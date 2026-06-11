# Chapter 3 Benchmark Report

This package describes the current project as a **progressive asynchronous subtitle generation** system. It does not claim live simultaneous interpretation.

## Run Context
- Benchmark run path: C:\Users\sondo\my_projects\KMA\billingual_project\outputs\e2e-benchmarks\runs\chapter3-full-20260611-rerunmerge-FqqK8hQzPgM
- Results directory: C:\Users\sondo\my_projects\KMA\billingual_project\outputs\e2e-benchmarks\runs\chapter3-full-20260611-rerunmerge-FqqK8hQzPgM\results
- Logs directory: C:\Users\sondo\my_projects\KMA\billingual_project\outputs\e2e-benchmarks\runs\chapter3-full-20260611-rerunmerge-FqqK8hQzPgM\logs
- Command used: powershell -ExecutionPolicy Bypass -File scripts\run-e2e-youtube-pipeline.ps1 -TargetLanguage vi -PollMs 1000 -OutputDir C:\Users\sondo\my_projects\KMA\billingual_project\outputs\e2e-benchmarks\runs\chapter3-full-20260611-rerunmerge-FqqK8hQzPgM
- Command source: manifest_inferred
- Polling interval recorded for this run: 1000 ms
- Suite summary path: C:\Users\sondo\my_projects\KMA\billingual_project\outputs\e2e-benchmarks\runs\chapter3-full-20260611-rerunmerge-FqqK8hQzPgM\results\suite.summary.json

## Environment Summary
- Base URL: http://localhost:3000/api
- Target language: vi
- Started at: 2026-06-11T07:50:52.685Z
- Finished at: 2026-06-11T09:24:31.935Z
- Fixture counts from suite summary: {"total":20,"english":10,"chinese":10,"werEligible":18,"werSkipped":2}

## Dataset / Sample Summary
- Cases exported: 20
- Completed cases: 20
- Failed cases: 0
- Manual-subtitle-available cases: 18

| Family | Cases | Avg Latency (s) | Avg Ratio | Avg First Chunk (s) | Avg First Batch (s) | Avg WER | Avg CER | Cases With Final | Progressive Before Final |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| chinese | 10 | 161.251 | 0.253 | 70.333 | 84.55 | 0.247 | 0.181 | 10 | 9 |
| english | 10 | 125.288 | 0.193 | 67.714 | 67.714 | 0.036 | 0.021 | 10 | 9 |

## Performance Summary Table

All milestone timings below are observed via backend status polling. They are not exact socket, Redis, MinIO, or client-perceived timestamps, and their precision is limited by the polling interval.

| Case | Status | Duration (s) | Wall Clock (s) | Ratio | First Chunk (s) | First Batch (s) | Has Final (s) | Completed (s) |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| chinese_-MTOd9V0VPU | COMPLETED | 482 | 140.21 | 0.291 | 70.122 | 70.122 | 140.21 | 140.21 |
| chinese_60xeAEe7H28 | COMPLETED | 367 | 70.115 | 0.191 | 70.115 | 70.115 | 70.115 | 70.115 |
| chinese_8sn3YzhnprM | COMPLETED | 904 | 210.339 | 0.233 | 70.13 | 73.142 | 210.339 | 210.339 |
| chinese_FqqK8hQzPgM | COMPLETED | 762 | 210.37 | 0.276 | 70.181 | 71.187 | 210.37 | 210.37 |
| chinese_GOjlcDYurP0 | COMPLETED | 640 | 140.237 | 0.219 | 70.139 | 70.139 | 140.237 | 140.237 |
| chinese_LcUoiBwG-OA | COMPLETED | 631 | 140.233 | 0.222 | 70.128 | 70.128 | 140.233 | 140.233 |
| chinese_WA18WJmXZZE | COMPLETED | 1047 | 210.293 | 0.201 | 70.129 | 140.211 | 210.293 | 210.293 |
| chinese_Y9_-pAk3Iag | COMPLETED | 356 | 140.211 | 0.394 | 70.129 | 70.129 | 140.211 | 140.211 |
| chinese__4GSI4J-GuA | COMPLETED | 714 | 210.3 | 0.295 | 70.124 | 70.124 | 210.3 | 210.3 |
| chinese_nSeVUZDzCUY | COMPLETED | 671 | 140.202 | 0.209 | 72.132 | 140.202 | 140.202 | 140.202 |
| english_-moW9jvvMr4 | COMPLETED | 565 | 140.249 | 0.248 | 70.165 | 70.165 | 140.249 | 140.249 |
| english_4TMPXK9tw5U | COMPLETED | 691 | 139.224 | 0.201 | 69.134 | 69.134 | 139.224 | 139.224 |
| english_5MuIMqhT8DM | COMPLETED | 1158 | 139.191 | 0.12 | 69.117 | 69.117 | 139.191 | 139.191 |
| english_8KkKuTCFvzI | COMPLETED | 767 | 139.216 | 0.182 | 69.12 | 69.12 | 139.216 | 139.216 |
| english_LpSDuDIaBGk | COMPLETED | 575 | 139.209 | 0.242 | 69.129 | 69.129 | 139.209 | 139.209 |
| english_MMmOLN5zBLY | COMPLETED | 304 | 69.116 | 0.227 | 69.116 | 69.116 | 69.116 | 69.116 |
| english_WeJrU-VJGfg | COMPLETED | 893 | 138.184 | 0.155 | 61.069 | 61.069 | 138.184 | 138.184 |
| english__zfN9wnPvU0 | COMPLETED | 592 | 139.192 | 0.235 | 69.107 | 69.107 | 139.192 | 139.192 |
| english_w4rG5GY9IlA | COMPLETED | 746 | 132.16 | 0.177 | 62.077 | 62.077 | 132.16 | 132.16 |
| english_yDAAlojz8NU | COMPLETED | 553 | 77.143 | 0.139 | 69.11 | 69.11 | 77.143 | 77.143 |

## Translation Policy Summary
- Cases with parsed per-case policy metadata from ai-engine.log: 20/20
- These fields are post-processed benchmark evidence only. They do not alter final.json or mobile-facing contracts.
- trust_stage and trust_decision are left not_available in the current exporter unless future E2E evidence records them explicitly.

| Case | Metadata Source | Requested Policy | Effective Policy | Auto Downgraded | Route | ASR Provider | Trust Gate Active | Source |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| chinese_-MTOd9V0VPU | ai_engine_log | during_asr | after_asr | true | sensevoice_small | sensevoice | true | zh |
| chinese_60xeAEe7H28 | ai_engine_log | during_asr | after_asr | true | sensevoice_small | sensevoice | true | zh |
| chinese_8sn3YzhnprM | ai_engine_log | during_asr | after_asr | true | sensevoice_small | sensevoice | true | zh |
| chinese_FqqK8hQzPgM | ai_engine_log | during_asr | after_asr | true | sensevoice_small | sensevoice | true | zh |
| chinese_GOjlcDYurP0 | ai_engine_log | during_asr | after_asr | true | sensevoice_small | sensevoice | true | zh |
| chinese_LcUoiBwG-OA | ai_engine_log | during_asr | after_asr | true | sensevoice_small | sensevoice | true | zh |
| chinese_WA18WJmXZZE | ai_engine_log | during_asr | after_asr | true | sensevoice_small | sensevoice | true | zh |
| chinese_Y9_-pAk3Iag | ai_engine_log | during_asr | after_asr | true | sensevoice_small | sensevoice | true | zh |
| chinese__4GSI4J-GuA | ai_engine_log | during_asr | after_asr | true | sensevoice_small | sensevoice | true | zh |
| chinese_nSeVUZDzCUY | ai_engine_log | during_asr | after_asr | true | sensevoice_small | sensevoice | true | zh |
| english_-moW9jvvMr4 | ai_engine_log | during_asr | during_asr | false | distil_whisper_en | whisper | false | en |
| english_4TMPXK9tw5U | ai_engine_log | during_asr | during_asr | false | distil_whisper_en | whisper | false | en |
| english_5MuIMqhT8DM | ai_engine_log | during_asr | during_asr | false | distil_whisper_en | whisper | false | en |
| english_8KkKuTCFvzI | ai_engine_log | during_asr | during_asr | false | distil_whisper_en | whisper | false | en |
| english_LpSDuDIaBGk | ai_engine_log | during_asr | during_asr | false | distil_whisper_en | whisper | false | en |
| english_MMmOLN5zBLY | ai_engine_log | during_asr | during_asr | false | distil_whisper_en | whisper | false | en |
| english_WeJrU-VJGfg | ai_engine_log | during_asr | during_asr | false | distil_whisper_en | whisper | false | en |
| english__zfN9wnPvU0 | ai_engine_log | during_asr | during_asr | false | distil_whisper_en | whisper | false | en |
| english_w4rG5GY9IlA | ai_engine_log | during_asr | during_asr | false | distil_whisper_en | whisper | false | en |
| english_yDAAlojz8NU | ai_engine_log | during_asr | during_asr | false | distil_whisper_en | whisper | false | en |

## Artifact Completeness Summary Table
| Case | Chunks | Batches | Final | Segments | Empty Translation | Missing Phonetic | Invalid Timestamps | Overlaps | Schema | Progressive Before Final |
| --- | ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: | --- | --- |
| chinese_-MTOd9V0VPU | 14 | 6 | yes | 111 | 0 | 1 | 0 | 0 | valid | yes |
| chinese_60xeAEe7H28 | 8 | 4 | yes | 62 | 0 | 0 | 0 | 0 | valid | no |
| chinese_8sn3YzhnprM | 22 | 9 | yes | 176 | 0 | 5 | 0 | 0 | valid | yes |
| chinese_FqqK8hQzPgM | 16 | 7 | yes | 121 | 0 | 3 | 0 | 0 | valid | yes |
| chinese_GOjlcDYurP0 | 14 | 6 | yes | 111 | 0 | 0 | 0 | 0 | valid | yes |
| chinese_LcUoiBwG-OA | 18 | 8 | yes | 137 | 0 | 3 | 0 | 0 | valid | yes |
| chinese_WA18WJmXZZE | 28 | 11 | yes | 223 | 0 | 0 | 0 | 0 | valid | yes |
| chinese_Y9_-pAk3Iag | 10 | 5 | yes | 76 | 0 | 1 | 0 | 0 | valid | yes |
| chinese__4GSI4J-GuA | 17 | 7 | yes | 136 | 0 | 0 | 0 | 0 | valid | yes |
| chinese_nSeVUZDzCUY | 19 | 8 | yes | 146 | 0 | 5 | 0 | 0 | valid | yes |
| english_-moW9jvvMr4 | 8 | 9 | yes | 62 | 0 | 0 | 0 | 0 | valid | yes |
| english_4TMPXK9tw5U | 15 | 16 | yes | 106 | 0 | 6 | 0 | 0 | valid | yes |
| english_5MuIMqhT8DM | 17 | 18 | yes | 136 | 0 | 0 | 0 | 0 | valid | yes |
| english_8KkKuTCFvzI | 13 | 14 | yes | 97 | 0 | 4 | 0 | 0 | valid | yes |
| english_LpSDuDIaBGk | 7 | 8 | yes | 51 | 0 | 3 | 0 | 0 | valid | yes |
| english_MMmOLN5zBLY | 3 | 4 | yes | 24 | 0 | 0 | 0 | 0 | valid | no |
| english_WeJrU-VJGfg | 17 | 18 | yes | 126 | 0 | 16 | 0 | 0 | valid | yes |
| english__zfN9wnPvU0 | 7 | 8 | yes | 52 | 0 | 0 | 0 | 0 | valid | yes |
| english_w4rG5GY9IlA | 12 | 13 | yes | 91 | 0 | 3 | 0 | 0 | valid | yes |
| english_yDAAlojz8NU | 8 | 9 | yes | 57 | 0 | 0 | 0 | 0 | valid | yes |

## Transcript Quality Summary Table
| Case | WER | CER | Ref Tokens | Ref Chars | Quality Note |
| --- | ---: | ---: | ---: | ---: | --- |
| chinese_-MTOd9V0VPU | 0.626 | 0.433 | 1627 | 2541 | manual_review_required |
| chinese_60xeAEe7H28 | - | - | - | - | manual_subtitles_unavailable | reference_unavailable |
| chinese_8sn3YzhnprM | 0.617 | 0.459 | 1224 | 1873 | manual_review_required |
| chinese_FqqK8hQzPgM | 0.124 | 0.083 | 1397 | 2211 | manual_review_required |
| chinese_GOjlcDYurP0 | 0.089 | 0.095 | 1001 | 1607 | manual_review_required |
| chinese_LcUoiBwG-OA | 0.12 | 0.081 | 1089 | 1724 | manual_review_required |
| chinese_WA18WJmXZZE | 0.065 | 0.044 | 3079 | 4628 | manual_review_required |
| chinese_Y9_-pAk3Iag | 0.247 | 0.213 | 437 | 694 | manual_review_required |
| chinese__4GSI4J-GuA | 0.086 | 0.042 | 2235 | 3892 | manual_review_required |
| chinese_nSeVUZDzCUY | - | - | - | - | manual_subtitles_unavailable | reference_unavailable |
| english_-moW9jvvMr4 | 0.01 | 0.006 | 1503 | 6876 | manual_review_required |
| english_4TMPXK9tw5U | 0.01 | 0.009 | 1463 | 6287 | manual_review_required |
| english_5MuIMqhT8DM | 0.024 | 0.018 | 2657 | 12012 | manual_review_required |
| english_8KkKuTCFvzI | 0.015 | 0.008 | 1722 | 7713 | manual_review_required |
| english_LpSDuDIaBGk | 0.014 | 0.007 | 1440 | 6545 | manual_review_required |
| english_MMmOLN5zBLY | 0.027 | 0.018 | 716 | 3717 | manual_review_required |
| english_WeJrU-VJGfg | 0.068 | 0.048 | 2564 | 10796 | manual_review_required |
| english__zfN9wnPvU0 | 0.048 | 0.017 | 1570 | 7053 | manual_review_required |
| english_w4rG5GY9IlA | 0.076 | 0.047 | 1672 | 7682 | manual_review_required |
| english_yDAAlojz8NU | 0.069 | 0.035 | 1313 | 6171 | manual_review_required |

## Progressive Artifact Evidence Summary
- Cases with inferable progressive artifacts before final completion: 18/20
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
