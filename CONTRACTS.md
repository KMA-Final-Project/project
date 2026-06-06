# CONTRACTS.md

## 0. Purpose

This file is the source of truth for cross-module contracts in the Bilingual Subtitle System.

Use this file whenever a task touches more than one module, especially `backend-api`, `ai-engine`, and `mobile-app` integration boundaries.

Do not duplicate full contract definitions in `AGENTS.md`, module `INSTRUCTION.md`, or module `CHECKPOINT.md`. Those files may summarize or point here, but this file owns the active cross-module contract.

## 1. Contract Change Rule

Any change to one of these surfaces is a cross-module contract change:

- BullMQ queue names, prefixes, payloads, or retry semantics
- Media API request/response DTOs consumed by the mobile app
- MinIO artifact paths, bucket names, or signed URL behavior
- `chunks/`, `translated_batches/`, or `final.json` structure
- Socket event names, channels, payloads, or progress semantics
- Media status values, `currentStep`, progress range, ETA, or failure reason behavior
- Auth token shape, refresh behavior, route guards, or client token storage assumptions
- Language/translation behavior such as `targetLanguage`, bilingual-by-default behavior, or same-language translation disabling
- Quota/subscription enforcement rules visible to users or processing jobs

When a contract change is needed, follow `.agent/workflows/contract-change.md` before editing code.

## 2. System Integration Flow

```text
Mobile App
  |
  | authenticated REST calls + socket updates
  v
Backend API (NestJS)
  |\
  | \-- PostgreSQL: users, subscriptions, media, usage, refresh tokens
  | \-- MinIO presigned upload flow -> raw bucket
  |
  +-> Redis / BullMQ: transcription queue
          |
          v
     Backend Worker: validation, YouTube ingestion, quota re-check
          |
          +-> Redis / BullMQ: ai-processing queue
                    |
                    v
               AI Engine: Python GPU worker
                    |
                    +-> MinIO processed artifacts: chunks/, translated_batches/, final.json
                    +-> PostgreSQL status/progress updates
                    +-> Redis Pub/Sub events mirrored by backend sockets to mobile
```

## 3. Module Ownership

### Backend API owns

- Auth, register/verify/login/refresh/logout
- Subscription and quota checks
- Media API contracts
- Presigned upload negotiation
- Media item creation and status reads
- Durable artifact inventory endpoint
- BullMQ `transcription` job production
- Backend worker validation and `ai-processing` job production
- Socket mirroring from Redis events to the mobile app

### AI Engine owns

- Validated audio download from MinIO
- Audio normalization, inspection, VAD, alignment, translation, optional refinement
- Tier 1 chunk artifact upload
- Tier 2 translated batch artifact upload
- Final subtitle JSON artifact upload
- PostgreSQL processing progress/status updates during GPU work
- Redis `media_updates` event publishing

### Mobile App owns

- Local file/link intent capture
- Client-side video-to-audio extraction before upload
- Direct upload to MinIO through backend-issued presigned URLs
- Auth/session token persistence and refresh handling
- Socket-first processing UX
- Incremental player hydration from `translated_batches` before `final.json` exists
- Subtitle rendering, player state, language/theme preferences

## 4. Queue Contracts

### 4.1 Redis / BullMQ settings

- Redis is the queue backend.
- BullMQ prefix: `bilingual`.
- Queue 1: `transcription`.
- Queue 2: `ai-processing`.
- The backend API produces `transcription` jobs.
- The backend worker consumes `transcription` jobs and produces `ai-processing` jobs.
- The Python AI Engine consumes `ai-processing` jobs.

### 4.2 `TranscriptionJobPayload`

Producer: Backend API media service.

Consumer: Backend worker / `MediaProcessor`.

```ts
interface TranscriptionJobPayload {
  mediaId: string;
  type: "LOCAL" | "YOUTUBE";
  filePath?: string;
  url?: string;
  userId: string;
  targetLanguage?: string;
}
```

Rules:

- `mediaId` must point to an existing `MediaItem`.
- `type = "LOCAL"` requires `filePath` to reference the uploaded raw object key.
- `type = "YOUTUBE"` requires `url`.
- `userId` is required for ownership, quota, and audit context.
- `targetLanguage` is the canonical bilingual translation selector for the media item and must default to the backend baseline when the client omits it.
- `processingMode` is removed and must not be reintroduced.

### 4.3 `AiProcessingJobPayload`

Producer: Backend worker after validation.

Consumer: AI Engine Python worker.

```ts
interface AiProcessingJobPayload {
  mediaId: string;
  audioS3Key: string;
  durationSeconds: number;
  userId: string;
  targetLanguage?: string;
}
```

Rules:

- `audioS3Key` points to validated audio accessible by the AI Engine.
- `durationSeconds` must come from validation, not client trust.
- Quota and per-file duration limits must be checked before this job is emitted.
- `targetLanguage` is passed through to the AI Engine from the canonical media record / validated backend request path, not inferred from Explain client traffic.
- Payload compatibility with the Python worker is part of the product contract, not an implementation detail.

## 5. Media API Contracts

The backend is the only stable HTTP boundary for the mobile app.

| Endpoint | Contract responsibility |
|---|---|
| `POST /media/presigned-url` | Performs optimistic quota check and returns a presigned PUT URL for direct upload to MinIO. |
| `POST /media/confirm-upload` | Verifies uploaded object, creates `MediaItem`, and dispatches a `transcription` job. |
| `POST /media/youtube` | Creates `MediaItem` for a YouTube submission and dispatches the validation worker flow. |
| `GET /user/subscription-status` | Returns the authenticated user's current plan, current-month quota usage, per-file duration limit, AI credits, and available plan catalog for mobile subscription UX. |
| `GET /media/:id/status` | Returns processing status, progress, `currentStep`, ETA, machine-readable `failCode`, and human-readable failure reason state. |
| `GET /media/:id/artifacts` | Returns durable inventory for `chunks/`, `translated_batches/`, and `final.json`. |
| `GET /media` | Returns the authenticated user's media library and artifact summaries for readiness UI, including persisted `failCode` when present. |
| `GET /vocabulary` | Returns the authenticated user's grouped saved-word bank with expandable historical contexts across media items. |
| `POST /media/:id/explain` | Streams Kapter Explain responses for one canonical subtitle segment. |
| `GET /media/:id/explain/history` | Returns the authenticated user's chat history for one media segment. |
| `POST /media/:id/explain/feedback` | Records authenticated feedback on an assistant chat message. |
| `POST /media/:id/lookup` | Returns one atomic vocabulary lookup payload for a canonical word/span inside a subtitle segment. |
| `POST /media/:id/lookup/bookmark` | Persists one explicitly saved vocabulary lookup snapshot for the authenticated user. |

Rules:

- Mobile must call the backend API, not the AI Engine directly.
- Artifact inventory must remain backend-owned so the mobile app does not reconstruct MinIO state itself.
- YouTube submissions may carry a client title; when absent, the worker may use metadata from `yt-dlp` before falling back to a generic placeholder.
- Request DTO changes must update backend validation, mobile API types/schemas, and checkpoints.
- `GET /media/:id/status` and `GET /media` should expose the canonical persisted `targetLanguage` when available so the mobile player and Explain UI can stay aligned with the media's translation profile even after onboarding preferences change.
- `GET /media/:id/status` and `GET /media` should expose `failCode` as the machine-readable source of truth for entitlement-related failures; `failReason` remains human-readable diagnostics only.

### 5.1 Kapter Explain API

Kapter Explain is an authenticated, media-owned language-learning chat surface embedded in the mobile player.

#### `POST /media/:id/explain`

Transport:

- Request method is `POST`.
- Response is a `text/event-stream` stream.
- The mobile client consumes the stream with a fetch/ReadableStream client, not browser `EventSource`.

Request body:

```ts
interface ExplainRequestDto {
  segmentIndex: number;
  sessionId?: string;
  userMessage?: string;
}
```

Rules:

- The mobile app must not send subtitle text, translation, phonetic text, word timestamps, previous/next segment text, source language, or target language.
- The backend must verify media ownership before resolving any subtitle context.
- The backend resolves canonical context from server-owned artifacts/cache using `mediaId` and `segmentIndex`.
- The backend resolves the authoritative Explain output language from the canonical media context and persisted media profile, never from client Explain payload fields.
- `segmentIndex` is required for initial explain and follow-up requests.
- `sessionId` is required for follow-up requests and must belong to the authenticated user, media item, and segment index.
- `userMessage` is omitted for initial explain and required for follow-ups.
- Initial explain cache hits are free and must be served before any credit reservation.
- Cache misses and follow-ups require an AI credit reservation ledger row before the LLM call.
- The initial Explain turn must provide an exhaustive sequential breakdown of every canonical token block in the active subtitle sentence, matching the order of `sentence.words[]`; it must not cherry-pick only a few "main vocabulary" items.
- Explain prompt context may include server-derived token-block order and phoneme hints to keep the pedagogical breakdown aligned with canonical subtitle segmentation.

SSE event payloads:

```ts
type ExplainSseEvent = "meta" | "delta" | "error" | "done";

interface ExplainMetaEvent {
  sessionId: string;
  messageId: string;
  cacheHit: boolean;
  creditsRemaining: number;
  model: string;
  promptVersion: string;
}

interface ExplainDeltaEvent {
  content: string;
}

interface ExplainErrorEvent {
  code:
    | "INSUFFICIENT_CREDITS"
    | "GUARDRAIL_REJECTED"
    | "SUBTITLE_CONTEXT_UNAVAILABLE"
    | "LLM_UNAVAILABLE"
    | "LLM_ERROR"
    | "RATE_LIMITED";
  message: string;
}

interface ExplainDoneEvent {
  tokensUsed: number;
  finishReason: "stop" | "length" | "aborted";
}
```

#### `GET /media/:id/explain/history?segmentIndex=N`

Response:

```ts
interface ChatHistoryResponse {
  sessionId: string | null;
  segmentIndex: number;
  messages: Array<{
    id: string;
    role: "user" | "assistant";
    content: string;
    createdAt: string;
    feedback?: { rating: "POSITIVE" | "NEGATIVE" };
  }>;
}
```

Rules:

- History is scoped by authenticated `userId`, `mediaId`, and `segmentIndex`.
- The backend must return only sessions owned by the authenticated user.
- For the first explain turn, the persisted initial user message should reflect the localized display phrase generated from the canonical media `targetLanguage` so reopened history matches the chat UI seed bubble.

#### `POST /media/:id/explain/feedback`

Request body:

```ts
interface ChatFeedbackDto {
  chatMessageId: string;
  rating: "POSITIVE" | "NEGATIVE";
  reason?: string;
}
```

Rules:

- Feedback must be scoped to the authenticated user.
- Feedback may only target assistant messages in a session owned by the user.

### 5.2 Vocabulary Lookup API

Vocabulary Lookup is an authenticated, media-owned utility surface embedded in the subtitle player. It is non-streaming and returns one atomic JSON payload.

#### `POST /media/:id/lookup`

Request body:

```ts
interface LookupRequestDto {
  segmentIndex: number;
  wordText: string;
  startWordIndex: number;
  endWordIndex: number;
}
```

Response:

```ts
interface LookupResponseDto {
  data: {
    word: string;
    phonetic: string;
    partOfSpeech:
      | "noun"
      | "pronoun"
      | "verb"
      | "adjective"
      | "adverb"
      | "particle"
      | "classifier"
      | "preposition"
      | "conjunction"
      | "interjection"
      | "phrase"
      | "idiom"
      | "proper_noun"
      | "other";
    contextualDefinition: string;
    exampleSentence: string;
    exampleSentenceTranslation: string;
  };
  meta: {
    cacheHit: boolean;
    alreadySaved: boolean;
    saveToken: string;
    quota: {
      tier: "free" | "paid";
      dailyLimit: number | null;
      remainingToday: number | null;
      resetsInSeconds: number | null;
    };
  };
}
```

Rules:

- The mobile app must not send sentence text, translation, phonetic text, source language, target language, or arbitrary definition text.
- The backend must verify media ownership before resolving subtitle context.
- The backend resolves the canonical segment from server-owned artifacts using `mediaId` and `segmentIndex`.
- `startWordIndex` and `endWordIndex` are inclusive offsets inside canonical `sentence.words[]`.
- The backend reconstructs the authoritative selected span from subtitle tokens and treats `wordText` as validation only.
- Free users are limited to 20 valid lookup requests per rolling 24-hour Redis window using `rate_limit:lookup:{userId}`.
- Paid users bypass the Redis lookup limiter when `plan.code !== "free"`.
- Lookup cache is Redis-only with key `lookup:{mediaId}:{segmentIndex}:{wordText}` and TTL 7 days.
- Lookup responses must be built from one non-streaming OpenAI Structured Outputs call using `json_schema` with `strict: true` on cache miss.
- The model must return only structured lexical fields; `word`, `phonetic`, and example sentence context are server-derived from canonical subtitle data.
- `contextualDefinition` is not a generic dictionary gloss; it must explain the selected word or phrase's exact role, structural behavior, or nuance inside the provided sentence context.
- For grammar-heavy tokens such as particles, classifiers, complements, aspect markers, or structural words, the lookup explanation must explicitly say what the token attaches to or changes in the sentence.

Error codes:

```ts
type LookupErrorCode =
  | "INVALID_WORD_SELECTION"
  | "INVALID_SAVE_TOKEN"
  | "MEDIA_NOT_FOUND"
  | "SUBTITLE_CONTEXT_UNAVAILABLE"
  | "LOOKUP_LIMIT_REACHED"
  | "RATE_LIMITED"
  | "LLM_UNAVAILABLE"
  | "LLM_ERROR";
```

#### `POST /media/:id/lookup/bookmark`

Request body:

```ts
interface SaveLookupWordDto {
  segmentIndex: number;
  wordText: string;
  startWordIndex: number;
  endWordIndex: number;
  saveToken: string;
}
```

Rules:

- Save Word is explicit only; lookup must not auto-persist anything to PostgreSQL.
- `saveToken` is an opaque Redis-backed snapshot token issued by `POST /media/:id/lookup`.
- The backend must validate that `saveToken`, `mediaId`, `segmentIndex`, and the selected span all match before writing.
- Bookmark persistence must snapshot the server-returned lookup data from Redis, never trust client-sent meaning or part-of-speech text.
- Canonical vocabulary identity is `normalizedWord + sourceLanguage`.
- User saves are unique per `userId + mediaItemId + segmentIndex + startWordIndex + endWordIndex`.

#### `GET /vocabulary`

Response:

```ts
interface WordBankContextItemDto {
  id: string;
  mediaItemId: string;
  mediaTitle: string;
  mediaOriginType: "LOCAL" | "YOUTUBE";
  mediaThumbnailUrl: string | null;
  mediaAvailable: boolean;
  segmentIndex: number;
  startWordIndex: number;
  endWordIndex: number;
  selectedText: string;
  phonetic: string;
  partOfSpeech:
    | "noun"
    | "pronoun"
    | "verb"
    | "adjective"
    | "adverb"
    | "particle"
    | "classifier"
    | "preposition"
    | "conjunction"
    | "interjection"
    | "phrase"
    | "idiom"
    | "proper_noun"
    | "other";
  savedContextualDefinition: string;
  savedExampleText: string;
  savedExampleTranslation: string;
  savedAt: string;
}

interface WordBankGroupItemDto {
  vocabularyId: string;
  word: string;
  sourceLanguage: string;
  phonetic: string;
  contextCount: number;
  latestSavedAt: string;
  contexts: WordBankContextItemDto[];
}

interface WordBankListResponseDto {
  data: WordBankGroupItemDto[];
  meta: {
    totalGroups: number;
    totalContexts: number;
  };
}
```

Rules:

- The route is authenticated and user-owned; mobile must not pass `userId`.
- The backend groups saves by canonical `vocabularyId`, not by client-side string normalization.
- Group ordering is newest-first by `latestSavedAt`.
- Context ordering inside each group is newest-first by `savedAt`.
- The backend enriches each context with media identity data from the related `MediaItem`.
- Local thumbnails are presigned server-side; YouTube thumbnails use the canonical `youtubeVideoId` path when available.
- Soft-deleted media contexts remain visible as historical saves, but must return `mediaAvailable=false` and `mediaThumbnailUrl=null`.
- V1 of this route has no pagination, search, filters, or mutation behavior.

### 5.3 Kapter Explain Admin API

Admin endpoints require ADMIN role enforcement through the existing admin guard pattern.

Documented endpoints:

- `GET /admin/ai-explain/metrics?period=7d`
- `GET /admin/ai-explain/sessions?page=1&limit=20`

Metrics response:

```ts
interface AiExplainMetrics {
  period: string;
  totalRequests: number;
  totalCreditsConsumed: number;
  totalTokensInput: number;
  totalTokensOutput: number;
  cacheHitRate: number;
  averageLatencyMs: number;
  guardrailRejectionRate: number;
  feedbackPositiveRate: number;
  topSegments: Array<{
    mediaId: string;
    mediaTitle: string;
    segmentIndex: number;
    segmentText: string;
    requestCount: number;
  }>;
  dailyUsage: Array<{
    date: string;
    requests: number;
    credits: number;
    tokens: number;
  }>;
}
```

## 6. Artifact Storage Contract

### 6.1 Buckets

- Raw input artifacts live in the `raw` bucket.
- Processed output artifacts live in the `processed` bucket.

### 6.2 Processed object layout

```text
processed/{mediaId}/
├── chunks/
│   ├── 0.json
│   └── ...
├── translated_batches/
│   ├── 0.json
│   └── ...
└── final.json
```

### 6.3 Tier 1: `chunks/`

Producer: AI Engine `SmartAligner` / transcription stage.

Consumer: Backend artifact inventory and mobile progressive readiness UI.

Rules:

- Each chunk file is a durable partial transcription artifact.
- Chunk files are arrays of `Sentence`-like objects.
- Tier 1 chunk segments are not the final canonical ordering surface.
- If `segment_index` is present in Tier 1, it must be treated as non-canonical and may be `null`.

### 6.4 Tier 2: `translated_batches/`

Producer: AI Engine async translation consumer.

Consumer: Mobile player and readiness UI.

Minimum shape:

```ts
interface TranslatedBatchArtifact {
  batch_index: number;
  first_segment_index: number;
  segments: Sentence[];
}
```

Rules:

- A translated batch unlocks player readiness before `final.json` exists.
- Incoming translated batches must be appendable without forcing a full player reload.
- Batch indexes must be stable and ordered.
- `first_segment_index` must point to the first canonical segment represented by the batch.

### 6.5 Final artifact: `final.json`

Producer: AI Engine export stage.

Consumer: Mobile player, completed media detail, and any future export/download feature.

Minimum shape:

```ts
interface SubtitleOutput {
  metadata: {
    duration: number;
    engine_profile?: string;
    [key: string]: unknown;
  };
  segments: Sentence[];
}

interface Sentence {
  segment_index?: number | null;
  start: number;
  end: number;
  text: string;
  translation: string;
  phonetic: string;
  words: Array<{
    word: string;
    start: number;
    end: number;
    [key: string]: unknown;
  }>;
}
```

Rules:

- `final.json` is the authoritative completed output.
- Final segments must be ordered.
- Final `segment_index` values, when present, must be consecutive and 0-based.
- `translation` must be a string. Use `""` rather than `null` when unavailable.
- `phonetic` must be a string. Use `""` for languages where phonetic output is unavailable.
- `words` are the renderable karaoke and lookup tokens, not a guarantee of raw ASR character granularity. Chinese-family output may group consecutive character-level timings into multi-character lexical words while preserving token order and using `start=first_child.start`, `end=last_child.end`.
- The mobile app depends on `start`, `end`, `text`, `translation`, `phonetic`, and `words` for bilingual/karaoke rendering.

## 7. MinIO URL Contract

- Client-facing artifact URLs must be signed with the MinIO client configured for `MINIO_PUBLIC_ENDPOINT`.
- Do not sign against an internal host and rewrite the URL afterward.
- Mobile uses backend-returned artifact URLs or artifact inventory; it must not construct MinIO URLs itself.
- Any change to URL signing, public endpoint behavior, or bucket/path layout is a contract change.

## 8. Socket Event Contract

### 8.1 Transport boundary

- AI Engine publishes Redis Pub/Sub events on channel `media_updates`.
- Backend mirrors these events through its socket layer.
- Mobile listens through socket sync and patches TanStack Query caches / processing UI state.

### 8.2 Event types

Documented event types:

- `progress`
- `chunk_ready`
- `batch_ready`
- `completed`
- `failed`

Rules:

- Event payloads must include enough media identity for the mobile app to patch the correct media item.
- `chunk_ready` must correspond to durable `chunks/` artifact availability.
- `batch_ready` must correspond to durable `translated_batches/` artifact availability.
- `completed` must correspond to durable `final.json` availability.
- `failed` must carry or point to a user-visible failure reason.
- Do not add aggressive polling as a replacement for socket-first UX unless explicitly approved.

## 9. Progress and Status Contract

### 9.1 Media statuses

Active `MediaStatus` values:

```ts
type MediaStatus = "QUEUED" | "VALIDATING" | "PROCESSING" | "COMPLETED" | "FAILED";
```

Rules:

- Validation failures become `FAILED` with a useful failure reason.
- Completed jobs must have a durable `final.json` artifact.
- Processing jobs may expose usable translated batches before completion.

### 9.2 Current step values

Common `currentStep` values:

```ts
type MediaCurrentStep =
  | "AUDIO_PREP"
  | "INSPECTING"
  | "VAD"
  | "PROCESSING"
  | "TRANSLATING"
  | "EXPORTING";
```

Rules:

- `currentStep` values are user-facing enough to affect mobile UX.
- Rename or add steps only through the contract-change workflow.

### 9.3 Progress semantics

Documented V2 progress ranges:

- `0.05` — audio preparation
- `0.10` — inspection
- `0.15` — VAD
- `0.15` to `0.60` — processing/alignment
- `0.60` to `0.90` — translation
- `0.98` — exporting
- `1.00` — completed

Rules:

- Progress must be monotonic in emitted events.
- Progress must be monotonic in PostgreSQL writes.
- Persisted progress should never roll backward because mobile uses progress to render trustable live state.

## 10. Auth Token Contract

- Registration follows a verify-first flow: register, receive OTP, verify OTP, then finalize the account and issue tokens.
- Access token is a short-lived JWT.
- Refresh token is a UUID wrapped in a signed JWT, stored in the database, and rotated on refresh.
- Mobile stores access and refresh tokens through `expo-secure-store`.
- Mobile API calls go through the central Axios instance.
- Axios request interceptor injects bearer tokens.
- Axios response interceptor performs refresh-token rotation and re-queues failed requests while refresh is in-flight.
- AsyncStorage must not be used for tokens.

## 11. Quota and Subscription Contract

- Backend owns quota and subscription enforcement.
- Quota checks must use subscription snapshot fields and usage history, not only current plan definitions.
- Per-file duration and monthly aggregate quota must be checked before expensive processing.
- Backend worker must re-check quota/duration after validation because client-provided metadata is not trusted.
- Usage data must remain audit-ready.
- Users and media use soft deletes rather than hard deletion in normal user flows.
- Mobile reads one authenticated subscription source of truth from `GET /user/subscription-status`; auth/login payloads are not the subscription contract.
- The user-facing quota window currently matches backend enforcement for the current calendar month: `windowStartAt = first day of month`, `windowEndAt = first day of next month`.
- Obvious blockers such as inactive subscription or exhausted monthly quota should be surfaced before upload begins when the mobile app has fresh status data.
- Worker-side failures must persist a machine-readable `failCode` for mobile UX; Phase 1 codes are:

```ts
type MediaFailCode =
  | "subscriptionInactive"
  | "quotaExceeded"
  | "durationLimitExceeded"
  | "validationFailed"
  | "processingFailed";
```

`GET /user/subscription-status` response contract:

```ts
interface SubscriptionStatusResponse {
  currentPlan: {
    planCode: string;
    planName: string;
    variantId: string;
    variantName: string;
    status: "ACTIVE" | "INACTIVE" | "EXPIRED";
    priceSnapshot: string;
    currency: string;
    billingCycleType: "MONTHLY" | "SIX_MONTHS" | "YEARLY" | "LIFETIME";
  } | null;
  quota: {
    usedSeconds: number;
    totalSeconds: number | null;
    remainingSeconds: number | null;
    maxDurationPerFileSeconds: number | null;
    windowStartAt: string;
    windowEndAt: string;
    uploadBlockerCode: "none" | "subscriptionInactive" | "quotaExceeded";
  };
  aiCredits: {
    remaining: number;
    includedPerCycle: number;
  };
  availablePlans: Array<{
    planCode: string;
    planName: string;
    description: string | null;
    features: string[];
    tierLevel: number | null;
    variantId: string;
    variantName: string;
    price: string;
    currency: string;
    billingCycleType: "MONTHLY" | "SIX_MONTHS" | "YEARLY" | "LIFETIME";
    monthlyQuotaSeconds: number | null;
    maxDurationPerFileSeconds: number | null;
    aiCreditsPerMonth: number;
    isCurrent: boolean;
  }>;
}
```

### 11.1 AI Credit Quota Contract

Kapter Explain uses a separate AI credit pool. It must not be conflated with audio processing duration quota.

Plan and subscription fields:

```ts
interface PlanVariantAiCreditFields {
  aiCreditsPerMonth: number;
}

interface SubscriptionAiCreditSnapshot {
  aiCreditsPerMonthSnapshot: number;
}

interface UserAiCreditBalance {
  aiCreditsRemaining: number;
  aiCreditsLastResetDate: string;
}
```

Ledger state:

```ts
type AiCreditReservationState = "PENDING" | "CONFIRMED" | "REFUNDED";
```

Rules:

- Initial explain cache hits cost 0 credits and must not create a reservation.
- Initial explain cache misses cost 1 credit when a usable response is delivered.
- Follow-up questions cost 1 credit when a usable response is delivered.
- Credit reservations must be recorded as durable ledger rows before an LLM call starts.
- Reservation cleanup must be idempotent: only one `PENDING -> REFUNDED` transition may increment the user balance.
- Successful charged requests transition `PENDING -> CONFIRMED`.
- Failed, refused, or early-aborted requests transition `PENDING -> REFUNDED`.
- Usage logs must record provider, model, prompt version, cache hit status, token counts when available, and the linked reservation ID when a reservation exists.
- Usage logs must store any admin-facing segment text as a server-resolved canonical snapshot, never from client-supplied subtitle text.
- Vocabulary lookup does not consume AI credits and must not create `AiCreditReservation` or `AiUsageLog` rows in the current design.

## 12. Language and Translation Contract

- The product is bilingual-by-default.
- `targetLanguage` is the active translation selector.
- `processingMode` is removed and must not be reintroduced.
- Mobile keeps translation enabled by default.
- Mobile may auto-disable translation only when subtitle metadata shows source language and target language are the same.
- AI Engine owns source transcription, target translation, phonetic enrichment, and final bilingual artifact generation.

## 13. Validation Matrix

Use the smallest validation that proves the contract still works.

| Contract area | Minimum validation |
|---|---|
| Queue payload | Backend build/test plus AI Engine import/test for worker compatibility. |
| Media API DTO | Backend build/lint/test and mobile type/schema validation. |
| Artifact layout | AI Engine streaming contract tests and backend artifact endpoint check. |
| Socket events | AI Engine event discipline tests and mobile socket sync verification. |
| Progress semantics | AI Engine event/progress tests and backend status read check. |
| Auth/token flow | Backend auth tests and mobile auth/session smoke check. |
| Quota/subscription | Backend unit/integration tests around subscription snapshots and usage history. |
| Mobile player artifact hydration | Mobile lint/type check and manual or automated translated-batch player test. |

## 14. Documentation Update Rule

When a contract changes, update these in the same work session:

1. `CONTRACTS.md` — authoritative contract definition.
2. Affected module `INSTRUCTION.md` files only if stable module rules changed.
3. Affected module `CHECKPOINT.md` files with current status and follow-ups.
4. Tests or validation notes proving producer/consumer compatibility.
5. `DECISIONS.md` only when the change is architectural, not routine.

Do not copy the full updated contract into `AGENTS.md`. Point agents to this file instead.
