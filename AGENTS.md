# AGENTS.md

## 0. Read This First

This file is the mandatory entry point for every coding agent working in this repository, including Claude Code, Cursor, Copilot, Codex, Windsurf, and similar tools.

Read this file before inspecting code, editing files, or running commands. Then route yourself to the smallest relevant project docs for the current task.

## 1. Documentation Map

```text
.
|- AGENTS.md                  # Mandatory agent onboarding, behavior rules, and routing protocol.
|- INSTRUCTION.md             # Product vision, architecture overview, and main use cases.
|- PROJECT_MAP.md             # Repository structure, module ownership, and important file locations.
|- CONTRACTS.md               # Source of truth for cross-module queue/API/artifact/socket/auth contracts.
|- COMMANDS.md                # Known commands, validation checks, infra startup, and cleanup commands.
|- DECISIONS.md               # Architecture decision records, if present.
|- apps/
|  |- backend-api/
|  |  |- INSTRUCTION.md        # Backend-specific rules.
|  |  `- CHECKPOINT.md         # Backend current progress and known issues.
|  |- ai-engine/
|  |  |- INSTRUCTION.md        # AI Engine-specific rules.
|  |  `- CHECKPOINT.md         # AI Engine current progress and known issues.
|  |- mobile-app/
|  |  |- INSTRUCTION.md        # Mobile-specific rules.
|  |  `- CHECKPOINT.md         # Mobile current progress and known issues.
|  `- dashboard/
|     |- INSTRUCTION.md        # Dashboard-specific rules.
|     `- CHECKPOINT.md         # Dashboard current progress and known issues.
|- .agent/
|  `- workflows/
|     |- contract-change.md
|     `- checkpoint-maintenance.md
```

## 2. Session Startup Protocol

1. Read this file fully.
2. Identify the task type:
   - feature development
   - bug fix/debugging
   - contract change
   - checkpoint/documentation maintenance
   - performance/evaluation/demo work
3. Read `PROJECT_MAP.md` to locate the affected module(s) and entry points.
4. Read root `INSTRUCTION.md` for product and architecture context when the task affects user flows or architecture.
5. Read only the affected module's `INSTRUCTION.md` and `CHECKPOINT.md`.
6. If the task touches queue payloads, media API DTOs, artifact paths/schema, socket events, progress semantics, auth flow, quota behavior, or language/translation behavior, read `CONTRACTS.md` and follow `.agent/workflows/contract-change.md`.
7. If the task requires command execution or validation, read `COMMANDS.md` before inventing commands.
8. State assumptions explicitly before writing code.
9. Inspect actual source files before changing behavior. Do not rely on docs alone.

## 3. Active Modules

| Module      | Path               | Stack                                                                                         | Main entry points                      |
| ----------- | ------------------ | --------------------------------------------------------------------------------------------- | -------------------------------------- |
| Backend API | `apps/backend-api` | NestJS v11, TypeScript, Prisma, BullMQ, Redis, MinIO, JWT                                     | `src/main.ts`, `src/worker.ts`         |
| AI Engine   | `apps/ai-engine`   | Python 3.12, faster-whisper, stable-ts, silero-vad, CTranslate2, NLLB-200-3.3B, BullMQ, MinIO | `src/main.py`, `src/async_pipeline.py` |
| Mobile App  | `apps/mobile-app`  | Expo 54, React Native, Expo Router, Zustand, Axios, Zod, i18next, react-native-unistyles      | `src/entry.ts`, `src/app/_layout.tsx`  |
| Dashboard   | `apps/dashboard`   | Vite 7, React 19, React Router 7, TanStack Query 5, shadcn/ui, Tailwind CSS v4               | `src/main.tsx`, `src/App.tsx`          |

Do not assume inactive or future modules exist unless the repository contains them.

## 4. Contract Routing Rules

`CONTRACTS.md` is the source of truth for cross-module contracts.

Read it before changing:

- BullMQ queue payloads, names, prefixes, or producer/consumer behavior
- Media API request/response DTOs
- MinIO bucket/path/signing behavior
- `chunks/`, `translated_batches/`, or `final.json` structure
- Socket events or Redis Pub/Sub behavior
- Media status, `currentStep`, progress, ETA, or failure reason behavior
- Auth token flow or mobile token persistence assumptions
- Quota/subscription enforcement visible to users or jobs
- `targetLanguage`, bilingual behavior, or any translation mode logic

Any such task must follow `.agent/workflows/contract-change.md`.

## 5. Agent Behavior Rules

### 5.1 Think Before Coding

Do not assume. Do not hide confusion. Surface tradeoffs.

Before implementing:

- state assumptions explicitly
- name uncertainty
- ask when a blocker is real
- present alternatives when multiple interpretations exist
- push back when a requested change would damage architecture, security, or maintainability

### 5.2 Simplicity First

Minimum code that solves the problem. Nothing speculative.

- No features beyond what was asked.
- No abstractions for single-use code.
- No flexibility/configurability that was not requested.
- No error handling for impossible scenarios.
- If a 200-line solution can be 50 lines, simplify it.

### 5.3 Surgical Changes

Touch only what the task requires.

- Do not refactor adjacent code unless asked.
- Do not reformat unrelated files.
- Match existing style even if you would personally write it differently.
- If you notice unrelated dead code, mention it instead of deleting it.
- Remove imports, variables, and functions only when your own changes made them unused.
- Every changed line should trace back to the user's request.

### 5.4 Goal-Driven Execution

Define success criteria and verify them.

For multi-step tasks, state a brief plan:

```text
1. [Step] -> verify: [check]
2. [Step] -> verify: [check]
```

Before declaring done, identify and run the smallest validation command that proves the change. If a check cannot be run, state why and provide the exact command that should be run manually.

## 6. Checkpoint Update Protocol

After completing a task, update the relevant module `CHECKPOINT.md` when the task involves:

- a new feature or endpoint
- a schema, DTO, payload, artifact, or event change
- a pipeline stage change
- a bug fix that reveals or resolves a systemic issue
- a dependency add or upgrade
- a meaningful validation result
- a newly discovered known issue or resolved known issue

Use `.agent/workflows/checkpoint-maintenance.md` for update format and rules.

A checkpoint update must include:

- date of change
- what changed and why
- current status: `Working`, `Partial`, `Broken`, `In-Progress`, `Blocked`, or `Deprecated`
- known follow-up items, if any
- validation result or validation command, when relevant

Failure to update the correct checkpoint after qualifying work means the task is incomplete.

## 7. What NOT to Do

- Do not use `process.env` directly in NestJS business logic; use `ConfigService`.
- Do not create a second Python virtual environment; reuse `apps/ai-engine/venv`.
- Do not re-introduce `processingMode`; the active contract is bilingual-by-default with `targetLanguage` only.
- Do not re-introduce `translator_engine.py`; the active translation path is `core/nmt_translator.py`.
- Do not sign MinIO URLs against an internal host and rewrite them afterward; sign with the public-endpoint client directly.
- Do not use `db push` for Prisma schema changes in production; use migrations.
- Do not hardcode colors, strings, or hex values in the mobile app.
- Do not add polling where socket events already exist.
- Do not touch multiple modules unless the task explicitly crosses module boundaries or the contract workflow requires it.
- Do not duplicate full cross-module contracts in checkpoints or module instructions; keep authoritative contract details in `CONTRACTS.md`.
- Do not add Zustand, Redux, or any global state store to the dashboard; server state lives in TanStack Query and auth state in AuthContext only.
- Do not add dashboard-specific admin endpoints to the backend without verifying ADMIN role guard is applied.

## 8. Definition of Done

A task is done only when:

- the affected source files were inspected
- the implementation is complete and minimal
- relevant types, DTOs, schemas, or tests are updated
- cross-module contracts remain aligned
- the smallest useful validation was run or clearly documented as not run
- the relevant module checkpoint was updated when required
- no unrelated files were modified

## 9. Preferred Workflow Files

Use these workflow files when applicable:

- `.agent/workflows/contract-change.md` — queue/API/artifact/socket/auth/progress/language contract changes
- `.agent/workflows/checkpoint-maintenance.md` — updating module checkpoints cleanly

Future workflow files may be added for feature development, debugging, E2E verification, AI quality evaluation, performance tuning, and graduation demo preparation.
