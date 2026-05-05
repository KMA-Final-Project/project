# AGENTS.md

## 0. Read This First

This file is the mandatory entry point for every coding agent working in this repository, including Claude Code, Cursor, Copilot, Codex, Windsurf, and similar tools. Read it before inspecting code, editing files, or running commands; then continue into the active module's `INSTRUCTION.md` and `CHECKPOINT.md`.

## 1. Repository Map

```text
.
|- AGENTS.md                    # Mandatory agent onboarding, behavior rules, and shared contracts.
|- INSTRUCTION.md               # Project-wide orientation: product vision, architecture, and main use cases.
|- apps/
|  |- INSTRUCTION.md            # Shared SaaS and product rules that apply across the active apps.
|  |- backend-api/              # NestJS API gateway, auth/media endpoints, and BullMQ worker producer.
|  |- ai-engine/                # Python GPU worker that produces bilingual subtitle artifacts.
|  `- mobile-app/               # Expo/React Native client for upload, processing UX, and playback.
|- infra/
|  |- postgres/                 # PostgreSQL compose setup for local relational data.
|  |- redis/                    # Redis compose setup for BullMQ queues and caching.
|  `- minio/                    # MinIO compose setup for raw and processed media artifacts.
|- scripts/                     # Helper scripts
```

## 2. Session Startup Protocol

1. Read this file (`AGENTS.md`) fully.
2. Identify which module(s) the current task touches (`backend-api`, `ai-engine`, `mobile-app`). If ambiguous, ask before proceeding.
3. Read the active module's `INSTRUCTION.md`.
4. Read the active module's `CHECKPOINT.md` to understand current feature status, known issues, and in-flight work.
5. If the task crosses module boundaries, read all affected modules' files.
6. State assumptions explicitly before writing any code.

## 3. Module Directory

| Module      | Path               | Stack                                                                                         | Entry Points                           |
| ----------- | ------------------ | --------------------------------------------------------------------------------------------- | -------------------------------------- |
| Backend API | `apps/backend-api` | NestJS v11, TypeScript, Prisma, BullMQ, Redis, MinIO, JWT                                     | `src/main.ts`, `src/worker.ts`         |
| AI Engine   | `apps/ai-engine`   | Python 3.12, faster-whisper, stable-ts, silero-vad, CTranslate2, NLLB-200-3.3B, BullMQ, MinIO | `src/main.py`, `src/async_pipeline.py` |
| Mobile App  | `apps/mobile-app`  | Expo 54, React Native, Expo Router, Zustand, Axios, Zod, i18next, react-native-unistyles      | `src/entry.ts`, `src/app/_layout.tsx`  |

## 4. Cross-Cutting Contracts

### 4.1 BullMQ Queue Payload Schema

The live pipeline is two queues on Redis with BullMQ prefix `bilingual`.

```ts
interface TranscriptionJobPayload {
  mediaId: string;
  type: "LOCAL" | "YOUTUBE";
  filePath?: string;
  url?: string;
  userId: string;
  targetLanguage?: string;
}

interface AiProcessingJobPayload {
  mediaId: string;
  audioS3Key: string;
  durationSeconds: number;
  userId: string;
  targetLanguage?: string;
}
```

`processingMode` is removed from the active contract. The bilingual flow is driven by `targetLanguage` only.

### 4.2 Artifact URL Contract

- `GET /media/:id/artifacts` is the durable processed-object inventory endpoint used by clients after upload and during playback readiness.
- Processed artifacts are written under `processed/{mediaId}/` with three durable surfaces: `chunks/`, `translated_batches/`, and `final.json`.
- Tier 1 chunk files are arrays of `Sentence` objects with `segment_index = null`.
- Tier 2 translated batch files are objects with `batch_index`, `first_segment_index`, and `segments`.
- `final.json` is the authoritative ordered output and carries consecutive 0-based `segment_index` values.
- Media list responses include artifact summaries so the mobile app can show readiness without reconstructing storage inventory client-side.

### 4.3 Socket Event Contract

- The AI engine publishes Redis Pub/Sub events on channel `media_updates`.
- The documented event types are `progress`, `chunk_ready`, `batch_ready`, `completed`, and `failed`.
- The backend mirrors these payloads through its socket layer for the mobile app.
- Progress is expected to stay monotonic across both emitted events and persisted DB writes.

### 4.4 Auth Token Flow

- Registration follows a verify-first flow: register, receive OTP, verify OTP, then finalize the account and issue tokens.
- Access token: short-lived JWT.
- Refresh token: UUID wrapped in a signed JWT, stored in the database, and rotated on refresh.

## 5. Agent Behavior Rules

### 5.1 Think Before Coding

> **5.1 Think Before Coding**
> Don't assume. Don't hide confusion. Surface tradeoffs.
> Before implementing: state assumptions explicitly. If uncertain, ask. If multiple
> interpretations exist, present them — don't pick silently. If a simpler approach
> exists, say so. Push back when warranted. If something is unclear, stop. Name what's
> confusing. Ask.

### 5.2 Simplicity First

> **5.2 Simplicity First**
> Minimum code that solves the problem. Nothing speculative.
> No features beyond what was asked. No abstractions for single-use code. No
> "flexibility" or "configurability" that wasn't requested. No error handling for
> impossible scenarios. If you write 200 lines and it could be 50, rewrite it.
> Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

### 5.3 Surgical Changes

> **5.3 Surgical Changes**
> Touch only what you must. Clean up only your own mess.
> When editing existing code: don't "improve" adjacent code, comments, or formatting.
> Don't refactor things that aren't broken. Match existing style, even if you'd do it
> differently. If you notice unrelated dead code, mention it — don't delete it.
> When your changes create orphans: remove imports/variables/functions that YOUR
> changes made unused. Don't remove pre-existing dead code unless asked.
> The test: every changed line should trace directly to the user's request.

### 5.4 Goal-Driven Execution

> **5.4 Goal-Driven Execution**
> Define success criteria. Loop until verified.
> Transform tasks into verifiable goals. For multi-step tasks, state a brief plan:
>
> 1. [Step] → verify: [check]
> 2. [Step] → verify: [check]
>    For every task, identify the validation command (lint, test, type-check) and run it
>    before declaring done.

## 6. Checkpoint Update Protocol (Mandatory)

After completing any task that involves any of the following, the relevant module `CHECKPOINT.md` must be updated before the task is considered complete:

- a new feature or endpoint
- a schema or payload change
- a pipeline stage change (ai-engine)
- a bug fix that reveals a systemic issue
- a dependency add or upgrade

Each checkpoint update must include:

- the date of change
- what changed and why
- the current status of the affected feature (`Working`, `Partial`, `Broken`, or `In-Progress`)
- any known follow-up items

Failure to update the checkpoint is an incomplete task.

## 7. What NOT to Do

- Do not use `process.env` directly in NestJS business logic; use `ConfigService`.
- Do not create a second Python virtual environment; reuse `apps/ai-engine/venv`.
- Do not re-introduce `processingMode`; the active contract is bilingual-by-default with `targetLanguage` only.
- Do not re-introduce `translator_engine.py`; the active translation path is `core/nmt_translator.py`.
- Do not sign MinIO URLs against an internal host and rewrite them afterward; sign with the public-endpoint client directly.
- Do not use `db push` for Prisma schema changes in production; use migrations.
- Do not hardcode colors, strings, or hex values in the mobile app.
- Do not add polling where socket events already exist.
- Do not touch multiple modules unless the task explicitly crosses module boundaries.

## 8. Infra Quick Reference

| Area              | Path                                | Notes                                                                                                                |
| ----------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| PostgreSQL        | `infra/postgres/docker-compose.yml` | Local relational store on port `5432`; the current checkpoint documents `POSTGRES_USER / PASSWORD / DB` env vars.    |
| Redis             | `infra/redis/docker-compose.yml`    | Local BullMQ and cache store on port `6379`; queues are `transcription` and `ai-processing` with prefix `bilingual`. |
| MinIO             | `infra/minio/docker-compose.yml`    | Object storage on ports `9000` and `9001`; buckets are `raw` and `processed`.                                        |
| AI Engine Compose | `apps/ai-engine/docker-compose.yml` | GPU worker profiles: `auto`, `turbo_only`, `full_only`.                                                              |

Key environment variables documented in the current docs:

- AI engine runtime: `AI_PERF_MODE`, `WORKER_MODEL_MODE`, `AI_ENABLE_LLM_REFINEMENT`, `NMT_MODEL_DIR`, `NMT_TOKENIZER_NAME`, `NMT_COMPUTE_TYPE`, `NMT_BEAM_SIZE`
- AI engine connectivity: `REDIS_HOST`, `MINIO_ENDPOINT`, `MINIO_PUBLIC_ENDPOINT`
- Mobile client: `EXPO_PUBLIC_API_URL`

There is no single root compose file in this clone. Start local services from the per-service compose directories under `infra/`.
