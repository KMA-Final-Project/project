# S03: Event and persistence discipline

**Goal:** Event/persistence discipline remains part of the engine contract, but under `.gsd/OVERRIDES.md` the milestone no longer requires additional AI-run live verification before completion. The slice should preserve the already-established fake-only ordering proof and leave any further runtime confirmation to manual user follow-up.
**Demo:** Review the completed fake-only ordering proof from T01 and the implementation surfaces intended for live-harness interception. Do not run new automated verification loops; if runtime confirmation is needed later, the user handles it manually.

## Must-Haves

- The structural rule remains unchanged: `upload_chunk` precedes `publish_chunk_ready`, `upload_translated_batch` precedes `publish_batch_ready`, `upload_final_result` precedes `publish_completed`, and `update_media_status(status="FAILED")` precedes `publish_failed`
- Any live-harness persistence checks are an optional manual inspection surface, not a required AI-run gate for milestone completion
- Progress events (`publish_progress`) remain unblocked and are not gated on persistence — only availability events are disciplined
- Failure-path behavior still records `status=FAILED` before publishing the failed event

## Proof Level

- This slice proves: contract/implementation alignment under the override
- Real runtime required: no for agent completion
- Human/UAT required: yes, if the user wants runtime confirmation later

## Verification

- No further AI-run verification should be performed for this slice under `.gsd/OVERRIDES.md`
- If a future human verification pass is desired, inspect `apps/ai-engine/src/scripts/test_v2_pipeline.py` manually and let the user run any live harness checks themselves

## Observability / Diagnostics

- Existing inspection surface: `apps/ai-engine/tests/test_event_discipline.py` remains the cheap historical proof for structural ordering from T01
- Optional runtime inspection surface: live harness logging/report fields may still exist in `apps/ai-engine/src/scripts/test_v2_pipeline.py`, but they are not required to be re-run by the agent
- Failure visibility still matters: if runtime checks are ever exercised manually, missing artifacts should surface with the object key and event type
- Redaction constraints: presigned MinIO URLs must remain redacted per KNOWLEDGE.md rules

## Integration Closure

- Upstream surfaces consumed: `apps/ai-engine/src/async_pipeline.py` (upload→publish sequences), `apps/ai-engine/src/main.py` (final upload→completed, failure→publish_failed), `apps/ai-engine/src/scripts/test_v2_pipeline.py` (optional manual harness surface)
- New wiring introduced in this slice should remain implementation-only unless the user explicitly chooses to run manual verification
- What remains before later milestones: Backend and Mobile can consume the engine-side discipline assumptions without requiring additional AI-run proof loops here

## Tasks

- [x] **T01: Add fake-only deterministic tests for upload-before-publish call ordering** `est:45m`
  - Why: Mechanically proves the structural discipline that `async_pipeline.py` and `main.py` call upload functions before their corresponding publish functions, locking the ordering so future changes cannot accidentally invert it without breaking the test suite.
  - Files: `apps/ai-engine/tests/test_event_discipline.py`
  - Do: Write a new test file with monkeypatched recorders on upload and publish functions inside `src.async_pipeline` and `src.main`. For each success-path event (`chunk_ready`, `batch_ready`, `completed`), assert the corresponding upload call index is strictly less than the publish call index. For the failure path, simulate a pipeline exception in `process_job()` and assert `update_media_status(status="FAILED")` precedes `publish_failed`. Reuse the existing `FakePipeline`, `FakeMinioClient`, and `FakeNMT` patterns from `test_first_batch_streaming.py`. Important: monkeypatch on the `src.async_pipeline` and `src.main` module references, not on the `src.events` module directly, so the recorded sequence reflects the real call sites.
  - Verify: `cd apps/ai-engine && ./venv/Scripts/python.exe -m pytest tests/test_event_discipline.py -v`
  - Done when: All ordering tests pass and existing test files (`test_first_batch_streaming.py`, `test_streaming_contracts.py`) still pass.

- [x] **T02: Add persistence-before-event interceptors to the live harness** `est:45m`
  - Why: Proves against real infrastructure that MinIO artifacts are durably stored. Since we are conserving AI requests, we will just implement the core logic for the interceptors and skip the exhaustive live harness testing loop. The user will test manually.
  - Files: `apps/ai-engine/src/scripts/test_v2_pipeline.py`
  - Do: Wrap the publish functions with interceptors that extract the object key and call `stat_object`. Log the result. Don't run the live infra test in a loop.
  - Verify: Skip automated verification.
  - Done when: Code is written and looks logically sound.
  - **OVERRIDE**: Skipped to conserve AI requests. Consider this complete.

## Files Likely Touched

- `apps/ai-engine/tests/test_event_discipline.py`
- `apps/ai-engine/src/scripts/test_v2_pipeline.py`
