# Backend API - Checkpoint

> Last updated: 2026-05-20  
> Maintained by: agents - update this file after every significant change.

## 1. Current Status

Backend API is in a working production-flow state for the current project scope.

The module owns authentication, subscription/quota enforcement, media APIs, presigned upload negotiation, MinIO integration, BullMQ job production, and the NestJS validation worker. It does not perform transcription or translation; validated jobs are handed off to the AI Engine through the `ai-processing` queue.

Current completed surfaces:

- Authentication and verify-first registration flow.
- Admin subscription plan and variant management.
- Media upload, YouTube submission, status, artifact inventory, and media library APIs.
- Standalone validation worker consuming `transcription` jobs and producing `ai-processing` jobs.
- Supporting MinIO, Redis, mail, OTP, user subscription, and queue services.

## 2. Active Work

No single active backend task is recorded in the imported checkpoint.

Use `Next Candidates` below as the current backend backlog until a new task file or issue exists.

## 3. Recently Completed

- 2026-04-02 — Authentication flow marked complete. Status: Working.
  - Verify-first registration.
  - OTP verification before user creation.
  - Login, refresh, logout.
  - Access token plus rotated refresh token flow.

- 2026-04-02 — Admin subscription management marked complete. Status: Working.
  - Subscription plan and plan variant CRUD.
  - Admin-only route protection.
  - Smart deactivation and variant versioning behavior.

- 2026-04-02 — Media library and upload pipeline marked complete. Status: Working.
  - Presigned upload URL endpoint.
  - Upload confirmation endpoint.
  - YouTube submission endpoint.
  - Media status endpoint.
  - Artifact inventory endpoint.
  - User media library endpoint.
  - `targetLanguage` is carried through the active bilingual flow.

- 2026-04-02 — Validation worker marked complete. Status: Working.
  - Standalone NestJS worker app.
  - Local upload validation.
  - YouTube metadata/audio ingestion.
  - Duration and quota checks.
  - Permanent validation failures move media to `FAILED`.
  - Successful validation dispatches `ai-processing` jobs.

- 2026-04-02 — Supporting modules marked complete. Status: Working.
  - MinIO service.
  - Redis service.
  - Mail service.
  - OTP service.
  - User subscription service.
  - Queue service.
  - CORS/preflight compatibility updates.

## 4. Known Issues

- Artifact summary performance may need optimization later.
  - Impact: `GET /media` currently derives artifact summaries per item from MinIO; large libraries may increase latency.
  - Current workaround: acceptable for current project/demo scale.
  - Related areas: `media` module, MinIO service, media library DTOs.

- Full end-to-end integration coverage is still a project-level gap.
  - Impact: backend, worker, AI Engine, Redis, MinIO, and mobile behavior are not fully proven by one automated E2E path.
  - Current workaround: use module checks and manual pipeline verification.

## 5. Next Candidates

- [ ] Optimize or cache artifact summaries for `GET /media` if library latency becomes noticeable.
- [ ] Add dictionary lookup and saved vocabulary backend endpoints.
- [ ] Add or strengthen E2E tests for upload confirmation, worker validation, artifact inventory, and queue handoff.
- [ ] Add monitoring/logging conventions for API and worker processes.
- [ ] Review quota usage audit behavior under failed, retried, and completed jobs.
- [ ] Confirm all soft-delete read paths explicitly filter `deletedAt: null`.

## 6. Contract Touchpoints

### API

Stable documented endpoints:

- `POST /media/presigned-url`
- `POST /media/confirm-upload`
- `POST /media/youtube`
- `GET /media/:id/status`
- `GET /media/:id/artifacts`
- `GET /media`

### Queue

Backend produces and consumes queue payloads across two queues:

- Consumes `transcription` jobs in the validation worker.
- Produces `ai-processing` jobs for the AI Engine.

Any queue payload change is cross-module and must be coordinated with `apps/ai-engine`.

### Storage

Backend manages raw upload negotiation and artifact inventory access through MinIO.

Important artifact roots:

- `processed/{mediaId}/chunks/`
- `processed/{mediaId}/translated_batches/`
- `processed/{mediaId}/final.json`

### Database

Backend owns Prisma schema and application data access patterns.

Important rules:

- Use migrations for schema changes.
- Do not use `db push` for production-style schema changes.
- Preserve soft deletes.
- Keep quota/subscription logic aligned with snapshot fields and usage history.

### Mobile Impact

Mobile consumes media status, artifact inventory, media library summaries, auth responses, and upload confirmation behavior. API response shape changes must be coordinated with `apps/mobile-app`.

## 7. Validation Notes

Fast backend validation:

```bash
cd apps/backend-api
pnpm build
pnpm lint
pnpm test
```

Integration validation when HTTP, queue, storage, auth, upload, or worker behavior changes:

```bash
cd apps/backend-api
pnpm test:e2e
```

Prisma validation after schema changes:

```bash
cd apps/backend-api
pnpm pgen
pnpm pmigrate:dev <name>
```

Last imported verification state:

- Old checkpoint recorded backend production-flow features as done.
- No fresh command output is available in this generated checkpoint.

## 8. Update Rules

Update this checkpoint when:

- A backend feature or endpoint changes status.
- A schema, DTO, queue payload, or API response shape changes.
- A worker behavior changes.
- A bug fix reveals a systemic issue.
- A dependency is added or upgraded.
- A validation result changes the known state.

Do not add long architecture explanations here. Move stable rules to `INSTRUCTION.md`, cross-module contracts to a future `CONTRACTS.md`, and historical context to `docs/archive/`.
