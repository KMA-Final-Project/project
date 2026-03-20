---
estimated_steps: 5
estimated_files: 1
---

# T02: Add persistence-before-event interceptors to the live harness

**Slice:** S03 — Event and persistence discipline
**Milestone:** M001

## Description

**[OVERRIDE APPLIED]:** Per `.gsd/OVERRIDES.md`, this task does not require further AI-run testing or verification. The milestone may finish without additional automated proof, and any runtime confirmation is deferred to manual user follow-up.

## Steps

- [x] Task skipped by user override.

## Must-Haves

- If this surface is revisited later, `publish_chunk_ready`, `publish_batch_ready`, and `publish_completed` should only be wrapped in live/manual inspection mode
- Fake-only mode should remain unchanged
- Any report field such as `persistence_before_event_checks` is optional implementation support, not a required gate for milestone completion under the override
- Presigned URLs must never be logged; only object keys may appear in diagnostics

## Verification

- Skip automated verification for this task under `.gsd/OVERRIDES.md`
- If the user later wants confirmation, they can manually run the live harness and inspect any emitted event-discipline logs or harness report fields themselves

## Observability Impact

- Optional runtime signal if the user chooses to inspect later: `[EventDiscipline] verified {object_key} exists before {event_type}`
- Optional inspection surface: `persistence_before_event_checks` in a harness report, if present
- Desired failure surface for manual follow-up: the missing object key and event type should be explicit

## Inputs

- `apps/ai-engine/src/scripts/test_v2_pipeline.py` — existing live harness with `_prepare_live_runtime`, `TracingMinioClient`, and `run_test`
- `apps/ai-engine/tests/test_event_discipline.py` — T01's output confirming the structural ordering holds in fake mode

## Expected Output

- `apps/ai-engine/src/scripts/test_v2_pipeline.py` — any interceptor support kept as an optional manual-inspection surface rather than a required automated gate
