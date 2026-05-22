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
- `targetLanguage` is the active bilingual translation selector.
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
- `targetLanguage` is passed through to the AI Engine.
- Payload compatibility with the Python worker is part of the product contract, not an implementation detail.

## 5. Media API Contracts

The backend is the only stable HTTP boundary for the mobile app.

| Endpoint | Contract responsibility |
|---|---|
| `POST /media/presigned-url` | Performs optimistic quota check and returns a presigned PUT URL for direct upload to MinIO. |
| `POST /media/confirm-upload` | Verifies uploaded object, creates `MediaItem`, and dispatches a `transcription` job. |
| `POST /media/youtube` | Creates `MediaItem` for a YouTube submission and dispatches the validation worker flow. |
| `GET /media/:id/status` | Returns processing status, progress, `currentStep`, ETA, and failure reason state. |
| `GET /media/:id/artifacts` | Returns durable inventory for `chunks/`, `translated_batches/`, and `final.json`. |
| `GET /media` | Returns the authenticated user's media library and artifact summaries for readiness UI. |

Rules:

- Mobile must call the backend API, not the AI Engine directly.
- Artifact inventory must remain backend-owned so the mobile app does not reconstruct MinIO state itself.
- YouTube submissions may carry a client title; when absent, the worker may use metadata from `yt-dlp` before falling back to a generic placeholder.
- Request DTO changes must update backend validation, mobile API types/schemas, and checkpoints.

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
