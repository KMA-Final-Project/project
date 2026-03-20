# S02: Durable streaming contracts

**Goal:** Freeze the chunk, translated-batch, and final artifact contracts so downstream consumers can rely on explicit shapes and matching rules instead of inference.
**Demo:** Run contract checks and a live-infra-backed harness to show that AI Engine artifacts written to MinIO have stable shapes, explicit matching semantics, and representative behavior across the three sample media types.

## Must-Haves

- Tier 1 chunk artifacts, Tier 2 translated batches, and `final.json` have mechanically checked shapes and required-field invariants.
- The matching rule between chunks, translated batches, and final segments is explicit and no longer relies on blind array position alone.
- AI Engine contract types and mirrored downstream subtitle types are aligned to the same durable artifact truth.
- Contract validation can run both cheaply in fake mode and against the local `infra/` Redis/Postgres/MinIO services for more truthful judgment.
- The sample media matrix is reflected in validation:
  - `demo_audio_2.mp3` — hard CJK music edge case
  - `demo_audio_3.mp3` — technical talkshow / standard dialogue path
  - `demo_audio_4.mp3` — English speech path

## Proof Level

- This slice proves: contract
- Real runtime required: yes
- Human/UAT required: no

## Verification

- `cd apps/ai-engine && ./venv/Scripts/python.exe -m pytest tests/test_streaming_contracts.py -q`
- `cd apps/mobile-app && npx tsc --noEmit -p tsconfig.json`
- `cd apps/ai-engine && ./venv/Scripts/python.exe -m src.scripts.test_v2_pipeline demo_audio_3.mp3 --lang vi --live-infra`
- `cd apps/ai-engine && ./venv/Scripts/python.exe -m src.scripts.test_v2_pipeline demo_audio_4.mp3 --lang vi --live-infra`
- `cd apps/ai-engine && ./venv/Scripts/python.exe -m pytest tests/test_streaming_contracts.py -v --tb=short 2>&1` — failure-path diagnostic: shows per-test PASSED/FAILED breakdown with short tracebacks for contract drift triage (missing fields, wrong types, coherence violations)

## Observability / Diagnostics

- Runtime signals: contract fixture assertions, timing checkpoints, live artifact keys/URLs, optional Redis/DB side-effect traces in live-infra mode
- Inspection surfaces: `tests/test_streaming_contracts.py`, `src.scripts.test_v2_pipeline --live-infra`, MinIO object inspection for `processed/{mediaId}/...`
- Failure visibility: missing required fields, mismatched segment identity/mapping metadata, downstream type drift, live artifact shape mismatch
- Redaction constraints: do not print secrets from `.env` or infrastructure credentials

## Integration Closure

- Upstream surfaces consumed: `apps/ai-engine/src/async_pipeline.py`, `apps/ai-engine/src/schemas.py`, `apps/ai-engine/src/minio_client.py`, `apps/ai-engine/src/scripts/test_v2_pipeline.py`, `apps/ai-engine/tests/test_first_batch_streaming.py`, `apps/mobile-app/src/types/subtitle.ts`, `apps/mobile-app/src/hooks/useProcessingSubtitles.ts`
- New wiring introduced in this slice: explicit artifact identity/matching metadata and optional live-infra validation path
- What remains before the milestone is truly usable end-to-end: readiness-event sequencing, partial-availability playback contract, and full live worker proof across queue/Redis/MinIO/Postgres

## Tasks

- [x] **T01: Freeze artifact shapes with contract tests** `est:45m`
  - Why: S01 proved runtime ordering, but the actual artifact contract is still spread across code, tests, and consumer assumptions.
  - Files: `apps/ai-engine/src/schemas.py`, `apps/ai-engine/src/minio_client.py`, `apps/ai-engine/tests/test_streaming_contracts.py`
  - Do: Codify the exact Tier 1 chunk, Tier 2 batch, and final output shapes with required-field invariants, path conventions, and intentional asymmetries.
  - Verify: `cd apps/ai-engine && ./venv/Scripts/python.exe -m pytest tests/test_streaming_contracts.py -q`
  - Done when: contract drift breaks mechanically in one place instead of leaking silently across the stack.

- [x] **T02: Add explicit segment identity and matching metadata** `est:1h`
  - Why: The current mobile-side index overlay is fragile and not a durable contract.
  - Files: `apps/ai-engine/src/schemas.py`, `apps/ai-engine/src/async_pipeline.py`, `apps/mobile-app/src/types/subtitle.ts`
  - Do: Introduce the minimal explicit identity/mapping metadata needed to match chunks, translated batches, and final segments without relying only on array position.
  - Verify: `cd apps/ai-engine && ./venv/Scripts/python.exe -m pytest tests/test_streaming_contracts.py -q`
  - Done when: partial outputs can be matched by explicit contract fields, and the mirrored subtitle types reflect that truth.

- [x] **T03: Mirror the durable contract into downstream typed surfaces** `est:45m`
  - Why: AI Engine is the source of truth, but downstream typed surfaces still carry stale assumptions.
  - Files: `apps/mobile-app/src/types/subtitle.ts`, `apps/mobile-app/src/hooks/useProcessingSubtitles.ts`, `apps/ai-engine/ARCHITECTURE_CONTEXT.md`
  - Do: Update the mirrored subtitle types and the documented consumer assumptions so they stop implying blind index-only matching, while keeping full downstream behavior rewrites out of scope.
  - Verify: `cd apps/mobile-app && npx tsc --noEmit -p tsconfig.json`
  - Done when: the typed consumer surface matches the durable AI artifact contract even if later slices still improve player/runtime behavior.

- [x] **T04: Add live-infra contract validation across representative media** `est:1h`
  - Why: You already have Redis, Postgres, and MinIO in `infra/`, so contract judgment should be possible against live services instead of fake-only harnesses.
  - Files: `apps/ai-engine/src/scripts/test_v2_pipeline.py`, `apps/ai-engine/tests/test_first_batch_streaming.py`, `infra/minio/docker-compose.yml`, `infra/postgres/docker-compose.yml`, `infra/redis/docker-compose.yml`
  - Do: Add an optional live-infra validation mode and use the three demo media files to judge contract behavior across hard CJK music, technical talkshow, and English speech paths.
  - Verify: `cd apps/ai-engine && ./venv/Scripts/python.exe -m src.scripts.test_v2_pipeline demo_audio_3.mp3 --lang vi --live-infra`
  - Done when: the harness can validate durable artifacts against local infrastructure and the contract holds across the representative media matrix.

## Files Likely Touched

- `apps/ai-engine/src/schemas.py`
- `apps/ai-engine/src/async_pipeline.py`
- `apps/ai-engine/src/minio_client.py`
- `apps/ai-engine/src/scripts/test_v2_pipeline.py`
- `apps/ai-engine/tests/test_streaming_contracts.py`
- `apps/ai-engine/tests/test_first_batch_streaming.py`
- `apps/mobile-app/src/types/subtitle.ts`
- `apps/mobile-app/src/hooks/useProcessingSubtitles.ts`
- `apps/ai-engine/ARCHITECTURE_CONTEXT.md`
