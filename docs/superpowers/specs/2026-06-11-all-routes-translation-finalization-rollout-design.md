# All-Routes Translation Finalization Rollout Design

**Date:** 2026-06-11  
**Status:** Approved for implementation in this session

## Goal

Roll out translation finalization across all AI-engine routes while preserving the current progressive product model:

- `translated_batches/` remain the latency layer
- `final.json` remains the authoritative completed artifact
- OpenAI is the only phase-1 finalization provider
- finalization is fail-open and bounded by real timeboxing
- finalization cost becomes measurable per media item

## Non-Goals

- No mobile live revision consumption before `final.json`
- No multi-provider routing for finalization
- No translation-quality judge pipeline in this slice
- No artifact contract expansion for backend/mobile consumption of `translation_revisions/`

## Current State

The repo already has:

- additive `translation_revisions/` artifacts
- final overlay into `final.json`
- strict translation-only validation
- OpenAI-backed finalization working in local E2E

The remaining gaps are:

- language-gated rollout instead of full-route rollout
- no real per-window timeout enforcement
- no real retry/concurrency enforcement
- no real provider cost accounting
- one flat finalization window policy instead of route-aware profiles

## Rollout Direction

### 1. All routes become eligible

Finalization is no longer limited by source-language allowlist. Every route may enter finalization when `AI_ENABLE_LLM_FINALIZATION=true`.

Eligibility becomes:

- finalization globally enabled
- target language present
- final subtitle segment set non-empty
- provider configured

### 2. Route-profiled policy, not uniform policy

All routes use finalization, but the windowing/budget policy is selected from a small internal profile set:

- `short_asset_single_window`
- `dense_dialogue_general`
- `dense_dialogue_cjk`
- `sparse_longform`

Profile selection uses runtime evidence already available in the AI-engine:

- detected source language
- media duration
- total segment count
- estimated source token count
- token density
- segment density

### 3. OpenAI-only in phase 1

The finalization provider remains OpenAI for all routes during this rollout. This keeps:

- one operational failure surface
- one cost model
- one timeout model
- one set of usage fields

### 4. Real timeboxing

Finalization must obey both media-level and window-level bounds.

Media-level:

- budget = `clamp(duration_seconds * ratio, min_seconds, max_seconds)`
- once the deadline is hit, no new windows start
- already completed valid windows are still used
- remaining segments fall back to NMT

Window-level:

- each LLM request runs with real timeout enforcement
- retries are bounded
- concurrency is bounded

### 5. Real cost tracking

Each finalized window records:

- provider
- model
- prompt tokens
- completion tokens
- total tokens
- estimated USD cost
- latency milliseconds
- attempt count

Per-media aggregates are written into `metadata.translation_finalization` on `final.json`.

## Policy Profiles

The rollout uses one configurable base profile plus derived route profiles.

### Base profile

The existing tuned defaults remain the baseline profile:

- `min_segments=16`
- `target_segments=28`
- `max_segments=36`
- `min_source_tokens=180`
- `target_source_tokens=360`
- `max_request_tokens=2600`
- `target_duration_seconds=75`
- `max_duration_seconds=120`
- `overlap_segments=4`
- `overlap_source_tokens=80`

### Derived profiles

#### `short_asset_single_window`

Used when:

- total segments <= configurable threshold
- estimated total source tokens <= base max request budget

Behavior:

- emit one EOF-sized window
- no profile-specific fragmentation before EOF

#### `dense_dialogue_cjk`

Used when:

- source language is CJK-family (`zh`, `yue`, `ja`, `ko`) and
- density is above sparse threshold

Behavior:

- start from base profile
- preserve overlap
- prefer segment/token triggers over duration

#### `dense_dialogue_general`

Used for:

- non-CJK routes with normal or high segment density

Behavior:

- start from base profile
- slightly lower overlap pressure than CJK if needed later, but phase 1 may keep the same overlap

#### `sparse_longform`

Used when:

- segment density and token density are both below thresholds
- or duration is long while segment count remains low

Behavior:

- larger segment target before flush
- lower overlap pressure
- stricter respect for media-level budget

## Timeboxing Rules

### Media-level settings

- `AI_LLM_FINALIZATION_BUDGET_RATIO_SECONDS_PER_MEDIA_SECOND`
- `AI_LLM_FINALIZATION_BUDGET_MIN_SECONDS`
- `AI_LLM_FINALIZATION_BUDGET_MAX_SECONDS`

### Window-level settings

- `AI_LLM_FINALIZATION_TIMEOUT_SECONDS`
- `AI_LLM_FINALIZATION_MAX_RETRIES`
- `AI_LLM_FINALIZATION_MAX_CONCURRENCY`

### Execution semantics

- windows are built first
- only windows started before the deadline are admitted
- each admitted window is processed under bounded concurrency
- each request is wrapped in a real timeout
- each failure may retry up to max retries unless deadline already blocks another attempt

## Cost Accounting

### Internal artifact level

`translation_revisions/{revision_index}.json` gains optional usage metadata:

- `attempt_count`
- `latency_ms`
- `prompt_tokens`
- `completion_tokens`
- `total_tokens`
- `estimated_cost_usd`

### Final metadata level

`metadata.translation_finalization` gains:

- `total_prompt_tokens`
- `total_completion_tokens`
- `total_tokens`
- `total_cost_usd`
- `applied_profile`
- `provider`
- `model`

These are additive internal/debug fields and do not change the mobile runtime contract.

## Contract Impact

Cross-module contract behavior remains intentionally narrow:

- `translated_batches/` unchanged
- `final.json.segments[]` unchanged
- backend/mobile do not consume `translation_revisions/`
- `final.json.metadata.translation_finalization` gains additive fields only

`CONTRACTS.md` must be updated to reflect:

- all-routes eligibility
- additive cost/profile metadata fields in `translation_finalization`

## Implementation Scope

### AI Engine

- replace language allowlist gate with full-route eligibility
- add profile selector helper
- add real timeout/retry/concurrency handling
- add cost aggregation and per-window usage capture
- persist profile and usage metadata in revision artifacts and final metadata

### Backend benchmark/reporting

- map new additive metadata fields from `final.json`
- keep existing WER flow unchanged

### Mobile / backend runtime

- no runtime contract changes in this phase

## Acceptance Criteria

This rollout is successful when:

1. Finalization can run on non-Chinese routes without config overrides.
2. Per-window timeout, retry, and concurrency settings are actually enforced.
3. `final.json.metadata.translation_finalization` contains real token/cost aggregates for OpenAI-backed windows.
4. The pipeline still completes fail-open when finalization times out or fails.
5. `translated_batches/` behavior remains unchanged.
6. Existing local E2E still produces a canonical `final.json` with valid segment ordering and stable progressive artifacts.
