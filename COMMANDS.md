
# COMMANDS.md

> Last updated: 2026-05-20  
> Purpose: command reference and validation strategy for humans and coding agents.

## 1. Command Rules for Agents

Before running commands:

1. Read `AGENTS.md`.
2. Identify the affected module.
3. Prefer commands listed here and in the affected module's `INSTRUCTION.md`.
4. Verify package scripts in the actual `package.json` or module files when unsure.
5. Use the smallest command that validates the change, then expand only when needed.

Do not declare a task complete without documenting which validation command was run or why it could not be run.

## 2. Backend API Commands

Location:

```bash
cd apps/backend-api
```

### Development

```bash
pnpm start:dev
```

Start the NestJS HTTP API in development mode.

```bash
pnpm worker:dev
```

Start the standalone NestJS worker that consumes `transcription` jobs and dispatches `ai-processing` jobs.

```bash
pnpm start:local
```

Start local backend-related services if this script is available in the backend package.

### Validation

Fast compile check:

```bash
pnpm build
```

Lint check:

```bash
pnpm lint
```

Unit tests:

```bash
pnpm test
```

End-to-end tests, when local infra is available:

```bash
pnpm test:e2e
```

Recommended backend completion check:

```bash
pnpm build
pnpm lint
pnpm test
```

Run `pnpm test:e2e` as well when the change affects HTTP integration, queues, storage, auth flows, upload confirmation, artifact inventory, or worker behavior.

### Prisma

Generate Prisma Client:

```bash
pnpm pgen
```

Create and apply local migration:

```bash
pnpm pmigrate:dev <name>
```

Seed database:

```bash
npx tsx prisma/seed.ts
```

Clean test environment:

```bash
pnpm clean:env
```

Rules:

- Use migrations for schema changes.
- Do not use `db push` as the production-style schema workflow.
- Regenerate Prisma Client after schema changes.

## 3. AI Engine Commands

Location:

```bash
cd apps/ai-engine
```

### Activate Local Virtual Environment

Windows PowerShell:

```powershell
venv\Scripts\activate
```

Linux/macOS:

```bash
source venv/bin/activate
```

Do not create a second virtual environment for this module.

### Development

Start the AI Engine worker from the local venv:

```bash
python -m src.main
```

Run the standalone V2 pipeline test script:

```bash
python -m src.scripts.test_v2_pipeline
```

### Fast Sanity Checks

Windows PowerShell direct interpreter check:

```powershell
venv\Scripts\python.exe -c "from src.core.pipeline import PipelineOrchestrator; print('OK')"
```

Linux/macOS after venv activation:

```bash
python -c "from src.core.pipeline import PipelineOrchestrator; print('OK')"
```

### Pytest Checks

Full test suite:

```bash
python -m pytest tests/ -v
```

Streaming contract tests:

```bash
python -m pytest tests/test_streaming_contracts.py -q
```

Event/progress discipline tests:

```bash
python -m pytest tests/test_event_discipline.py -v
```

If the repository still contains the older two-tier streaming test file, this may also be useful:

```bash
python -m pytest tests/test_two_tier_streaming.py -v
```

### Docker / GPU Worker

Build image:

```bash
docker compose build
```

Single auto-profile worker:

```bash
docker compose --profile auto up
```

Scale identical auto-profile workers:

```bash
docker compose --profile auto up --scale ai-engine=N
```

Dual-worker split:

```bash
docker compose --profile turbo --profile full up
```

Use Docker/GPU checks when the task affects runtime packaging, CUDA dependencies, worker profiles, or production-like AI Engine deployment.

## 4. Mobile App Commands

Location:

```bash
cd apps/mobile-app
```

### Development

Start Expo development server:

```bash
pnpm start
```

Android development build, when native toolchain is available:

```bash
pnpm android
```

or, depending on package scripts:

```bash
pnpm dlx expo run:android
```

iOS development build, when macOS/Xcode is available:

```bash
pnpm ios
```

or, depending on package scripts:

```bash
pnpm dlx expo run:ios
```

### Validation

Lint:

```bash
pnpm lint
```

If available in `package.json`, also prefer:

```bash
pnpm typecheck
```

or:

```bash
pnpm tsc --noEmit
```

Native Android caveat:

- Keep the repository path short on Windows before running native builds.
- `react-native-unistyles` requires a development build and cannot be fully tested through Expo Go.

Recommended mobile completion check:

```bash
pnpm lint
```

For type-heavy changes, route changes, DTO changes, or API response handling changes, also run the available TypeScript/typecheck command if the project defines one.

## 5. Infra Commands

Each local infra service has its own compose directory.

### PostgreSQL

```bash
cd infra/postgres
docker-compose up -d
```

### Redis

```bash
cd infra/redis
docker-compose up -d
```

### MinIO

```bash
cd infra/minio
docker-compose up -d
```

There is no assumed single root compose file. Start local services from their service directories unless the repository later introduces a root orchestrator.

## 6. Common Local Development Startup

Typical full-stack local flow:

1. Start PostgreSQL.
2. Start Redis.
3. Start MinIO.
4. Start Backend API.
5. Start Backend Worker.
6. Start AI Engine.
7. Start Mobile App.

Example:

```bash
# terminal 1
cd infra/postgres && docker-compose up -d

# terminal 2
cd infra/redis && docker-compose up -d

# terminal 3
cd infra/minio && docker-compose up -d

# terminal 4
cd apps/backend-api && pnpm start:dev

# terminal 5
cd apps/backend-api && pnpm worker:dev

# terminal 6
cd apps/ai-engine
# activate venv first
python -m src.main

# terminal 7
cd apps/mobile-app && pnpm start
```

## 7. Validation by Task Type

Small backend service/controller change:

```bash
cd apps/backend-api
pnpm build
pnpm lint
pnpm test
```

Backend queue, media, upload, storage, or auth change:

```bash
cd apps/backend-api
pnpm build
pnpm lint
pnpm test
pnpm test:e2e
```

AI Engine schema, artifact, event, or progress change:

```bash
cd apps/ai-engine
python -m pytest tests/test_streaming_contracts.py -q
python -m pytest tests/test_event_discipline.py -v
```

AI Engine pipeline/runtime change:

```bash
cd apps/ai-engine
python -m pytest tests/ -v
```

Mobile UI-only change:

```bash
cd apps/mobile-app
pnpm lint
```

Mobile API/auth/upload/player contract change:

```bash
cd apps/mobile-app
pnpm lint
# plus typecheck command if available in package.json
```

Cross-module contract change:

```text
Run the smallest meaningful checks in every affected module.

Examples:
- queue payload change: backend build/test + AI Engine relevant tests
- artifact schema change: AI Engine streaming tests + backend artifact tests/e2e + mobile lint/typecheck
- socket/progress change: AI Engine event tests + backend socket/e2e + mobile cache/player validation
```

## 8. Commands That Should Not Be Used Casually

Avoid these unless explicitly requested and understood:

```bash
docker system prune -a
```

```bash
prisma db push
```

```bash
rm -rf apps/ai-engine/venv
```

```bash
rm -rf node_modules
```

Rules:

- Do not destroy containers, images, volumes, caches, or virtual environments without explicit user approval.
- Do not reset databases or MinIO buckets unless the task is specifically test-environment cleanup.
- Do not introduce global installs when a local `pnpm`, `npx`, `venv`, or project command exists.

## 9. Completion Report Format

When finishing a task, agents should report:

```text
Changed:
- ...

Validated:
- command: result
- command: result

Not run:
- command: reason

Checkpoint:
- updated: apps/<module>/CHECKPOINT.md
- not updated: reason
```
