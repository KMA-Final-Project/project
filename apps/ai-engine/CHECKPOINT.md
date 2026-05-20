# AI Engine - Checkpoint

> Last updated: 2026-05-08
> Maintained by: agents - update this file after every significant change.

## 1. Current Status

AI Engine is in the active V2 production-path state.

The module is a queue-driven Python GPU worker that consumes `ai-processing` jobs, downloads validated audio from MinIO, runs the V2 async NMT-first pipeline, uploads streaming and final subtitle artifacts, updates PostgreSQL progress/status, and emits Redis Pub/Sub processing events.

The active production path is:

```text
main.py
  -> pipelines.py / run_v2_pipeline()
  -> async_pipeline.py
  -> AudioProcessor
  -> AudioInspector
  -> VADManager
  -> SmartAligner
  -> SemanticMerger when needed
  -> NMTTranslator
  -> optional LLMProvider refinement
  -> MinIO chunks / translated_batches / final.json
```

Deprecated V1 paths must not be reintroduced.

## 2. Active Work

No single active AI Engine task is recorded in the imported checkpoint.

Use `Next Candidates` below as the current AI Engine backlog until a new task file or issue exists.

## 3. Recently Completed

- 2026-04-02 — V2 async NMT-first pipeline marked active. Status: Working.
  - `async_pipeline.py` owns producer-consumer processing.
  - `core/nmt_translator.py` is the active translation runtime.
  - Optional LLM refinement remains available through `LLMProvider`.

- 2026-04-02 — V1 translation cleanup completed. Status: Working.
  - Old `translator_engine.py` path removed.
  - Old `incremental_pipeline.py` path removed.
  - `processingMode` branching removed.
  - `targetLanguage` is the active bilingual flow input.

- 2026-04-02 — Two-tier streaming artifact protocol completed. Status: Working.
  - Tier 1 chunks uploaded during alignment.
  - Tier 2 translated batches uploaded during async translation.
  - `final.json` uploaded as the canonical completed output.

- 2026-04-02 — Progress discipline completed. Status: Working.
  - In-memory reservation prevents progress rollback.
  - Database writes preserve monotonic progress.
  - Event discipline tests exist for progress/event behavior.

- 2026-04-02 — Docker deployment path added. Status: Working.
  - CUDA image.
  - Profile-based GPU worker modes.
  - `auto`, `turbo`, and `full` profile usage.

## 4. Known Issues

- Full E2E streaming integration test is still missing.
  - Impact: Redis + MinIO + Ollama + backend worker + AI Engine streaming contract is not fully validated in one automated flow.
  - Current workaround: targeted pytest coverage plus manual integration testing.
  - Related areas: `tests/`, Redis, MinIO, backend worker, mobile player.

- NMT quality tuning is ongoing.
  - Impact: translation quality may vary by language pair and media style.
  - Current workaround: tune `NMT_BEAM_SIZE`, `NMT_COMPUTE_TYPE`, and refinement prompts per language pair.
  - Related areas: `core/nmt_translator.py`, `core/llm_provider.py`, `core/prompts.py`, `config.py`.

- True language-based worker routing is not fully implemented.
  - Impact: CJK-heavy jobs may not always route to the best worker profile when horizontal scaling is used.
  - Current workaround: current model routing works within the active worker; scaling/routing can be revisited later.
  - Related areas: language detection, worker profiles, queue payloads.

- Long music-heavy files may need further VAD and inspector tuning.
  - Impact: processing time and segmentation quality may vary on real-world music content.
  - Current workaround: current AudioInspector, VADManager, and vocal isolation fallback behavior.

## 5. Next Candidates

- [ ] Add an end-to-end AI Engine integration test with real Redis, MinIO, and optional Ollama.
- [ ] Continue NMT quality tuning for important language pairs.
- [ ] Improve language-based routing for CJK-heavy jobs when horizontal scaling becomes necessary.
- [ ] Further tune the multi-segment AudioInspector using real-world audio.
- [ ] Investigate VAD processing time on long music files.
- [ ] Add basic monitoring and alerting for worker health, GPU memory, processing time, and failure rates.
- [ ] Build a small evaluation set for transcription timing, translation quality, and latency.

## 6. Contract Touchpoints

### Queue

Consumes `AiProcessingJobPayload` from the `ai-processing` queue.

Required fields:

- `mediaId`
- `audioS3Key`
- `durationSeconds`
- `userId`
- `targetLanguage?`

Do not reintroduce `processingMode`.

### Artifacts

Writes durable artifacts under:

```text
processed/{mediaId}/chunks/
processed/{mediaId}/translated_batches/
processed/{mediaId}/final.json
```

Expected surfaces:

- Tier 1 chunk files: raw transcription sentence arrays.
- Tier 2 translated batch files: translated batch objects.
- Final output: full `SubtitleOutput`.

### Progress and Events

Expected processing events:

- `progress`
- `chunk_ready`
- `batch_ready`
- `completed`
- `failed`

Progress must remain monotonic across emitted events and persisted database writes.

### Mobile Impact

Mobile player depends on:

- translated batch availability before `final.json`;
- final JSON shape;
- word timestamps;
- source text;
- translation text;
- phonetic field;
- stable artifact URLs.

### Backend Impact

Backend depends on:

- queue payload compatibility;
- progress/status updates;
- Redis event payloads;
- artifact path conventions;
- final completion/failure state.

## 7. Validation Notes

Fast sanity check:

```powershell
cd apps/ai-engine
venv\Scripts\python.exe -c "from src.core.pipeline import PipelineOrchestrator; print('OK')"
```

Full pytest:

```powershell
cd apps/ai-engine
venv\Scripts\python.exe -m pytest tests/ -v
```

Targeted contract tests:

```powershell
cd apps/ai-engine
venv\Scripts\python.exe -m pytest tests/test_streaming_contracts.py -q
venv\Scripts\python.exe -m pytest tests/test_event_discipline.py -v
```

Docker/GPU profile check:

```bash
cd apps/ai-engine
docker compose --profile auto up
```

Last imported verification state:

- Old checkpoint recorded V2 pipeline and streaming contract as active.
- No fresh command output is available in this generated checkpoint.

## 8. Update Rules

Update this checkpoint when:

- A pipeline stage changes.
- A schema or artifact format changes.
- A queue payload or event payload changes.
- Translation, alignment, VAD, or audio processing behavior changes.
- A runtime profile or GPU setting changes.
- A systemic bug or quality issue is discovered.
- A dependency is added or upgraded.
- A validation result changes the known state.

Do not add long migration history here. Move stable architecture to `INSTRUCTION.md`, cross-module contracts to a future `CONTRACTS.md`, and historical migration details to `docs/archive/`.
