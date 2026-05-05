# AI Engine - Checkpoint

> Last updated: 2026-05-06
> Maintained by: agents - update this file after every significant change.

## Current Status

| Area                                         | Status  | Notes                                                                                             |
| -------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------- |
| V2 async NMT-first pipeline                  | Working | `main.py` delegates to the V2 async path and `async_pipeline.py` owns the real orchestration.     |
| Tier 1 and Tier 2 streaming artifacts        | Working | `chunks/`, `translated_batches/`, and `final.json` are the live durable output surfaces.          |
| NMT translation with optional LLM refinement | Working | CTranslate2 / NLLB is primary; Ollama refinement is optional and best effort.                     |
| Docker worker profiles                       | Working | Compose profiles `auto`, `turbo_only`, and `full_only` are documented for GPU deployment.         |
| End-to-end automated coverage                | Partial | Automated coverage is contract-focused and does not fully cover BullMQ, DB writes, or live infra. |

## Active Pipeline / Architecture Notes

- The runtime boundary is: BullMQ job in -> MinIO raw audio download -> V2 subtitle pipeline -> MinIO processed artifact upload -> PostgreSQL status update -> Redis progress events.
- Queue name: `ai-processing`; BullMQ prefix: `bilingual`; concurrency: `1`; lock duration: `10 minutes`; stalled interval: `5 minutes`.
- `src/async_pipeline.py` is the active orchestration layer, not `src/core/pipeline.py`.
- The producer path is `AudioProcessor -> AudioInspector -> VADManager -> SmartAligner`; translation is decoupled behind `asyncio.Queue(maxsize=4)`.
- Tier 1 chunk files are arrays with `segment_index = null`.
- Tier 2 batch files are objects with `batch_index`, `first_segment_index`, and `segments`.
- `final.json` is the authoritative ordered output and carries consecutive 0-based `segment_index` values.
- The AI engine publishes `progress`, `chunk_ready`, `batch_ready`, `completed`, and `failed` events on `media_updates`.
- Cross-module queue payloads and artifact expectations are summarized in the repository root `AGENTS.md`.

## Known Issues & Workarounds

- `final.json` is still stored under transcript-style naming in some DB and event fields (`transcriptS3Key` / `transcript_s3_key`); downstream consumers must treat that key as the final subtitle artifact.
- CJK content can collapse Tier 1 chunks into fewer Tier 2 segments after semantic merge; use `segment_index` and `first_segment_index` for matching instead of array position.
- Automated tests are contract-focused and do not fully exercise BullMQ, DB writes, Redis sequencing, or live MinIO/Ollama behavior; use the documented live-infra harness when validating those boundaries.
- `src/scripts/test_pipeline.py` is stale and calls a nonexistent API; use `src.scripts.test_v2_pipeline` instead.
- Legacy remnants still exist (`TRANSLATOR_PROVIDER`, `USE_V2_PIPELINE`, `subtitle_s3_key`, `ContextAnalysis` alias); do not build new behavior on them.

## Environment & Commands

```powershell
venv\Scripts\python.exe -m src.main
venv\Scripts\python.exe -m pytest tests/test_streaming_contracts.py -q
venv\Scripts\python.exe -m pytest tests/test_streaming_contracts.py -v --tb=short
venv\Scripts\python.exe -m pytest tests/ -v
venv\Scripts\python.exe -m src.scripts.test_v2_pipeline
venv\Scripts\python.exe -m src.scripts.test_v2_pipeline demo_audio_3.mp3 --lang vi --live-infra
docker compose --profile auto up
docker compose --profile turbo_only up
docker compose --profile full_only up
```

## Recent Changes

| Date       | Change                                                                                                                     | Author              |
| ---------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| 2026-04-02 | P0 + P1a + P1b optimization pass reduced wall time from 217.8s to 101.8s on the benchmarked 565s video.                    | existing checkpoint |
| 2026-04-10 | Root checkpoint documents the V2 pipeline as the only active production path with `targetLanguage` and monotonic progress. | existing checkpoint |
| 2026-05-06 | Split AI-engine-specific status into `apps/ai-engine/CHECKPOINT.md`.                                                       | agent               |

## Follow-up Items

- Continue NMT quality tuning for `NMT_BEAM_SIZE`, `NMT_COMPUTE_TYPE`, and refinement prompts.
- Tackle transcription speed as the main remaining bottleneck after P1.
- Add true language-based worker routing when horizontal scaling becomes necessary.
- Add an end-to-end integration test with real Redis, MinIO, and Ollama.
- Further refine the multi-segment inspector with real-world audio.
- Investigate VAD performance on long music files.
- Add monitoring and alerting for worker processes.
