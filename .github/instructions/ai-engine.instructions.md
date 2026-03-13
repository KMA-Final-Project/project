---
applyTo: "apps/ai-engine/**"
---

# AI Engine — Copilot Instructions

Python BullMQ worker that runs a bilingual subtitle generation pipeline.

## Project Structure

```text
src/
├── main.py              # Entry point + job orchestration (all pipeline logic lives here)
├── config.py            # pydantic-settings config — single `settings` singleton
├── schemas.py           # ALL Pydantic models (Sentence, VADSegment, TranslationStyle, etc.)
├── minio_client.py      # MinIO upload/download helpers
├── core/
│   ├── pipeline.py      # Component registry only — no business logic
│   ├── audio_inspector.py
│   ├── vad_manager.py
│   ├── smart_aligner.py
│   ├── semantic_merger.py
│   ├── translator_engine.py
│   ├── llm_provider.py  # Ollama wrapper
│   └── prompts.py       # All LLM prompt templates (module-level constants)
└── utils/
    ├── audio_processor.py
    ├── vocal_isolator.py
    └── hardware_profiler.py
```

**Pipeline order:** `AudioProcessor → AudioInspector → VADManager → SmartAligner → SemanticMerger → TranslatorEngine`

## Python Conventions

- **Type hints:** Mandatory on all functions and methods.
- **Logging:** `from loguru import logger` only. Never use stdlib `logging` in new code.
- **Config:** Always read from `settings` (`from src.config import settings`). No hardcoded values.
- **Schemas:** All Pydantic models go in `src/schemas.py`. Do not define models inside `core/` modules.
- **Singletons:** `SmartAligner` and `VADManager` use the `__new__` + `_initialized` pattern — never instantiate them more than once per process.
- **Error handling:** Catch exceptions, log with `logger.error()`, return a safe fallback — never crash the job.

## Testing & Validation

Always activate the venv first:

```bash
cd apps/ai-engine
.venv\Scripts\activate        # Windows
# source .venv/bin/activate   # Linux/macOS (inside Docker)

# Import sanity check
python -c "from src.core.pipeline import PipelineOrchestrator; print('OK')"

# Run a specific script
python -m src.scripts.<script_name>
```

> PyTorch must be installed manually before `requirements.txt`:
>
> ```bash
> pip install --pre torch torchvision --index-url https://download.pytorch.org/whl/nightly/cu128
> pip install -r requirements.txt
> ```
