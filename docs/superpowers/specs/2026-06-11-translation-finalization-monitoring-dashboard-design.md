# Translation Finalization Usage And Cost Monitor

Date: 2026-06-11
Status: Proposed
Scope: `apps/backend-api`, `apps/dashboard`, `packages/contracts`

## 1. Decision

Current translation finalization is good enough for a guarded MVP.

Why:
- The mobile app already consumes `translated_batches/` during processing and switches to `final.json` when it exists, so finalization improvements are already manually testable on mobile with no client contract change.
- Real local E2E runs already show OpenAI-backed finalization completing on both English and Chinese routes with non-zero token and cost telemetry in `final.json.metadata.translation_finalization`.
- The remaining gaps are operational visibility and spend tracking, not core pipeline viability.

This means the next move should be an admin monitoring surface for translation finalization usage and cost.

## 2. MVP Readiness Call

### 2.1 What is already shippable

- `translated_batches/` remain the progressive latency layer.
- `final.json` is the authoritative completed artifact with additive `metadata.translation_finalization`.
- Mobile processing preview can continue showing provisional subtitles.
- Mobile player will automatically pick up finalized translations once the backend exposes `final.json` in artifact inventory.

### 2.2 What MVP does not yet do

- The mobile app does not consume live translation revisions before completion.
- There is no judge-based translation quality evaluation yet.
- There is no operator dashboard for finalization usage, spend, and fallback behavior.

These are acceptable for MVP if operator visibility is added next.

## 3. Existing Runtime Facts

### 3.1 Mobile manual test path already exists

- `usePlayerSubtitles()` prefers `final.json` whenever artifact inventory reports a final artifact, and otherwise hydrates from `translated_batches/`.
- `useProcessingSubtitles()` prefers `final.json` when present, and otherwise merges chunk text plus translated batches for preview.

Consequence:
- Manual mobile validation can be done immediately by processing one media item and comparing:
  - in-progress processing preview: provisional NMT-backed content
  - completed player session: finalized `final.json` content

### 3.2 Dashboard/admin pattern already exists

The dashboard already has:
- overview metrics
- queue monitoring
- failure diagnostics
- AI Explain usage observability

The backend already has:
- `GET /admin/monitoring/queues`
- `GET /admin/monitoring/failures`
- `GET /admin/ai-explain/metrics`
- `GET /admin/ai-explain/sessions`

This means translation finalization monitoring should be an additive admin monitoring slice, not a new subsystem.

## 4. Approaches Considered

### Approach A — Dashboard reads benchmark outputs or E2E files

Reject.

Why:
- Not product data.
- Not durable for production-like usage.
- Bypasses the backend admin contract pattern.

### Approach B — Backend computes monitoring data from recent completed media plus `final.json` metadata

Recommended for MVP.

Why:
- Reuses the telemetry already written by AI Engine into `final.json.metadata.translation_finalization`.
- Requires no AI Engine contract change.
- Preserves current product/runtime behavior.
- Fits the existing backend-admin-dashboard architecture cleanly.

Trade-off:
- Backend must read and aggregate final artifacts from MinIO at request time.
- This needs bounded query windows and pagination to stay predictable.

### Approach C — Persist finalization summary snapshots into PostgreSQL first, then build dashboard from DB only

Defer.

Why not first:
- Adds schema and write-path work across backend and/or AI Engine.
- Good long-term scale path, but heavier than needed for the next MVP slice.

When to adopt later:
- If the monitoring endpoints become slow under real usage.
- If operators need large historical windows, rollups, or alerting.

## 5. Recommendation

Implement Approach B now:
- Backend admin endpoints compute translation finalization monitoring from recent completed `MediaItem` rows plus `final.json.metadata.translation_finalization`.
- Dashboard adds one new monitoring page for usage/cost visibility.
- Keep the implementation bounded and read-only.

This is the lowest-risk next step and gives immediate operational visibility into:
- spend
- token usage
- coverage/fallback behavior
- deadline hits
- route/profile distribution

## 6. Scope

### In scope

- New backend admin DTOs and read-only endpoints
- New dashboard page and navigation item
- Shared contracts for the new admin monitoring payloads
- Translation finalization metrics aggregated from recent completed media
- Recent finalized-media table for operator drill-down

### Out of scope

- AI Engine pipeline changes
- Mobile changes
- Live subtitle revision consumption before completion
- Judge-based translation quality scoring
- Budget enforcement changes
- Alerting, notifications, or background rollups

## 7. Data Source Strategy

## 7.1 Source of truth

Use:
- PostgreSQL `MediaItem` as the index for candidate media rows
- `processed/{mediaId}/final.json` as the source of finalization telemetry

Read from `final.json.metadata.translation_finalization`:
- `enabled`
- `applied_profile`
- `provider`
- `model`
- `coverage_segments`
- `coverage_duration_seconds`
- `attempted_windows`
- `completed_windows`
- `timed_out_windows`
- `invalid_windows`
- `failed_windows`
- `fallback_segments`
- `total_prompt_tokens`
- `total_completion_tokens`
- `total_tokens`
- `total_cost_usd`
- `finalization_deadline_hit`
- `segment_provenance`

Also use `final.json.metadata` for:
- `source_lang`
- `target_lang`
- `duration`

## 7.2 Candidate row selection

Backend should first query recent `MediaItem` rows where:
- `deletedAt = null`
- `status = COMPLETED`
- `artifactSummary.hasFinal = true` if available, otherwise tolerate missing cached summary

Filters should apply in SQL first where possible:
- date window
- source language
- target language

Then the backend reads only the final artifacts needed for the requested page/query.

## 7.3 Why not store a DB snapshot now

For MVP, live-read aggregation is acceptable because:
- this is an admin-only surface
- request volume is low
- the page can be bounded by period and pagination
- the telemetry already exists in final artifacts

If this becomes slow later, the graduation path is:
- add a persisted translation finalization summary snapshot on `MediaItem` or a separate rollup table
- keep the API response contract stable

## 8. Backend API Design

Keep this under the existing admin monitoring namespace.

### 8.1 Summary endpoint

`GET /admin/monitoring/translation-finalization/summary`

Query params:
- `period`: `7d | 30d` default `7d`
- `sourceLanguage?`
- `targetLanguage?`
- `provider?`
- `profile?`

Purpose:
- operator summary cards and breakdown charts

Response shape:

```ts
interface AdminTranslationFinalizationSummaryResponse {
  period: "7d" | "30d";
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

### 8.2 Recent media endpoint

`GET /admin/monitoring/translation-finalization/media`

Query params:
- `page`, `limit`
- `period`: `7d | 30d` default `7d`
- `sourceLanguage?`
- `targetLanguage?`
- `provider?`
- `profile?`
- `health?`

`health` values:
- `all`
- `healthy`
- `fallback`
- `deadline_hit`
- `failed_windows`

Purpose:
- recent finalized-media drill-down table

Response shape:

```ts
interface AdminTranslationFinalizationMediaListResponse {
  page: number;
  limit: number;
  total: number;
  data: Array<{
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
  }>;
}
```

### 8.3 Contract notes

- This is a backend + dashboard + contracts change only.
- It does not change mobile APIs.
- It does not change queue payloads or AI-engine output schema.
- `CONTRACTS.md` should document the new admin monitoring API.

## 9. Backend Aggregation Rules

### 9.1 Candidate limit policy

To avoid unbounded MinIO reads:
- summary endpoint should only scan media inside the selected bounded period
- media list endpoint should page SQL candidates before fetching final artifacts

Recommended phase-1 safeguards:
- max period choices: `7d`, `30d`
- max page size: `50`

### 9.2 Missing or malformed finalization metadata

If `final.json` exists but `metadata.translation_finalization` is missing or malformed:
- treat the media item as completed but not finalized
- do not fail the entire response
- increment an internal `unreadableFinalizationMedia` counter for server logs only

This keeps the admin page fail-open.

### 9.3 Derived metrics

Use these formulas:
- `coverageRate = coverageSegments / totalSegmentCount` when segment count is derivable from final artifact
- `fallbackRate = fallbackSegments / totalSegmentCount`
- `averageWindowSuccessRate = completedWindows / attemptedWindows`
- `costPerMediaMinuteUsd = totalCostUsd / (durationSeconds / 60)` when duration > 0
- `llmRevisedSegments = count(segment_provenance where source = "llm_revision")`
- `nmtFallbackSegments = count(segment_provenance where source = "nmt")`

### 9.4 Completion timestamp

Use `MediaItem.updatedAt` as the completion timestamp for MVP.

Reason:
- no dedicated `completedAt` exists on `MediaItem`
- this is already the durable backend timestamp closest to completion

If exact completion auditing becomes important later, add a dedicated completion timestamp field separately.

## 10. Dashboard Design

Add a new page under monitoring:
- route: `/monitoring/translation-finalization`
- nav label: `Finalization`

Why under monitoring instead of a standalone top-level page:
- this is operational pipeline telemetry, not a product feature config screen
- it belongs with queues and failures

## 10.1 Page layout

Section 1: summary header
- title: `Translation finalization`
- subtitle: operational visibility into LLM cost, coverage, and fallback behavior
- controls:
  - period toggle `7d | 30d`
  - source language filter
  - target language filter
  - provider filter
  - profile filter
  - refresh button

Section 2: top metric cards
- completed media
- finalized media
- total cost USD
- average cost per media minute
- total tokens
- average coverage rate
- fallback rate
- deadline-hit media

Section 3: breakdown panels
- daily cost/tokens usage bars
- by profile panel
- by route panel
- by provider panel

Section 4: recent finalized media table
- completed time
- media title
- user
- route
- profile
- windows `completed/attempted`
- fallback segments
- total tokens
- total cost
- health badge

## 10.2 Health badge rules

Recommended badge mapping:
- `healthy`: no deadline hit, no failed windows, fallback segments = 0
- `fallback`: fallback segments > 0
- `deadline`: `finalization_deadline_hit = true`
- `failed`: `failedWindows > 0 || invalidWindows > 0 || timedOutWindows > 0`

Priority:
- failed
- deadline
- fallback
- healthy

## 10.3 Refresh behavior

Use TanStack Query with:
- `staleTime = 30_000`
- `refetchInterval = 30_000`

This is enough for admin observability without pretending this page needs real-time socket semantics.

## 11. Shared Contracts

Add new transport types in `packages/contracts` for:
- summary query
- summary response
- media-list query
- media-list response
- breakdown row types

Dashboard should continue importing these from `@kapter/contracts`, matching the existing monitoring and AI Explain pattern.

## 12. Manual Validation Path

### 12.1 Mobile MVP check

Manual mobile validation can be done now:
1. Submit one media item from the mobile app.
2. Observe in-progress processing preview while only `translated_batches/` exist.
3. Wait for completion.
4. Open the player again and confirm it hydrates from `final.json`.

Expected result:
- in-progress subtitles are provisional
- completed subtitles reflect finalized output

### 12.2 Dashboard validation after implementation

Minimum validation:
1. process at least one new media item with finalization enabled
2. open `/monitoring/translation-finalization`
3. verify non-zero tokens/cost appear
4. verify the recent-media row matches the processed media item
5. verify filters narrow the dataset correctly

## 13. Acceptance Criteria

- Admin backend exposes a summary endpoint and a recent-media endpoint for translation finalization telemetry.
- Dashboard exposes a new `Finalization` monitoring page.
- The page shows non-zero token/cost telemetry for finalized media items that used OpenAI finalization.
- Operators can filter by period and basic route/provider/profile dimensions.
- The recent-media table exposes fallback and deadline-hit behavior clearly.
- Mobile behavior remains unchanged.
- No AI Engine pipeline changes are required for this slice.

## 14. Follow-Up After This Slice

If this monitor proves useful, the next likely follow-ups are:
- persist translation finalization summary snapshots in PostgreSQL for faster queries
- add operator drill-down into segment provenance and revision artifacts
- add budget alerts or spend thresholds
- add export/download for monitoring reports

## 15. Recommendation Summary

Current translation finalization is solid enough for a guarded MVP and is already manually testable on mobile because the player hydrates from `final.json` after completion.

The correct next step is not more pipeline redesign. The correct next step is operator visibility:
- backend-admin monitoring endpoints
- dashboard monitoring page
- usage/cost/fallback telemetry from existing finalization metadata

That gives the product team the operational evidence needed before any broader rollout or spend policy changes.
