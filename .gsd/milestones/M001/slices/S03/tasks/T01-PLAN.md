---
estimated_steps: 4
estimated_files: 1
---

# T01: Add fake-only deterministic tests for upload-before-publish call ordering

**Slice:** S03 — Event and persistence discipline
**Milestone:** M001

## Description

Write `tests/test_event_discipline.py` with fake-only tests that mechanically prove the AI Engine's structural discipline: upload functions are always called before their corresponding publish functions, and failure status is recorded before the failed event is published.

This test file monkeypatches upload and publish functions inside `src.async_pipeline` and `src.main` to record a global call sequence, then asserts strict ordering. It reuses the fake patterns already established in `test_first_batch_streaming.py` (FakePipeline, FakeMinioClient, FakeNMT, etc.) — import or copy those fakes as appropriate.

The existing test files `test_first_batch_streaming.py` and `test_streaming_contracts.py` already cover batch-before-final ordering and contract shapes. This file covers a different surface: the exact interleaving of upload and publish calls.

## Steps

1. Read `apps/ai-engine/tests/test_first_batch_streaming.py` to understand the existing fake classes and monkeypatch patterns. The executor should reuse the same FakePipeline/FakeMinioClient/FakeNMT approach.

2. Create `apps/ai-engine/tests/test_event_discipline.py`. Define a shared `CallRecorder` class that wraps any callable and appends `(label, args, kwargs)` to a shared list on each call. This is the sequencing mechanism — every monkeypatched function appends to the same list, and ordering assertions compare list indices.

3. Write `test_upload_before_publish_chunk_ready`: monkeypatch `src.async_pipeline`'s `publish_chunk_ready` and the `FakeMinioClient.upload_chunk` method to record calls. Run the async pipeline with fakes. Assert that every `upload_chunk` call index is strictly less than the corresponding `publish_chunk_ready` call index (matched by chunk_index).

4. Write `test_upload_before_publish_batch_ready`: same pattern for `upload_translated_batch` → `publish_batch_ready` (matched by batch_index).

5. Write `test_upload_final_before_publish_completed`: exercise `main.process_job()` with fakes (same approach as `test_worker_process_persists_batch_before_final_completion` in the existing test file). Record both `upload_final_result` and `publish_completed`. Assert `upload_final_result` precedes `publish_completed` in the call sequence.

6. Write `test_failed_status_before_publish_failed`: exercise `main.process_job()` with a FakePipeline whose aligner raises an exception. Monkeypatch `src.main.update_media_status` and `src.main.publish_failed` to record calls. Assert that the `update_media_status(status="FAILED")` call precedes the `publish_failed` call. Also assert that `publish_failed` is actually called (not silently swallowed).

7. Run `cd apps/ai-engine && ./venv/Scripts/python.exe -m pytest tests/test_event_discipline.py -v` and confirm all tests pass.

8. Run `cd apps/ai-engine && ./venv/Scripts/python.exe -m pytest tests/test_first_batch_streaming.py tests/test_streaming_contracts.py -q` to confirm no regressions.

## Must-Haves

- [ ] `upload_chunk` strictly precedes `publish_chunk_ready` for every chunk index
- [ ] `upload_translated_batch` strictly precedes `publish_batch_ready` for every batch index
- [ ] `upload_final_result` strictly precedes `publish_completed`
- [ ] `update_media_status(status="FAILED")` strictly precedes `publish_failed`
- [ ] All four ordering tests pass deterministically
- [ ] Existing test files (`test_first_batch_streaming.py`, `test_streaming_contracts.py`) still pass

## Verification

- `cd apps/ai-engine && ./venv/Scripts/python.exe -m pytest tests/test_event_discipline.py -v` — all tests pass
- `cd apps/ai-engine && ./venv/Scripts/python.exe -m pytest tests/test_first_batch_streaming.py tests/test_streaming_contracts.py -q` — no regressions

## Inputs

- `apps/ai-engine/tests/test_first_batch_streaming.py` — reuse fake classes and monkeypatch patterns
- `apps/ai-engine/src/async_pipeline.py` — the upload→publish sequences under test
- `apps/ai-engine/src/main.py` — the final-upload→completed and failure→publish_failed sequences under test
- `apps/ai-engine/src/events.py` — publish function signatures to match when recording

## Expected Output

- `apps/ai-engine/tests/test_event_discipline.py` — new test file with 4+ ordering tests covering chunk, batch, final, and failure paths
