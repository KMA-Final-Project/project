# AI Engine - Agent Instruction

## 1. Module Role

`apps/ai-engine` is the queue-driven Python GPU worker that owns the full audio-to-JSON subtitle pipeline. It downloads validated audio from MinIO, runs the active V2.1 hybrid async pipeline, uploads streaming and final artifacts, updates PostgreSQL status, and emits Redis progress events.

## 2. Tech Stack

- Language: Python 3.12
- ASR: `faster-whisper`
- Word-level refinement support: `stable-ts`
- VAD: `silero-vad`
- Translation runtime: CTranslate2 with NLLB-200-3.3B
- Optional refinement: Ollama via `LLMProvider`
- Logging: `loguru`
- Settings: `pydantic-settings`
- Local virtual environment: `apps/ai-engine/venv`

## 3. Active V2.1 Pipeline

The live orchestration runs through `src/async_pipeline.py`. Public behavior stays the same as V2, but the default single-worker runtime is now resource-aware so one 16GB GPU is not asked to keep multiple heavy Whisper routes and NMT resident at the same time.

1. `AudioProcessor` - normalizes input audio to 16kHz mono WAV.
2. `AudioInspector` - classifies audio as music-oriented or standard speech.
3. `VADManager` - detects and merges speech regions and can isolate vocals for music-heavy audio.
4. Source-language routing - uses `AI_SOURCE_LANGUAGE_HINT`, any local hint, or a short turbo-route probe to choose the main ASR route before transcription.
5. `SmartAligner` - lazily loads only the chosen Whisper route for the job, produces word timestamps, enriches word phonemes, and emits Tier 1 chunk callbacks during ASR.
6. `SemanticMerger` - performs language-aware line grouping and CJK homophone correction when merge logic is needed.
7. `NMTTranslator` - translates batches with NLLB-200-3.3B via CTranslate2. In the default `AI_TRANSLATION_START_POLICY=after_asr` mode, NMT starts only after ASR unloads its heavy route and releases GPU residency.
8. `LLMProvider` refinement (optional) - applies a post-NMT quality pass when `AI_ENABLE_LLM_REFINEMENT` is enabled.

Default hybrid guardrails:

- Tier 1 `chunks/` uploads and `chunk_ready` events stay live during ASR.
- `translated_batches/`, `final.json`, socket event names, and progress semantics stay unchanged.
- `WORKER_MODEL_MODE=auto` now means lazy per-job route selection, not eager dual-model startup.
- `AI_ENABLE_NMT_PREFETCH` should stay `False` in the default single-GPU path unless benchmark evidence justifies overlap.

## 4. Performance Profiles

Do not hardcode performance settings. The runtime is controlled by `AI_PERF_MODE`.

| Profile  | Target                          | Quantization / compute  | Batch size        | Beam size |
| -------- | ------------------------------- | ----------------------- | ----------------- | --------- |
| `LOW`    | Background jobs and lower heat  | `int8`                  | `1`               | `1-2`     |
| `MEDIUM` | Default balanced mode           | `int8_float16`          | `4`               | `5`       |
| `HIGH`   | Priority jobs and maximum speed | `float16` when possible | Higher batch size | `5+`      |

`MEDIUM` is the default profile.

Single-GPU runtime defaults:

- `AI_TRANSLATION_START_POLICY=after_asr`
- `AI_SOURCE_LANGUAGE_PROBE_ENABLED=true`
- `AI_ENABLE_NMT_PREFETCH=false`

## 5. Coding Standards

- Add type hints to every function and method.
- Use `from loguru import logger`; do not introduce `print`-based logging.
- Read configuration from `settings` in `src.config`; do not hardcode thresholds or runtime parameters.
- Keep all Pydantic models in `src/schemas.py`; do not define models inside pipeline modules.
- Preserve the singleton pattern used by `SmartAligner` and `VADManager`.
- Keep failure handling graceful; do not let GPU issues crash the worker outright.

## 6. Output JSON Schema

Output must strictly adhere to the schema required by the Mobile App:

```json
{
    "metadata": { "duration": 300.5, "engine_profile": "MEDIUM", ... },
    "segments": [
        {
            "start": 0.0, "end": 4.5,
            "text": "Source text",
            "translation": "Target text",
            "phonetic": "/ipa/",
            "words": [{ "word": "Source", "start": 0.0, "end": 0.5 }]
        }
    ]
}
```

## 7. MinIO Artifact Rules

- Sign any client-facing artifact URL with the MinIO client configured for `MINIO_PUBLIC_ENDPOINT`.
- Do not sign against an internal host and rewrite the URL afterward.
- Streaming output is written under `processed/{mediaId}/chunks/` and `processed/{mediaId}/translated_batches/`.
- Completion output is written to `processed/{mediaId}/final.json`.
- Progress writes and emitted events must remain monotonic across the whole pipeline.

## 8. Environment Setup

Use the existing virtual environment at `apps/ai-engine/venv`. Never create a second venv for this module.

Windows PowerShell:

```powershell
cd apps/ai-engine
venv\Scripts\activate
```

Linux/macOS:

```bash
cd apps/ai-engine
source venv/bin/activate
```

Sanity import check:

```powershell
venv\Scripts\python.exe -c "from src.core.pipeline import PipelineOrchestrator; print('OK')"
```

Pytest:

```powershell
venv\Scripts\python.exe -m pytest tests/ -v
```

## 9. Validation Checklist

Use the smallest check that matches your change, then expand if needed.

```powershell
venv\Scripts\python.exe -c "from src.core.pipeline import PipelineOrchestrator; print('OK')"
venv\Scripts\python.exe -m pytest tests/test_hybrid_routing.py -v
venv\Scripts\python.exe -m pytest tests/test_streaming_contracts.py -q
venv\Scripts\python.exe -m pytest tests/test_event_discipline.py -v
venv\Scripts\python.exe -m pytest tests/ -v
docker compose --profile auto up
```
