# Backend API - Agent Instruction

## 1. Module Role

`apps/backend-api` owns the HTTP boundary for the product: authentication, subscription and quota enforcement, media-library APIs, presigned upload negotiation, and the NestJS worker that validates uploads or YouTube ingests before GPU processing. It does not perform transcription or translation itself; once validation is complete it hands work off to the AI engine through BullMQ.

## 2. Tech Stack & Package Manager

- Framework: NestJS v11
- Language: TypeScript
- Data: Prisma + PostgreSQL
- Queueing: BullMQ + Redis
- Storage: MinIO / S3-compatible object storage
- Auth: JWT access + refresh-token rotation
- Package manager: `pnpm`

Key scripts:

| Script                     | Purpose                                                                 |
| -------------------------- | ----------------------------------------------------------------------- |
| `pnpm build`               | Compile the NestJS application for production.                          |
| `pnpm lint`                | Run the backend lint rules before closing a change.                     |
| `pnpm test`                | Run the backend test suite.                                             |
| `pnpm test:e2e`            | Run end-to-end tests when infra and integration surfaces are available. |
| `pnpm worker:dev`          | Start the standalone NestJS worker in watch mode.                       |
| `pnpm pgen`                | Regenerate Prisma Client after schema changes.                          |
| `pnpm pmigrate:dev <name>` | Create and apply a local Prisma migration.                              |

## 3. Directory Structure

```text
src/
|- main.ts                     # HTTP API entry point
|- worker.ts                   # Standalone NestJS worker entry point
|- app.module.ts               # Main API module
|- worker.module.ts            # Lean worker module for validation and queue handoff
|- common/
|  |- decorators/              # Route and auth decorators
|  |- guards/                  # JwtAuthGuard, RolesGuard
|  `- constants/               # Shared backend constants and messages
|- prisma/                     # PrismaModule + PrismaService
`- modules/
   |- auth/                    # Register, verify OTP, login, refresh, logout
   |- admin/                   # SubscriptionPlan and PlanVariant administration
   |- media/                   # Upload, YouTube submit, status, artifacts, library
   |  `- workers/              # MediaProcessor validation worker
   |- queue/                   # BullMQ producer service and queue payload types
   |- minio/                   # Presigned URL, object verification, uploads/downloads
   |- redis/                   # Redis access helpers
   |- mail/                    # OTP mail delivery
   |- otp/                     # OTP generation and verification
   `- user/                    # User profile and subscription helpers
```

## 4. Coding Standards

### DTOs and Validation

- All controller inputs must use DTO classes.
- Use `class-validator` decorators for every externally supplied field.
- Decorate DTO properties with `@ApiProperty()` so the contract stays visible and typed.
- Keep `ValidationPipe` transformation semantics intact when adding or changing request shapes.

### Configuration

- Use `ConfigService` or dedicated config namespaces inside business logic.
- Do not read `process.env` directly in services, controllers, or workers.

### Prisma and Data Access

- Use the singleton `PrismaService` rather than creating ad hoc database clients.
- Apply the soft-delete rule everywhere: filter `deletedAt: null` unless the use case is an explicit audit/admin view.
- Keep quota and subscription logic aligned with snapshot fields and usage-history records.

### Errors and Guards

- Preserve the global exception-filter pattern that maps system and Prisma failures into HTTP responses.
- Use `HttpException` subclasses for intentional application errors.
- Protect authenticated routes with `@UseGuards(JwtAuthGuard)` and use the module's custom user-decorator pattern instead of pulling values directly from `Request`.

### BullMQ Producer Pattern

- Keep queue names and payload interfaces centralized and typed.
- The backend worker consumes `transcription` jobs and produces `ai-processing` jobs.
- Any queue payload change is a cross-module contract change and must be coordinated with the AI engine and documented in checkpoints.

## 5. API Contract Highlights

The current docs define the stable purpose of these endpoints; confirm DTO-level field details before widening the contract.

| Endpoint                     | Documented contract                                                                                       |
| ---------------------------- | --------------------------------------------------------------------------------------------------------- |
| `POST /media/presigned-url`  | Generates a presigned PUT URL after an optimistic quota check so the client can upload directly to MinIO. |
| `POST /media/confirm-upload` | Verifies the uploaded object in MinIO, creates the `MediaItem`, and dispatches the BullMQ validation job. |
| `POST /media/youtube`        | Creates the `MediaItem` for a YouTube submission and sends it through the validation worker flow.         |
| `GET /media/:id/status`      | Returns processing progress, `currentStep`, estimated time remaining, and failure reason state.           |
| `GET /media/:id/artifacts`   | Returns the durable processed-object inventory for `chunks/`, `translated_batches/`, and `final.json`.    |
| `GET /media`                 | Returns the user's media library and artifact summaries used by the mobile readiness UI.                  |

Additional contract notes:

- Artifact inventory is part of the media contract and is consumed by the mobile app.
- YouTube submissions may carry a client title; when absent, the worker prefers `yt-dlp` metadata before falling back to a generic placeholder.

## 6. Queue Contract

Documented payloads:

```ts
interface TranscriptionJobPayload {
  mediaId: string;
  type: 'LOCAL' | 'YOUTUBE';
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

Rules:

- `targetLanguage` is the live bilingual-translation field.
- `processingMode` is removed from both API and queue payloads.
- Compatibility with the Python BullMQ worker is part of the contract, not an implementation detail.

## 7. Database Rules

- Use Prisma migrations (`prisma migrate dev` via `pnpm pmigrate:dev <name>`) for schema changes.
- Never use `db push` as the schema-change workflow for this module.
- Keep soft deletes intact for primary records and make the `deletedAt: null` filter explicit in application queries.
- Select only the fields you need in read paths.
- Maintain indexes on high-frequency query fields such as `userId` and `jobId`.

## 8. Validation Checklist

Run these before declaring a backend change complete:

```bash
pnpm build
pnpm lint
pnpm test
```

When the change affects HTTP integration, queues, storage, or auth flows, also run `pnpm test:e2e` with local infra available.
