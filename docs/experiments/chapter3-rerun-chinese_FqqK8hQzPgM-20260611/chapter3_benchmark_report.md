# Chapter 3 Benchmark Report

This package describes the current project as a **progressive asynchronous subtitle generation** system. It does not claim live simultaneous interpretation.

## Run Context
- Benchmark run path: C:\Users\sondo\my_projects\KMA\billingual_project\outputs\e2e-benchmarks\runs\chapter3-rerun-chinese_FqqK8hQzPgM-20260611
- Results directory: C:\Users\sondo\my_projects\KMA\billingual_project\outputs\e2e-benchmarks\runs\chapter3-rerun-chinese_FqqK8hQzPgM-20260611\results
- Logs directory: C:\Users\sondo\my_projects\KMA\billingual_project\outputs\e2e-benchmarks\runs\chapter3-rerun-chinese_FqqK8hQzPgM-20260611\logs
- Command used: powershell -ExecutionPolicy Bypass -File scripts\run-e2e-youtube-pipeline.ps1 -CaseIds chinese_FqqK8hQzPgM -TargetLanguage vi -PollMs 1000 -OutputDir C:\Users\sondo\my_projects\KMA\billingual_project\outputs\e2e-benchmarks\runs\chapter3-rerun-chinese_FqqK8hQzPgM-20260611
- Command source: manifest_inferred
- Polling interval recorded for this run: 1000 ms
- Suite summary path: C:\Users\sondo\my_projects\KMA\billingual_project\outputs\e2e-benchmarks\runs\chapter3-rerun-chinese_FqqK8hQzPgM-20260611\results\suite.summary.json

## Environment Summary
- Base URL: http://localhost:3000/api
- Target language: vi
- Started at: 2026-06-11T09:40:42.761Z
- Finished at: 2026-06-11T09:48:32.370Z
- Fixture counts from suite summary: {"total":1,"english":0,"chinese":1,"werEligible":1,"werSkipped":0}

## Dataset / Sample Summary
- Cases exported: 1
- Completed cases: 1
- Failed cases: 0
- Manual-subtitle-available cases: 1

| Family | Cases | Avg Latency (s) | Avg Ratio | Avg First Chunk (s) | Avg First Batch (s) | Avg WER | Avg CER | Cases With Final | Progressive Before Final |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| chinese | 1 | 210.37 | 0.276 | 70.181 | 71.187 | 0.124 | 0.083 | 1 | 1 |

## Performance Summary Table

All milestone timings below are observed via backend status polling. They are not exact socket, Redis, MinIO, or client-perceived timestamps, and their precision is limited by the polling interval.

| Case | Status | Duration (s) | Wall Clock (s) | Ratio | First Chunk (s) | First Batch (s) | Has Final (s) | Completed (s) |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| chinese_FqqK8hQzPgM | COMPLETED | 762 | 210.37 | 0.276 | 70.181 | 71.187 | 210.37 | 210.37 |

## Translation Policy Summary
- Cases with parsed per-case policy metadata from ai-engine.log: 1/1
- These fields are post-processed benchmark evidence only. They do not alter final.json or mobile-facing contracts.
- trust_stage and trust_decision are left not_available in the current exporter unless future E2E evidence records them explicitly.

| Case | Metadata Source | Requested Policy | Effective Policy | Auto Downgraded | Route | ASR Provider | Trust Gate Active | Source |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| chinese_FqqK8hQzPgM | ai_engine_log | during_asr | after_asr | true | sensevoice_small | sensevoice | true | zh |

## Artifact Completeness Summary Table
| Case | Chunks | Batches | Final | Segments | Empty Translation | Missing Phonetic | Invalid Timestamps | Overlaps | Schema | Progressive Before Final |
| --- | ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: | --- | --- |
| chinese_FqqK8hQzPgM | 16 | 7 | yes | 121 | 0 | 3 | 0 | 0 | valid | yes |

## Transcript Quality Summary Table
| Case | WER | CER | Ref Tokens | Ref Chars | Quality Note |
| --- | ---: | ---: | ---: | ---: | --- |
| chinese_FqqK8hQzPgM | 0.124 | 0.083 | 1397 | 2211 | manual_review_required |

## Progressive Artifact Evidence Summary
- Cases with inferable progressive artifacts before final completion: 1/1
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
