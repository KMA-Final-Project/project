---
id: T01
parent: S02
milestone: M001
provides:
  - Serialized contract tests for Tier 1 chunk artifacts, Tier 2 translated batch artifacts, and canonical final.json output
  - Canonical MinIO artifact key helpers for chunk, batch, and final uploads
  - Explicit field-presence checks for sentence defaults and final metadata invariants
key_files:
  - apps/ai-engine/tests/test_streaming_contracts.py
  - apps/ai-engine/src/minio_client.py
  - apps/ai-engine/src/schemas.py
  - apps/ai-engine/ARCHITECTURE_CONTEXT.md
key_decisions:
  - "Froze the durable contract at the serialized MinIO payload boundary so drift breaks on real artifact shapes, not on inferred consumer assumptions."
patterns_established:
  - "Use one authoritative contract test file plus canonical MinIO key helpers to freeze artifact shape and path conventions together."
observability_surfaces:
  - cd apps/ai-engine && ./venv/Scripts/python.exe -m pytest tests/test_streaming_contracts.py -q
duration: 45m
verification_result: passed
completed_at: 2026-03-20T14:57:45Z
blocker_discovered: false
---

# T01: Freeze artifact shapes with contract tests

**Replaced the loose two-tier sketch with serialized contract checks for chunk, batch, and final artifacts.**

## What Happened

This task pulled the durable artifact contract into one place instead of leaving it split across `schemas.py`, `minio_client.py`, and older light-touch tests. I added canonical MinIO key helpers for chunk, translated-batch, and final uploads, then wrote `tests/test_streaming_contracts.py` around the actual JSON payloads written by the upload methods.

The new test file freezes the intentional asymmetries directly: Tier 1 chunks serialize as a top-level `Sentence[]`, Tier 2 batches serialize as `{ batch_index, segments }`, and `final.json` is the only artifact that carries `metadata`. It also makes the field-presence rules explicit: sentence-level `translation`, `phonetic`, and `detected_lang` must always exist as strings even when empty, while `Word.phoneme` is allowed to stay `null`.

I also retired the older `test_two_tier_streaming.py` file and updated `ARCHITECTURE_CONTEXT.md` so future agents have one authoritative contract verification surface instead of overlapping sketches.

## Verification

Ran the focused contract test file and a regression check for the worker-boundary proof from S01. The new tests validate the serialized payload shape, metadata requirements, and MinIO key conventions instead of checking only model defaults.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `cd apps/ai-engine && ./venv/Scripts/python.exe -m pytest tests/test_streaming_contracts.py -q` | 0 | PASS | 0.46s |
| 2 | `cd apps/ai-engine && ./venv/Scripts/python.exe -m pytest tests/test_first_batch_streaming.py -q` | 0 | PASS | 53.52s |

## Diagnostics

Run `cd apps/ai-engine && ./venv/Scripts/python.exe -m pytest tests/test_streaming_contracts.py -q` to inspect the durable artifact contract later. The most useful failures are now missing required fields, wrong top-level shape, or wrong MinIO key conventions.

## Deviations

Retired `apps/ai-engine/tests/test_two_tier_streaming.py` and updated `apps/ai-engine/ARCHITECTURE_CONTEXT.md` so the contract has one authoritative test surface.

## Known Issues

None.

## Files Created/Modified

- `apps/ai-engine/tests/test_streaming_contracts.py` — authoritative serialized contract checks for chunk, batch, and final artifact payloads
- `apps/ai-engine/src/minio_client.py` — canonical artifact key helpers used by the upload paths
- `apps/ai-engine/src/schemas.py` — clarified output-facing field expectations for durable artifacts
- `apps/ai-engine/ARCHITECTURE_CONTEXT.md` — updated the handoff diagnostics to point at the new contract test surface
- `apps/ai-engine/tests/test_two_tier_streaming.py` — removed after replacement by the focused contract test file
