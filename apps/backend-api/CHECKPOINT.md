# Backend API - Checkpoint

> Last updated: 2026-06-07
> Maintained by: agents - update this file after every significant change.

## 1. Current Status

Backend API is in a working production-flow state for the current project scope, and now has an automated local YouTube E2E WER suite that exercises the real app-facing submit path through API, validation worker, AI queue handoff, status polling, artifact retrieval, manual-caption ground-truth harvesting through `yt-dlp`, and word/token-level WER reporting.

The module owns authentication, subscription/quota enforcement, media APIs, presigned upload negotiation, MinIO integration, BullMQ job production, and the NestJS validation worker. It does not perform transcription or translation; validated jobs are handed off to the AI Engine through the `ai-processing` queue.

Current completed surfaces:

- Authentication and verify-first registration flow.
- Admin subscription plan and variant management.
- Media upload, YouTube submission, status, artifact inventory, and media library APIs.
- Standalone validation worker consuming `transcription` jobs and producing `ai-processing` jobs.
- Supporting MinIO, Redis, mail, OTP, user subscription, and queue services.
- Kapter Explain backend provider transport now uses the official OpenAI Node SDK behind a NestJS custom provider boundary.

## 2. Active Work

- [ ] Manually verify Kapter Explain SSE and admin metrics against local Redis/MinIO/provider credentials.

## 3. Recently Completed

- 2026-06-07 — Backend Prisma/watch startup stabilized after workspace reinstall. Status: Working.
  - Pinned `prisma`, `@prisma/client`, and `@prisma/adapter-pg` to `7.8.0`, and updated backend build/dev scripts to regenerate Prisma before compile so the emitted client cannot drift from the installed runtime.
  - Disabled Nest CLI `deleteOutDir` during watch startup on Windows because repeated `dist/` cleanup was throwing `EPERM` and preventing both `pnpm start:dev` and `pnpm worker:dev` from recompiling the updated Prisma client.
  - Corrected the backend runtime entry scripts to the actual emitted paths under `dist/src/`.
  - Why: after the shared workspace reinstall, backend watch mode kept crashing before recompilation and the stale compiled Prisma client then surfaced `TypeError: Cannot read properties of undefined (reading 'graph')` during bootstrap.
  - Contract touched: none. API, queue, artifact, and socket behavior unchanged.
  - Validation: `pnpm build`; controlled startup verification of `pnpm start:dev` and `pnpm worker:dev` until Nest reached successful bootstrap.
  - Follow-up: if multiple dev processes need to run concurrently, avoid starting backend API and worker with separate `pnpm pgen` steps at the exact same moment because Prisma generation writes into one shared output directory.

- 2026-06-07 — Root pnpm workspace and shared TypeScript contracts package. Status: Working.
  - Added a repository-root `pnpm` workspace and moved the TypeScript modules onto one shared lockfile.
  - Added `packages/contracts` as a minimal shared workspace package, wired backend DTO/request classes into the shared transport surfaces where the wire shapes already matched cleanly, and now emit the package through `tsup`.
  - Kept backend NestJS DTO classes and Swagger decorators as the runtime validation authority; this change centralized TypeScript transport definitions without changing API behavior.
  - Aligned the backend Jest toolchain to `jest@29.7.0` and `@types/jest@29.5.14` after the shared workspace install surfaced a broken Jest 30 runtime path during backend test execution.
  - Added repository-root workspace scripts for build, lint, typecheck, test, and validate so backend verification can run from one consistent entry point.
  - Why: backend, mobile, and dashboard were duplicating the same transport contracts, which increased drift risk and made future web-app expansion less clean than it needed to be.
  - Contract touched: TypeScript compile-time authority only. API/queue/artifact/socket behavior unchanged.
  - Validation: `pnpm --filter @kapter/contracts build`; `pnpm --filter @kapter/contracts typecheck`; `pnpm build`; `pnpm lint`; `pnpm test -- --runInBand`.
  - Follow-up: if the team later adopts generated OpenAPI consumer types, replace or feed `packages/contracts` through the same package boundary instead of reintroducing ad hoc per-app contract mirrors.

- 2026-06-06 — Mobile subscription status contract and failure-code upload gating. Status: Working.
  - Added authenticated `GET /user/subscription-status` under the user module so mobile can read the current plan snapshot, current-month quota usage window, per-file duration limit, AI credits, and active plan catalog from one backend source of truth.
  - Replaced pre-submit upload blockers with distinct machine-readable error codes for inactive subscription vs exhausted quota, instead of collapsing both into one generic quota message.
  - Added persisted `MediaItem.failCode` support and worker-side validation-code mapping so mobile can distinguish `subscriptionInactive`, `quotaExceeded`, and `durationLimitExceeded` without parsing human-readable `failReason`.
  - Why: the mobile app needed truthful subscription visibility and deterministic entitlement UX before upload and on failed validation states.
  - Contract touched: API, Quota, Progress, Mobile impact.
  - Validation: `pnpm pgen`; `pnpm build`; `pnpm lint`; `pnpm test`.
  - Follow-up: if AI-engine-originated failures later need the same UX treatment, propagate a machine-readable processing failure code through the status/socket path as well.

- 2026-06-04 — Grouped Word Bank read endpoint. Status: Working.
  - Added authenticated `GET /vocabulary` under a user-owned route so mobile can fetch grouped saved vocabulary across all media items without reconstructing canonical groups client-side.
  - The backend now groups `UserVocabulary` rows by canonical `Vocabulary` identity, enriches each saved context with media title/origin/thumbnail state, and keeps soft-deleted media visible as historical contexts with `mediaAvailable=false`.
  - Added Swagger DTOs and service coverage for group ordering, context ordering, thumbnail enrichment, and soft-delete visibility behavior.
  - Why: the upcoming mobile Word Bank screen needed one clean read contract that avoids duplicate cards for the same word while still preserving the exact saved subtitle snapshots.
  - Contract touched: API, Mobile impact.
  - Validation: `pnpm build`; `pnpm lint`; `pnpm test -- vocabulary.service.spec.ts lookup.service.spec.ts`.
  - Follow-up: manually verify the new route against a seeded local database and confirm thumbnail/sign-in behavior from the mobile screen.

- 2026-05-27 — End-to-end YouTube WER benchmark suite. Status: Working.
  - Rebuilt `scripts/e2e-youtube-pipeline-eval.ts` into a modular benchmark harness under `scripts/e2e-youtube-benchmark/` with helper modules for fixture loading, benchmark-user bootstrap, Axios API access, `yt-dlp` manual subtitle acquisition, English/Chinese tokenization, Levenshtein WER, and suite reporting.
  - The suite now defaults to the full 20-video fixture matrix from `apps/ai-engine/test_medias.md`, submits each case through `POST /media/youtube` with explicit `sourceLanguage`, polls `GET /media/:id/status` for milestone timestamps, fetches `final.json` through the backend artifact URL, and saves per-case evidence bundles including `translated_batch.first.json`, `final.json`, normalized reference/hypothesis text, and `evaluation.summary.json`.
  - Hardened long-running suite execution by re-authenticating before each case, retrying transient Axios network failures during login/artifact fetch/status polling, and keeping per-case evidence directly under the run `results/<caseId>/` directory instead of nesting under `results/results/`.
  - Hardened Chinese ground-truth handling after finding that some `yt-dlp` manual `zh*` tracks were romanized pinyin rather than Han-character captions and that the Windows subprocess bridge to the `jieba` tokenizer was not forcing UTF-8. The suite now scores Chinese manual subtitle candidates by Han-script dominance, strips pinyin companion lines when a cue also contains Han text, and forces `PYTHONUTF8=1` plus `PYTHONIOENCODING=utf-8` for the tokenizer subprocess.
  - Added manual-subtitle WER scoring with strict skip behavior when no human-authored subtitle track exists. After fixing Chinese subtitle selection, the current fixture reality is 15 scored cases and 5 latency-only Chinese cases because four videos expose no manual subtitles and `chinese_nSeVUZDzCUY` only exposed a pinyin-only manual track, which is now treated as unsuitable for Mandarin WER.
  - Added stable suite exports at `outputs/e2e-benchmarks/e2e_wer_suite_summary.json` and `.md`, while each run also keeps its own timestamped bundle under `outputs/e2e-benchmarks/runs/`.
  - Updated `scripts/run-e2e-youtube-pipeline.ps1` so the existing launcher now targets the new benchmark output root and defaults to the full matrix when no explicit `-CaseIds` override is supplied.
  - Why: isolated AI-engine benchmarks were no longer enough; the project needed one reproducible quantitative harness that measures real wall-clock app-path latency and subtitle accuracy from the live backend submit surface.
  - Contract touched: none. API endpoints, queue payloads, artifacts, and socket events were exercised but not changed.
  - Validation: `pnpm add axios@^1.13.5`; `pnpm build`; `.\scripts\run-e2e-youtube-pipeline.ps1 -CaseIds english_-moW9jvvMr4,chinese_WA18WJmXZZE -OutputDir .\outputs\e2e-benchmarks\runs\smoke-20260527`; `.\scripts\run-e2e-youtube-pipeline.ps1 -OutputDir .\outputs\e2e-benchmarks\runs\full-20260527-rerun2`, which completed all 20 fixtures but still contained contaminated Chinese ground truth; followed by a local artifact audit on `chinese_LcUoiBwG-OA`, `chinese_FqqK8hQzPgM`, and `chinese_GOjlcDYurP0` that confirmed the old saved ground truth mixed pinyin/Han incorrectly and that the UTF-8-forced tokenizer bridge now returns clean Chinese tokens; then `.\scripts\run-e2e-youtube-pipeline.ps1 -OutputDir .\outputs\e2e-benchmarks\runs\full-20260527-chinese-fix-rerun3`, which completed all 20 fixtures with clean Chinese normalized references, skipped the pinyin-only `chinese_nSeVUZDzCUY` track, and refreshed the stable suite summary to `averageWer=0.0669`, `averageLatencySeconds=96.7286`, `english averageWer=0.0361`, and `chinese averageWer=0.1290` across 15 WER-eligible fixtures.
  - Follow-up: run the full 20-case matrix after major AI-engine routing or subtitle-quality changes, and consider promoting fixture-specific pass/fail thresholds once the Chinese reference coverage is expanded.

- 2026-05-25 — Explain and Lookup pedagogical prompt deepening. Status: Working.
  - Upgraded Kapter Explain prompt defaults to `promptVersion=v4`, raised the default output-token budget, and injected canonical `<token_blocks>` into subtitle context so the initial Explain turn now has to cover every token block in order instead of cherry-picking only a few main words.
  - Tightened Explain first-turn instructions to require a sequential token-by-token breakdown, while keeping follow-up turns direct and still grounded in the canonical sentence token order.
  - Upgraded Lookup prompt defaults to `lookup-v2`, widened the Structured Outputs `contextualDefinition` allowance, and rewrote the lookup prompt so the model must explain sentence-specific grammatical role, structural behavior, and nuance instead of returning a generic dictionary gloss.
  - Added lookup cache version-awareness so pre-upgrade Redis entries are treated as stale and recomputed under the stronger prompt.
  - Why: current Explain and Lookup answers were too shallow compared with the intended teaching quality, especially for grammar-heavy Chinese subtitle cases.
  - Contract touched: API behavior, Language.
  - Validation: `pnpm build`; `pnpm test -- chat.service.spec.ts chat-provider.service.spec.ts lookup.service.spec.ts`; `pnpm exec eslint src/modules/chat/chat-config.service.ts src/modules/chat/chat-context.service.ts src/modules/chat/chat-provider.service.ts src/modules/chat/chat-provider.service.spec.ts src/modules/chat/chat.service.ts src/modules/chat/chat.service.spec.ts src/modules/chat/lookup.service.ts src/modules/chat/lookup.service.spec.ts`.
  - Follow-up: manually verify the refreshed Explain and Lookup outputs against live provider calls and clear any long-lived Redis entries if old lookup wording is still observed during the 7-day TTL window.

- 2026-05-25 — Lookup Save Word duplicate-key race hardened. Status: Working.
  - Updated the lookup bookmark save path so concurrent duplicate save requests no longer bubble a PostgreSQL/Prisma unique-key collision into a `500`.
  - The service now treats a `P2002` race on `UserVocabulary` create as an idempotent already-saved result by re-reading the canonical saved row and returning `created: false`.
  - Why: rapid repeated mobile taps could race past the pre-create existence check and crash the save request instead of returning the existing bookmark state.
  - Contract touched: API behavior only; request/response DTOs unchanged.
  - Validation: `pnpm build`; `pnpm test -- lookup.service.spec.ts`; `pnpm exec eslint src/modules/chat/lookup.service.ts src/modules/chat/lookup.service.spec.ts`.
  - Follow-up: validate this behavior from the mobile app against a live local database session while stress-tapping Save Word.

- 2026-05-25 — Vocabulary lookup and Save Word backend slice. Status: Working.
  - Added Prisma migration `20260525130000_add_lookup_vocabulary` to remodel canonical vocabulary identity as `normalizedWord + sourceLanguage` and convert `UserVocabulary` into a context-aware saved-word snapshot table keyed by `userId + mediaItemId + segmentIndex + startWordIndex + endWordIndex`.
  - Added `POST /media/:id/lookup` with canonical subtitle context resolution, free-tier Redis rate limiting, Redis L1 lookup caching, `saveToken` snapshot issuance, and one atomic OpenAI Structured Outputs (`json_schema`, strict) response on cache miss.
  - Added `POST /media/:id/lookup/bookmark` so saved vocabulary is explicit only and persists the server-issued Redis lookup snapshot rather than trusting client-sent definition text.
  - Extended the shared OpenAI provider/config boundary with a non-streaming lookup path while preserving the existing Explain streaming path.
  - Contract touchpoints: API, DB, Quota, Artifact, Mobile impact.
  - Validation: `pnpm pgen`; `pnpm db:reseed`; `pnpm build`; `pnpm test -- chat.service.spec.ts chat-provider.service.spec.ts ai-credit-ledger.service.spec.ts lookup.service.spec.ts`; `pnpm exec eslint "src/modules/chat/**/*.ts" --fix`.
  - Follow-up: wire the mobile player popup to the new lookup and bookmark routes, then validate the full UI flow against live provider credentials.

- 2026-05-25 — Explain SSE responses now flush per event for live mobile updates. Status: Working.
  - Updated the Explain controller SSE response headers to disable proxy buffering (`X-Accel-Buffering: no`) and flush each written event frame when the underlying Express response supports `flush()`.
  - Why: the mobile Explain sheet could reopen and read persisted history, but live `meta` / `delta` events were not always reaching the client promptly during the active request, which made the UI look disconnected from the backend.
  - Contract touched: API transport behavior only; public DTO/SSE event schema unchanged.
  - Validation: `pnpm build`.
  - Follow-up: manual end-to-end verification from the mobile Explain sheet against a live backend/provider session to confirm first-token delivery and stop/abort timing.

- 2026-05-25 — Explain initial user message now includes the translated context line. Status: Working.
  - Updated the backend-generated first-turn explain display message to include the canonical translated layer when available, keeping persisted history aligned with the mobile Explain seed bubble.
  - Why: the chosen sentence in the chat seed bubble needed to show both source and translated context, and reopened history must match that exact UI state.
  - Contract touched: Language, Mobile impact.
  - Validation: `pnpm build`; `pnpm test -- chat.service.spec.ts`.
  - Follow-up: none beyond the existing live mobile/backend manual verification pass.

- 2026-05-24 — Kapter Explain target-language enforcement and media target profile persistence. Status: Working.
  - Added `MediaItem.targetLanguage` with migration `20260524184500_add_media_target_language` and persisted the canonical target language for local uploads and YouTube submissions.
  - Normalized backend media ingestion so the stored target language, queue payload, media status response, and media library response stay aligned on one canonical value.
  - Updated Explain context resolution and prompt construction to enforce response language from backend-owned media context, and persisted the localized first-turn user message so history matches the mobile seed bubble.
  - Contract touchpoints: API, DB, Queue, Language, Mobile impact.
  - Validation: `pnpm pgen`; `pnpm build`; `pnpm lint`; `pnpm test -- chat.service.spec.ts chat-provider.service.spec.ts ai-credit-ledger.service.spec.ts ai-explain-admin.service.spec.ts`; `pnpm exec tsc --noEmit --pretty false`.
  - Follow-up: run the new flow against a live backend/mobile session and execute the pending Prisma migration in the target environments.

- 2026-05-24 — Database seeding on reseed fix. Status: Working.
  - Updated the `db:reseed` script in `package.json` to run `prisma migrate reset --force && prisma db seed`.
  - Why: Prisma v7 has removed automatic seeding during `prisma migrate reset`.
  - Validation: verified `pnpm db:reseed` successfully resets the database and runs the seed script.

- 2026-05-24 — Kapter Explain provider SDK transport hardening. Status: Partial.
  - Replaced the backend provider-side raw HTTP/SSE parsing path with the official OpenAI Node SDK streaming API.
  - Added an `OPENAI_CLIENT` symbol-token NestJS custom provider so SDK construction stays outside business services and can be mocked cleanly in unit tests.
  - Added provider-level SDK error mapping to Kapter canonical explain errors (`RATE_LIMITED`, `LLM_UNAVAILABLE`, `LLM_ERROR`) so upstream SDK details do not leak to mobile SSE payloads.
  - Added anti-regression coverage proving the provider path does not reintroduce `getReader`, `TextDecoder`, `data:` frame parsing, or `[DONE]` marker parsing.
  - Contract touchpoints: Backend provider dependency only; public explain DTO/SSE contracts unchanged.
  - Validation: `pnpm build`; `pnpm lint`; `pnpm test`.
  - Follow-up: manually verify live provider SSE behavior with local Redis/MinIO/provider credentials.

- 2026-05-24 — Kapter Explain Phase 1 backend foundation. Status: In-Progress.
  - Added `CONTRACTS.md` entries for Kapter Explain request/stream/history/feedback/admin metrics contracts; the client request DTO is limited to `segmentIndex`, `sessionId`, and `userMessage`.
  - Added Prisma schema and migration `20260524093000_add_ai_explain_foundation` for chat sessions/messages/feedback, AI usage logs, and idempotent credit reservations with `PENDING | CONFIRMED | REFUNDED` states.
  - Added provider-agnostic chat config defaults via `ConfigService` with OpenAI `gpt-4o-mini` as the baseline model, plus a Phase 1 chat module shell and credit ledger service.
  - Extended plan variants, subscriptions, seed data, and free-plan assignment with AI credit snapshot/remaining-credit fields.
  - Contract touchpoints: API, DB, Quota, Mobile impact.
  - Validation: `pnpm prisma validate`; `pnpm pgen`; `pnpm build`; `pnpm test -- ai-credit-ledger.service.spec.ts`.
  - Follow-up: implement cache-first Redis lookup, canonical subtitle resolver, SSE endpoint behavior, usage logging, and admin metrics queries.

- 2026-05-24 — Kapter Explain backend streaming slice. Status: Partial.
  - Added `POST /media/:id/explain` SSE runtime with strict DTO validation, canonical subtitle context resolution from `final.json` or translated batches, Redis L1 cache-first initial explanations, provider-compatible OpenAI chat streaming, and ledger-backed reserve/confirm/refund behavior.
  - Added `GET /media/:id/explain/history` and `POST /media/:id/explain/feedback` backend routes.
  - Added guardrail sanitizer/refusal detection tests and a cache-hit service test proving no credit reservation occurs on L1 hit.
  - Contract touchpoints: API, DB, Quota, Artifact, Mobile impact.
  - Validation: `pnpm build`; `pnpm lint`; `pnpm test -- chat-guardrails.spec.ts chat.service.spec.ts ai-credit-ledger.service.spec.ts`.
  - Follow-up: add manual SSE verification against local Redis/MinIO/provider credentials, add concurrency/abort integration coverage, implement admin AI metrics queries, and wire mobile UI.

- 2026-05-24 — Kapter Explain admin observability endpoints. Status: Partial.
  - Added `GET /admin/ai-explain/metrics` and `GET /admin/ai-explain/sessions` behind the existing admin role guard.
  - Added AI Explain metrics aggregation for requests, credits, cache hit rate, guardrail rejection rate, feedback positive rate, daily usage, and top requested segments.
  - Added canonical `segmentText` snapshots to `AiUsageLog` so admin top-segment text is backend-resolved and not client supplied.
  - Contract touchpoints: API, DB, Quota, Dashboard impact.
  - Validation: `pnpm prisma validate`; `pnpm pgen`; `pnpm build`; `pnpm lint`; `pnpm test -- ai-explain-admin.service.spec.ts chat-guardrails.spec.ts chat.service.spec.ts ai-credit-ledger.service.spec.ts`.
  - Follow-up: exercise the admin endpoints against real seeded usage data after the local SSE path is manually verified.

- 2026-05-23 — YouTube Pre-Flight Configuration Panel & Queue updates. Status: Working.
  - Added `sourceLanguage` parameter to `TranscriptionJobPayload` and `AiProcessingJobPayload` queue contracts.
  - Added optional `sourceLanguage` field to the `SubmitYoutubeDto` class validator in `request.dto.ts`.
  - Updated `submitYoutube` in `media.service.ts` to accept `sourceLanguage` from payload, persist it in the `MediaItem` database table, and forward it to `dispatchTranscriptionJob`.
  - Updated `handleTranscription` in `media.processor.ts` to propagate `sourceLanguage` from transcription queue job to `AiProcessingJobPayload` sent to the AI Engine.
  - Resolved all linter errors/warnings in `media.service.ts`, `user.dto.ts` and `minio.service.spec.ts`, making `pnpm lint` and `pnpm test` pass cleanly.

- 2026-05-23 — Modern visual refactoring and thumbnail ingestion updates. Status: Working.
  - Added `youtubeVideoId` and `hasThumbnail` columns to `MediaItem` in database schema via migration `20260523082324_add_media_thumbnail_fields`.
  - Updated `ConfirmUploadDto`, `PresignedUrlResponseDto`, `MediaListItemDto`, and `MediaStatusResponseDto` with thumbnail fields.
  - Integrated `MediaService` to return dynamic `thumbnailUrl` (signed URLs for local videos, direct CDN URLs for YouTube) and pre-allocate `mediaId` in the presigned URL flow.

- 2026-05-21 — Automated YouTube E2E pipeline evaluator added. Status: Working.
  - Added `scripts/e2e-youtube-pipeline-eval.ts` and `pnpm test:youtube:e2e` to drive the real backend path: create/login test user, `POST /media/youtube`, poll `GET /media/:id/status`, fetch `GET /media/:id/artifacts`, read artifact objects from local MinIO, and write a local evaluation bundle.
  - Added root `scripts/run-e2e-youtube-pipeline.ps1` to bring up local infra, start backend API + worker + AI engine, capture logs, run the evaluator, and store suite results under `outputs/e2e-youtube-pipeline/`.
  - Why: the project needed one reproducible end-to-end path that matches the real mobile submit flow closely enough to expose routing and artifact-quality issues outside synthetic benchmarks.
  - Validation: `cd apps/backend-api && pnpm build`; escalated run of `.\scripts\run-e2e-youtube-pipeline.ps1` completed and produced `outputs/e2e-youtube-pipeline/20260521_113334/` with English and Chinese case results plus captured logs.
  - Follow-up: keep using the same harness for regressions, and expand case coverage after the live Chinese routing bug is fixed.

- 2026-04-02 — Authentication flow marked complete. Status: Working.
  - Verify-first registration.
  - OTP verification before user creation.
  - Login, refresh, logout.
  - Access token plus rotated refresh token flow.

- 2026-04-02 — Admin subscription management marked complete. Status: Working.
  - Subscription plan and plan variant CRUD.
  - Admin-only route protection.
  - Smart deactivation and variant versioning behavior.

- 2026-05-21 — Admin user endpoints added. Status: Working.
  - `GET /admin/users` — paginated user list with current subscription/plan info (`UserAdminService.findAll`).
  - `GET /admin/users/:id` — full user detail: profile, subscription snapshot, last 3 usage history cycles, total media count.
  - New `UserAdminService` injectable from `AdminModule`.
  - New DTOs: `AdminUsersQueryDto`, `AdminUserListItemDto`, `AdminUserListResponseDto`, `AdminUserDetailDto`.
  - Validation: `pnpm build` — PASSED (zero errors).

- 2026-04-02 — Media library and upload pipeline marked complete. Status: Working.
  - Presigned upload URL endpoint.
  - Upload confirmation endpoint.
  - YouTube submission endpoint.
  - Media status endpoint.
  - Artifact inventory endpoint.
  - User media library endpoint.
  - `targetLanguage` is carried through the active bilingual flow.

- 2026-04-02 — Validation worker marked complete. Status: Working.
  - Standalone NestJS worker app.
  - Local upload validation.
  - YouTube metadata/audio ingestion.
  - Duration and quota checks.
  - Permanent validation failures move media to `FAILED`.
  - Successful validation dispatches `ai-processing` jobs.

- 2026-04-02 — Supporting modules marked complete. Status: Working.
  - MinIO service.
  - Redis service.
  - Mail service.
  - OTP service.
  - User subscription service.
  - Queue service.
  - CORS/preflight compatibility updates.

## 4. Known Issues

- Artifact summary performance may need optimization later.
  - Impact: `GET /media` currently derives artifact summaries per item from MinIO; large libraries may increase latency.
  - Current workaround: acceptable for current project/demo scale.
  - Related areas: `media` module, MinIO service, media library DTOs.

- Full mobile-device E2E coverage is still a project-level gap.
  - Impact: backend, worker, AI Engine, Redis, MinIO, and app-path submit flow are now covered locally, but the actual Expo/mobile runtime is still not automated in the same harness.
  - Current workaround: use `scripts/run-e2e-youtube-pipeline.ps1` for local app-path backend verification, then manually confirm mobile UX against the same media IDs.

- Local automated E2E now proves the live Chinese route bug is upstream of mobile.
  - Impact: the same Chinese YouTube case that looked acceptable in forced benchmark runs completed through the real backend path as `source_lang=en` and `model_used=distil-large-v3.5`, so the problem is in runtime routing / AI-engine behavior, not in mobile submission payloads.
  - Current workaround: use the new E2E harness to compare backend/worker/AI-engine logs and saved artifacts while routing fixes are developed.

- Four Chinese benchmark fixtures currently have no manual subtitles in `yt-dlp`, so the WER suite cannot score all 20 cases under the strict human-authored-caption policy.
  - Impact: wall-clock latency is still measured for all 20 fixtures, but WER is currently available for 16 fixtures only.
  - Current workaround: keep the suite strict and report `manual_subtitles_unavailable` instead of falling back to auto captions.

## 5. Next Candidates

- [ ] Optimize or cache artifact summaries for `GET /media` if library latency becomes noticeable.
- [ ] Add fixture thresholds or fail-fast assertions on top of the WER suite once acceptable latency/WER ranges are agreed.
- [ ] Swagger operation responses for new admin user endpoints — currently documented but not exhaustively typed in Swagger.
- [ ] Add monitoring/logging conventions for API and worker processes.
- [ ] Review quota usage audit behavior under failed, retried, and completed jobs.
- [ ] Confirm all soft-delete read paths explicitly filter `deletedAt: null`.

## 6. Contract Touchpoints

### API

Stable documented endpoints:

- `POST /media/presigned-url`
- `POST /media/confirm-upload`
- `POST /media/youtube`
- `GET /media/:id/status`
- `GET /media/:id/artifacts`
- `GET /media`
- `POST /media/:id/explain`
- `GET /media/:id/explain/history`
- `POST /media/:id/explain/feedback`
- `POST /media/:id/lookup`
- `POST /media/:id/lookup/bookmark`
- `GET /vocabulary`

### Queue

Backend produces and consumes queue payloads across two queues:

- Consumes `transcription` jobs in the validation worker.
- Produces `ai-processing` jobs for the AI Engine.

Any queue payload change is cross-module and must be coordinated with `apps/ai-engine`.

### Storage

Backend manages raw upload negotiation and artifact inventory access through MinIO.

Important artifact roots:

- `processed/{mediaId}/chunks/`
- `processed/{mediaId}/translated_batches/`
- `processed/{mediaId}/final.json`

### Database

Backend owns Prisma schema and application data access patterns.

Important rules:

- Use migrations for schema changes.
- Do not use `db push` for production-style schema changes.
- Preserve soft deletes.
- Keep quota/subscription logic aligned with snapshot fields and usage history.

### Mobile Impact

Mobile consumes media status, artifact inventory, media library summaries, auth responses, and upload confirmation behavior. API response shape changes must be coordinated with `apps/mobile-app`.

## 7. Validation Notes

Fast backend validation:

```bash
cd apps/backend-api
pnpm build
pnpm lint
pnpm test
```

Integration validation when HTTP, queue, storage, auth, upload, or worker behavior changes:

```bash
cd apps/backend-api
pnpm test:e2e
```

Prisma validation after schema changes:

```bash
cd apps/backend-api
pnpm pgen
pnpm pmigrate:dev <name>
```

Last verified:

- 2026-05-21 — `cd apps/backend-api && pnpm build` passed after adding the evaluator script.
- 2026-05-21 — `.\scripts\run-e2e-youtube-pipeline.ps1` completed and produced a full local run bundle under `outputs/e2e-youtube-pipeline/20260521_113334/`.

## 8. Update Rules

Update this checkpoint when:

- A backend feature or endpoint changes status.
- A schema, DTO, queue payload, or API response shape changes.
- A worker behavior changes.
- A bug fix reveals a systemic issue.
- A dependency is added or upgraded.
- A validation result changes the known state.

Do not add long architecture explanations here. Move stable rules to `INSTRUCTION.md`, cross-module contracts to a future `CONTRACTS.md`, and historical context to `docs/archive/`.
