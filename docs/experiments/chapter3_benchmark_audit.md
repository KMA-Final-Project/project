# Chapter 3 Benchmark Audit

Audit date: 2026-06-11  
Repository root: `C:\Users\sondo\my_projects\KMA\billingual_project`

This audit is based on live source inspection of the current repository, plus existing saved benchmark outputs already present in the workspace. It does **not** fabricate new measurements. Where a saved run is mentioned, it is described as historical evidence already in the repo, not as a guaranteed current result.

## Scope and current modules

Current top-level application modules under `apps/`:

- `apps/mobile-app`: Expo 54 mobile client and the primary user-facing submit + playback flow.
- `apps/backend-api`: NestJS API, upload/status/artifact endpoints, validation worker, socket gateway, BullMQ producers.
- `apps/ai-engine`: Python GPU worker that performs ASR, translation, progressive artifact generation, and final export.
- `apps/dashboard`: admin-only monitoring UI; useful for queue/telemetry inspection, not part of the end-user runtime path requested here.
- `apps/client-web`: auxiliary web module; not part of the core mobile subtitle runtime described in this audit.

Supporting shared package:

- `packages/contracts`: shared transport contracts.

Core reference docs inspected for this audit:

- `AGENTS.md`
- `PROJECT_MAP.md`
- `INSTRUCTION.md`
- `COMMANDS.md`
- `CONTRACTS.md`
- `apps/backend-api/CHECKPOINT.md`
- `apps/ai-engine/CHECKPOINT.md`
- `apps/mobile-app/CHECKPOINT.md`
- `apps/dashboard/CHECKPOINT.md`

## 1. Current runtime flow summary

This project currently implements **progressive asynchronous subtitle availability**, not live simultaneous interpretation. The actual runtime path is:

### 1.1 Mobile App submission

Relevant files:

- `apps/mobile-app/src/services/api/media.service.ts`
- `apps/mobile-app/src/hooks/useSocketSync.ts`
- `apps/mobile-app/src/hooks/usePlayerSubtitles.ts`
- `apps/mobile-app/src/hooks/useProcessingSubtitles.ts`

Implemented behavior:

1. The mobile app submits media through the backend API.
2. It subscribes to socket updates for processing progress and artifact availability.
3. During processing, it can render preview subtitle state from partial artifacts.
4. For playback, it can hydrate from `translated_batches/` before `final.json` exists.

The mobile client explicitly listens for:

- `media_progress`
- `media_chunk_ready`
- `media_batch_ready`
- `media_completed`
- `media_failed`

The player-side readiness model is implemented in `apps/mobile-app/src/hooks/usePlayerSubtitles.ts`, which computes:

- `readyUntilSec`
- `hasCoverageAt(timeSec)`

That is strong evidence that the intended "real-time" claim is **reduced waiting time through progressive readiness**, not live interpretation.

### 1.2 Backend API media creation and queue submission

Relevant files:

- `apps/backend-api/src/modules/media/media.service.ts`
- `apps/backend-api/src/modules/queue/queue.types.ts`

Implemented behavior:

1. The backend confirms an upload or accepts a YouTube submission.
2. It creates a `MediaItem` with initial status such as `QUEUED`.
3. It stores `targetLanguage`, status/progress state, and artifact-summary placeholders.
4. It pushes a validation/transcription job to the backend worker queue.

Important runtime endpoints used by the app path:

- `POST /media/confirm-upload`
- `POST /media/youtube`
- `GET /media/:id/status`
- `GET /media/:id/artifacts`

`GET /media/:id/status` returns user-visible processing state such as:

- `status`
- `progress`
- `currentStep`
- `estimatedTimeRemaining`
- `failCode`
- `failReason`
- artifact summary

`GET /media/:id/artifacts` returns the durable MinIO-backed inventory for:

- `chunks/`
- `translated_batches/`
- `final.json`

### 1.3 Backend worker validation and AI queue handoff

Relevant files:

- `apps/backend-api/src/modules/media/workers/media.processor.ts`
- `apps/backend-api/src/modules/youtube/services/youtube-download.service.ts`

Implemented behavior:

1. The backend worker receives a `transcription` queue job.
2. It marks the media item as validating.
3. For YouTube sources, it fetches metadata, checks duration, downloads audio, and uploads validated audio to MinIO raw storage.
4. For direct uploads, it fetches the raw object from MinIO and validates it with `ffprobe`.
5. It calculates authoritative `durationSeconds`.
6. It re-checks quota against the validated duration.
7. It pushes an `ai-processing` job to the AI engine queue with:
   - `mediaId`
   - `audioS3Key`
   - `durationSeconds`
   - `userId`
   - `targetLanguage`
   - `sourceLanguage` when available
8. It marks the media item as `PROCESSING`.

This worker stage is the trust boundary between user-submitted media and AI processing.

### 1.4 AI Engine processing and progressive artifact creation

Relevant files:

- `apps/ai-engine/src/main.py`
- `apps/ai-engine/src/async_pipeline.py`
- `apps/ai-engine/src/minio_client.py`
- `apps/ai-engine/src/events.py`
- `apps/ai-engine/src/db.py`
- `apps/ai-engine/src/schemas.py`

Implemented behavior:

1. The AI engine consumes `ai-processing` jobs from BullMQ.
2. It downloads validated audio from MinIO raw storage.
3. It runs the V2 async pipeline.
4. During processing, it emits progressive artifacts and events:
   - Tier 1: `chunks/{index}.json`
   - Tier 2: `translated_batches/{index}.json`
   - final: `final.json`
5. It updates PostgreSQL status/progress during processing.
6. It publishes Redis events for progress and artifact readiness.
7. On success it uploads `final.json`, marks the media item completed, and publishes the final event.
8. On failure it persists `FAILED` and publishes a failure event.

Observed artifact contract in current code:

- `processed/{mediaId}/chunks/{chunkIndex}.json`
- `processed/{mediaId}/translated_batches/{batchIndex}.json`
- `processed/{mediaId}/final.json`

Observed event contract in current code:

- internal Redis event names:
  - `progress`
  - `chunk_ready`
  - `batch_ready`
  - `completed`
  - `failed`
- backend socket mirror event names:
  - `media_progress`
  - `media_chunk_ready`
  - `media_batch_ready`
  - `media_completed`
  - `media_failed`

### 1.5 MinIO artifact structure

Relevant files:

- `apps/backend-api/src/modules/minio/minio.service.ts`
- `apps/ai-engine/src/minio_client.py`
- `CONTRACTS.md`

The backend parses and summarizes artifact availability from MinIO. Current artifact summary fields include:

- `chunkCount`
- `translatedBatchCount`
- `hasFinal`
- `latestChunkIndex`
- `latestBatchIndex`
- `finalObjectKey`

This summary is what the mobile app and status APIs use to understand progressive readiness.

### 1.6 Socket/progress propagation

Relevant files:

- `apps/backend-api/src/modules/socket/socket.service.ts`
- `apps/backend-api/src/modules/socket/socket.types.ts`
- `apps/mobile-app/src/services/socket.service.ts`
- `apps/mobile-app/src/hooks/useSocketSync.ts`

Implemented behavior:

1. The AI engine publishes Redis events.
2. The backend socket service subscribes to the Redis `media_updates` channel.
3. The backend mirrors events to socket rooms and also refreshes cached artifact summaries.
4. The mobile app consumes those socket events and patches local query caches.

The mobile cache layer explicitly advances processing state on:

- progress events
- chunk-ready events
- batch-ready events
- completion events
- failure events

### 1.7 Mobile player hydration

Relevant files:

- `apps/mobile-app/src/hooks/usePlayerSubtitles.ts`
- `apps/mobile-app/src/hooks/useProcessingSubtitles.ts`

Actual implemented hydration order:

1. If `final.json` exists, the mobile player treats it as authoritative.
2. Otherwise, it fetches available `translated_batches/` and builds a partial session.
3. Processing preview can additionally merge chunk text plus translated batch overlays.
4. Playback readiness is derived from segment coverage rather than waiting for full completion.

Conclusion for Chapter 3 wording:

- Safe claim: the system reduces user waiting time by progressively exposing subtitle artifacts and progress state during asynchronous processing.
- Unsafe claim: the system performs real-time live simultaneous interpretation.

## 2. Existing benchmark assets

All paths below are relative to repository root unless the path is already absolute inside a saved artifact.

### 2.1 Current end-to-end benchmark harness through the real app path

| Item | Path | What it measures | How to run | Output | Compatibility |
| --- | --- | --- | --- | --- | --- |
| PowerShell launcher | `scripts/run-e2e-youtube-pipeline.ps1` | Full local app-path benchmark: infra startup, backend API, backend worker, AI engine, real `POST /media/youtube` submit path | `powershell -ExecutionPolicy Bypass -File scripts\run-e2e-youtube-pipeline.ps1` | Creates `outputs/e2e-benchmarks/runs/<timestamp>/` with `logs/`, `results/`, `run.manifest.json` | **Yes, current and strongest benchmark entry point** |
| Launcher with selected cases | `scripts/run-e2e-youtube-pipeline.ps1` | Same as above, scoped subset for faster reruns | `powershell -ExecutionPolicy Bypass -File scripts\run-e2e-youtube-pipeline.ps1 -CaseIds english_-moW9jvvMr4,chinese_60xeAEe7H28 -OutputDir outputs\e2e-benchmarks\runs\chapter3-smoke` | Same run bundle, but only selected fixtures | **Yes** |
| Shell launcher | `scripts/run-e2e-youtube-pipeline.sh` | Unix shell variant of the same full app-path benchmark | Run from a Unix-like shell | Same benchmark bundle layout | **Partial**. Useful for parity, but this workspace is Windows-first |
| TypeScript evaluator | `apps/backend-api/scripts/e2e-youtube-pipeline-eval.ts` | Per-case latency timeline, artifact retrieval, manual-subtitle harvesting, normalized text export, WER scoring | From `apps/backend-api`: `pnpm exec tsx scripts/e2e-youtube-pipeline-eval.ts --output-dir ..\..\outputs\e2e-benchmarks\runs\manual-eval\results --target-language vi` | Per-case evidence bundles plus suite summary | **Yes** |
| Evaluator helper tests | `apps/backend-api/package.json` with script `test:benchmark` | Jest coverage for helper modules such as fixture parsing, tokenization, WER helpers, translation-judge prompt shaping | From `apps/backend-api`: `pnpm test:benchmark` | Jest pass/fail only | **Yes, but this validates harness code, not model quality** |

Current evaluator helper modules:

- `apps/backend-api/scripts/e2e-youtube-benchmark/auth.ts`
- `apps/backend-api/scripts/e2e-youtube-benchmark/fixtures.ts`
- `apps/backend-api/scripts/e2e-youtube-benchmark/http.ts`
- `apps/backend-api/scripts/e2e-youtube-benchmark/reporting.ts`
- `apps/backend-api/scripts/e2e-youtube-benchmark/subtitles.ts`
- `apps/backend-api/scripts/e2e-youtube-benchmark/tokenizer.ts`
- `apps/backend-api/scripts/e2e-youtube-benchmark/types.ts`
- `apps/backend-api/scripts/e2e-youtube-benchmark/utils.ts`
- `apps/backend-api/scripts/e2e-youtube-benchmark/wer.ts`
- `apps/backend-api/scripts/e2e-youtube-benchmark/translation-judge.ts`
- `apps/backend-api/scripts/e2e-youtube-benchmark/translation-judge.spec.ts`

### 2.2 Saved end-to-end benchmark outputs already present in the repo

| Item | Path | What it measures | How to inspect | Output | Compatibility |
| --- | --- | --- | --- | --- | --- |
| Stable suite summary JSON | `outputs/e2e-benchmarks/e2e_wer_suite_summary.json` | Aggregated saved app-path benchmark results | Open directly or parse with JSON tools | Machine-readable suite summary | **Yes, but historical saved evidence** |
| Stable suite summary Markdown | `outputs/e2e-benchmarks/e2e_wer_suite_summary.md` | Human-readable saved app-path summary | Open directly | Markdown summary table | **Yes, historical saved evidence** |
| Timestamped run bundles | `outputs/e2e-benchmarks/runs/` | Full archived run evidence with logs and results | Open a run directory | Per-run logs, results, manifest | **Yes** |
| Representative saved run | `outputs/e2e-benchmarks/runs/full-20260527-chinese-fix-rerun3/` | Full 20-fixture saved suite with logs and results | Open directly | `logs/`, `results/`, `run.manifest.json` | **Yes, but saved historical evidence from 2026-05-27** |
| Representative run logs | `outputs/e2e-benchmarks/runs/full-20260527-chinese-fix-rerun3/logs/` | Backend/worker/AI-engine stdout and stderr during a real local run | Open directly | `backend-api.log`, `backend-api.err.log`, `backend-worker.log`, `backend-worker.err.log`, `ai-engine.log`, `ai-engine.err.log` | **Yes** |
| Representative run summary | `outputs/e2e-benchmarks/runs/full-20260527-chinese-fix-rerun3/results/summary/e2e_wer_suite_summary.md` | Saved aggregate metrics from a completed app-path suite | Open directly | Markdown table with latency and WER | **Yes, but do not present as a fresh rerun** |

Representative per-case evidence inside the saved run:

- English case folder: `outputs/e2e-benchmarks/runs/full-20260527-chinese-fix-rerun3/results/english_-moW9jvvMr4/`
  - `artifacts.inventory.json`
  - `chunk.first.json`
  - `evaluation.summary.json`
  - `final.json`
  - `ground_truth.normalized.txt`
  - `ground-truth.en.vtt`
  - `hypothesis.normalized.txt`
  - `status.final.json`
  - `status.timeline.json`
  - `translated_batch.first.json`
- Chinese case folder: `outputs/e2e-benchmarks/runs/full-20260527-chinese-fix-rerun3/results/chinese_60xeAEe7H28/`
  - `artifacts.inventory.json`
  - `chunk.first.json`
  - `evaluation.summary.json`
  - `final.json`
  - `ground_truth.normalized.txt`
  - `hypothesis.normalized.txt`
  - `status.final.json`
  - `status.timeline.json`
  - `translated_batch.first.json`

What these saved bundles are good for:

- quoting the exact evidence structure already supported by the benchmark harness
- extracting example tables and screenshots for Chapter 3
- showing that the project already archives both progressive and final artifacts

What they are **not** good for:

- claiming the current branch still reproduces the exact same numbers without rerunning
- proving device-level mobile playback behavior

### 2.3 Benchmark fixture manifest and cached media

| Item | Path | What it measures | How to run/use | Output | Compatibility |
| --- | --- | --- | --- | --- | --- |
| Current fixture manifest | `apps/ai-engine/test_medias.md` | Source list of benchmark YouTube samples | Read directly; used automatically by benchmark loaders | 10 English + 10 Chinese YouTube URLs | **Yes, current** |
| Case-id builder | `apps/ai-engine/src/scripts/benchmark_manifest.py` | Converts `test_medias.md` into `case_id` values like `english_-moW9jvvMr4` | `cd apps\ai-engine` then `venv\Scripts\python.exe -m src.scripts.benchmark_suite --list-cases` | Current generated case list | **Yes** |
| Cached benchmark audios | `apps/ai-engine/benchmark/audios/` | Reusable downloaded audio for processing-only runs | Consumed automatically by `benchmark_suite.py` | 24 cached `.mp3` files currently present | **Partial**. Useful, but includes legacy/orphaned files not guaranteed to match today's fixture manifest |

Important compatibility note for cached audios:

- The current fixture manifest is `apps/ai-engine/test_medias.md`.
- The cache directory currently contains 24 `.mp3` files, including current case-id-based files and older legacy names.
- Therefore the cache is useful operationally, but it should **not** be treated as a clean canonical dataset inventory for Chapter 3 tables.

### 2.4 AI-engine processing-only benchmark assets

| Item | Path | What it measures | How to run | Output | Compatibility |
| --- | --- | --- | --- | --- | --- |
| Processing-only suite | `apps/ai-engine/src/scripts/benchmark_suite.py` | Internal AI pipeline latency, trace events, hardware usage, output statistics, without DB/Redis/MinIO side effects | `cd apps\ai-engine` then `venv\Scripts\python.exe -m src.scripts.benchmark_suite` | `apps/ai-engine/outputs/benchmarks/suite_<timestamp>/` | **Yes, but not full app path** |
| List benchmark cases | `apps/ai-engine/src/scripts/benchmark_suite.py` | Current generated case IDs | `cd apps\ai-engine` then `venv\Scripts\python.exe -m src.scripts.benchmark_suite --list-cases` | Printed case list | **Yes** |
| Single-case processing-only run | `apps/ai-engine/src/scripts/benchmark_suite.py` | Internal timing on one current fixture | `cd apps\ai-engine` then `venv\Scripts\python.exe -m src.scripts.benchmark_suite --case english_-moW9jvvMr4` | Single suite folder with one case result | **Yes** |
| Single-file local benchmark | `apps/ai-engine/src/scripts/benchmark.py` | Local core-pipeline timing for one input audio file | `cd apps\ai-engine` then `venv\Scripts\python.exe -m src.scripts.benchmark path\to\audio.wav --target-lang vi` | JSON report under `apps/ai-engine/outputs/benchmarks/` unless `--output` is given | **Yes, but narrow and not app-path** |
| Manual NLLB evaluator | `apps/ai-engine/src/scripts/eval_nllb.py` | Manual translation quality/performance spot-checks for NLLB | `cd apps\ai-engine` then `venv\Scripts\python.exe -m src.scripts.eval_nllb` | Console output only | **Partial**. Useful for exploratory analysis, not standardized Chapter 3 evidence |

Existing processing-only benchmark outputs already saved:

- root: `apps/ai-engine/outputs/benchmarks/`
- current count in workspace: 24 suite directories
- representative suite:
  - `apps/ai-engine/outputs/benchmarks/suite_20260520_174126/benchmark_summary.json`
  - `apps/ai-engine/outputs/benchmarks/suite_20260520_174126/benchmark_summary.md`
  - per-case metrics: `apps/ai-engine/outputs/benchmarks/suite_20260520_174126/cases/english_-moW9jvvMr4.metrics.json`
  - per-case report: `apps/ai-engine/outputs/benchmarks/suite_20260520_174126/cases/english_-moW9jvvMr4.report.md`
  - per-case final output snapshot: `apps/ai-engine/outputs/benchmarks/suite_20260520_174126/results/english_-moW9jvvMr4.final.json`
  - hardware profiler files:
    - `apps/ai-engine/outputs/benchmarks/suite_20260520_174126/profiles/english_-moW9jvvMr4/profile_20260520_174227_jobenglish_-moW9jvvMr4.txt`
    - `apps/ai-engine/outputs/benchmarks/suite_20260520_174126/profiles/english_-moW9jvvMr4/profile_20260520_174227_jobenglish_-moW9jvvMr4.csv`

Compatibility interpretation:

- These assets are still useful for **internal stage timing** and **hardware profiling**.
- They are weaker evidence than the backend-submit E2E harness for Chapter 3 because they bypass:
  - backend validation
  - BullMQ queue handoff from the real API path
  - PostgreSQL live status writes
  - Redis/socket event delivery
  - MinIO durable artifact upload
  - mobile hydration behavior

### 2.5 Contract and event-discipline tests relevant to evaluation correctness

| Item | Path | What it measures | How to run | Output | Compatibility |
| --- | --- | --- | --- | --- | --- |
| Streaming contract test | `apps/ai-engine/tests/test_streaming_contracts.py` | Artifact schema and path discipline for `chunks/`, `translated_batches/`, `final.json`, plus translation revision artifacts | `cd apps\ai-engine` then `venv\Scripts\python.exe -m pytest tests/test_streaming_contracts.py -q` | Pytest pass/fail | **Yes** |
| Event discipline test | `apps/ai-engine/tests/test_event_discipline.py` | Upload-before-publish ordering, monotonic progress, failure-event discipline | `cd apps\ai-engine` then `venv\Scripts\python.exe -m pytest tests/test_event_discipline.py -v` | Pytest pass/fail | **Yes** |

These tests do **not** measure model accuracy, but they are relevant to Chapter 3 because they support claims about:

- artifact schema stability
- event ordering discipline
- progress monotonicity

### 2.6 Debug and exploratory assets

| Item | Path | What it measures | How to use | Output | Compatibility |
| --- | --- | --- | --- | --- | --- |
| NLLB debug batch input | `apps/ai-engine/outputs/debug/d422b74d-e5a3-40fc-af98-9f4472ce9aee/batch_001.json` | Real sentence batch used by `eval_nllb.py` for exploratory translation samples | Used automatically if present by `eval_nllb.py` | Extra real-sentence console samples | **Partial** |
| Legacy app-path outputs | `outputs/e2e-youtube-pipeline/` | Older end-to-end run bundles before the current `outputs/e2e-benchmarks/` layout | Open directly if historical comparison is needed | Historical logs and outputs | **Partial/legacy**. Use only with clear labeling as pre-current harness output layout |

## 3. Existing metrics

Current measurable metrics are split across two evidence sources: the full backend-submit E2E harness and the AI-engine processing-only suite.

### 3.1 Metrics currently measured by the backend-submit E2E harness

Source files:

- `apps/backend-api/scripts/e2e-youtube-pipeline-eval.ts`
- `apps/backend-api/scripts/e2e-youtube-benchmark/reporting.ts`

Currently measured or exported:

- `wallClockLatencySeconds`
- `durationSeconds`
- `processingToDurationRatio`
- `processingToDurationRatioDisplay`
- `throughputMultiplier`
- `submitRoundTripMs`
- `timeToValidatingSeconds`
- `timeToProcessingSeconds`
- `timeToFirstChunkSeconds`
- `timeToFirstTranslatedBatchSeconds`
- `timeToHasFinalSeconds`
- `timeToCompletedSeconds`
- per-case status timeline snapshots:
  - status
  - progress
  - current step
  - ETA
  - source language
  - target language
  - artifact counts
- WER-related values when manual subtitles exist:
  - `finalWer`
  - substitutions
  - deletions
  - insertions
  - reference token count
  - hypothesis token count
- artifact availability summary:
  - chunk count
  - translated batch count
  - final presence
  - latest chunk index
  - latest batch index
- sample evidence:
  - first chunk artifact
  - first translated batch artifact
  - first segments from final output
- subtitle/reference availability metadata:
  - manual subtitle availability
  - selected subtitle tag
  - subtitle acquisition time
  - WER-eligible or skipped
- output heuristics already surfaced in saved summaries:
  - `segmentCount`
  - `emptyTranslationCount`
  - `avgSourceLength`
  - suspicious token/script flags
- additive translation-finalization metadata when present in `final.json.metadata.translation_finalization`:
  - coverage counts
  - fallback counts
  - timeout counts
  - invalid-window counts
  - token counts
  - cost totals
  - deadline-hit flag
  - segment provenance

### 3.2 Metrics currently measured by the AI-engine processing-only suite

Source file:

- `apps/ai-engine/src/scripts/benchmark_suite.py`

Currently measured or exported:

- audio download time
- whether cached audio was reused
- audio duration
- input file size
- total wall-clock time
- real-time factor
- throughput multiplier
- detected route/profile metadata:
  - source language
  - target language
  - model used
  - routing/policy flags
  - ASR provider
  - route
  - probe result
- per-stage timing from internal trace:
  - `audio_prep_s`
  - `inspect_s`
  - `vad_s`
  - `time_to_first_chunk_s`
  - `time_to_first_translated_batch_s`
  - `first_batch_after_first_chunk_s`
  - `translated_batches_visible_window_s`
  - `finalization_after_last_batch_s`
  - `pipeline_completed_at_s`
  - `wall_clock_total_s`
- deeper internal run metrics from the async pipeline:
  - aligner timings
  - merge timings
  - NMT timings
  - upload bookkeeping timings
  - producer wait time
  - pipeline total
- streaming output counts:
  - chunk count
  - batch count
  - chunk sentence total
  - batch segment total
  - final segment total
  - final output count
- output completeness statistics:
  - segment count
  - total word count
  - average words per segment
  - average segment duration
  - segments with translation filled
  - segments with phonetic filled
- hardware metrics:
  - CPU usage
  - RAM usage
  - GPU utilization
  - VRAM usage
  - GPU temperature
  - GPU power
  - process-tree stats

### 3.3 Metrics currently implied by tests but not exported as benchmark tables

From:

- `apps/ai-engine/tests/test_streaming_contracts.py`
- `apps/ai-engine/tests/test_event_discipline.py`

These tests currently support binary claims such as:

- artifact path/schema consistency
- upload-before-publish discipline
- monotonic progress discipline
- failure ordering discipline

They do not currently export numeric benchmark tables.

## 4. Missing metrics for a stronger Chapter 3

The project already has useful latency and WER evidence, but a stronger thesis Chapter 3 would still need several missing or incomplete measurements.

### 4.1 Timing metrics that are missing or too coarse

- **Exact time to first ASR chunk** in the full app path:
  - current E2E milestone timing is derived from periodic REST polling, not from exact artifact-write or socket timestamps.
- **Exact time to first translated batch** in the full app path:
  - same limitation as above.
- **Exact time to `final.json` availability**:
  - the E2E harness approximates this from status polling snapshots.
- **Exact socket event timing**:
  - the current benchmark does not timestamp socket delivery on the client side.
- **Exact mobile player readiness timing**:
  - no automated measurement currently records when the player first becomes usable from partial subtitles.

### 4.2 Artifact completeness metrics that are missing

- numeric completeness score for `final.json`
- numeric completeness score for `translated_batches/`
- coverage ratio of progressive batches vs final segments
- missing-field counts inside final segments
- percentage of segments with:
  - `translation`
  - `phonetic`
  - `words`
  - valid `segment_index`

At the moment the codebase mostly has:

- schema tests
- artifact counts
- sample saved artifacts

It does not yet have a dedicated completeness scoring report.

### 4.3 Transcript and translation quality metrics that are missing

- **CER**: not implemented in the current benchmark harness
- **translation quality against references**:
  - no BLEU
  - no chrF
  - no COMET
  - no human-rated adequacy/fluency table
- **NMT vs finalization quality delta**:
  - `translation-judge.ts` exists, but it is not wired into the active benchmark flow
- **source transcript quality beyond WER**:
  - no sentence-level error analysis table
  - no language-specific segmentation quality score

### 4.4 Subtitle synchronization and timestamp validity metrics that are missing

- negative-duration segment count
- overlapping-segment count
- non-monotonic timestamp count
- invalid word-timestamp count
- average subtitle lead/lag versus a reference alignment
- subtitle density/readability checks

The current code and tests strongly suggest timestamp discipline is important, but the benchmark harness does not yet compute these as metrics.

### 4.5 Progressive readiness and UX evidence that is missing

- automated proof that the mobile player opened successfully from `translated_batches/` before `final.json`
- automated proof that `readyUntilSec` advanced over time during processing
- automated proof that socket events and backend artifact inventory stayed consistent case by case
- timeline screenshots or recordings of:
  - processing screen
  - first translated batch available
  - player opened before final completion

The code path exists, but Chapter 3 would be much stronger if this behavior were documented with explicit evidence.

### 4.6 Compatibility and benchmark-governance gaps

- Some saved outputs are historical and may not match today's exact fixture list.
- The cached audio directory includes legacy files, so it is not a clean authoritative dataset manifest.
- The processing-only suite is useful, but it can overstate readiness if treated as equivalent to the real mobile/backend runtime.

## 5. Recommended Chapter 3 evaluation design

The goal here should be a **defensible, time-bounded evaluation plan**, not a perfect research-grade benchmark program.

### 5.1 Recommended evidence hierarchy

Use this order of trust in Chapter 3:

1. **Primary evidence**: backend-submit E2E benchmark through the real app path
   - `scripts/run-e2e-youtube-pipeline.ps1`
   - `apps/backend-api/scripts/e2e-youtube-pipeline-eval.ts`
2. **Secondary evidence**: AI-engine processing-only benchmark
   - `apps/ai-engine/src/scripts/benchmark_suite.py`
3. **Correctness support evidence**:
   - `apps/ai-engine/tests/test_streaming_contracts.py`
   - `apps/ai-engine/tests/test_event_discipline.py`
4. **Manual qualitative evidence**:
   - mobile screenshots
   - sample subtitle comparisons
   - final artifact excerpts

### 5.2 Recommended dataset/sample plan

Pragmatic option under time pressure:

- Use the current fixture manifest in `apps/ai-engine/test_medias.md` as the official source list.
- If time is limited, run a **balanced subset** first:
  - 3 English cases
  - 3 Chinese cases
- If time allows, run the full current 20-case matrix through the E2E harness.

Suggested minimum balanced subset for Chapter 3 reruns:

- English:
  - `english_-moW9jvvMr4`
  - `english_8KkKuTCFvzI`
  - `english_5MuIMqhT8DM`
- Chinese:
  - `chinese_60xeAEe7H28`
  - `chinese_LcUoiBwG-OA`
  - `chinese_GOjlcDYurP0`

Recommended rerun command for a fast thesis subset:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\run-e2e-youtube-pipeline.ps1 `
  -CaseIds english_-moW9jvvMr4,english_8KkKuTCFvzI,english_5MuIMqhT8DM,chinese_60xeAEe7H28,chinese_LcUoiBwG-OA,chinese_GOjlcDYurP0 `
  -OutputDir outputs\e2e-benchmarks\runs\chapter3-subset
```

Recommended full rerun command:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\run-e2e-youtube-pipeline.ps1 `
  -OutputDir outputs\e2e-benchmarks\runs\chapter3-full
```

### 5.3 Recommended Chapter 3 tables

Recommended automatic tables:

1. **System runtime path table**
   - module
   - responsibility
   - input
   - output

2. **Dataset/sample inventory table**
   - case ID
   - language family
   - source type
   - duration
   - manual subtitle available or not

3. **End-to-end latency table**
   - case ID
   - duration
   - wall-clock latency
   - processing-to-duration ratio
   - time to validating
   - time to processing
   - time to first chunk
   - time to first translated batch
   - time to completed

4. **Artifact generation table**
   - case ID
   - chunk count
   - translated batch count
   - final present
   - segment count
   - empty translation count

5. **Transcript quality table**
   - case ID
   - WER
   - substitutions
   - deletions
   - insertions
   - reference token count
   - note if case is latency-only due to missing manual subtitles

6. **AI-engine internal timing table**
   - case ID
   - audio prep
   - inspect
   - VAD
   - first chunk
   - first translated batch
   - pipeline complete
   - real-time factor
   - hardware utilization summary

Recommended manual-review tables:

7. **Translation quality spot-check table**
   - case ID
   - source sentence
   - system translation
   - reviewer comment on adequacy/fluency

8. **Progressive playback evidence table**
   - case ID
   - translated batch available before final
   - player opened before final
   - screenshot/log reference

### 5.4 Recommended figures, screenshots, and logs

Recommended figures/screenshots:

1. One architecture diagram for the runtime path:
   - Mobile App -> Backend API -> Backend Worker -> AI Engine -> MinIO/Redis/PostgreSQL -> Mobile App
2. One screenshot of the mobile processing UI receiving progress updates.
3. One screenshot of the mobile player opened while only progressive artifacts are available.
4. One screenshot of the same media after `final.json` completion.
5. One excerpt of `status.timeline.json` or a plotted progress timeline.
6. One excerpt of `translated_batch.first.json`.
7. One excerpt of `final.json`.
8. One screenshot or excerpt from `outputs/e2e-benchmarks/e2e_wer_suite_summary.md`.

Recommended logs to preserve:

- `outputs/e2e-benchmarks/runs/<run>/logs/backend-api.log`
- `outputs/e2e-benchmarks/runs/<run>/logs/backend-worker.log`
- `outputs/e2e-benchmarks/runs/<run>/logs/ai-engine.log`
- `outputs/e2e-benchmarks/runs/<run>/results/<case>/status.timeline.json`

### 5.5 Metrics that should be computed automatically

Already available automatically and should definitely be used:

- wall-clock latency
- processing-to-duration ratio
- time to first chunk
- time to first translated batch
- time to completed
- chunk count
- translated batch count
- final presence
- WER where manual subtitles exist
- segment count
- empty translation count
- real-time factor from the processing-only suite
- hardware usage from the processing-only suite

High-value additions if time remains:

- exact socket-event timestamps
- exact final-artifact write timestamp
- final.json completeness score
- translated-batch completeness score
- timestamp validity checks

### 5.6 Quality criteria that should remain manual

Under thesis time pressure, these are better handled by manual review instead of trying to build a full new evaluator:

- translation adequacy
- translation fluency
- subtitle readability
- whether bilingual subtitle segmentation feels natural
- whether progressive playback is meaningfully usable to a human
- whether phonetic text is helpful in Chinese cases

### 5.7 Recommended Chapter 3 framing

The most defensible evaluation framing is:

- the system is evaluated as an **asynchronous progressive subtitle-generation pipeline**
- the key performance goal is **reduced waiting time to usable subtitle output**
- the key user-facing evidence is:
  - progress updates
  - early progressive artifacts
  - playable subtitle coverage before final completion when available
- transcript quality can be partially quantified with WER on cases that have manual subtitles
- translation quality should be presented cautiously, with manual qualitative review unless a proper reference-based translation metric is added

## 6. Risks and claims to avoid

These claims are **not** safely supported by the current codebase and benchmark evidence.

### 6.1 Claims about “real-time”

Avoid claiming:

- live simultaneous interpretation
- instant subtitle generation during capture
- guaranteed low-latency live streaming translation

Safer wording:

- progressive asynchronous subtitle generation
- reduced waiting time through chunked processing and progressive artifact availability

### 6.2 Claims about model development

Avoid claiming:

- model training
- model fine-tuning
- dataset curation for supervised training
- custom ASR/NMT model optimization through retraining

Current repo evidence supports inference/pipeline engineering, not training research.

### 6.3 Claims about accuracy

Avoid claiming:

- guaranteed WER below a fixed threshold
- universal accuracy across all languages and media conditions
- translation superiority over all baselines
- strong translation quality claims without human review or reference-based translation scoring

Even the strongest current benchmark mainly proves:

- app-path latency
- progressive artifact generation
- transcript WER when manual subtitles exist

### 6.4 Claims about progressive playback proof

Avoid claiming:

- fully proven user-level progressive playback without screenshots or demo evidence
- exact player-readiness timing unless instrumented
- guaranteed consistency of socket and UI timing under all conditions

The code path exists, but Chapter 3 still needs explicit evidence capture.

### 6.5 Claims about infrastructure robustness

Avoid claiming:

- production-scale high availability
- horizontal scaling proof
- fault tolerance under heavy concurrent production traffic
- SLA-grade reliability

The repository is a strong prototype with real queue/storage/event architecture, but current benchmark assets are local-development oriented.

### 6.6 Claims about translation-finalization quality

Avoid claiming:

- measured quality gains from LLM finalization over baseline NMT unless a comparison study is actually run
- cost-effectiveness of finalization unless cost tables are extracted from new reruns

Current evidence supports:

- the metadata pipeline exists
- cost/token telemetry can be recorded

It does **not** yet support a strong scientific quality-improvement claim.

## Final assessment

For Chapter 3, the repository already contains a usable evaluation foundation:

- a real app-path end-to-end benchmark harness
- saved benchmark bundles with logs, timelines, artifacts, and WER summaries
- an internal AI-engine timing and hardware benchmark suite
- schema and event-discipline tests that support correctness claims

The strongest current evidence is for:

- end-to-end asynchronous processing latency
- progressive artifact generation
- transcript WER on manual-subtitle-eligible cases
- internal stage timing and hardware profiling

The weakest current evidence is for:

- translation quality evaluation
- exact progressive player-readiness timing
- subtitle timestamp validity scoring
- device-level proof of progressive playback UX

If Chapter 3 must be completed quickly, the most realistic strategy is to:

1. use the backend-submit E2E harness as the primary quantitative source,
2. use the AI-engine processing-only suite only for internal stage/hardware tables,
3. add a small manual review section for translation quality and progressive playback evidence,
4. avoid overstating live-real-time or model-accuracy claims beyond the saved data.
