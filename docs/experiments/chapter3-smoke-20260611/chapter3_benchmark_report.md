# Chapter 3 Benchmark Report

This package describes the current project as a **progressive asynchronous subtitle generation** system. It does not claim live simultaneous interpretation.

## Run Context
- Benchmark run path: C:\Users\sondo\my_projects\KMA\billingual_project\outputs\e2e-benchmarks\runs\chapter3-smoke-20260611
- Results directory: C:\Users\sondo\my_projects\KMA\billingual_project\outputs\e2e-benchmarks\runs\chapter3-smoke-20260611\results
- Logs directory: C:\Users\sondo\my_projects\KMA\billingual_project\outputs\e2e-benchmarks\runs\chapter3-smoke-20260611\logs
- Command used: powershell -ExecutionPolicy Bypass -File scripts\run-e2e-youtube-pipeline.ps1 -CaseIds english_-moW9jvvMr4,chinese__4GSI4J-GuA -TargetLanguage vi -PollMs 1000 -OutputDir C:\Users\sondo\my_projects\KMA\billingual_project\outputs\e2e-benchmarks\runs\chapter3-smoke-20260611
- Command source: manifest_inferred
- Polling interval recorded for this run: 1000 ms
- Suite summary path: C:\Users\sondo\my_projects\KMA\billingual_project\outputs\e2e-benchmarks\runs\chapter3-smoke-20260611\results\suite.summary.json

## Environment Summary
- Base URL: http://localhost:3000/api
- Target language: vi
- Started at: 2026-06-11T07:35:27.955Z
- Finished at: 2026-06-11T07:47:31.528Z
- Fixture counts from suite summary: {"total":2,"english":1,"chinese":1,"werEligible":2,"werSkipped":0}

## Dataset / Sample Summary
- Cases exported: 2
- Completed cases: 2
- Failed cases: 0
- Manual-subtitle-available cases: 2

| Family | Cases | Avg Latency (s) | Avg Ratio | Avg First Chunk (s) | Avg First Batch (s) | Avg WER | Avg CER | Cases With Final | Progressive Before Final |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| chinese | 1 | 210.33 | 0.295 | 70.151 | 76.184 | 0.086 | 0.042 | 1 | 1 |
| english | 1 | 140.26 | 0.248 | 70.17 | 70.17 | 0.01 | 0.006 | 1 | 1 |

## Performance Summary Table

All milestone timings below are observed via backend status polling. They are not exact socket, Redis, MinIO, or client-perceived timestamps, and their precision is limited by the polling interval.

| Case | Status | Duration (s) | Wall Clock (s) | Ratio | First Chunk (s) | First Batch (s) | Has Final (s) | Completed (s) |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| chinese__4GSI4J-GuA | COMPLETED | 714 | 210.33 | 0.295 | 70.151 | 76.184 | 210.33 | 210.33 |
| english_-moW9jvvMr4 | COMPLETED | 565 | 140.26 | 0.248 | 70.17 | 70.17 | 140.26 | 140.26 |

## Translation Policy Summary
- Cases with parsed per-case policy metadata from ai-engine.log: 2/2
- These fields are post-processed benchmark evidence only. They do not alter final.json or mobile-facing contracts.
- trust_stage and trust_decision are left not_available in the current exporter unless future E2E evidence records them explicitly.

| Case | Metadata Source | Requested Policy | Effective Policy | Auto Downgraded | Route | ASR Provider | Trust Gate Active | Source |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| chinese__4GSI4J-GuA | ai_engine_log | during_asr | after_asr | true | sensevoice_small | sensevoice | true | zh |
| english_-moW9jvvMr4 | ai_engine_log | during_asr | during_asr | false | distil_whisper_en | whisper | false | en |

## Artifact Completeness Summary Table
| Case | Chunks | Batches | Final | Segments | Empty Translation | Missing Phonetic | Invalid Timestamps | Overlaps | Schema | Progressive Before Final |
| --- | ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: | --- | --- |
| chinese__4GSI4J-GuA | 17 | 7 | yes | 136 | 0 | 0 | 0 | 0 | valid | yes |
| english_-moW9jvvMr4 | 8 | 9 | yes | 62 | 0 | 0 | 0 | 0 | valid | yes |

## Transcript Quality Summary Table
| Case | WER | CER | Ref Tokens | Ref Chars | Quality Note |
| --- | ---: | ---: | ---: | ---: | --- |
| chinese__4GSI4J-GuA | 0.086 | 0.042 | 2235 | 3892 | manual_review_required |
| english_-moW9jvvMr4 | 0.01 | 0.006 | 1503 | 6876 | manual_review_required |

## Progressive Artifact Evidence Summary
- Cases with inferable progressive artifacts before final completion: 2/2
- This exporter infers progressive evidence from polling-observed evaluator milestones and saved status timelines.
- progressive_artifacts_before_final is not a direct socket, Redis, MinIO, or client playback timestamp comparison.
- Because the current E2E harness uses polling, these timings are useful but not exact socket-delivery timestamps.

## Manual Translation Review Instructions
- Review the generated CSV at `chapter3_manual_translation_review.csv`.
- The exporter includes the first 5 available segments per case from `final.json`, or `translated_batch.first.json` when final output is unavailable.
- Fill the score columns manually using a consistent 1-5 rubric.
- Do not auto-claim translation quality improvements unless supported by manual review or a reliable reference-based metric.

## Failures and Limitations
- Failed cases are preserved in the Chapter 3 package when the run bundle contains their saved status/artifact files.
- CER becomes not_available when normalized reference or hypothesis text is absent.
- Timestamp validity counts are heuristic checks over saved final segments.
- Schema validation issues found: none
- This package does not claim model training, fine-tuning, production HA, or live simultaneous interpretation.

## Recommended Chapter 3 Tables
- System runtime path table
- Dataset/sample inventory table
- End-to-end latency table
- Artifact generation/completeness table
- Transcript quality table
- Manual translation review table

## Recommended Screenshots / Figures To Capture
- Processing screen with progress and current step
- MinIO or artifact inventory showing chunks/, translated_batches/, and final.json
- Mobile player using bilingual subtitles
- Word lookup / explain popup if available
