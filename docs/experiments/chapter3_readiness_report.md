# Chapter 3 Readiness Report

Verification date: 2026-06-11  
Repository root: `C:\Users\sondo\my_projects\KMA\billingual_project`

This report is a code-and-runtime verification pass for the final Chapter 3 benchmark. It focuses on translation start policy, downgrade behavior, E2E timing semantics, fixture readiness, and thesis-safe interpretation.

No code changes were made in this pass beyond writing this report.

---

## 1. Translation start policy overview

### 1.1 Primary config flags and env vars

Current policy-related settings live in:

- `apps/ai-engine/src/config.py`

Direct translation-start-policy settings:

- `AI_TRANSLATION_START_POLICY`
  - defined in `Settings.AI_TRANSLATION_START_POLICY`
  - path: `apps/ai-engine/src/config.py`
  - default: `"during_asr"`
  - documented values: `after_asr | during_asr`
- `Settings.translation_start_policy`
  - property in `apps/ai-engine/src/config.py`
  - normalizes the effective configured string to either `"during_asr"` or `"after_asr"`
  - invalid values fall back to `"during_asr"`
- `Settings.hybrid_after_asr_mode`
  - derived property in `apps/ai-engine/src/config.py`
  - true when normalized policy is `after_asr`
- `AI_ENABLE_NMT_PREFETCH`
  - defined in `apps/ai-engine/src/config.py`
  - default: `False`
  - only allows NMT prefetch when not in hybrid `after_asr` mode
- `Settings.nmt_prefetch_enabled`
  - derived property in `apps/ai-engine/src/config.py`
  - returns `AI_ENABLE_NMT_PREFETCH and not hybrid_after_asr_mode`

Route-certification and downgrade-related settings:

- `AI_ASR_ALLOW_AUTO_POLICY_DOWNGRADE`
  - `apps/ai-engine/src/config.py`
  - default: `True`
  - allows uncertified routes to be automatically downgraded from `during_asr` to `after_asr`
- `AI_ASR_DURING_ASR_CERTIFIED_ROUTES`
  - `apps/ai-engine/src/config.py`
  - default: `"distil_whisper_en,whisper_turbo,sensevoice_small"`
  - controls which internal route IDs are allowed to keep `during_asr`
- `Settings.asr_during_asr_certified_routes`
  - derived property in `apps/ai-engine/src/config.py`
  - parsed into a normalized route-id set

Chinese trust-gate override settings:

- `AI_CHINESE_TRUST_GATE_ENABLED`
- `AI_CHINESE_HOLD_UNVERIFIED_CHUNKS`
- `AI_CHINESE_FORCE_AFTER_ASR_ON_RECOVERY`
- `AI_CHINESE_RECOVERY_ROUTE_IDS`
- `AI_CHINESE_RECOVERY_ENABLE_SENSEVOICE`
- `AI_CHINESE_RECOVERY_ENABLE_WHISPER_FULL`

Routing/source selection settings that indirectly affect the policy path:

- `AI_ASR_ROUTING_ENABLED`
- `AI_ASR_DEFAULT_ROUTE_EN`
- `AI_ASR_DEFAULT_ROUTE_ZH`
- `AI_ASR_EXPERIMENTAL_ROUTE_ZH`
- `AI_ASR_ENABLE_EXPERIMENTAL_ZH_ROUTE`
- `AI_ASR_FALLBACK_ROUTE_EN`
- `AI_ASR_FALLBACK_ROUTE_ZH`
- `AI_ASR_FORCE_ROUTE`
- `AI_SOURCE_LANGUAGE_HINT`
- `AI_SOURCE_LANGUAGE_PROBE_ENABLED`
- `AI_SOURCE_LANGUAGE_PROBE_MAX_SECONDS`
- `AI_SOURCE_LANGUAGE_PROBE_MAX_SEGMENTS`

### 1.2 Where the policy is read

The configured translation start policy is first read in:

- `apps/ai-engine/src/async_pipeline.py`
  - function: `run_v2_pipeline_async(...)`
  - variable assignment:
    - `translation_start_policy = settings.translation_start_policy`
    - `nmt_prefetch_enabled = settings.nmt_prefetch_enabled if prefetch_nmt is None else bool(prefetch_nmt)`

The worker startup log also prints the current configured policy in:

- `apps/ai-engine/src/main.py`
  - function: `main()`
  - log:
    - `Translation start policy: {settings.translation_start_policy}`

### 1.3 Where the effective policy is decided

The first policy decision happens in route selection:

- `apps/ai-engine/src/core/smart_aligner.py`
  - `SmartAligner._build_route_configs()`
  - builds `ASRRouteConfig` entries, including `during_asr_certified`
- `apps/ai-engine/src/core/smart_aligner.py`
  - `SmartAligner.route_decision_for_language(...)`
  - delegates to `ASRRouter.decision_for_language(...)`
- `apps/ai-engine/src/core/asr/router.py`
  - `ASRRouter.decision_for_language(...)`
  - returns `ASRRouteDecision` with:
    - `requested_policy`
    - `effective_policy`
    - `auto_downgraded`
    - `during_asr_certified`
    - `fallback_chain`

The main routing/policy branch in the live pipeline is:

- `apps/ai-engine/src/async_pipeline.py`
  - function: `run_v2_pipeline_async(...)`
  - variables:
    - `route_decision = pipeline.aligner.route_decision_for_language(...)`
    - `effective_translation_policy = route_decision.effective_policy`
    - `auto_policy_downgraded = route_decision.auto_downgraded`

### 1.4 Where downgrade can happen

There are two major downgrade layers:

1. Router downgrade:
- `apps/ai-engine/src/core/asr/router.py`
  - `ASRRouter.decision_for_language(...)`
  - downgrade rule:
    - requested policy is `during_asr`
    - selected route is not `during_asr_certified`
    - `AI_ASR_ALLOW_AUTO_POLICY_DOWNGRADE` is true

2. Chinese trust-gate override:
- `apps/ai-engine/src/async_pipeline.py`
  - after `trust_gate_active` is computed
  - branch:
    - `if trust_gate_active and settings.AI_CHINESE_FORCE_AFTER_ASR_ON_RECOVERY:`
    - `effective_translation_policy = "after_asr"`
    - `auto_policy_downgraded = True`

### 1.5 Where the decision is recorded

Recorded in logs and trace:

- `apps/ai-engine/src/async_pipeline.py`
  - source-routing log:
    - `logger.info("🧭 Source routing: ... policy=... effective_policy=...")`
  - trace event:
    - `_trace("source_routing_decided", requested_translation_start_policy=..., translation_start_policy=..., auto_policy_downgraded=..., route=..., provider=..., trust_gate_active=...)`

Recorded in in-memory run metrics:

- `apps/ai-engine/src/async_pipeline.py`
  - `pipeline.last_run_metrics`
  - includes:
    - `requested_translation_start_policy`
    - `translation_start_policy`
    - `auto_policy_downgraded`
    - `route`
    - `requested_route`
    - `asr_provider`
    - `probe_source_lang`
    - `asr_fallback_used`
    - `asr_fallback_chain`
    - `trust_gate_active`
    - `trust_stage`
    - `trust_attempts`
    - `trust_decision`

Surfaced by the processing-only benchmark:

- `apps/ai-engine/src/scripts/benchmark_suite.py`
  - exports and renders:
    - `requested_translation_start_policy`
    - `translation_start_policy`
    - `auto_policy_downgraded`

Not currently recorded in final subtitle artifact metadata:

- `apps/ai-engine/src/schemas.py`
  - `SubtitleMetadata`
  - current fields are:
    - `duration`
    - `engine_profile`
    - `source_lang`
    - `target_lang`
    - `model_used`
    - `translation_finalization`
  - there is no `translation_start_policy`, `requested_translation_start_policy`, or `auto_policy_downgraded` in `final.json.metadata`

Not currently exported by the backend E2E summary:

- `apps/backend-api/scripts/e2e-youtube-pipeline-eval.ts`
  - `evaluation.summary.json` does not currently include the effective policy or downgrade reason

---

## 2. Downgrade conditions

### 2.1 Route-certification downgrade

Source:

- `apps/ai-engine/src/core/asr/router.py`
  - `ASRRouter.decision_for_language(...)`

Condition:

- requested policy is `during_asr`
- selected route is not `during_asr_certified`
- `AI_ASR_ALLOW_AUTO_POLICY_DOWNGRADE=true`

Why it exists:

- the code treats overlap safety as a route-level capability gate
- this is a scheduling/config decision, not a live VRAM measurement

Who it affects:

- any route not listed in `AI_ASR_DURING_ASR_CERTIFIED_ROUTES`
- currently relevant examples:
  - `whisper_full`
  - `paraformer_zh`

Expected or error:

- expected behavior

Impact on `time_to_first_translated_batch_seconds`:

- translation cannot begin until ASR completes
- this tends to push the first translated batch much later, often near completion

### 2.2 Chinese trust-gate forced `after_asr`

Sources:

- `apps/ai-engine/src/async_pipeline.py`
- `apps/ai-engine/src/core/transcript_trust_gate.py`

Condition:

- `trust_gate_active` becomes true, and
- `AI_CHINESE_FORCE_AFTER_ASR_ON_RECOVERY=true`

Current activation logic:

- `trust_gate_active = settings.AI_CHINESE_TRUST_GATE_ENABLED and (chinese_prior.should_gate or selected_source_lang in {"zh", "yue"} or probe_source_lang in {"zh", "yue"})`

This is important:

- in the current code, Chinese-family jobs are not only downgraded when they are clearly broken
- any job that resolves to `zh` or `yue` enters the trust-gate path
- with the current default `AI_CHINESE_FORCE_AFTER_ASR_ON_RECOVERY=true`, that path forces `after_asr`

Why it exists:

- the trust gate is designed to prevent public chunk/batch publication from an untrusted Chinese-family transcript
- the system first establishes transcript ownership/trust, optionally retries route recovery, and only then releases artifacts

Who it affects:

- Chinese/CJK jobs that resolve into the Chinese-family trust-gate path
- in practice, this is the main reason current Chinese jobs behave sequentially even if `sensevoice_small` is overlap-certified

Expected or error:

- expected behavior
- it is a protective runtime policy, not a bug

Impact on `time_to_first_translated_batch_seconds`:

- translation is intentionally held until after the trust-gated ASR/recovery phase
- therefore the first translated batch may legitimately appear close to completion

### 2.3 Chinese recovery/fallback route path

Sources:

- `apps/ai-engine/src/config.py`
  - `Settings.chinese_recovery_route_ids`
- `apps/ai-engine/src/async_pipeline.py`
  - trust-gate branch using `_run_candidate_asr(...)`

Condition:

- trust gate decides the first candidate is suspicious or needs recovery
- the pipeline iterates `trust_candidate_routes`

Default recovery chain comes from:

- current selected Chinese route
- `sensevoice_small` if enabled
- `whisper_full` if enabled

Why it exists:

- to recover a trusted Chinese transcript when the first route appears to have wrong ownership or poor cleanliness

Who it affects:

- trust-gated Chinese-family jobs

Expected or error:

- expected behavior

Impact on `time_to_first_translated_batch_seconds`:

- recovery adds additional full-ASR candidate passes before public release
- the first translated batch can be materially delayed

### 2.4 Source-language hint / probe / prior affecting route and policy

Sources:

- `apps/ai-engine/src/async_pipeline.py`
- `apps/ai-engine/src/config.py`
- `apps/ai-engine/src/core/asr/router.py`

Decision order:

1. configured hint:
   - `settings.source_language_hint`
2. local hint:
   - `source_language_hint` argument normalized into `local_source_hint`
3. probe:
   - `pipeline.aligner.probe_source_language(...)`
4. Chinese soft prior:
   - `build_chinese_route_prior(...)`

Special override:

- `if local_source_hint and local_source_hint.startswith("zh"): route_override_zh = "sensevoice_small"`

Why it exists:

- to steer ASR route selection before the main pass

Who it affects:

- all jobs, especially mixed or ambiguous language jobs

Expected or error:

- expected behavior

Impact on `time_to_first_translated_batch_seconds`:

- indirect
- the selected source language determines route choice, certification status, and whether the trust gate becomes active

### 2.5 GPU/model residency and NMT overlap constraints

Sources:

- `apps/ai-engine/src/config.py`
- `apps/ai-engine/src/async_pipeline.py`
- `apps/ai-engine/src/core/asr/router.py`
- `apps/ai-engine/src/main.py`

Relevant behavior:

- in `after_asr` mode:
  - `nmt_prefetch_enabled = False`
  - `NMTTranslator.unload_instance()` is called
  - ASR routes are unloaded before translation starts
  - queue becomes unbounded: `queue_maxsize = 0`
  - consumer drains only after ASR has completed

Why it exists:

- the current runtime is optimized for a single-GPU hybrid schedule
- it avoids overlapping ASR and NMT on paths that are not treated as overlap-safe

Who it affects:

- any case whose effective policy becomes `after_asr`

Expected or error:

- expected behavior

Impact on `time_to_first_translated_batch_seconds`:

- adds unavoidable delay because translation starts only after ASR residency is released

### 2.6 SmartAligner route configuration and certification

Source:

- `apps/ai-engine/src/core/smart_aligner.py`

Current route configs:

- `distil_whisper_en`
- `whisper_turbo`
- `whisper_full`
- `sensevoice_small`
- `paraformer_zh`

`during_asr_certified` is attached at route-config build time from:

- `settings.asr_during_asr_certified_routes`

Important current default:

- certified by default:
  - `distil_whisper_en`
  - `whisper_turbo`
  - `sensevoice_small`
- not certified by default:
  - `whisper_full`
  - `paraformer_zh`

This means:

- English Distil route can legitimately keep `during_asr`
- Chinese `sensevoice_small` is router-certified for `during_asr`
- but the Chinese trust-gate override still forces `after_asr` later in the live pipeline

### 2.7 Test evidence that this is expected

Relevant tests:

- `apps/ai-engine/tests/test_asr_routing.py`
  - verifies certified routes can keep `during_asr`
- `apps/ai-engine/tests/test_chinese_trust_gate.py`
  - verifies trust-gated Chinese pipelines end with `translation_start_policy == "after_asr"`
- `apps/ai-engine/tests/test_hybrid_routing.py`
  - verifies the hybrid after-ASR path delays translation until after ASR completion

---

## 3. Why first translated batch often appears near completion

There are three different explanations, and they should be kept separate.

### 3.1 True runtime behavior: `after_asr`

Source:

- `apps/ai-engine/src/async_pipeline.py`

Key branch:

- if `effective_translation_policy == "after_asr"`:
  - producer runs to completion first
  - trace event `asr_completed` is recorded
  - ASR routes are unloaded
  - only then does `consumer()` run and upload translated batches

Therefore:

- `chunks/` can appear earlier than translation only if chunk publication itself is not being held
- `translated_batches/` cannot appear until after ASR completion in this mode

This is the main true-runtime reason for late first translated batches.

### 3.2 True runtime behavior: Chinese trust-gated release

Source:

- `apps/ai-engine/src/async_pipeline.py`
- `apps/ai-engine/src/core/transcript_trust_gate.py`

In the trust-gate path:

- ASR candidates are run and evaluated first
- public release is held until a trusted candidate is chosen
- then chunks are replayed with `_replay_chunk(...)`
- then the consumer starts from the trusted transcript path

This means:

- current Chinese public artifacts are not proving overlap-style progressive translation
- they are proving controlled release after transcript trust is established

### 3.3 Polling granularity artifact from the E2E harness

Sources:

- `apps/backend-api/scripts/e2e-youtube-pipeline-eval.ts`
- `apps/backend-api/scripts/e2e-youtube-benchmark/http.ts`

Current benchmark timing is REST-poll-observed, not event-timestamped:

- `DEFAULT_POLL_INTERVAL_MS = 3000`
- `/media/:id/status` is polled every 3 seconds
- `timeToFirstTranslatedBatchSeconds` is the first timeline entry where `artifacts.translatedBatchCount > 0`
- `timeToHasFinalSeconds` is the first timeline entry where `artifacts.hasFinal == true`

Therefore:

- if a translated batch is uploaded shortly before completion, and no poll lands between that upload and completion, the first observed translated batch time collapses onto the completion poll
- this can make `time_to_first_translated_batch_seconds == time_to_completed_seconds` even when a translated batch was technically uploaded slightly earlier

### 3.4 Cases where progressive translation should be visible earlier

Current code should allow earlier translated batches mainly when:

- the effective policy remains `during_asr`
- the selected route is overlap-safe
- the run is not in the Chinese trust-gated release path
- the job is long enough that a translated batch is uploaded well before the final completion poll

In practice this currently points mostly to:

- English cases on `distil_whisper_en`

Even there, the benchmark can still miss earlier batch availability because:

- the poll interval is coarse
- translated batches may cluster late in the run

### 3.5 Thesis-safe interpretation of these late timings

Safe interpretation:

- a late `time_to_first_translated_batch_seconds` does not automatically mean the system has no progressive design
- it can mean:
  - the effective policy was `after_asr`
  - Chinese trust-gated release intentionally delayed public batches
  - or the E2E benchmark only observed the first batch at the completion poll

Unsafe interpretation:

- “first translated batch equals completion, therefore the system never supported progressive translation”

---

## 4. Benchmark/exporter metric correctness

### 4.1 Where each timing metric is computed

Source file:

- `apps/backend-api/scripts/e2e-youtube-pipeline-eval.ts`

Function:

- `deriveMilestones(...)`

Current behavior:

- `timeToFirstChunkSeconds`
  - first `StatusTimelineEntry` where `artifacts.chunkCount > 0`
- `timeToFirstTranslatedBatchSeconds`
  - first `StatusTimelineEntry` where `artifacts.translatedBatchCount > 0`
- `timeToHasFinalSeconds`
  - first `StatusTimelineEntry` where `artifacts.hasFinal`
- `timeToCompletedSeconds`
  - `elapsedSeconds` returned by polling completion

Source of `elapsedSeconds` and timeline snapshots:

- `apps/backend-api/scripts/e2e-youtube-benchmark/http.ts`
  - function: `pollForCompletion(...)`
  - every poll stores:
    - `tSeconds`
    - `status`
    - `progress`
    - `currentStep`
    - `estimatedTimeRemaining`
    - `sourceLanguage`
    - `targetLanguage`
    - `artifacts`

### 4.2 What the timings are actually based on

These E2E timing fields currently come from:

- REST polling of `GET /media/:id/status`

They do **not** come from:

- socket event timestamps
- MinIO object timestamps
- Redis event timestamps
- AI-engine debug traces

This is why the most thesis-safe description is:

- “observed via backend status polling”

### 4.3 Current polling interval

Source:

- `apps/backend-api/scripts/e2e-youtube-pipeline-eval.ts`

Constant:

- `DEFAULT_POLL_INTERVAL_MS = 3_000`

CLI override:

- `--poll-ms`

### 4.4 Current precision limitations

Because timings are polling-observed:

- precision is limited to the poll cadence
- artifact appearance can be earlier than the reported time
- multiple milestones can collapse into one poll sample
- late-run translated batches are especially likely to collapse into completion time

### 4.5 How `progressive_artifacts_before_final` is inferred

Source:

- `apps/backend-api/scripts/e2e-youtube-benchmark/chapter3-export.ts`

Function:

- `inferProgressiveArtifactsBeforeFinal(...)`

Current logic:

- takes:
  - `milestoneTimings.timeToFirstChunkSeconds`
  - `milestoneTimings.timeToFirstTranslatedBatchSeconds`
  - `milestoneTimings.timeToHasFinalSeconds`
- falls back to `statusTimeline` if needed
- finds earliest progressive artifact time from:
  - first chunk
  - first translated batch
- compares it with first observed final time

Important implication:

- this is also polling-observed
- it is a useful inference, but not a ground-truth object-upload timestamp comparison

### 4.6 Exporter timing semantics

Source:

- `apps/backend-api/scripts/e2e-youtube-benchmark/chapter3-export.ts`

The exporter currently copies the benchmark’s saved milestone timings into:

- `chapter3_performance_metrics.csv`

and builds:

- `progressive_artifacts_before_final`

from those same saved milestone/timeline values.

### 4.7 Thesis-safe naming recommendation

Current names are acceptable for internal tooling, but in Chapter 3 prose they should be described as:

- “observed time to first chunk via backend status polling”
- “observed time to first translated batch via backend status polling”
- “observed time to final artifact visibility via backend status polling”

That wording is more accurate than implying exact event timestamps.

---

## 5. Final benchmark dataset readiness

### 5.1 Current fixture manifest

Fixture manifest path:

- `apps/ai-engine/test_medias.md`

Case loader used by the benchmark:

- `apps/backend-api/scripts/e2e-youtube-benchmark/fixtures.ts`
  - `loadCaseDefinitions(...)`

Current totals verified from the live manifest:

- total cases: 20
- English cases: 10
- Chinese cases: 10

### 5.2 Current case IDs

Current case IDs generated from the manifest are:

English:

- `english_-moW9jvvMr4`
- `english_8KkKuTCFvzI`
- `english_5MuIMqhT8DM`
- `english_MMmOLN5zBLY`
- `english__zfN9wnPvU0`
- `english_LpSDuDIaBGk`
- `english_4TMPXK9tw5U`
- `english_yDAAlojz8NU`
- `english_WeJrU-VJGfg`
- `english_w4rG5GY9IlA`

Chinese:

- `chinese__4GSI4J-GuA`
- `chinese_60xeAEe7H28`
- `chinese_LcUoiBwG-OA`
- `chinese_nSeVUZDzCUY`
- `chinese_-MTOd9V0VPU`
- `chinese_Y9_-pAk3Iag`
- `chinese_WA18WJmXZZE`
- `chinese_FqqK8hQzPgM`
- `chinese_8sn3YzhnprM`
- `chinese_GOjlcDYurP0`

The IDs do match the current URLs because the loader derives them from the YouTube `v=` video ID.

Important note:

- `chinese__4GSI4J-GuA` is correct
- the double underscore is expected because the video ID itself begins with `_`

### 5.3 Current manual subtitle availability

Live verification date: 2026-06-11  
Verification method:

- used the same benchmark helper as the E2E harness:
  - `apps/backend-api/scripts/e2e-youtube-benchmark/subtitles.ts`
  - `createSubtitleClient().downloadManualSubtitle(...)`
- this checks real `yt-dlp` metadata and, for Chinese, applies the benchmark’s current content-based selection path rather than only checking tag names

English cases currently manual-subtitle-available:

- all 10 English cases

Chinese cases currently manual-subtitle-available according to the current benchmark logic:

- `chinese__4GSI4J-GuA`
- `chinese_LcUoiBwG-OA`
- `chinese_-MTOd9V0VPU`
- `chinese_Y9_-pAk3Iag`
- `chinese_WA18WJmXZZE`
- `chinese_FqqK8hQzPgM`
- `chinese_8sn3YzhnprM`
- `chinese_GOjlcDYurP0`

Chinese cases currently not manual-subtitle-available according to the current benchmark logic:

- `chinese_60xeAEe7H28`
- `chinese_nSeVUZDzCUY`

Therefore the current expected WER/CER-eligible total is:

- English: 10
- Chinese: 8
- Total expected eligible cases: 18 / 20

Important caution:

- this availability is external-state-dependent
- it was verified on 2026-06-11
- YouTube subtitle availability can still drift later

### 5.4 Current cache cleanliness

Cache directory inspected:

- `apps/ai-engine/benchmark/audios/`

Current matching cached audio files for the current manifest:

- 13 current cached files match today’s case IDs

Current orphaned/legacy cached files present:

- `A Simple Way to Break a Bad Habit ｜ Judson Brewer ｜ TED.mp3`
- `chinese_EtlN4Vi9zeI.mp3`
- `chinese_iKzN26XbOnI.mp3`
- `chinese_kUzay3X1maA.mp3`
- `chinese_SM7KMMQQ9yE.mp3`
- `Cooking Together - Chinese Mandarin Dialogue.mp3`
- `english_RdayDfzCJ1Y.mp3`
- `english_utIJb6CHhuY.mp3`
- `english_wIbBUzNJbOU.mp3`
- `First Blind Date in Chinese｜Beginner Mandarin Dialogue with Pinyin + English Subtitles.mp3`
- `What Makes a Good Life？ Lessons from the Longest Study on Happiness ｜ Robert Waldinger ｜ TED.mp3`

Interpretation:

- the processing-only benchmark cache is not clean
- it contains legacy/orphaned files from older fixture sets

However:

- the final Chapter 3 benchmark should use the real app-path E2E harness
- that harness does **not** depend on `apps/ai-engine/benchmark/audios/`
- therefore this cache does not need to be cleared for the final E2E run

### 5.5 Output directory readiness

Historical outputs should not be overwritten.

Recommended:

- use fresh run directories
- use fresh export directories
- do not reuse `docs/experiments` for the final thesis package unless you intentionally want to overwrite the current working files

---

## 6. Recommended final run strategy

### 6.1 Safest run sequence

Recommended sequence:

1. 2-case smoke test
2. 6-case subset
3. full 20-case run
4. export the final Chapter 3 package from the final run directory

This is safer than jumping straight to the 20-case run because it verifies:

- services boot correctly
- current YouTube access works
- subtitle availability assumptions still hold
- exporter works against the new run bundle

### 6.2 Recommended output names

From repo root, use date-stamped directories such as:

- `outputs/e2e-benchmarks/runs/chapter3-smoke-20260611`
- `outputs/e2e-benchmarks/runs/chapter3-subset-20260611`
- `outputs/e2e-benchmarks/runs/chapter3-full-20260611`
- `docs/experiments/chapter3-final-20260611`

### 6.3 Recommended smoke test

Use one English and one Chinese case:

- English: `english_-moW9jvvMr4`
- Chinese: `chinese__4GSI4J-GuA`

Command from repo root:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\run-e2e-youtube-pipeline.ps1 `
  -CaseIds english_-moW9jvvMr4,chinese__4GSI4J-GuA `
  -OutputDir outputs\e2e-benchmarks\runs\chapter3-smoke-20260611
```

### 6.4 Recommended 6-case subset

Suggested subset:

- English:
  - `english_-moW9jvvMr4`
  - `english_8KkKuTCFvzI`
  - `english_5MuIMqhT8DM`
- Chinese:
  - `chinese__4GSI4J-GuA`
  - `chinese_LcUoiBwG-OA`
  - `chinese_GOjlcDYurP0`

Command from repo root:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\run-e2e-youtube-pipeline.ps1 `
  -CaseIds english_-moW9jvvMr4,english_8KkKuTCFvzI,english_5MuIMqhT8DM,chinese__4GSI4J-GuA,chinese_LcUoiBwG-OA,chinese_GOjlcDYurP0 `
  -OutputDir outputs\e2e-benchmarks\runs\chapter3-subset-20260611
```

### 6.5 Recommended full run

Command from repo root:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\run-e2e-youtube-pipeline.ps1 `
  -OutputDir outputs\e2e-benchmarks\runs\chapter3-full-20260611
```

### 6.6 Export Chapter 3 evidence after each run

Command from `apps/backend-api`:

```powershell
pnpm export:chapter3 -- --run-dir ..\..\outputs\e2e-benchmarks\runs\chapter3-full-20260611 --out-dir ..\..\docs\experiments\chapter3-final-20260611
```

Equivalent for smoke/subset:

```powershell
pnpm export:chapter3 -- --run-dir ..\..\outputs\e2e-benchmarks\runs\chapter3-smoke-20260611 --out-dir ..\..\docs\experiments\chapter3-smoke-20260611
```

### 6.7 What to preserve

Preserve these files for thesis evidence:

- run root:
  - `run.manifest.json`
- logs:
  - `logs/backend-api.log`
  - `logs/backend-api.err.log`
  - `logs/backend-worker.log`
  - `logs/backend-worker.err.log`
  - `logs/ai-engine.log`
  - `logs/ai-engine.err.log`
- results:
  - `results/suite.summary.json`
  - `results/suite.summary.md`
  - `results/summary/e2e_wer_suite_summary.json`
  - `results/summary/e2e_wer_suite_summary.md`
- per-case:
  - `evaluation.summary.json`
  - `status.timeline.json`
  - `status.final.json`
  - `artifacts.inventory.json`
  - `chunk.first.json`
  - `translated_batch.first.json`
  - `final.json`
  - `ground_truth.normalized.txt`
  - `hypothesis.normalized.txt`
- exported Chapter 3 package:
  - `chapter3_results.json`
  - all generated CSVs
  - `chapter3_benchmark_report.md`
  - `chapter3_evidence_index.md`

### 6.8 Cache/output cleanup recommendation

For the final E2E benchmark:

- do **not** clear the AI-engine processing-only audio cache for benchmark correctness
  - it is not used by the real app-path E2E harness
- do **not** delete historical E2E output bundles
- instead, use new unique output directories

If you later run the processing-only benchmark suite for secondary evidence:

- optional cleanup of `apps/ai-engine/benchmark/audios/` may make that secondary cache tidier
- but it is not required for the app-path final run

---

## 7. Thesis-safe interpretation

### 7.1 What can be safely claimed about progressive subtitle generation

Safe claim:

- the system is designed for progressive asynchronous subtitle generation
- it reduces waiting time through:
  - queued processing
  - progress updates
  - progressive artifacts
  - artifact inventory/status visibility
  - player/client hydration paths that can use intermediate outputs when available

### 7.2 What can be safely claimed about `chunks/`

Safe claim:

- `chunks/` are the Tier 1 progressive artifact layer
- they represent ASR-side subtitle chunk availability
- they can appear earlier than final output

Important limitation:

- on Chinese trust-gated paths, public `chunks/` may be intentionally withheld until transcript trust is established

### 7.3 What can be safely claimed about `translated_batches/`

Safe claim:

- `translated_batches/` are the Tier 2 progressive translation artifact layer
- they are uploaded before `final.json` in the intended progressive design
- when they appear early enough and are observed by the client, they can support earlier subtitle readiness than waiting for the canonical final file

Important limitation:

- their observed timing depends on:
  - effective translation policy
  - trust-gated release behavior
  - benchmark polling granularity

### 7.4 What should be avoided about early playable subtitles

Avoid claiming:

- that every case always yields early playable bilingual subtitles
- that translated batches always appear substantially earlier than completion
- that the current benchmark timings are exact client-perceived readiness timestamps

Safer wording:

- “the system supports progressive subtitle artifacts and can provide earlier usable subtitle state when the effective runtime path and timing allow it”

### 7.5 How to explain cases where first translated batch appears close to completion

Recommended explanation:

- some cases show first translated batch near completion because the benchmark records the first **observed** translated-batch visibility through 3-second backend status polling
- on `after_asr` paths, translation begins only after ASR finishes
- on Chinese trust-gated paths, public release is intentionally delayed until a trusted transcript is established
- therefore a late observed first translated batch may reflect:
  - sequential `after_asr` scheduling,
  - trust-gated release,
  - or polling granularity,
  - not necessarily the absence of a progressive architecture

### 7.6 How to explain policy downgrade from `during_asr` to `after_asr`

Recommended explanation:

- the configured policy expresses a preferred scheduling mode
- the effective runtime policy is route- and trust-aware
- uncertified ASR routes are automatically downgraded to `after_asr`
- Chinese trust-gated recovery also forces `after_asr` to preserve transcript ownership and public-artifact correctness
- this downgrade is expected runtime behavior, not a failure of the queue system

---

## 8. Optional improvement suggestions

These are small, low-risk improvements that would make final benchmark evidence clearer. They were **not** implemented in this pass.

### 8.1 Export effective translation policy into backend E2E summaries

Suggested files:

- `apps/backend-api/scripts/e2e-youtube-pipeline-eval.ts`
- potentially backend media status/artifact surfaces only if already available without new contracts

Suggestion:

- include fields such as:
  - `requested_translation_start_policy`
  - `effective_translation_start_policy`
  - `auto_policy_downgraded`
  - `route`
  - `asr_provider`
  - `trust_gate_active`
  - `trust_stage`

Why useful:

- would let Chapter 3 directly correlate late translated-batch timing with policy/runtime path

### 8.2 Label timing fields as polling-observed in thesis-facing report text

Suggested file:

- `apps/backend-api/scripts/e2e-youtube-benchmark/chapter3-export.ts`

Suggestion:

- add a stronger wording cue in the generated report such as:
  - “observed via backend status polling”

Why useful:

- removes ambiguity about timestamp precision

### 8.3 Export more route-decision metadata from the AI engine into final benchmark evidence

Potential sources:

- `apps/ai-engine/src/async_pipeline.py`
- `apps/backend-api/scripts/e2e-youtube-pipeline-eval.ts`

Suggestion:

- surface a subset of `pipeline.last_run_metrics` into saved E2E summaries

Why useful:

- the information already exists in the AI engine runtime, but the current Chapter 3 package cannot see it directly in the app-path benchmark output

### 8.4 Optional smoke-run policy verification

Before the full final run, after the 2-case smoke test:

- inspect:
  - `logs/ai-engine.log`
  - per-case `evaluation.summary.json`
  - per-case `status.timeline.json`

Specifically confirm:

- English smoke case stayed on a `during_asr`-eligible route
- Chinese smoke case used the trust-gated path and therefore should not be interpreted as an overlap-style progressive translation case

---

## Bottom line

Current readiness status:

- the benchmark/export pipeline is ready to run
- the current fixture manifest is internally consistent
- current live subtitle verification suggests 18/20 cases are WER/CER-eligible under the present benchmark logic
- the biggest thesis interpretation risk is not benchmark failure, but over-claiming what `time_to_first_translated_batch_seconds` means

Most important practical conclusion:

- treat `time_to_first_translated_batch_seconds` as a **polling-observed runtime indicator**
- explain late first-batch timings using:
  - effective `after_asr` policy,
  - Chinese trust-gated release,
  - and polling granularity,
  - not as evidence that the system lacks a progressive asynchronous design
