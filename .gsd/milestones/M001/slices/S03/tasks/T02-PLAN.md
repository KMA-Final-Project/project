---
estimated_steps: 5
estimated_files: 1
---

# T02: Add persistence-before-event interceptors to the live harness

**Slice:** S03 — Event and persistence discipline
**Milestone:** M001

## Description

**[OVERRIDE APPLIED]:** Task skipped to conserve AI requests per `.gsd/OVERRIDES.md`. The user will handle manual testing and verification. This task and slice are considered complete without further automated testing.

## Steps

- [x] Task skipped by user override.

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
