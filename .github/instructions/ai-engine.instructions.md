---
applyTo: "apps/ai-engine/**"
---

# AI Engine — Copilot Instructions

Python BullMQ worker that runs a bilingual subtitle generation pipeline.

## Project Structure

```text
src/
├── main.py              # BullMQ entry point + job orchestration
├── config.py            # pydantic-settings config — single `settings` singleton
├── db.py                # Direct PostgreSQL helpers for status/progress updates
├── events.py            # Redis Pub/Sub publishers (progress, chunk_ready, batch_ready, etc.)
├── pipelines.py         # Thin entry point to the active V2 pipeline
├── async_pipeline.py    # Async producer-consumer pipeline implementation
├── schemas.py           # ALL Pydantic models (Sentence, VADSegment, TranslationStyle, etc.)
├── minio_client.py      # MinIO upload/download helpers
├── core/
│   ├── pipeline.py      # Component registry only — no business logic
│   ├── audio_inspector.py
│   ├── vad_manager.py
│   ├── smart_aligner.py
│   ├── semantic_merger.py
│   ├── nmt_translator.py
│   ├── llm_provider.py  # Ollama wrapper
│   └── prompts.py       # All LLM prompt templates (module-level constants)
└── utils/
    ├── audio_processor.py
    ├── vocal_isolator.py
    └── hardware_profiler.py
```

**Active pipeline order:** `AudioProcessor → AudioInspector → VADManager → SmartAligner → SemanticMerger → NMTTranslator → optional LLM refinement`

**Runtime notes:**

- `main.py` always runs the V2 path through `run_v2_pipeline()`.
- `processingMode` is gone from the active queue contract. Use `targetLanguage` only.
- Progress must remain monotonic across both emitted events and DB writes.
- Durable output artifacts live under `processed/{mediaId}/chunks/`, `processed/{mediaId}/translated_batches/`, and `processed/{mediaId}/final.json`.

## Python Conventions

- **Type hints:** Mandatory on all functions and methods.
- **Logging:** `from loguru import logger` only. Never use stdlib `logging` in new code.
- **Config:** Always read from `settings` (`from src.config import settings`). No hardcoded values.
- **Schemas:** All Pydantic models go in `src/schemas.py`. Do not define models inside `core/` modules.
- **Singletons:** `SmartAligner` and `VADManager` use the `__new__` + `_initialized` pattern — never instantiate them more than once per process.
- **Translation runtime:** Use `NMTTranslator` for bilingual translation. Do not recreate the deleted `TranslatorEngine` path.
- **Progress safety:** Any change to progress/current-step publishing must preserve monotonic behavior in both memory and persisted DB state.
- **Error handling:** Catch exceptions, log with `logger.error()`, return a safe fallback — never crash the job.

## Testing & Validation

Always activate the venv first:

```bash
cd apps/ai-engine
.venv\Scripts\activate        # Windows
# source .venv/bin/activate   # Linux/macOS (inside Docker)

# Import sanity check
python -c "from src.core.pipeline import PipelineOrchestrator; print('OK')"

# Unit tests
python -m pytest tests/ -v

# Run a specific script
python -m src.scripts.<script_name>
```

Preferred targeted validations when changing the live pipeline:

```bash
python -m pytest tests/test_two_tier_streaming.py -v
python -m pytest tests/test_event_discipline.py -v
```

> PyTorch must be installed manually before `requirements.txt`:
>
> ```bash
> pip install --pre torch torchvision --index-url https://download.pytorch.org/whl/nightly/cu128
> pip install -r requirements.txt
> ```
