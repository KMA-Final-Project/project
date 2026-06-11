# Translation Finalization Monitoring Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add backend-admin and dashboard monitoring for translation finalization usage, cost, coverage, and fallback behavior without changing AI-engine or mobile runtime behavior.

**Architecture:** Extend the existing admin monitoring contract family in `@kapter/contracts`, add one bounded read-only aggregation path in the backend admin module that reads recent completed media plus `final.json.metadata.translation_finalization`, and expose one new dashboard monitoring page under the current admin shell. Keep the slice additive, fail-open, and scoped to backend/dashboard/contracts only.

**Tech Stack:** TypeScript, NestJS, Prisma, MinIO, Jest, React 19, React Router 7, TanStack Query 5, shadcn/ui, Tailwind CSS v4.

---

## File Structure

- Modify: `packages/contracts/src/admin-monitoring.ts`
  - Extend admin monitoring transport types with translation-finalization query/response shapes.
- Modify: `packages/contracts/src/index.ts`
  - Re-export the new monitoring types.
- Modify: `apps/backend-api/src/modules/admin/dto/monitoring.dto.ts`
  - Add query/response DTO classes for the new endpoints.
- Modify: `apps/backend-api/src/modules/admin/dto/index.ts`
  - Re-export the new DTOs through the admin DTO barrel.
- Modify: `apps/backend-api/src/modules/admin/services/monitoring-admin.service.ts`
  - Add summary and media-list aggregation methods for translation finalization telemetry.
- Modify: `apps/backend-api/src/modules/admin/services/monitoring-admin.service.spec.ts`
  - Add bounded aggregation tests for summary/media views and malformed/missing metadata handling.
- Modify: `apps/backend-api/src/modules/admin/admin.controller.ts`
  - Add the new `/admin/monitoring/translation-finalization/*` routes.
- Modify: `apps/dashboard/src/features/monitoring/types.ts`
  - Re-export the new transport types from `@kapter/contracts`.
- Modify: `apps/dashboard/src/features/monitoring/monitoring-api.ts`
  - Add typed API helpers for summary and media-list endpoints.
- Modify: `apps/dashboard/src/features/monitoring/monitoring-queries.ts`
  - Add TanStack Query factories for the new monitoring endpoints.
- Create: `apps/dashboard/src/features/monitoring/pages/monitoring-translation-finalization-page.tsx`
  - New admin page for usage, cost, breakdowns, and recent-media drill-down.
- Modify: `apps/dashboard/src/app/router.tsx`
  - Register the new monitoring route.
- Modify: `apps/dashboard/src/app/layouts/admin-layout.tsx`
  - Add the new navigation item.
- Modify: `CONTRACTS.md`
  - Document the new admin monitoring API.
- Modify: `apps/backend-api/CHECKPOINT.md`
  - Record the new admin monitoring surface and validation.
- Modify: `apps/dashboard/CHECKPOINT.md`
  - Record the new dashboard monitoring page and validation.

## Task 1: Extend Shared Monitoring Contracts

**Files:**
- Modify: `packages/contracts/src/admin-monitoring.ts`
- Modify: `packages/contracts/src/index.ts`
- Test: `apps/backend-api/src/modules/admin/dto/monitoring.dto.ts`

- [ ] **Step 1: Add transport types for translation finalization monitoring**

```ts
export type AdminTranslationFinalizationPeriod = "7d" | "30d";

export interface AdminTranslationFinalizationSummaryQuery {
  period?: AdminTranslationFinalizationPeriod;
  sourceLanguage?: string;
  targetLanguage?: string;
  provider?: string;
  profile?: string;
}

export interface AdminTranslationFinalizationMediaQuery
  extends AdminTranslationFinalizationSummaryQuery {
  page?: number;
  limit?: number;
  health?: "all" | "healthy" | "fallback" | "deadline_hit" | "failed_windows";
}

export interface AdminTranslationFinalizationSummaryResponse {
  period: AdminTranslationFinalizationPeriod;
  generatedAt: string;
  totals: {
    completedMedia: number;
    finalizedMedia: number;
    finalizationEnabledMedia: number;
    totalCostUsd: number;
    totalPromptTokens: number;
    totalCompletionTokens: number;
    totalTokens: number;
    totalCoverageSegments: number;
    totalFallbackSegments: number;
    deadlineHitMedia: number;
    failedWindowMedia: number;
  };
  averages: {
    costPerMediaUsd: number;
    costPerMediaMinuteUsd: number;
    tokensPerMedia: number;
    coverageRate: number;
    fallbackRate: number;
    averageWindowSuccessRate: number;
  };
  breakdowns: {
    byProvider: Array<{
      provider: string;
      mediaCount: number;
      totalCostUsd: number;
      totalTokens: number;
    }>;
    byProfile: Array<{
      profile: string;
      mediaCount: number;
      totalCostUsd: number;
      averageCoverageRate: number;
    }>;
    byRoute: Array<{
      sourceLanguage: string;
      targetLanguage: string;
      mediaCount: number;
      totalCostUsd: number;
      averageCoverageRate: number;
    }>;
    dailyUsage: Array<{
      date: string;
      mediaCount: number;
      totalCostUsd: number;
      totalTokens: number;
      deadlineHits: number;
    }>;
  };
}
```

- [ ] **Step 2: Add the recent-media list transport types**

```ts
export interface AdminTranslationFinalizationMediaListItem {
  mediaId: string;
  title: string;
  userEmail: string;
  sourceLanguage: string;
  targetLanguage: string;
  durationSeconds: number;
  completedAt: string;
  provider: string;
  model: string;
  profile: string;
  coverageSegments: number;
  fallbackSegments: number;
  attemptedWindows: number;
  completedWindows: number;
  failedWindows: number;
  timedOutWindows: number;
  invalidWindows: number;
  deadlineHit: boolean;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalTokens: number;
  totalCostUsd: number;
  llmRevisedSegments: number;
  nmtFallbackSegments: number;
}

export interface AdminTranslationFinalizationMediaListResponse {
  page: number;
  limit: number;
  total: number;
  data: AdminTranslationFinalizationMediaListItem[];
}
```

- [ ] **Step 3: Export the new types from the contracts barrel**

```ts
export * from "./admin-monitoring.js";
```

No new barrel file is needed; only confirm the existing export path still exposes the extended module.

- [ ] **Step 4: Run contracts build/type validation**

Run: `pnpm --filter @kapter/contracts build`
Expected: build succeeds and emits updated `dist/`.

## Task 2: Add Backend DTOs And Aggregation

**Files:**
- Modify: `apps/backend-api/src/modules/admin/dto/monitoring.dto.ts`
- Modify: `apps/backend-api/src/modules/admin/dto/index.ts`
- Modify: `apps/backend-api/src/modules/admin/services/monitoring-admin.service.ts`
- Modify: `apps/backend-api/src/modules/admin/admin.controller.ts`
- Test: `apps/backend-api/src/modules/admin/services/monitoring-admin.service.spec.ts`

- [ ] **Step 1: Add DTO classes for the new query shapes**

```ts
export class AdminTranslationFinalizationSummaryQueryDto
  implements AdminTranslationFinalizationSummaryQuery
{
  @ApiPropertyOptional({ enum: ["7d", "30d"], default: "7d" })
  @IsOptional()
  @IsIn(["7d", "30d"])
  period?: "7d" | "30d" = "7d";

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sourceLanguage?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  targetLanguage?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  provider?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  profile?: string;
}
```

- [ ] **Step 2: Add DTO classes for the media list query/response**

```ts
export class AdminTranslationFinalizationMediaQueryDto
  extends AdminTranslationFinalizationSummaryQueryDto
  implements AdminTranslationFinalizationMediaQuery
{
  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ example: 20, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 20;

  @ApiPropertyOptional({
    enum: ["all", "healthy", "fallback", "deadline_hit", "failed_windows"],
    default: "all",
  })
  @IsOptional()
  @IsIn(["all", "healthy", "fallback", "deadline_hit", "failed_windows"])
  health?: "all" | "healthy" | "fallback" | "deadline_hit" | "failed_windows" =
    "all";
}
```

- [ ] **Step 3: Write the failing backend aggregation tests first**

```ts
it("aggregates translation finalization summary totals from completed media", async () => {
  prisma.mediaItem.findMany.mockResolvedValue([
    makeCompletedMediaRow("m1", "zh", "vi", "user@example.com"),
  ]);
  minio.readProcessedJson.mockResolvedValue(
    makeFinalArtifact({
      provider: "openai",
      profile: "dense_dialogue_cjk",
      totalCostUsd: 0.004,
      totalTokens: 6000,
      coverageSegments: 62,
      fallbackSegments: 0,
    }),
  );

  const result = await service.getTranslationFinalizationSummary({ period: "7d" });

  expect(result.totals.finalizedMedia).toBe(1);
  expect(result.totals.totalCostUsd).toBeCloseTo(0.004);
  expect(result.breakdowns.byProvider[0]?.provider).toBe("openai");
});
```

- [ ] **Step 4: Implement minimal backend aggregation helpers**

```ts
private async readTranslationFinalizationRecord(
  media: CompletedMediaCandidate,
): Promise<TranslationFinalizationRecord | null> {
  const finalKey = `${media.id}/final.json`;
  const finalArtifact = await this.minioService.readProcessedJson<SubtitleOutput>(
    finalKey,
  );

  const metadata = finalArtifact.metadata?.translation_finalization;
  if (!metadata?.enabled) {
    return null;
  }

  const totalSegmentCount = finalArtifact.segments.length;
  const llmRevisedSegments = metadata.segment_provenance.filter(
    (entry) => entry.source === "llm_revision",
  ).length;

  return {
    mediaId: media.id,
    title: media.title,
    userEmail: media.user.email,
    sourceLanguage: finalArtifact.metadata.source_lang || media.sourceLanguage || "",
    targetLanguage: finalArtifact.metadata.target_lang || media.targetLanguage || "",
    durationSeconds: finalArtifact.metadata.duration || media.durationSeconds || 0,
    completedAt: media.updatedAt.toISOString(),
    provider: metadata.provider,
    model: metadata.model,
    profile: metadata.applied_profile,
    totalSegmentCount,
    llmRevisedSegments,
    nmtFallbackSegments: metadata.segment_provenance.filter(
      (entry) => entry.source === "nmt",
    ).length,
    metrics: metadata,
  };
}
```

- [ ] **Step 5: Add the controller routes**

```ts
@Get("monitoring/translation-finalization/summary")
@ApiOperation({ summary: "Translation finalization usage and cost summary" })
@ApiResponse({ status: 200, type: AdminTranslationFinalizationSummaryResponseDto })
async getTranslationFinalizationSummary(
  @Query() query: AdminTranslationFinalizationSummaryQueryDto,
): Promise<AdminTranslationFinalizationSummaryResponseDto> {
  return this.monitoringAdminService.getTranslationFinalizationSummary(query);
}

@Get("monitoring/translation-finalization/media")
@ApiOperation({ summary: "Paginated recent media with translation finalization telemetry" })
@ApiResponse({ status: 200, type: AdminTranslationFinalizationMediaListResponseDto })
async getTranslationFinalizationMedia(
  @Query() query: AdminTranslationFinalizationMediaQueryDto,
): Promise<AdminTranslationFinalizationMediaListResponseDto> {
  return this.monitoringAdminService.getTranslationFinalizationMedia(query);
}
```

- [ ] **Step 6: Run backend tests and build**

Run: `pnpm --filter backend-api test -- monitoring-admin.service.spec.ts`
Expected: new and existing monitoring tests pass.

Run: `pnpm --filter backend-api build`
Expected: backend compiles successfully.

## Task 3: Add Dashboard Monitoring Surface

**Files:**
- Modify: `apps/dashboard/src/features/monitoring/types.ts`
- Modify: `apps/dashboard/src/features/monitoring/monitoring-api.ts`
- Modify: `apps/dashboard/src/features/monitoring/monitoring-queries.ts`
- Create: `apps/dashboard/src/features/monitoring/pages/monitoring-translation-finalization-page.tsx`
- Modify: `apps/dashboard/src/app/router.tsx`
- Modify: `apps/dashboard/src/app/layouts/admin-layout.tsx`

- [ ] **Step 1: Re-export the new monitoring types for the dashboard**

```ts
export type {
  AdminTranslationFinalizationSummaryQuery,
  AdminTranslationFinalizationSummaryResponse,
  AdminTranslationFinalizationMediaQuery,
  AdminTranslationFinalizationMediaListResponse,
  AdminTranslationFinalizationMediaListItem,
} from "@kapter/contracts";
```

- [ ] **Step 2: Add typed API helpers**

```ts
export const getTranslationFinalizationSummary = async (
  params: AdminTranslationFinalizationSummaryQuery,
): Promise<AdminTranslationFinalizationSummaryResponse> => {
  const searchParams = new URLSearchParams();
  if (params.period) searchParams.set("period", params.period);
  if (params.sourceLanguage) searchParams.set("sourceLanguage", params.sourceLanguage);
  if (params.targetLanguage) searchParams.set("targetLanguage", params.targetLanguage);
  if (params.provider) searchParams.set("provider", params.provider);
  if (params.profile) searchParams.set("profile", params.profile);

  return apiClient.get<AdminTranslationFinalizationSummaryResponse>(
    `/admin/monitoring/translation-finalization/summary?${searchParams.toString()}`,
  );
};
```

- [ ] **Step 3: Add query factories**

```ts
export const monitoringTranslationFinalizationSummaryQuery = (
  params: AdminTranslationFinalizationSummaryQuery,
) =>
  queryOptions({
    queryKey: [...monitoringKeys.all, "translation-finalization", "summary", params] as const,
    queryFn: () => getTranslationFinalizationSummary(params),
    staleTime: 30_000,
    refetchInterval: 30_000,
  });
```

- [ ] **Step 4: Build the page with the existing dashboard visual language**

```tsx
export const MonitoringTranslationFinalizationPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const period = searchParams.get("period") === "30d" ? "30d" : "7d";
  const provider = searchParams.get("provider") ?? "";
  const profile = searchParams.get("profile") ?? "";

  const summaryQuery = useQuery(
    monitoringTranslationFinalizationSummaryQuery({
      period,
      provider: provider || undefined,
      profile: profile || undefined,
    }),
  );

  const mediaQuery = useQuery(
    monitoringTranslationFinalizationMediaQuery({
      period,
      provider: provider || undefined,
      profile: profile || undefined,
      page,
      limit: 20,
      health,
    }),
  );

  return (
    <div className="space-y-8">
      {/* summary controls */}
      {/* metric cards */}
      {/* breakdown cards */}
      {/* recent media table */}
    </div>
  );
};
```

- [ ] **Step 5: Register the route and nav item**

```tsx
{
  path: "/monitoring/translation-finalization",
  element: <MonitoringTranslationFinalizationPage />,
}
```

```ts
{
  label: "Finalization",
  to: "/monitoring/translation-finalization",
  icon: RiRadarLine,
}
```

- [ ] **Step 6: Run dashboard validation**

Run: `pnpm --filter dashboard typecheck`
Expected: typecheck passes.

Run: `pnpm --filter dashboard build`
Expected: dashboard builds successfully.

## Task 4: Update Contracts, Checkpoints, And Final Validation

**Files:**
- Modify: `CONTRACTS.md`
- Modify: `apps/backend-api/CHECKPOINT.md`
- Modify: `apps/dashboard/CHECKPOINT.md`

- [ ] **Step 1: Add the new admin monitoring API to `CONTRACTS.md`**

```md
#### GET /admin/monitoring/translation-finalization/summary

Returns bounded usage/cost/coverage telemetry aggregated from completed media and
`final.json.metadata.translation_finalization`.

#### GET /admin/monitoring/translation-finalization/media

Returns a paginated recent-media dataset for operator drill-down into provider,
profile, tokens, cost, fallback segments, and deadline/failure behavior.
```

- [ ] **Step 2: Update backend and dashboard checkpoints**

Add concise checkpoint entries describing:
- what changed
- why it changed
- validation run
- follow-up: DB snapshot persistence only if live aggregation becomes slow

- [ ] **Step 3: Run final cross-module validation**

Run: `pnpm --filter @kapter/contracts build`
Expected: pass

Run: `pnpm --filter backend-api test -- monitoring-admin.service.spec.ts`
Expected: pass

Run: `pnpm --filter backend-api build`
Expected: pass

Run: `pnpm --filter dashboard typecheck`
Expected: pass

Run: `pnpm --filter dashboard build`
Expected: pass

- [ ] **Step 4: Manual review of changed files**

Check:
- no AI-engine files changed
- no mobile files changed
- no Prisma migration introduced
- monitoring scope stayed additive

## Self-Review

- Spec coverage: summary endpoint, media endpoint, dashboard page, route/nav integration, contracts, checkpoints, and validation are all mapped to concrete tasks above.
- Placeholder scan: no `TODO`, `TBD`, or unnamed “write tests later” steps remain.
- Type consistency: the plan uses one consistent naming family: `AdminTranslationFinalization*`.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-11-translation-finalization-monitoring-dashboard.md`.

Execution mode already chosen by the user: subagent-driven style, no per-task commits. Implement task-by-task, review after each task, then present the full working tree in the final handoff.
