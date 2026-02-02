---
name: nestjs-backend-dev
description: Expert patterns, scaffolding commands, and best practices for developing the NestJS backend API.
---

# NestJS Backend Development Skill

Use this skill when modifying or extending the `apps/backend-api` project.

## 1. Scaffolding Rules

When creating new features, always follow the Modular Monolith structure.

### Generating a New Feature Module
Use the NestJS CLI to ensure proper wiring in `app.module.ts`.

```bash
# Example: Creating a 'plans' feature
cd apps/backend-api
npx nest g module modules/plans
npx nest g controller modules/plans --no-spec
npx nest g service modules/plans --no-spec
```
*Note: We disable default spec files (`--no-spec`) because we prefer writing integration tests or focused unit tests later.*

## 2. DTO & Validation Patterns

Every Controller Endpoint **MUST** have a dedicated DTO.

### Template: Request DTO
```typescript
import { IsString, IsOptional, IsInt, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateItemDto {
  @ApiProperty({ description: 'The name of the item', example: 'My Item' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ description: 'Optional description' })
  @IsOptional()
  @IsString()
  description?: string;
}
```

## 3. Prisma & Database Interactions

### Accessing the DB
Always inject `PrismaService`.

```typescript
constructor(private prisma: PrismaService) {}
```

### Soft Delete Pattern
When "deleting" core business data (users, media), use `update` to set `deletedAt`.

```typescript
async remove(id: number) {
  return this.prisma.media.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
}
```

## 4. Queue (BullMQ) Integration

When sending jobs to the AI Engine:

1.  Inject the Queue using `@InjectQueue`.
2.  Ensure the payload matches the Python worker's expected schema.

```typescript
// Constructor
constructor(@InjectQueue('transcription_queue') private transQueue: Queue) {}

// Method
async addToQueue(fileKey: string) {
  await this.transQueue.add('transcribe', {
    s3Key: fileKey,
    // ...other params
  });
}
```

## 5. Environment & Config

Access config via `ConfigService`, strict typed.

```typescript
// BAD
const db = process.env.DATABASE_URL;

// GOOD
const db = this.configService.getOrThrow<string>('DATABASE_URL');
```
