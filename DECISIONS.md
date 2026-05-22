# DECISIONS.md

## Purpose

This file records the major architecture decisions for the Bilingual Subtitle System.

Use this file to understand **why** the project is structured this way before proposing large refactors. Exact schemas, payloads, endpoint contracts, event shapes, and artifact rules belong in `CONTRACTS.md`. Current progress belongs in each module's `CHECKPOINT.md`.

## How Agents Should Use This File

Read this file when a task touches architecture, module boundaries, queue flow, artifact storage, AI pipeline design, processing UX, quota behavior, or any cross-module contract.

When changing an accepted decision:

1. Explain why the existing decision no longer fits.
2. Update `CONTRACTS.md` if any schema, payload, endpoint, artifact, socket, progress, or auth behavior changes.
3. Follow `.agent/workflows/contract-change.md` when the change crosses module boundaries.
4. Update affected module `CHECKPOINT.md` files.
5. Add a new ADR instead of silently rewriting history.

## Decision Status Labels

- `Accepted` — active project direction.
- `Superseded` — replaced by a newer decision.
- `Deprecated` — kept for historical context only.
- `Proposed` — not yet accepted.

---

## Decision Index

- [ADR-001 — Build a SaaS-style bilingual subtitle system, not a simple local converter](#adr-001--build-a-saas-style-bilingual-subtitle-system-not-a-simple-local-converter)
- [ADR-002 — Split the system into Mobile App, Backend API, AI Engine, and Infra modules](#adr-002--split-the-system-into-mobile-app-backend-api-ai-engine-and-infra-modules)
- [ADR-003 — Extract audio on the mobile client before local media upload](#adr-003--extract-audio-on-the-mobile-client-before-local-media-upload)
- [ADR-004 — Upload media directly to MinIO through backend-issued presigned URLs](#adr-004--upload-media-directly-to-minio-through-backend-issued-presigned-urls)
- [ADR-005 — Keep the backend as API gateway, auth/quota owner, and validation worker, not an ML runtime](#adr-005--keep-the-backend-as-api-gateway-authquota-owner-and-validation-worker-not-an-ml-runtime)
- [ADR-006 — Use a two-queue BullMQ pipeline for media validation and GPU processing](#adr-006--use-a-two-queue-bullmq-pipeline-for-media-validation-and-gpu-processing)
- [ADR-007 — Store durable streaming artifacts in MinIO before final output exists](#adr-007--store-durable-streaming-artifacts-in-minio-before-final-output-exists)
- [ADR-008 — Use socket-first processing UX with REST hydration, not aggressive polling](#adr-008--use-socket-first-processing-ux-with-rest-hydration-not-aggressive-polling)
- [ADR-009 — Use the V2 async NMT-first AI pipeline as the only active production path](#adr-009--use-the-v2-async-nmt-first-ai-pipeline-as-the-only-active-production-path)
- [ADR-010 — Use `targetLanguage` as the bilingual flow switch and do not reintroduce `processingMode`](#adr-010--use-targetlanguage-as-the-bilingual-flow-switch-and-do-not-reintroduce-processingmode)
- [ADR-011 — Keep subtitle artifact schemas mobile-compatible and progressive-playback-friendly](#adr-011--keep-subtitle-artifact-schemas-mobile-compatible-and-progressive-playback-friendly)
- [ADR-012 — Enforce quota and subscription rules in the backend using snapshot-style records](#adr-012--enforce-quota-and-subscription-rules-in-the-backend-using-snapshot-style-records)
- [ADR-013 — Sign client-facing MinIO URLs with the public endpoint client directly](#adr-013--sign-client-facing-minio-urls-with-the-public-endpoint-client-directly)
- [ADR-014 — Keep mobile dependent on Backend API, not directly on AI Engine](#adr-014--keep-mobile-dependent-on-backend-api-not-directly-on-ai-engine)
- [ADR-015 — Adopt the V2.1 hybrid after-ASR runtime for single-GPU AI Engine workers](#adr-015--adopt-the-v21-hybrid-after-asr-runtime-for-single-gpu-ai-engine-workers)
- [ADR-016 — Use ASR provider routing so `during_asr` stays the target UX mode on 16GB GPUs](#adr-016--use-asr-provider-routing-so-during_asr-stays-the-target-ux-mode-on-16gb-gpus)

---

## ADR-001 — Build a SaaS-style bilingual subtitle system, not a simple local converter

Status: Accepted

### Decision

Build the product as a SaaS-style bilingual subtitle platform with authenticated users, media library, quotas, durable artifacts, and progressive subtitle playback.

### Reason

The project goal is not only to convert one media file into one subtitle file. The product needs a reusable workflow for media ingestion, background processing, bilingual output, word-level karaoke timing, playback readiness, usage tracking, and later SaaS features such as subscriptions or vocabulary learning.

### Tradeoffs

- More moving parts than a local script.
- Requires stronger contracts between modules.
- Requires infra services such as PostgreSQL, Redis, and MinIO.
- Provides a stronger final-year project because it demonstrates product architecture, async processing, ML integration, and real app UX.

### Guardrails

- Do not collapse the system into a single local script as the default architecture.
- Do not remove durable media/job state just to simplify a small feature.
- Keep final-year project evidence in mind: demoability, observability, and measurable ML quality matter.

### Related Files

- `INSTRUCTION.md`
- `PROJECT_MAP.md`
- `CONTRACTS.md`
- `apps/backend-api/INSTRUCTION.md`
- `apps/ai-engine/INSTRUCTION.md`
- `apps/mobile-app/INSTRUCTION.md`

---

## ADR-002 — Split the system into Mobile App, Backend API, AI Engine, and Infra modules

Status: Accepted

### Decision

Keep the monorepo split into dedicated modules:

- `apps/mobile-app` — user-facing upload, processing feedback, player, preferences, and auth session UX.
- `apps/backend-api` — HTTP boundary, auth, quota, media records, presigned upload, API contracts, and validation worker.
- `apps/ai-engine` — GPU-heavy subtitle pipeline, transcription, alignment, translation, streaming artifacts, and final subtitle export.
- `infra` — local PostgreSQL, Redis, MinIO, and service configuration.

### Reason

Each module has a different runtime, responsibility, and validation style. Keeping clear boundaries prevents unrelated concerns from leaking into each other.

### Tradeoffs

- Cross-module contracts must be documented carefully.
- End-to-end testing requires multiple services.
- A small feature may require coordinated changes across multiple modules.

### Guardrails

- Do not place GPU-heavy transcription or translation inside the mobile app or backend API.
- Do not make mobile talk directly to AI Engine by default.
- Do not let infra-specific assumptions leak into product logic.

### Related Files

- `PROJECT_MAP.md`
- `COMMANDS.md`
- `CONTRACTS.md`
- `apps/*/INSTRUCTION.md`
- `apps/*/CHECKPOINT.md`

---

## ADR-003 — Extract audio on the mobile client before local media upload

Status: Accepted

### Decision

For local video uploads, the mobile app extracts audio before requesting upload flow, so the backend and AI Engine receive audio-oriented payloads instead of full video whenever possible.

### Reason

Subtitle generation primarily needs audio. Extracting audio client-side reduces upload size, backend bandwidth, object storage usage, and validation cost.

### Tradeoffs

- Mobile app has more responsibility in the upload flow.
- Native/mobile build behavior becomes more important.
- Some device-specific extraction errors must be handled in the client.

### Guardrails

- Do not proxy large local video files through the backend by default.
- Do not skip client-side extraction unless the task explicitly introduces a justified fallback.
- Keep YouTube/link ingestion as a backend-worker responsibility because the client does not own that media file directly.

### Related Files

- `apps/mobile-app/INSTRUCTION.md`
- `apps/backend-api/INSTRUCTION.md`
- `CONTRACTS.md`

---

## ADR-004 — Upload media directly to MinIO through backend-issued presigned URLs

Status: Accepted

### Decision

Use backend-issued presigned MinIO URLs for direct media upload from the mobile app to object storage.

### Reason

The backend should negotiate and validate upload permissions, but it should not proxy large media payloads. Direct upload keeps the API responsive and reduces backend memory, bandwidth, and timeout pressure.

### Tradeoffs

- Upload flow has multiple steps: request presigned URL, upload to MinIO, confirm upload to backend.
- Client and backend must agree on object key and confirmation behavior.
- Local MinIO/public endpoint configuration must be correct.

### Guardrails

- Do not route large binary uploads through NestJS unless the task explicitly requires a small controlled fallback.
- Do not bypass backend quota/auth checks before upload negotiation.
- Keep presigned upload and confirmation contracts documented in `CONTRACTS.md`.

### Related Files

- `apps/mobile-app/INSTRUCTION.md`
- `apps/backend-api/INSTRUCTION.md`
- `CONTRACTS.md`
- `COMMANDS.md`

---

## ADR-005 — Keep the backend as API gateway, auth/quota owner, and validation worker, not an ML runtime

Status: Accepted

### Decision

The backend owns authentication, authorization, subscription/quota enforcement, media APIs, presigned upload negotiation, media records, and validation/ingestion before GPU processing. It does not perform transcription, alignment, NMT translation, or LLM refinement.

### Reason

The backend should stay responsive and predictable. ML/audio processing is long-running, GPU-dependent, failure-prone, and better isolated in the Python AI Engine.

### Tradeoffs

- Requires queue-based communication between backend and AI Engine.
- Requires explicit payload contracts.
- Backend must track processing progress without owning the processing implementation.

### Guardrails

- Do not add Whisper, VAD, NMT, or LLM pipeline logic to NestJS services.
- Do not make backend controllers wait synchronously for full AI processing.
- Keep queue payload changes coordinated with `apps/ai-engine`.

### Related Files

- `apps/backend-api/INSTRUCTION.md`
- `apps/ai-engine/INSTRUCTION.md`
- `CONTRACTS.md`
- `.agent/workflows/contract-change.md`

---

## ADR-006 — Use a two-queue BullMQ pipeline for media validation and GPU processing

Status: Accepted

### Decision

Use two Redis/BullMQ queues:

1. `transcription` — backend worker validates uploads or YouTube submissions, performs duration/quota checks, prepares audio, and dispatches AI work.
2. `ai-processing` — Python AI Engine performs GPU-heavy subtitle generation.

The queue prefix is `bilingual`.

### Reason

Validation and GPU processing have different runtime needs. Splitting queues keeps I/O-bound validation separate from long-running GPU jobs and makes failure handling cleaner.

### Tradeoffs

- Requires two worker processes.
- Requires stable queue payloads.
- Requires end-to-end visibility to debug a job across both queues.

### Guardrails

- Do not push unvalidated media directly to the AI Engine queue.
- Do not merge the two queues unless the validation/processing architecture is intentionally redesigned.
- Any queue payload change must follow `.agent/workflows/contract-change.md`.

### Related Files

- `CONTRACTS.md`
- `apps/backend-api/INSTRUCTION.md`
- `apps/ai-engine/INSTRUCTION.md`
- `COMMANDS.md`

---

## ADR-007 — Store durable streaming artifacts in MinIO before final output exists

Status: Accepted

### Decision

The AI Engine writes progressive artifacts under `processed/{mediaId}/`:

- `chunks/` — Tier 1 raw transcription chunks.
- `translated_batches/` — Tier 2 bilingual translated batches.
- `final.json` — canonical final subtitle output.

### Reason

Long media processing should not behave like a black box. Durable streaming artifacts let the app show readiness earlier, recover state after reconnects, and support progressive player hydration before the final artifact exists.

### Tradeoffs

- More artifact paths to maintain.
- Mobile and backend must understand partial readiness.
- Cleanup and storage accounting become more important.

### Guardrails

- Do not make `final.json` the only usable output surface.
- Do not change artifact paths without updating `CONTRACTS.md`, backend artifact inventory, AI Engine upload logic, and mobile hydration logic.
- Keep `final.json` canonical once processing completes.

### Related Files

- `CONTRACTS.md`
- `apps/ai-engine/INSTRUCTION.md`
- `apps/backend-api/INSTRUCTION.md`
- `apps/mobile-app/INSTRUCTION.md`

---

## ADR-008 — Use socket-first processing UX with REST hydration, not aggressive polling

Status: Accepted

### Decision

Use REST to hydrate current processing state and artifact inventory, then use socket events for live progress and readiness updates.

### Reason

Processing can be long-running. Socket-first UX provides better feedback and avoids frequent polling load. REST hydration remains necessary for refresh/reconnect and initial screen load.

### Tradeoffs

- Socket lifecycle and cache patching must be reliable.
- Backend must mirror AI Engine Redis events through its socket layer.
- REST endpoints still need to be accurate for recovery.

### Guardrails

- Do not reintroduce aggressive polling when socket events already cover the workflow.
- If adding fallback polling, keep it conservative and justified.
- Progress must remain monotonic in emitted events and persisted DB writes.

### Related Files

- `CONTRACTS.md`
- `apps/mobile-app/INSTRUCTION.md`
- `apps/backend-api/INSTRUCTION.md`
- `apps/ai-engine/INSTRUCTION.md`

---

## ADR-009 — Use the V2 async NMT-first AI pipeline as the only active production path

Status: Superseded by ADR-015 for single-GPU runtime scheduling

### Decision

Use the V2 AI Engine pipeline based on `src/async_pipeline.py`, with producer-consumer flow, `NMTTranslator` as the active translation runtime, and optional LLM refinement.

The old V1 translation flow using `translator_engine.py` and `incremental_pipeline.py` is not active and must not be reintroduced.

### Reason

The V2 pipeline improves throughput and streaming behavior by decoupling transcription from translation using bounded async work. NMT provides a faster GPU-native translation baseline, while optional LLM refinement can improve quality when enabled.

### Tradeoffs

- More pipeline orchestration complexity.
- Requires NMT model management and language-pair quality tuning.
- LLM refinement must remain optional to control latency and resource usage.

### Guardrails

- Do not reintroduce `translator_engine.py` as the active translation path.
- Do not reintroduce `incremental_pipeline.py` as the active orchestration path.
- Do not hardcode performance settings; use existing runtime settings such as `AI_PERF_MODE` and NMT config.
- Keep GPU failure handling graceful.

### Related Files

- `apps/ai-engine/INSTRUCTION.md`
- `apps/ai-engine/CHECKPOINT.md`
- `COMMANDS.md`
- `CONTRACTS.md`

---

## ADR-010 — Use `targetLanguage` as the bilingual flow switch and do not reintroduce `processingMode`

Status: Accepted

### Decision

The product is bilingual-by-default. Use `targetLanguage` to drive target translation behavior. Do not reintroduce `processingMode` into API DTOs, queue payloads, AI Engine branching, or mobile flow.

### Reason

`processingMode` created unnecessary branching and ambiguity. The active product direction is bilingual subtitle generation by default, with translation auto-disabled only when source and target languages are effectively the same.

### Tradeoffs

- Less runtime flexibility for non-bilingual modes.
- Simpler contract and easier cross-module reasoning.
- Future non-translation modes would need a new explicit product decision.

### Guardrails

- Do not add `processingMode` back casually.
- Do not branch AI processing based on legacy V1 mode concepts.
- If a true mono-subtitle mode is needed later, create a new ADR and update `CONTRACTS.md` first.

### Related Files

- `CONTRACTS.md`
- `apps/backend-api/INSTRUCTION.md`
- `apps/ai-engine/INSTRUCTION.md`
- `apps/mobile-app/INSTRUCTION.md`

---

## ADR-011 — Keep subtitle artifact schemas mobile-compatible and progressive-playback-friendly

Status: Accepted

### Decision

AI Engine output must stay compatible with the mobile subtitle player and progressive playback flow. Translated batches should be usable before `final.json` exists, and final output should remain the canonical ordered subtitle artifact.

### Reason

The mobile player is a core product surface. It depends on stable timing, text, translation, phonetic fields, word timestamps, segment ordering, and readiness states.

### Tradeoffs

- AI Engine schemas cannot be changed freely.
- Backend artifact inventory must reflect readiness in a client-friendly way.
- Mobile must handle partial and final states consistently.

### Guardrails

- Do not change `chunks/`, `translated_batches/`, or `final.json` shape without following the contract-change workflow.
- Do not make mobile reconstruct storage inventory from raw object listing when backend artifact summaries already exist.
- Preserve word-level timing where available.

### Related Files

- `CONTRACTS.md`
- `apps/ai-engine/INSTRUCTION.md`
- `apps/mobile-app/INSTRUCTION.md`
- `apps/backend-api/INSTRUCTION.md`

---

## ADR-012 — Enforce quota and subscription rules in the backend using snapshot-style records

Status: Accepted

### Decision

Backend logic owns quota and subscription enforcement. Usage and subscription state should be audit-ready and based on stored snapshots/history, not recomputed from raw events on every read path.

### Reason

Quota enforcement is a product/business rule, not an AI Engine concern. Snapshot-style records make billing, audits, and historical plan changes easier to reason about.

### Tradeoffs

- Backend data model is more complex.
- Job creation and validation need quota checks at multiple points.
- Usage counting must avoid double-counting failed or retried jobs.

### Guardrails

- Do not move quota enforcement into the mobile app or AI Engine.
- Do not hard-delete user/media records that must remain audit-relevant.
- Keep quota checks aligned with subscription snapshots and usage history.

### Related Files

- `apps/backend-api/INSTRUCTION.md`
- `apps/backend-api/CHECKPOINT.md`
- `CONTRACTS.md`

---

## ADR-013 — Sign client-facing MinIO URLs with the public endpoint client directly

Status: Accepted

### Decision

Client-facing MinIO artifact URLs must be signed using the MinIO client configured for the public endpoint. Do not sign internal-host URLs and rewrite them afterward.

### Reason

Presigned URLs include host information in the signature. Rewriting internal-host signed URLs can break access and creates confusing environment-specific behavior.

### Tradeoffs

- Requires correct public endpoint configuration in local/dev environments.
- Requires clear separation between internal service access and client-facing artifact access.

### Guardrails

- Do not sign against an internal host and string-replace it later.
- Keep public endpoint settings documented in environment/config references.
- Test client-facing artifact URLs through the same surface the mobile app uses.

### Related Files

- `CONTRACTS.md`
- `apps/backend-api/INSTRUCTION.md`
- `apps/ai-engine/INSTRUCTION.md`
- `COMMANDS.md`

---

## ADR-014 — Keep mobile dependent on Backend API, not directly on AI Engine

Status: Accepted

### Decision

The mobile app communicates with the Backend API for auth, upload negotiation, media status, artifact inventory, and processing feedback. It should not call the AI Engine directly in normal product flow.

### Reason

Backend is the authenticated product boundary. Direct mobile-to-AI Engine communication would bypass auth, quota, media ownership, artifact inventory, and stable API contracts.

### Tradeoffs

- Backend must expose enough status and artifact surfaces for mobile.
- AI Engine cannot independently define mobile-facing behavior.
- Cross-module changes require more coordination.

### Guardrails

- Do not add mobile-to-AI Engine calls unless a new ADR explicitly approves a special-case debug/dev path.
- Keep mobile networking centralized through the existing API layer.
- Keep artifact readiness mediated by backend REST/socket surfaces.

### Related Files

- `apps/mobile-app/INSTRUCTION.md`
- `apps/backend-api/INSTRUCTION.md`
- `apps/ai-engine/INSTRUCTION.md`
- `CONTRACTS.md`

---

## ADR-015 — Adopt the V2.1 hybrid after-ASR runtime for single-GPU AI Engine workers

Status: Superseded by ADR-016

### Decision

Keep the current V2 public artifact and event protocol, but change the default single-worker AI Engine runtime to a V2.1 hybrid schedule for constrained single-GPU deployments.

The accepted default is:

- lazy per-job Whisper route selection instead of eager dual-route residency;
- internal source-language routing from config hint, local hint, or short turbo-route probe;
- live Tier 1 chunk uploads during ASR;
- `AI_TRANSLATION_START_POLICY=after_asr` by default, so ASR unloads before NMT translation starts;
- no eager NMT prefetch in the default hybrid path.

### Reason

The previous eager-overlap interpretation of V2 could push one 16GB GPU worker too close to a residency cliff by keeping multiple heavy Whisper routes and NLLB active at once. The hybrid schedule keeps the public contract stable while making the default runtime fit the target hardware more reliably.

### Tradeoffs

- First translated batch may arrive later because translation waits for ASR completion by default.
- Runtime orchestration is more explicit because models are loaded, unloaded, and routed per job.
- Benchmark evidence is still required before enabling overlap again on specific hardware profiles.
- Horizontal scale-out with separate `turbo` and `full` workers still needs an explicit queue-routing strategy.

### Guardrails

- Do not change `chunks/`, `translated_batches/`, `final.json`, socket event names, or monotonic progress semantics as part of this runtime decision.
- Do not reintroduce `processingMode` or revive deleted V1 translation paths.
- Do not eagerly load both Whisper routes at worker startup in the default single-GPU path.
- Do not enable NMT prefetch or `during_asr` overlap by default without benchmark evidence for the target hardware.

### Related Files

- `apps/ai-engine/INSTRUCTION.md`
- `apps/ai-engine/CHECKPOINT.md`
- `apps/ai-engine/src/async_pipeline.py`
- `apps/ai-engine/src/core/smart_aligner.py`
- `apps/ai-engine/src/core/nmt_translator.py`
- `apps/ai-engine/src/scripts/benchmark_suite.py`

---

## ADR-016 — Use ASR provider routing so `during_asr` stays the target UX mode on 16GB GPUs

Status: Accepted

### Decision

Keep the public V2 pipeline contract unchanged, but move AI Engine ASR selection behind an internal provider-routing layer.

The accepted default direction is:

- English default route: Distil-Whisper via `faster-whisper`
- English/unknown fallback: Whisper turbo
- Chinese shipping default: Whisper full until an alternative route is benchmark-certified
- Chinese prototype routes: SenseVoice Small and Paraformer behind config
- Requested `AI_TRANSLATION_START_POLICY=during_asr` remains the target UX mode
- The effective policy may auto-downgrade to `after_asr` for uncertified or fallback-heavy routes

### Reason

V2.1 proved that pure scheduling changes are not enough. `after_asr` is stable but delays the first translated batch too much, while `during_asr` is only practical if the selected ASR model can coexist with NMT on a 16GB GPU.

The real blocker is ASR residency and route fit by language:

- English does not need the same multilingual heavy route strategy as Chinese
- Chinese needs dedicated prototype candidates judged by timestamp compatibility, not CER alone
- The pipeline needs a route-aware place to decide whether overlap is safe without changing backend or mobile contracts

### Tradeoffs

- The AI Engine now owns more internal routing complexity.
- Some routes are available only as experimental providers until timing quality and VRAM behavior are certified.
- The worker may request `during_asr` but still run `after_asr` for a given job when the selected route is not certified.
- Benchmark reporting must become more explicit about provider, route, and effective policy.

### Guardrails

- Do not change `chunks/`, `translated_batches/`, `final.json`, queue payloads, socket event names, or public progress semantics as part of this decision.
- Do not reintroduce `processingMode` or revive deleted V1 translation paths.
- Do not treat FunASR prototype routes as shipping defaults until they pass route-level benchmark and timestamp-quality gates.
- Keep `Sentence` / `Word` as the internal normalization boundary for every ASR provider.

### Related Files

- `apps/ai-engine/INSTRUCTION.md`
- `apps/ai-engine/CHECKPOINT.md`
- `apps/ai-engine/src/core/asr/`
- `apps/ai-engine/src/core/smart_aligner.py`
- `apps/ai-engine/src/async_pipeline.py`
- `apps/ai-engine/src/scripts/benchmark_suite.py`

---

## Maintenance Notes

- New architecture-level changes should add a new ADR instead of rewriting an existing one.
- If a decision is replaced, mark the old one as `Superseded` and link to the new ADR.
- Keep this file focused on why decisions exist. Do not copy exact schemas from `CONTRACTS.md`.
- Keep implementation progress in module `CHECKPOINT.md` files.
