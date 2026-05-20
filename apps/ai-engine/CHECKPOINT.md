# AI Engine - Checkpoint

> Last updated: 2026-05-20
> Maintained by: agents - update this file after every significant change.

## 1. Current Status

AI Engine is in the active V2.1 hybrid production-path state.

The module is a queue-driven Python GPU worker that consumes `ai-processing` jobs, downloads validated audio from MinIO, runs the V2.1 hybrid async pipeline, uploads streaming and final subtitle artifacts, updates PostgreSQL progress/status, and emits Redis Pub/Sub processing events.

The active production path is:

```text
main.py
  -> pipelines.py / run_v2_pipeline()
  -> async_pipeline.py
  -> AudioProcessor
  -> AudioInspector
  -> VADManager
  -> source-language hint/probe routing
  -> SmartAligner
  -> SemanticMerger when needed
  -> NMTTranslator
  -> optional LLMProvider refinement
  -> MinIO chunks / translated_batches / final.json
```

Default single-worker behavior now keeps Tier 1 chunk streaming live during ASR, then unloads ASR before NMT translation starts. Public artifacts, event names, queue semantics, and progress discipline stay unchanged.

Deprecated V1 paths must not be reintroduced.

## 2. Active Work

- [ ] Benchmark the V2.1 hybrid runtime on at least `3 English + 3 Chinese` cases and capture VRAM, first-chunk, and first-translated-batch timings.

## 3. Recently Completed

- 2026-05-20 — V2.1 hybrid single-GPU runtime adopted.
  - Status: Working
  - Changed: `SmartAligner` and `NMTTranslator` now support lazy load/unload, source-language hint/probe routing selects the main ASR route per job, and the default `AI_TRANSLATION_START_POLICY=after_asr` schedule unloads ASR before NMT starts.
  - Why: Keep one 16GB GPU worker off the multi-model VRAM cliff while preserving `chunks/`, `translated_batches/`, `final.json`, event names, and monotonic progress behavior.
  - Validation: `venv\Scripts\python.exe -c "from src.core.pipeline import PipelineOrchestrator; print('OK')"`; `venv\Scripts\python.exe -m py_compile src/config.py src/async_pipeline.py src/core/smart_aligner.py src/core/nmt_translator.py src/main.py src/pipelines.py src/scripts/benchmark_suite.py`; `venv\Scripts\python.exe -m pytest tests/test_prewarm_startup.py -v --basetemp C:\Users\sondo\AppData\Local\Temp\codex-pytest-20260520\prewarm`; `venv\Scripts\python.exe -m pytest tests/test_hybrid_routing.py -v --basetemp C:\Users\sondo\AppData\Local\Temp\codex-pytest-20260520\hybrid`; `venv\Scripts\python.exe -m pytest tests/test_streaming_contracts.py -q --basetemp C:\Users\sondo\AppData\Local\Temp\codex-pytest-20260520\contracts`; direct invocation of the `tmp_path` cases in `tests/test_first_batch_streaming.py` and `tests/test_event_discipline.py` via `pytest.MonkeyPatch` because this sandbox blocks pytest tmpdir cleanup.
  - Follow-up: Run the benchmark matrix and decide later whether `during_asr` overlap or NMT prefetch is worth re-enabling on specific hardware profiles.

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

- Hybrid runtime still needs benchmark evidence across representative EN and CJK media.
  - Impact: the default `after_asr` schedule is implemented and validated functionally, but VRAM headroom and latency tradeoffs are not yet recorded in the repo for the target `3 English + 3 Chinese` matrix.
  - Current workaround: keep `AI_TRANSLATION_START_POLICY=after_asr` and `AI_ENABLE_NMT_PREFETCH=false` on constrained single-GPU deployments until benchmark results exist.
  - Related areas: `src/async_pipeline.py`, `src/core/smart_aligner.py`, `src/core/nmt_translator.py`, `src/scripts/benchmark_suite.py`.

- NMT quality tuning is ongoing.
  - Impact: translation quality may vary by language pair and media style.
  - Current workaround: tune `NMT_BEAM_SIZE`, `NMT_COMPUTE_TYPE`, and refinement prompts per language pair.
  - Related areas: `core/nmt_translator.py`, `core/llm_provider.py`, `core/prompts.py`, `config.py`.

- Queue-level worker routing for horizontal scale-out is still incomplete.
  - Impact: the active worker now chooses the correct ASR route internally, but multi-worker deployments still lack queue-level language-aware dispatch when separate `turbo` and `full` workers are used.
  - Current workaround: rely on per-job lazy routing inside the worker or pin deployments to a single hybrid worker until scale-out routing is designed explicitly.
  - Related areas: worker profiles, queue payloads, future backend dispatch rules.

- Long music-heavy files may need further VAD and inspector tuning.
  - Impact: processing time and segmentation quality may vary on real-world music content.
  - Current workaround: current AudioInspector, VADManager, and vocal isolation fallback behavior.

## 5. Next Candidates

- [ ] Run the benchmark suite for `3 English + 3 Chinese` media and capture VRAM, route, first chunk, and first translated batch timings.
- [ ] Add an end-to-end AI Engine integration test with real Redis, MinIO, and optional Ollama.
- [ ] Continue NMT quality tuning for important language pairs.
- [ ] Improve queue-level language-aware worker routing when horizontal scaling becomes necessary.
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
Do not treat source-language hints as a required cross-module contract in the current MVP.

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

Focused hybrid validation:

```powershell
cd apps/ai-engine
venv\Scripts\python.exe -m pytest tests/test_prewarm_startup.py -v
venv\Scripts\python.exe -m pytest tests/test_hybrid_routing.py -v
venv\Scripts\python.exe -m pytest tests/test_streaming_contracts.py -q
```

Ordering and worker-discipline tests:

```powershell
cd apps/ai-engine
venv\Scripts\python.exe -m pytest tests/test_first_batch_streaming.py -v
venv\Scripts\python.exe -m pytest tests/test_event_discipline.py -v
```

Full pytest:

```powershell
cd apps/ai-engine
venv\Scripts\python.exe -m pytest tests/ -v
```

Docker/GPU profile or benchmark check:

```bash
cd apps/ai-engine
docker compose --profile auto up
```

Last verified:

- 2026-05-20 — import sanity, py_compile, `test_prewarm_startup.py`, `test_hybrid_routing.py`, and `test_streaming_contracts.py` passed.
- 2026-05-20 — `tests/test_first_batch_streaming.py` and `tests/test_event_discipline.py` logic passed via direct function invocation because this sandbox denies pytest tmpdir cleanup under `--basetemp`.

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
