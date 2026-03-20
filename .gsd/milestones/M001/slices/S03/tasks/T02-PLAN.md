---
estimated_steps: 5
estimated_files: 1
---

# T02: Add persistence-before-event interceptors to the live harness

**Slice:** S03 — Event and persistence discipline
**Milestone:** M001

## Description

Extend `src/scripts/test_v2_pipeline.py` so that `_prepare_live_runtime` wraps the three readiness-event publishers (`publish_chunk_ready`, `publish_batch_ready`, `publish_completed`) with interceptors that perform a synchronous MinIO `stat_object` before allowing the event to proceed. This proves at the integration level that every artifact is durably stored at the exact moment the corresponding readiness event fires — the live-infrastructure complement to the fake-only ordering tests in T01.

The interceptors must:
- Extract the MinIO object key from the event kwargs (for `publish_completed`, use `s3_key`; for chunk/batch events, look up the key from the `TracingMinioClient.uploads` list by matching index)
- Call `minio_client.client.stat_object(bucket_processed, object_key)` synchronously
- Log `[EventDiscipline] verified {object_key} exists before {event_type}`
- Append a result dict `{ "event_type", "object_key", "verified": True }` to a `persistence_checks` list
- Call the real `events_mod.publish_*` function to allow the event through
- If `stat_object` fails, raise immediately — the harness must not silently swallow a missing artifact

The `persistence_checks` list is added to the harness report JSON under the key `persistence_before_event_checks`.

**Important:** The `TracingMinioClient` instance is currently created inside `run_test` after `_prepare_live_runtime` returns. The interceptors need access to the same client instance. Refactor `_prepare_live_runtime` to accept a `persistence_checks` list and a `minio_client_holder` list (or use a closure) so that the interceptors can look up the live MinIO client and its upload records. The simplest approach: have `_prepare_live_runtime` return the `persistence_checks` list as an additional return value, and have the interceptors reference a mutable holder that `run_test` populates after creating the `TracingMinioClient`.

Presigned URLs must remain redacted in logs per KNOWLEDGE.md rules — log only the object key, never the full URL.

## Steps

1. Read the current `_prepare_live_runtime` function and `run_test` function in `apps/ai-engine/src/scripts/test_v2_pipeline.py` to understand the current wiring.

2. Add a `persistence_checks: list[dict]` and a `minio_client_holder: list[TracingMinioClient]` (initially empty) to `_prepare_live_runtime`. The holder will be populated by `run_test` after the `TracingMinioClient` is created.

3. Write interceptor wrappers for `publish_chunk_ready`, `publish_batch_ready`, and `publish_completed`:
   - For `publish_chunk_ready(*, media_id, user_id, chunk_index, url, sentence_count)`: look up the object key from `minio_client_holder[0].uploads` matching `type="chunk"` and `index=chunk_index`. Call `stat_object`. Log. Record. Call real publish.
   - For `publish_batch_ready(*, media_id, user_id, batch_index, url, segment_count, progress)`: look up object key from uploads matching `type="batch"` and `index=batch_index`. Call `stat_object`. Log. Record. Call real publish.
   - For `publish_completed(*, media_id, user_id, final_url, segment_count, source_lang, target_lang, s3_key)`: use `s3_key` directly as the object key. Call `stat_object`. Log. Record. Call real publish.

4. Patch `events_mod.publish_chunk_ready`, `events_mod.publish_batch_ready`, and the module-level `publish_completed` with the interceptors in live-infra mode. Preserve the existing fake-only path unchanged.

5. In `run_test`, after creating the `TracingMinioClient`, populate the holder: `minio_client_holder.append(minio_client)`. Add `persistence_before_event_checks: persistence_checks` to the `harness_report` dict.

6. Run `cd apps/ai-engine && ./venv/Scripts/python.exe -m src.scripts.test_v2_pipeline demo_audio_3.mp3 --lang vi --live-infra` and verify `[EventDiscipline]` log lines appear and the harness report contains `persistence_before_event_checks` with all entries `verified: true`.

## Must-Haves

- [ ] `publish_chunk_ready` interceptor verifies chunk object exists in MinIO before publishing
- [ ] `publish_batch_ready` interceptor verifies batch object exists in MinIO before publishing
- [ ] `publish_completed` interceptor verifies final object exists in MinIO before publishing
- [ ] Interceptors only activate in `--live-infra` mode; fake-only mode is unchanged
- [ ] `persistence_before_event_checks` array present in harness report JSON
- [ ] Presigned URLs are never logged — only object keys

## Verification

- `cd apps/ai-engine && ./venv/Scripts/python.exe -m src.scripts.test_v2_pipeline demo_audio_3.mp3 --lang vi --live-infra` — completes successfully with `[EventDiscipline]` verification lines in logs
- Harness report JSON at `apps/ai-engine/outputs/test_v2/*.harness.json` contains `persistence_before_event_checks` with all `verified: true`

## Observability Impact

- Signals added/changed: `[EventDiscipline] verified {object_key} exists before {event_type}` log lines during live harness runs
- How a future agent inspects this: check `persistence_before_event_checks` in any `*.harness.json` report
- Failure state exposed: if a MinIO artifact is missing at publish time, the harness raises with the exact object key and event type

## Inputs

- `apps/ai-engine/src/scripts/test_v2_pipeline.py` — existing live harness with `_prepare_live_runtime`, `TracingMinioClient`, and `run_test`
- `apps/ai-engine/tests/test_event_discipline.py` — T01's output confirming the structural ordering holds in fake mode

## Expected Output

- `apps/ai-engine/src/scripts/test_v2_pipeline.py` — modified with persistence-before-event interceptors in `_prepare_live_runtime` and `persistence_before_event_checks` in harness reports
