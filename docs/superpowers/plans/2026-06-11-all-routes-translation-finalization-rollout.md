# All-Routes Translation Finalization Rollout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Roll out OpenAI-backed translation finalization to all AI-engine routes with route-aware window profiles, real timeboxing, and real per-media cost accounting while keeping the progressive artifact contract unchanged.

**Architecture:** Add a small finalization policy selector layer in the AI-engine, upgrade the existing finalization loop to honor real timeout/retry/concurrency controls, and extend finalization metadata with usage/cost aggregates. Keep `translated_batches/` untouched, preserve fail-open export behavior, and only widen benchmark/reporting surfaces where they already read `final.json` metadata.

**Tech Stack:** Python 3.12, asyncio, pydantic-settings, Pydantic models, OpenAI chat completions, TypeScript benchmark harness.

---

### Task 1: Route-Profiled Finalization Policy

**Files:**
- Create: `apps/ai-engine/src/core/translation_finalization_policy.py`
- Modify: `apps/ai-engine/src/config.py`
- Modify: `apps/ai-engine/src/async_pipeline.py`
- Test: `apps/ai-engine/tests/test_translation_finalization_policy.py`

- [ ] Add a focused policy selector that chooses among `short_asset_single_window`, `dense_dialogue_general`, `dense_dialogue_cjk`, and `sparse_longform`.
- [ ] Keep the existing tuned base thresholds as the default profile source.
- [ ] Replace the source-language allowlist gate in `async_pipeline.py` with all-routes eligibility plus profile selection.
- [ ] Add tests for:
  - short asset selecting single-window profile
  - CJK dense content selecting CJK profile
  - sparse long-form content selecting sparse profile
  - non-CJK dense content selecting general dense profile

### Task 2: Real Timeout, Retry, And Concurrency Enforcement

**Files:**
- Modify: `apps/ai-engine/src/async_pipeline.py`
- Modify: `apps/ai-engine/src/core/llm_provider.py`
- Test: `apps/ai-engine/tests/test_translation_finalization_runtime.py`

- [ ] Wrap each finalization request in a real per-window timeout using `asyncio.wait_for(...)`.
- [ ] Execute blocking provider calls through `asyncio.to_thread(...)`.
- [ ] Enforce `AI_LLM_FINALIZATION_MAX_RETRIES`.
- [ ] Enforce `AI_LLM_FINALIZATION_MAX_CONCURRENCY` using an `asyncio.Semaphore`.
- [ ] Preserve media-level deadline behavior: do not admit new windows after deadline; use completed valid windows only.
- [ ] Add focused tests for timeout handling, retry counting, and no-new-window admission after deadline.

### Task 3: Real OpenAI Usage And Cost Tracking

**Files:**
- Modify: `apps/ai-engine/src/schemas.py`
- Modify: `apps/ai-engine/src/core/llm_provider.py`
- Modify: `apps/ai-engine/src/async_pipeline.py`
- Test: `apps/ai-engine/tests/test_llm_provider_translation_finalization.py`
- Test: `apps/ai-engine/tests/test_translation_finalization_runtime.py`

- [ ] Add additive per-window usage fields to `TranslationRevisionArtifact`.
- [ ] Add additive aggregate fields to `TranslationFinalizationMetadata`.
- [ ] Teach the OpenAI finalization path to return both parsed payload and usage metadata.
- [ ] Estimate USD cost from provider/model token usage using configured per-million token rates.
- [ ] Aggregate totals into `final.json.metadata.translation_finalization`.
- [ ] Add tests proving usage metadata is parsed and aggregated.

### Task 4: Benchmark And Contract Documentation Alignment

**Files:**
- Modify: `apps/backend-api/scripts/e2e-youtube-benchmark/types.ts`
- Modify: `apps/backend-api/scripts/e2e-youtube-pipeline-eval.ts`
- Modify: `CONTRACTS.md`
- Modify: `apps/ai-engine/CHECKPOINT.md`
- Modify: `apps/backend-api/CHECKPOINT.md`

- [ ] Extend the benchmark summary mapping with the new additive metadata fields needed for rollout debugging and cost visibility.
- [ ] Update `CONTRACTS.md` to reflect all-routes finalization eligibility and additive `translation_finalization` cost/profile metadata.
- [ ] Record the rollout change and validation evidence in the AI-engine checkpoint.
- [ ] Record benchmark/reporting alignment in the backend checkpoint.

### Task 5: Validation

**Files:**
- Validate only

- [ ] Run focused AI-engine tests for policy selection, provider finalization, windowing, overlay, and runtime controls.
- [ ] Run backend build and benchmark test.
- [ ] Run one OpenAI-backed E2E smoke case and confirm:
  - finalization enabled
  - full or partial valid coverage with fail-open safety
  - real usage/cost fields populated
  - `translated_batches/` still present and unchanged as progressive artifacts
