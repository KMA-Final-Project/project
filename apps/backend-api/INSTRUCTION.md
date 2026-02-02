# Backend API - Development Rules & Guidelines

## 1. Architecture Overview

-   **Framework:** NestJS v11+ (TypeScript).
-   **Pattern:** Modular Monolith (Feature-based modules).
-   **Structure:**
    ```
    src/
    ├── common/          # Shared decorators, filters, guards, interceptors
    ├── config/          # Configuration namespaces and validation
    ├── modules/         # Feature modules (e.g., auth, media, subscriptions)
    │   ├── [feature]/
    │   │   ├── dto/             # Data Transfer Objects (Request/Response)
    │   │   ├── entities/        # Domain entities (optional, if different from Prisma)
    │   │   ├── [feature].controller.ts
    │   │   ├── [feature].service.ts
    │   │   └── [feature].module.ts
    ├── prisma/          # Prisma Module & Service
    ├── queue/           # Queue Producer Module (BullMQ)
    ├── app.module.ts
    └── main.ts
    ```

## 2. Coding Standards

### 2.1. Configuration
-   **Strict Typing:** Use `@nestjs/config` with `class-validator` to validate environment variables.
-   **Access:** Inject `ConfigService` or dedicated config namespaces; never use `process.env` directly in business logic.

### 2.2. Validation (DTOs)
-   **Strict Input:** All controller inputs (Body, Query, Param) MUST use DTO classes.
-   **Decorators:** Use `class-validator` decorators (`@IsString()`, `@IsOptional()`, etc.).
-   **Transformation:** Enable `transform: true` in `ValidationPipe` to automatically convert payloads to DTO instances.
-   **Swagger:** Decorate DTO properties with `@ApiProperty()` for auto-generated documentation.

### 2.3. Error Handling
-   **Global Filters:** Use a Global Exception Filter to map System/Prisma errors to standard HTTP responses.
-   **Custom Exceptions:** Use `HttpException` subclasses (e.g., `BadRequestException`, `NotFoundException`) with clear messages.

## 3. Database (Prisma)

### 3.1. Best Practices
-   **Service:** Use `PrismaService` (singleton) to access the database.
-   **Soft Deletes:**
    -   MODELS: Add `deletedAt DateTime?` to all main models.
    -   QUERIES: Always filter `{ deletedAt: null }` unless explicitly "admin" audit view.
    -   IMPLEMENTATION: Use a middleware or helper method in Service to handle soft deletes.
-   **Migrations:** Always use `prisma migrate dev` for schema changes. NEVER use `db push` in production.

### 3.2. Performance
-   **Select:** Select only fields needed (`select: { ... }`) to reduce payload.
-   **Indexing:** Ensure Indexes on frequently queried fields (e.g., `userId`, `jobId`).

## 4. Asynchronous Jobs (BullMQ)

-   **Queue System:** BullMQ (Redis-based).
-   **Producer:** Backend API acts as the Producer.
    -   Use `@nestjs/bullmq` (or `@nestjs/bull` if specifically using older Bull).
    -   Job Data MUST be typed (Define interfaces for Job Payloads).
    -   Compatibility: Ensure Job ID/Data format is compatible with the Python AI Engine worker (which should likely use the Python `bullmq` library).

## 5. File Storage
-   **Provider:** S3-compatible (MinIO for dev, AWS S3/Cloudflare R2 for prod).
-   **Library:** `@aws-sdk/client-s3` wrapped in a Service Module.
-   **Security:** Generate Presigned URLs for client uploads/downloads when possible to offload bandwidth.

## 6. Authentication & Authorization
-   **Auth:** JWT-based stateless authentication.
-   **Guards:** Use `@UseGuards(JwtAuthGuard)` on protected routes.
-   **Decorators:** Use custom `@User()` decorator to extract user info from Request.
