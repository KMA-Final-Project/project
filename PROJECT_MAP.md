
# PROJECT_MAP.md

> Last updated: 2026-05-20  
> Purpose: fast repository navigation for coding agents and human maintainers.

## 1. How to Use This File

Use this file after reading `AGENTS.md` and before opening source files. It is a navigation map only; it does not replace module-specific instructions or checkpoints.

Recommended agent flow:

1. Read `AGENTS.md`.
2. Read this `PROJECT_MAP.md`.
3. Identify the affected module(s).
4. Read the affected module's `INSTRUCTION.md`.
5. Read the affected module's `CHECKPOINT.md`.
6. Inspect the real source files before editing.

For cross-module changes, especially queue payloads, artifact formats, socket events, subtitle JSON, auth, or progress semantics, read every affected module's instruction and checkpoint.

## 2. Product Shape

This repository builds a SaaS-style bilingual subtitle system.

Core flow:

```text
Mobile App
  -> Backend API
  -> Redis / BullMQ transcription queue
  -> Backend Worker validation
  -> Redis / BullMQ ai-processing queue
  -> AI Engine GPU worker
  -> MinIO processed artifacts + PostgreSQL status + Redis events
  -> Backend socket mirror
  -> Mobile playback and subtitle UX
```

Primary output surfaces:

- `processed/{mediaId}/chunks/`
- `processed/{mediaId}/translated_batches/`
- `processed/{mediaId}/final.json`

## 3. Top-Level Files

```text
.
|- AGENTS.md              # Mandatory agent behavior, startup protocol, and global guardrails.
|- INSTRUCTION.md         # Product vision, architecture overview, module roles, and main use cases.
|- PROJECT_MAP.md         # Repository navigation map.
|- COMMANDS.md            # Command reference and validation strategy.
|- apps/                  # Active product applications.
|- infra/                 # Local infrastructure compose setups.
|- scripts/               # Helper scripts.
`- docs/                  # Optional docs/archive/evaluation material.
```

## 4. Active Modules

### 4.1 Backend API

Path:

```text
apps/backend-api
```

Role:

The NestJS HTTP and worker boundary. It owns authentication, subscriptions, quotas, media APIs, presigned upload negotiation, validation worker flow, BullMQ job production, PostgreSQL records, and MinIO access helpers.

It does not own transcription, translation, or GPU processing.

Entry points:

```text
apps/backend-api/src/main.ts
apps/backend-api/src/worker.ts
apps/backend-api/src/app.module.ts
apps/backend-api/src/worker.module.ts
```

Important folders:

```text
apps/backend-api/src/modules/auth          # Register, verify OTP, login, refresh, logout.
apps/backend-api/src/modules/admin         # Subscription plan and variant administration.
apps/backend-api/src/modules/media         # Upload, YouTube submit, status, artifacts, library.
apps/backend-api/src/modules/media/workers # MediaProcessor validation worker.
apps/backend-api/src/modules/queue         # BullMQ producer service and queue payload types.
apps/backend-api/src/modules/minio         # Presigned URLs, object verification, upload/download helpers.
apps/backend-api/src/modules/redis         # Redis access helpers.
apps/backend-api/src/modules/mail          # OTP email delivery.
apps/backend-api/src/modules/otp           # OTP generation and verification.
apps/backend-api/src/modules/user          # User profile and subscription helpers.
apps/backend-api/src/prisma                # PrismaModule and PrismaService.
apps/backend-api/prisma                    # Prisma schema, migrations, seed, generated client.
apps/backend-api/scripts                   # Backend utility scripts.
```

Agent docs:

```text
apps/backend-api/INSTRUCTION.md
apps/backend-api/CHECKPOINT.md
```

### 4.2 AI Engine

Path:

```text
apps/ai-engine
```

Role:

The Python GPU worker. It consumes validated `ai-processing` jobs, downloads audio from MinIO, runs the active V2 async NMT-first subtitle pipeline, uploads streaming/final artifacts, updates PostgreSQL progress/status, and emits Redis progress events.

Entry points:

```text
apps/ai-engine/src/main.py
apps/ai-engine/src/pipelines.py
apps/ai-engine/src/async_pipeline.py
```

Important files and folders:

```text
apps/ai-engine/src/main.py                  # Thin BullMQ consumer entry point.
apps/ai-engine/src/pipelines.py             # V2 pipeline entry point.
apps/ai-engine/src/async_pipeline.py        # Active asyncio producer-consumer pipeline.
apps/ai-engine/src/db.py                    # Direct PostgreSQL status/progress helpers.
apps/ai-engine/src/events.py                # Redis Pub/Sub event publishing.
apps/ai-engine/src/minio_client.py          # Audio download and artifact upload helpers.
apps/ai-engine/src/config.py                # Settings and runtime flags.
apps/ai-engine/src/schemas.py               # Pydantic schemas; keep models here.
apps/ai-engine/src/core/audio_inspector.py  # Music/speech classification.
apps/ai-engine/src/core/vad_manager.py      # Silero VAD and speech-region merge.
apps/ai-engine/src/core/smart_aligner.py    # Whisper alignment, word timestamps, Tier 1 chunk callbacks.
apps/ai-engine/src/core/semantic_merger.py  # Language-aware merge and CJK handling.
apps/ai-engine/src/core/nmt_translator.py   # Active NLLB/CTranslate2 translation runtime.
apps/ai-engine/src/core/llm_provider.py     # Optional LLM refinement.
apps/ai-engine/src/utils/audio_processor.py # FFmpeg audio normalization.
apps/ai-engine/src/utils/vocal_isolator.py  # Vocal isolation for music-heavy audio.
apps/ai-engine/tests                        # Pytest coverage.
apps/ai-engine/outputs/debug                # Per-job debug snapshots.
apps/ai-engine/outputs/profiles             # Hardware profiler output.
apps/ai-engine/temp                         # Temporary processing files.
apps/ai-engine/venv                         # Local virtual environment. Reuse it; do not create another venv.
```

Deprecated paths that should not be reintroduced:

```text
apps/ai-engine/src/core/translator_engine.py
apps/ai-engine/src/incremental_pipeline.py
```

Agent docs:

```text
apps/ai-engine/INSTRUCTION.md
apps/ai-engine/CHECKPOINT.md
```

### 4.3 Mobile App

Path:

```text
apps/mobile-app
```

Role:

The Expo/React Native client. It owns user intent capture, auth/session UI, upload flow, socket-first processing UX, media library, settings, and the incremental bilingual subtitle player.

It extracts audio from video before upload, uploads directly to MinIO through backend-issued presigned URLs, and hydrates player state from translated batches before `final.json` is available.

Entry points:

```text
apps/mobile-app/src/entry.ts
apps/mobile-app/src/app/_layout.tsx
apps/mobile-app/src/app/(app)/_layout.tsx
```

Important folders:

```text
apps/mobile-app/src/app                       # Expo Router pages and layouts.
apps/mobile-app/src/app/(auth)                # Login/register/verify OTP routes.
apps/mobile-app/src/app/(app)                 # Library, upload, processing, player, settings routes.
apps/mobile-app/src/components                # Reusable UI primitives and auth components.
apps/mobile-app/src/services/api.ts           # Central Axios instance and interceptors.
apps/mobile-app/src/services/token-storage.ts # Secure token storage.
apps/mobile-app/src/stores/auth.store.ts      # Zustand auth/session store.
apps/mobile-app/src/constants                 # Endpoint and route constants.
apps/mobile-app/src/validations               # Zod schemas.
apps/mobile-app/src/types                     # App-facing DTO/types.
apps/mobile-app/src/theme                     # Design tokens, themes, Unistyles config.
apps/mobile-app/src/i18n                      # i18next setup and locale files.
apps/mobile-app/src/hooks                     # Theme/language and app hooks.
```

Agent docs:

```text
apps/mobile-app/INSTRUCTION.md
apps/mobile-app/CHECKPOINT.md
```

## 5. Infrastructure

### PostgreSQL

```text
infra/postgres/docker-compose.yml
```

Local relational data store. Used for users, subscriptions, media, usage history, refresh tokens, and processing status.

### Redis

```text
infra/redis/docker-compose.yml
```

Used for BullMQ queues, registration cache, and Pub/Sub processing events.

Active queues:

```text
transcription
ai-processing
```

BullMQ prefix:

```text
bilingual
```

### MinIO

```text
infra/minio/docker-compose.yml
```

S3-compatible object storage.

Buckets:

```text
raw
processed
```

Do not sign client-facing URLs against an internal host and rewrite them afterward. Client-facing artifact URLs must be signed with the public endpoint configuration.

### AI Engine Docker

```text
apps/ai-engine/docker-compose.yml
apps/ai-engine/Dockerfile
```

GPU worker profiles:

```text
auto
turbo
full
```

## 6. Cross-Module Contract Hotspots

Treat these as high-risk. Inspect all affected modules before changing them.

```text
Queue payloads:
- TranscriptionJobPayload
- AiProcessingJobPayload

Artifact paths:
- processed/{mediaId}/chunks/
- processed/{mediaId}/translated_batches/
- processed/{mediaId}/final.json

Subtitle schemas:
- Sentence
- TranslatedBatch
- SubtitleOutput

Media status and progress:
- QUEUED
- VALIDATING
- PROCESSING
- COMPLETED
- FAILED
- progress
- currentStep
- estimatedTimeRemaining
- failReason

Socket events:
- progress
- chunk_ready
- batch_ready
- completed
- failed

Language behavior:
- targetLanguage
- no processingMode
```

## 7. Generated, Heavy, or Local-Only Paths

Agents should avoid editing or committing generated/heavy/local-only outputs unless explicitly asked.

```text
apps/ai-engine/venv/
apps/ai-engine/temp/
apps/ai-engine/outputs/
apps/backend-api/prisma/generated/
node_modules/
dist/
build/
.expo/
```

Debug and profiler outputs may be useful for diagnosis but should not become primary documentation.

## 8. Task Routing Guide

Backend-only task:

```text
Read:
- AGENTS.md
- PROJECT_MAP.md
- INSTRUCTION.md
- apps/backend-api/INSTRUCTION.md
- apps/backend-api/CHECKPOINT.md
```

AI Engine-only task:

```text
Read:
- AGENTS.md
- PROJECT_MAP.md
- INSTRUCTION.md
- apps/ai-engine/INSTRUCTION.md
- apps/ai-engine/CHECKPOINT.md
```

Mobile-only task:

```text
Read:
- AGENTS.md
- PROJECT_MAP.md
- INSTRUCTION.md
- apps/mobile-app/INSTRUCTION.md
- apps/mobile-app/CHECKPOINT.md
```

Cross-module contract task:

```text
Read:
- AGENTS.md
- PROJECT_MAP.md
- INSTRUCTION.md
- every affected module's INSTRUCTION.md
- every affected module's CHECKPOINT.md
- the actual source files that define and consume the contract
```

Common cross-module examples:

```text
Queue payload change:
- backend-api
- ai-engine

Artifact or subtitle JSON change:
- ai-engine
- backend-api
- mobile-app

Socket/progress behavior change:
- ai-engine
- backend-api
- mobile-app

Upload flow change:
- mobile-app
- backend-api

Quota/subscription change:
- backend-api
- mobile-app when user-facing limits or errors change
```

## 9. Maintenance Rule

Keep this file focused on navigation. Do not turn it into a checkpoint, decision log, command reference, or contract specification.
