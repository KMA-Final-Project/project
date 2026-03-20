# AI Engine Architecture Context

> Last reviewed: 2026-03-20  
> Scope: `apps/ai-engine`  
> Purpose: persistent handoff doc for future AI Engine, Backend, and Mobile integration work.

## 1. Current status

The AI Engine has already been rebuilt around the **V2 async NMT-first pipeline**.

This means:
- the AI Engine is now the **source of truth** for subtitle processing behavior
- Backend and Mobile integrations may still reflect **older assumptions**
- future integration work should start from the contracts and behavior documented here, not from older prompts/checkpoint notes alone

## 2. Start here

If you are new to this service, open files in this order:

1. `src/main.py` — real worker lifecycle and external boundary
2. `src/async_pipeline.py` — actual V2 orchestration logic
3. `src/schemas.py` — canonical output/data contract
4. `src/minio_client.py` — MinIO paths and artifact shapes
5. `src/events.py` — Redis event contract
6. `src/db.py` — direct PostgreSQL side effects
7. `src/core/smart_aligner.py` — Whisper transcription and Tier 1 chunk production
8. `src/core/nmt_translator.py` — NLLB translation core
9. `src/core/semantic_merger.py` — CJK merge/homophone logic

Cross-workspace contract references:

- `apps/backend-api/src/modules/queue/queue.types.ts`
- `apps/backend-api/src/modules/socket/socket.types.ts`
- `apps/backend-api/src/modules/media/workers/media.processor.ts`

## 3. What this service is

`apps/ai-engine` is a **queue-driven Python GPU worker**.

It is not an HTTP service. Its runtime boundary is:

```text
BullMQ job in
  → MinIO raw audio download
  → V2 subtitle pipeline
  → MinIO processed artifact upload
  → PostgreSQL status update
  → Redis Pub/Sub progress events
```

### Runtime entrypoint

- Entrypoint: `src/main.py`
- Queue: `ai-processing`
- Bull prefix: `bilingual`
- Concurrency: `1`
- Lock duration: `10 minutes`
- Stalled interval: `5 minutes`

Docker runtime:
- `Dockerfile` runs `python -m src.main`
- `docker-compose.yml` supports:
  - `auto`
  - `turbo_only`
  - `full_only`

## 4. Actual V2 pipeline flow

The real orchestration lives in `src/async_pipeline.py`, not in `src/core/pipeline.py`.

```text
Queue job
  ↓
main.py
  ↓
MinIO download
  ↓
AudioProcessor
  - normalize to 16kHz mono wav
  ↓
AudioInspector
  - classify music vs standard
  ↓
VADManager
  - detect and merge speech regions
  - optional vocal isolation in music mode
  ↓
SmartAligner
  - Whisper transcription
  - word timestamps
  - phoneme enrichment on words
  - Tier 1 chunk callback
  ↓
asyncio.Queue(maxsize=4)
  - producer/consumer backpressure boundary
  ↓
Consumer
  - CJK: SemanticMerger / homophone correction
  - non-CJK: direct path
  ↓
NMTTranslator
  - NLLB-200-3.3B via CTranslate2
  ↓
LLMProvider.refine_batch()
  - optional post-NMT refinement
  ↓
TranslatedBatch upload
  ↓
SubtitleOutput build
  ↓
final.json upload
  ↓
DB update + Redis completion event
```

## 5. Key modules and responsibilities

| File | Responsibility |
| --- | --- |
| `src/main.py` | BullMQ worker entrypoint; per-job lifecycle; temp dir; final side effects |
| `src/pipelines.py` | Thin shim; delegates to V2 async pipeline |
| `src/async_pipeline.py` | Main orchestration: progress, streaming, translation, export |
| `src/core/pipeline.py` | Component registry only |
| `src/utils/audio_processor.py` | FFmpeg normalization + duration probe |
| `src/core/audio_inspector.py` | AST-based music vs speech classification |
| `src/core/vad_manager.py` | Silero VAD + greedy segment merge + music-mode isolation |
| `src/core/smart_aligner.py` | Whisper transcription, word timestamps, chunk streaming, language routing |
| `src/core/semantic_merger.py` | LLM-assisted line grouping; CJK homophone correction |
| `src/core/nmt_translator.py` | NLLB/CTranslate2 translation with 1:1 mapping guarantee |
| `src/core/llm_provider.py` | Context analysis + optional refinement |
| `src/schemas.py` | Canonical Pydantic models |
| `src/minio_client.py` | Download/upload helpers and processed path conventions |
| `src/events.py` | Redis `media_updates` publisher helpers |
| `src/db.py` | Direct PostgreSQL updates via psycopg2 pool |
| `src/utils/hardware_profiler.py` | Background CPU/RAM/GPU sampling per job |

## 6. Performance and model strategy

Configuration lives in `src/config.py`.

Important knobs:
- `AI_PERF_MODE`: `LOW | MEDIUM | HIGH`
- `WORKER_MODEL_MODE`: `auto | turbo_only | full_only`
- `WHISPER_MODEL_TURBO`: fast model for common languages
- `WHISPER_MODEL_FULL`: more accurate model for CJK
- `WHISPER_CJK_LANGUAGES`: currently routes `zh`, `ja`, `ko`
- `CHUNK_SIZE`: defaults to `8`
- `NMT_MODEL_DIR`, `NMT_TOKENIZER_NAME`, `NMT_COMPUTE_TYPE`, `NMT_BEAM_SIZE`

Behavior:
- `SmartAligner` is a singleton and keeps Whisper models loaded
- `NMTTranslator` is a singleton and keeps the CTranslate2 model loaded
- `asyncio.Queue(maxsize=4)` provides natural backpressure between transcription and translation

## 7. External contracts

### 7.1 Queue payload in

Produced by Backend as `AiProcessingJobPayload`.

Current fields:
- `mediaId`
- `audioS3Key`
- `processingMode`
- `durationSeconds`
- `userId`
- `targetLanguage?`

Important: `processingMode` is still sent, but the AI Engine no longer branches on it in V2.

### 7.2 Redis events out

Channel:
- `media_updates`

Event types published by `src/events.py`:
- `progress`
- `chunk_ready`
- `batch_ready`
- `completed`
- `failed`

Backend mirrors these payloads in:
- `apps/backend-api/src/modules/socket/socket.types.ts`

### 7.3 MinIO artifacts out

Processed-bucket convention:

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

Artifact shapes:

#### Tier 1
Path:
- `{mediaId}/chunks/{chunkIndex}.json`

Shape:
- top-level **array** of `Sentence` dicts
- `segment_index` is **always `null`** on every element — global ordering is not yet known at transcription time

#### Tier 2
Path:
- `{mediaId}/translated_batches/{batchIndex}.json`

Shape:
- top-level object:
  - `batch_index` — 0-indexed batch number used in the MinIO key
  - `first_segment_index` — 0-indexed global position of the first segment in the complete transcript; cheap range anchor for cross-artifact matching without scanning segment arrays
  - `segments` — array of `Sentence` dicts, each with a non-null `segment_index`

CJK note: semantic merging may produce **fewer** segments in a Tier 2 batch than there were sentences in the corresponding Tier 1 chunks. Do **not** assume a 1:1 mapping by array position between Tier 1 and Tier 2.

#### Final
Path:
- `{mediaId}/final.json`

Shape:
- top-level object:
  - `metadata`
  - `segments` — consecutive 0-based `segment_index` on every element; this is the authoritative ordering signal

#### Cross-artifact matching rules

These rules are frozen in `tests/test_streaming_contracts.py` and are the canonical reference for any consumer matching logic:

1. **Tier 1 → use array position only.** `segment_index=null` means no global identity is available at this layer. Array order within a single chunk file is stable, but cross-chunk identity is not.

2. **Tier 2 → use `segment_index`.** Every `Sentence` in a `TranslatedBatch` carries a non-null `segment_index` naming its global position. Use this key for cross-artifact correlation, not array position.

3. **Batch range anchor.** `TranslatedBatch.first_segment_index` equals `segments[0].segment_index`. The batch covers the half-open range `[first_segment_index, first_segment_index + len(segments))`. Range overlap checks against other batches or `final.json` require no scanning.

4. **Final.json is the authoritative ordered output.** Segments have consecutive 0-based `segment_index` values. This is the canonical ground truth for complete-transcript consumers.

Canonical path helpers: `MinioClient.chunk_object_key(mediaId, chunkIndex)`, `MinioClient.translated_batch_object_key(mediaId, batchIndex)`, `MinioClient.final_result_object_key(mediaId)`.

### 7.4 Final JSON contract

Canonical models live in `src/schemas.py`.

Important runtime structures:

- `Word`
  - `word`
  - `start`
  - `end`
  - `confidence`
  - `phoneme?` — always serialized (never absent), may be `null`
- `Sentence`
  - `text`
  - `start`
  - `end`
  - `words`
  - `translation` — always serialized, may be empty string on Tier 1
  - `phonetic` — always serialized, may be empty string
  - `detected_lang` — always serialized, may be empty string
  - `segment_index` — `null` on Tier 1 chunks; non-null integer on Tier 2 batches and `final.json`
- `TranslatedBatch`
  - `batch_index`
  - `first_segment_index` — range anchor; equals `segments[0].segment_index`
  - `segments`
- `SubtitleMetadata`
  - `duration`
  - `engine_profile`
  - `source_lang`
  - `target_lang`
  - `model_used`
- `SubtitleOutput`
  - `metadata`
  - `segments`

## 8. Important truths and invariants

These are the most important things to remember before changing integrations.

### V2 is the real pipeline
- `src/pipelines.py` always delegates to `run_v2_pipeline_async()`
- `USE_V2_PIPELINE` is legacy config only

### Translation is now NMT-first
- NLLB/CTranslate2 is the primary translation engine
- Ollama is now secondary and best-effort
- LLM refinement failures fall back to raw NMT output

### `processingMode` is effectively legacy in AI Engine
- It is still read and logged in `main.py`
- It does not control the V2 processing path anymore

### Effective chunk size is 8
- `config.py` default `CHUNK_SIZE = 8`
- this affects Tier 1 and Tier 2 streaming cadence

### Tier 1 and Tier 2 are intentionally asymmetric
- Tier 1 JSON is an array
- Tier 2 JSON is an object
- CJK Tier 2 batches are **not** guaranteed to map 1:1 to Tier 1 chunks because multiple chunks may be merged before translation

### Cross-artifact segment identity and matching
- `Sentence.segment_index` is the durable matching key for cross-artifact correlation
- On **Tier 1** chunks: always `null` — global ordering is not yet known at transcription time
- On **Tier 2** batches and `final.json`: always a non-null integer — the segment's 0-indexed position in the complete accumulated transcript
- **Do not use array position as an identity key.** It is the only available handle for Tier 1 sentences, but it is not reliable across artifact layers or after CJK merging
- `TranslatedBatch.first_segment_index` equals `batch.segments[0].segment_index` — a contract invariant frozen by tests
- The batch range `[first_segment_index, first_segment_index + len(segments))` enables O(1) overlap checks without scanning any segment array

### Source language is detected inside the AI Engine
- First chunk drives source-language detection
- detected source language is written back to DB

### `Sentence.phonetic` exists, but runtime phonetics currently live on words
- current processing path populates `Word.phoneme`
- `Sentence.phonetic` exists for contract compatibility/defaults, but is not the main runtime carrier of phonetic data

### `final.json` is currently stored under transcript naming
- `main.py` uploads `final.json`
- the returned key is stored in DB/event fields named like `transcriptS3Key` / `transcript_s3_key`
- this is a naming mismatch from earlier pipeline generations

## 9. Legacy remnants / cleanup notes

These are worth knowing even if you do not clean them up immediately.

- `TRANSLATOR_PROVIDER = "google"` in `config.py` appears unused
- `USE_V2_PIPELINE` is explicitly marked legacy
- `subtitle_s3_key` support exists in `db.py`, but the active AI Engine path does not set it
- `TranslatedSentence = Sentence` is a compatibility alias
- `ContextAnalysis` exists in `schemas.py`, but current runtime uses `ContextAnalysisResult`
- `src/scripts/test_pipeline.py` is stale and calls a nonexistent `PipelineOrchestrator.process_video(...)`
- some comments/docs still describe older translation architecture or older chunk behavior

## 10. Verification and test surface

Automated pytest coverage is minimal and contract-focused.

Current automated test file:
- `tests/test_streaming_contracts.py`

What it covers:
- MinIO path conventions via canonical key helpers
- Tier 1 chunk array shape; `segment_index=null` invariant on every Tier 1 sentence
- Tier 2 batch wrapper shape; `first_segment_index` equals `segments[0].segment_index`
- `final.json` metadata shape and sequential 0-based `segment_index` ordering
- Required sentence-field presence (including empty-string defaults and nullable word phonemes)
- Cross-artifact matching simulation: `segment_index`-based lookup without array-position comparison

What it does **not** cover well:
- BullMQ worker behavior
- Redis event sequencing
- DB writes
- no-speech behavior
- CJK buffering/merge correctness
- NMT/LLM fallback behavior
- end-to-end live integration with MinIO/Redis/Postgres/Ollama

Useful commands:

```bash
cd apps/ai-engine
./venv/Scripts/python.exe -m pytest tests/test_streaming_contracts.py -q
# Failure-path diagnostic (per-test breakdown with tracebacks):
./venv/Scripts/python.exe -m pytest tests/test_streaming_contracts.py -v --tb=short
```

Manual local harness:

```bash
cd apps/ai-engine
./venv/Scripts/python.exe -m src.scripts.test_v2_pipeline
```

### Live-infra contract harness

Use `--live-infra` when you need to validate the durable artifact contract against the local compose-backed Redis, PostgreSQL, and MinIO services instead of the in-memory doubles.

Local service expectations:
- Redis: `localhost:6379`
- MinIO: `localhost:9000`
- PostgreSQL: `localhost:5432`
- Credentials come from `apps/ai-engine/.env` and the service-side `infra/*/.env` files. Do not print or copy those secrets into logs.

Live mode behavior:
- uses the real `MinioClient` and then re-reads `processed/{mediaId}/...` objects from MinIO for serialized contract validation
- subscribes to Redis `media_updates` and captures matching events for the harness media id
- creates a scratch `users` row and `media_items` row in PostgreSQL so `update_media_status(...)` and `mark_quota_counted(...)` hit a real table, snapshots the row state, then cleans up the scratch records
- writes a local harness report beside the JSON output under `outputs/test_v2/`

Representative media matrix for live validation:
- `demo_audio_3.mp3` — **technical talkshow baseline**. Judge this as the standard path: Tier 1 chunk totals, Tier 2 translated totals, and `final.json` totals should stay aligned.
- `demo_audio_4.mp3` — **English speech baseline**. Same standard-path expectation as `demo_audio_3.mp3`.
- `demo_audio_2.mp3` — **hard CJK music edge**. Do **not** use this as the generic 1:1 baseline. Tier 1 chunk totals may exceed Tier 2/final totals because semantic merge can collapse fragments before translation. The durable checks here are `segment_index`, `first_segment_index`, and final ordering — not blind chunk-to-batch count equality.

Useful commands:

```bash
cd apps/ai-engine
./venv/Scripts/python.exe -m src.scripts.test_v2_pipeline demo_audio_3.mp3 --lang vi --live-infra
./venv/Scripts/python.exe -m src.scripts.test_v2_pipeline demo_audio_4.mp3 --lang vi --live-infra
./venv/Scripts/python.exe -m src.scripts.test_v2_pipeline demo_audio_2.mp3 --lang vi --live-infra
```

One-off utilities:
- `src/scripts/convert_nllb.py`
- `src/scripts/eval_nllb.py`
- `src/scripts/check_env.py`

## 11. Integration checklist for later

When reconnecting Backend and Mobile to this V2 pipeline, verify these first:

1. Queue payload expectations still match V2 behavior
2. `processingMode` assumptions are still valid, or simplify/remove them
3. Backend socket layer handles `batch_ready` in addition to `chunk_ready`
4. Mobile correctly handles:
   - Tier 1 chunk array shape
   - Tier 2 translated-batch object shape
   - `final.json` canonical output
5. Consumers do not assume `Sentence.phonetic` is richly populated
6. Consumers understand that `transcriptS3Key` currently points to `final.json`
7. CJK streaming consumers do not assume Tier 1 and Tier 2 indices align one-to-one
8. Cross-artifact matching uses `segment_index` (non-null on Tier 2 and final), not array position
9. Tier 1 consumers treat `segment_index=null` as the explicit signal that array position is the only available ordering handle at that layer
10. `TranslatedBatch.first_segment_index` is used for range-overlap checks; do not recompute it from `segments[0].segment_index`

## 12. Short handoff summary

If you only remember one thing, remember this:

> The AI Engine is now an async, two-tier streaming worker where Whisper transcription and NMT translation are decoupled by an internal queue, and the real downstream contract is defined by `schemas.py`, `events.py`, and `minio_client.py`.

Matching shorthand:
- Tier 1 chunks → `segment_index=null`, array position is the only handle
- Tier 2 batches → `segment_index` is the durable identity key; `first_segment_index` is the range anchor
- Final.json → consecutive 0-based `segment_index`, authoritative ordering signal
- Never assume 1:1 Tier 1 ↔ Tier 2 mapping for CJK content
