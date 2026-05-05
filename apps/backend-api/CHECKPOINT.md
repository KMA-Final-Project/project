# Backend API - Checkpoint

> Last updated: 2026-05-06
> Maintained by: agents - update this file after every significant change.

## Current Status

| Area                                     | Status  | Notes                                                                                                                        |
| ---------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Authentication (`/auth`)                 | Working | Verify-first registration, OTP verification, login, refresh, and logout are documented as done.                              |
| Admin subscription management (`/admin`) | Working | CRUD for plans and variants is documented as done with role protection and smart delete behavior.                            |
| Media library (`/media`)                 | Working | Presigned uploads, confirm-upload, YouTube submit, status, artifacts, and library listing are documented as production flow. |
| Validation worker (`MediaProcessor`)     | Working | Standalone NestJS worker validates local and YouTube media, re-checks quota, and dispatches `ai-processing` jobs.            |
| Supporting services                      | Working | MinIO, Redis, Mail, OTP, subscription, and queue services are documented as done.                                            |

## Active Pipeline / Architecture Notes

- The backend is the API gateway and the first queue producer in a two-queue pipeline.
- `main.ts` runs the HTTP API; `worker.ts` runs the standalone NestJS worker.
- The worker consumes `transcription` jobs, validates media, and produces `ai-processing` jobs.
- Media endpoints include a durable artifact inventory endpoint at `GET /media/:id/artifacts` and list responses include artifact summaries.
- Authentication uses JWT access tokens plus refresh-token rotation stored in the database.
- Cross-module queue payload contracts are defined in the repository root `AGENTS.md` and must stay aligned with the AI engine.

## Known Issues & Workarounds

- No backend-only broken flow is called out in the current root checkpoint.
- The documented backend watch item is library latency: `GET /media` derives artifact summaries per item from MinIO, so revisit this path if media-library latency becomes noticeable.

## Environment & Commands

```bash
pnpm start:dev
pnpm worker:dev
pnpm start:local
pnpm pgen
pnpm pmigrate:dev <name>
npx tsx prisma/seed.ts
pnpm clean:env
```

## Recent Changes

| Date       | Change                                                                                                          | Author              |
| ---------- | --------------------------------------------------------------------------------------------------------------- | ------------------- |
| 2026-04-10 | Root checkpoint records the full media pipeline, validation worker, and artifact-summary contract as completed. | existing checkpoint |
| 2026-05-06 | Split backend-specific status into `apps/backend-api/CHECKPOINT.md`.                                            | agent               |

## Follow-up Items

- Revisit `GET /media` artifact-summary derivation if library latency becomes noticeable.
- Add the vocabulary feature endpoints noted in the legacy root checkpoint.
