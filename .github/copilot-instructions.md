# Copilot Coding Agent Onboarding

## Start here

- This repository is a monorepo for a bilingual subtitle SaaS system with three active apps:
  - `apps/backend-api`: NestJS API gateway + BullMQ worker producer
  - `apps/ai-engine`: Python BullMQ worker for GPU-heavy subtitle generation
  - `apps/mobile-app`: Expo/React Native client
- The most useful high-level document is `checkpoint.md`. Read it first for architecture, queues, infra, current feature status, and the command table.
- Then read `apps/INSTRUCTION.md` and the app-specific instruction file for the area you are changing:
  - `apps/backend-api/INSTRUCTION.md`
  - `apps/mobile-app/INSTRUCTION.md`
  - `apps/ai-engine/INSTRUCTION.md`
- There is also scoped GitHub instruction coverage for the AI engine at `.github/instructions/ai-engine.instructions.md`.
- The default app READMEs are less trustworthy than `checkpoint.md` and the `INSTRUCTION.md` files. In particular, `apps/mobile-app/README.md` is still the stock Expo template.

## Repository shape and ownership

- `apps/backend-api` is a NestJS v11 modular monolith with Prisma, BullMQ, Redis, MinIO, and JWT auth.
- `apps/ai-engine` is a Python worker whose active V2 path is:
  `AudioProcessor -> AudioInspector -> VADManager -> SmartAligner -> SemanticMerger -> NMTTranslator (+ optional LLM refinement)`
- `apps/mobile-app` is an Expo Router app using Zustand, Axios, Zod, i18next, and `react-native-unistyles`.
- Infra is not managed by a single root compose file in this clone. Instead, compose files live here:
  - `infra/postgres/docker-compose.yml`
  - `infra/redis/docker-compose.yml`
  - `infra/minio/docker-compose.yml`
  - `apps/ai-engine/docker-compose.yml`

## How to work efficiently

- Scope your changes to the relevant app; avoid touching multiple apps unless the feature crosses boundaries.
- Prefer the instruction files and existing implementation patterns over starter-template README guidance.
- Search `checkpoint.md` before guessing service names, queue names, pipeline stages, or commands.
- Treat `processingMode` as removed. The active cross-app contract is bilingual-by-default and carries `targetLanguage` only.
- There are no standard repository GitHub workflow files checked in under `.github/workflows`, so local validation is especially important.

## App-specific rules that matter

### Backend API (`apps/backend-api`)

- Package manager: `pnpm`.
- Key scripts from `package.json`:
  - `pnpm build`
  - `pnpm lint`
  - `pnpm test`
  - `pnpm test:e2e`
  - `pnpm worker:dev`
  - `pnpm pgen`
  - `pnpm pmigrate:dev <name>`
- Follow `apps/backend-api/INSTRUCTION.md`:
  - use DTO classes with `class-validator`
  - use `ConfigService`, not direct `process.env` in business logic
  - use `PrismaService`
  - preserve soft-delete behavior
  - keep BullMQ payloads typed and compatible with the Python worker
  - artifact inventory is now part of the media contract: `/media/:id/artifacts` and media list `artifacts` summaries are used by mobile
  - YouTube submissions may carry a client title; preserve it when present, otherwise prefer `yt-dlp` metadata before falling back to a generic URL-derived placeholder

### AI engine (`apps/ai-engine`)

- Python conventions are strict:
  - type hints everywhere
  - use `from loguru import logger`
  - use `settings` from `src.config`
  - keep all Pydantic models in `src/schemas.py`
  - `SmartAligner` and `VADManager` are singleton-style classes
- Active translation runtime is `core/nmt_translator.py` via CTranslate2; do not reintroduce the deleted `translator_engine.py` path
- `AI_ENABLE_LLM_REFINEMENT` controls the optional post-NMT Ollama refinement path in `async_pipeline.py`; preserve the non-refinement path when disabled
- Public artifact URLs must be signed directly with a MinIO client configured for `MINIO_PUBLIC_ENDPOINT`; never sign an internal host and rewrite the URL afterward
- Progress writes are expected to be monotonic across events and DB updates
- Fast sanity/test commands once the environment is ready:
  - `python -c "from src.core.pipeline import PipelineOrchestrator; print('OK')"`
  - `python -m pytest tests/ -v`
- For dockerized AI engine work, use the compose profiles in `apps/ai-engine/docker-compose.yml`.

### Mobile app (`apps/mobile-app`)

- Package manager: `pnpm`.
- Main existing script for validation: `pnpm lint`.
- Respect `apps/mobile-app/INSTRUCTION.md`:
  - no hardcoded colors or strings
  - use `react-native-unistyles` tokens
  - route all API calls through centralized Axios services
  - keep auth/session state in Zustand
  - mobile should extract audio client-side before upload when the source is video
  - processing/detail flows are socket-first; avoid reintroducing aggressive polling on status/artifact queries
  - durable output state comes from `/media/:id/artifacts`, not temporary preview caches
  - `/(app)/player` is now an incremental subtitle player fed by `translated_batches` before `final.json`; avoid reintroducing full-screen reloads when new batches arrive
  - translation layer should default on and only auto-disable when subtitle metadata shows source and target languages are the same

## Bootstrap and validation checklist

1. Read `checkpoint.md` plus the relevant `INSTRUCTION.md`.
2. Validate only the app you touch first, then broader integration if needed.
3. Use the existing scripts instead of inventing new tooling.
4. If your change touches queues, processing payloads, or output contracts, inspect both backend and AI engine expectations before editing.
5. If your change touches live processing UX, inspect mobile socket sync and backend/AI event payloads together before changing query behavior.

## Errors encountered in a fresh clone and workarounds

These were reproduced in this repository during onboarding and are worth knowing up front:

- `pnpm: command not found` when trying to run backend/mobile scripts in this sandbox.
  - Workaround: install `pnpm` first, then run `pnpm install` inside the Node app you are working on before using `pnpm lint`, `pnpm test`, or dev commands.
- AI engine import sanity check fails immediately with `ModuleNotFoundError: No module named 'loguru'` in a fresh clone.
  - Workaround: create/activate the AI engine virtual environment, install PyTorch first, then install `requirements.txt`:
    - `cd apps/ai-engine`
    - `python -m venv .venv`
    - `source .venv/bin/activate` on Linux/macOS or `.venv\Scripts\activate` on Windows
    - `pip install --pre torch torchvision --index-url https://download.pytorch.org/whl/nightly/cu128`
    - `pip install -r requirements.txt`
- `python -m pytest` currently fails with `No module named pytest` in the same fresh environment.
  - Workaround: after activating the AI engine venv, install `pytest` if it is not already present in the local environment before running the test suite.
- `apps/backend-api/package.json` contains `pnpm start:local`, but this clone does not include a root `infra/docker-compose.yml`.
  - Workaround: start infra services from the per-service compose directories under `infra/postgres`, `infra/redis`, and `infra/minio` instead of assuming a single root compose file exists.
- On Windows, native Android builds for `apps/mobile-app` can fail because `react-native-unistyles` hits CMake path-length limits.
  - Workaround: move the repo to a shorter absolute path before running `expo run:android`, and if needed add a recent Ninja binary to the Android CMake `bin` directory as described in `apps/mobile-app/INSTRUCTION.md`.

## Practical guidance for future agents

- Treat `checkpoint.md` as the project status/source-of-truth document.
- Treat generic starter docs as stale unless confirmed by code.
- Prefer small, app-local changes with app-local validation.
- If you touch AI output schemas or queue payloads, verify downstream consumers in the other apps before finalizing.
- For media-processing work, verify both the status contract and the artifact contract; current mobile UX depends on both.
