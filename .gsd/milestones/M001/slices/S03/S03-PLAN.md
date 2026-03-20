# S03: Event and persistence discipline

**Goal:** Readiness events (`chunk_ready`, `batch_ready`, `completed`) only fire after the corresponding artifacts are durably persisted in MinIO, and failure events only fire after status is recorded. This discipline is mechanically proven at both the fake-only and live-infrastructure levels.
**Demo:** `pytest tests/test_event_discipline.py` passes proving call ordering, and the live harness `--live-infra` run logs a successful MinIO re-read for every readiness event before allowing the publish to proceed.

## Must-Haves

- Fake-only tests prove `upload_chunk` strictly precedes `publish_chunk_ready`, `upload_translated_batch` strictly precedes `publish_batch_ready`, `upload_final_result` strictly precedes `publish_completed`, and `update_media_status(status="FAILED")` strictly precedes `publish_failed`
- Live harness interceptors perform a synchronous MinIO `stat_object` inside the publish wrapper, proving the artifact is fetchable at the exact moment the readiness event fires
- Progress events (`publish_progress`) remain unblocked and are not gated on persistence — only availability events are disciplined
- Failure path proof: the worker exception handler records `status=FAILED` before publishing the failed event

## Proof Level

- This slice proves: contract + integration
- Real runtime required: yes (live harness exercises real MinIO/Redis)
- Human/UAT required: no

## Verification

- `cd apps/ai-engine && ./venv/Scripts/python.exe -m pytest tests/test_event_discipline.py -v` — all ordering assertions pass
- `cd apps/ai-engine && ./venv/Scripts/python.exe -m pytest tests/test_first_batch_streaming.py tests/test_streaming_contracts.py -q` — existing tests still pass (no regressions)
- `cd apps/ai-engine && ./venv/Scripts/python.exe -m src.scripts.test_v2_pipeline demo_audio_3.mp3 --lang vi --live-infra` — harness logs persistence-before-event verification for every readiness event and includes results in the saved harness report

## Observability / Diagnostics

- Runtime signals: each intercepted publish logs `[EventDiscipline] verified {object_key} exists before {event_type}` at the moment of assertion
- Inspection surfaces: harness report JSON includes `persistence_before_event_checks` array with per-event verification results
- Failure visibility: if a MinIO stat fails inside the interceptor, the harness raises immediately with the missing object key and event type
- Redaction constraints: presigned MinIO URLs must remain redacted per KNOWLEDGE.md rules

## Integration Closure

- Upstream surfaces consumed: `apps/ai-engine/src/async_pipeline.py` (upload→publish sequences), `apps/ai-engine/src/main.py` (final upload→completed, failure→publish_failed), `apps/ai-engine/src/scripts/test_v2_pipeline.py` (live harness infrastructure)
- New wiring introduced in this slice: event interceptors in `_prepare_live_runtime` that wrap publish functions with synchronous MinIO verification
- What remains before the milestone is truly usable end-to-end: S04 partial-availability playback contract, S05 end-to-end worker proof

## Tasks

- [ ] **T01: Add fake-only deterministic tests for upload-before-publish call ordering** `est:45m`
  - Why: Mechanically proves the structural discipline that `async_pipeline.py` and `main.py` call upload functions before their corresponding publish functions, locking the ordering so future changes cannot accidentally invert it without breaking the test suite.
  - Files: `apps/ai-engine/tests/test_event_discipline.py`
  - Do: Write a new test file with monkeypatched recorders on upload and publish functions inside `src.async_pipeline` and `src.main`. For each success-path event (`chunk_ready`, `batch_ready`, `completed`), assert the corresponding upload call index is strictly less than the publish call index. For the failure path, simulate a pipeline exception in `process_job()` and assert `update_media_status(status="FAILED")` precedes `publish_failed`. Reuse the existing `FakePipeline`, `FakeMinioClient`, and `FakeNMT` patterns from `test_first_batch_streaming.py`. Important: monkeypatch on the `src.async_pipeline` and `src.main` module references, not on the `src.events` module directly, so the recorded sequence reflects the real call sites.
  - Verify: `cd apps/ai-engine && ./venv/Scripts/python.exe -m pytest tests/test_event_discipline.py -v`
  - Done when: All ordering tests pass and existing test files (`test_first_batch_streaming.py`, `test_streaming_contracts.py`) still pass.

- [ ] **T02: Add persistence-before-event interceptors to the live harness** `est:45m`
  - Why: Proves against real infrastructure that MinIO artifacts are durably stored at the exact moment each readiness event fires, completing the integration-level proof for D002.
  - Files: `apps/ai-engine/src/scripts/test_v2_pipeline.py`
  - Do: In `_prepare_live_runtime`, wrap `events_mod.publish_chunk_ready`, `events_mod.publish_batch_ready`, and `events_mod.publish_completed` with interceptors. Each interceptor must: (1) extract the `object_key` or `url` from the event kwargs, (2) derive the MinIO object key, (3) call `minio_client.client.stat_object(bucket, object_key)` synchronously to prove the artifact exists, (4) log the verification, (5) record the result into a `persistence_checks` list, (6) call the real publish function. The `TracingMinioClient` instance must be created before the interceptors are wired (requires a small refactor of the factory pattern in `_prepare_live_runtime` to return a closure that captures the client). Add the `persistence_checks` list to the harness report JSON under `persistence_before_event_checks`. For `publish_completed`, the object key is the `s3_key` kwarg. For `publish_chunk_ready` and `publish_batch_ready`, derive the key from the `url` or use the `TracingMinioClient.uploads` list to find the last matching upload's `object_key`.
  - Verify: `cd apps/ai-engine && ./venv/Scripts/python.exe -m src.scripts.test_v2_pipeline demo_audio_3.mp3 --lang vi --live-infra` — look for `[EventDiscipline]` log lines and `persistence_before_event_checks` in the harness report
  - Done when: Live harness run completes with every readiness event verified, and the harness report includes the `persistence_before_event_checks` array with all entries showing `verified: true`.

## Files Likely Touched

- `apps/ai-engine/tests/test_event_discipline.py`
- `apps/ai-engine/src/scripts/test_v2_pipeline.py`
