# Chapter 3 Benchmark Report

This package describes the current project as a **progressive asynchronous subtitle generation** system. It does not claim live simultaneous interpretation.

## Run Context
- Benchmark run path: C:\Users\sondo\my_projects\KMA\billingual_project\outputs\e2e-benchmarks\runs\full-20260527-chinese-fix-rerun3
- Results directory: C:\Users\sondo\my_projects\KMA\billingual_project\outputs\e2e-benchmarks\runs\full-20260527-chinese-fix-rerun3\results
- Logs directory: C:\Users\sondo\my_projects\KMA\billingual_project\outputs\e2e-benchmarks\runs\full-20260527-chinese-fix-rerun3\logs
- Command used: powershell -ExecutionPolicy Bypass -File scripts\run-e2e-youtube-pipeline.ps1 -TargetLanguage vi -OutputDir C:\Users\sondo\my_projects\KMA\billingual_project\outputs\e2e-benchmarks\runs\full-20260527-chinese-fix-rerun3
- Command source: manifest_inferred
- Suite summary path: C:\Users\sondo\my_projects\KMA\billingual_project\outputs\e2e-benchmarks\runs\full-20260527-chinese-fix-rerun3\results\suite.summary.json

## Environment Summary
- Base URL: http://localhost:3000/api
- Target language: vi
- Started at: 2026-05-27T06:23:41.091Z
- Finished at: 2026-05-27T07:25:53.715Z
- Fixture counts from suite summary: {"total":20,"english":10,"chinese":10,"werEligible":15,"werSkipped":5}

## Dataset / Sample Summary
- Cases exported: 20
- Completed cases: 20
- Failed cases: 0
- Manual-subtitle-available cases: 15

| Family | Cases | Avg Latency (s) | Avg Ratio | Avg First Chunk (s) | Avg First Batch (s) | Avg WER | Avg CER | Cases With Final | Progressive Before Final |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| chinese | 10 | 97.033 | 0.192 | 83.514 | 89.819 | 0.129 | 0.103 | 10 | 5 |
| english | 10 | 96.426 | 0.153 | 31.86 | 85.612 | 0.036 | 0.021 | 10 | 8 |

## Performance Summary Table
| Case | Status | Duration (s) | Wall Clock (s) | Ratio | First Chunk (s) | First Batch (s) | Has Final (s) | Completed (s) |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| chinese_60xeAEe7H28 | COMPLETED | 367 | 90.114 | 0.246 | 90.114 | 90.114 | 90.114 | 90.114 |
| chinese_FqqK8hQzPgM | COMPLETED | 762 | 108.179 | 0.142 | 90.143 | 90.143 | 108.179 | 108.179 |
| chinese_GOjlcDYurP0 | COMPLETED | 640 | 90.128 | 0.141 | 90.128 | 90.128 | 90.128 | 90.128 |
| chinese_LcUoiBwG-OA | COMPLETED | 631 | 90.126 | 0.143 | 90.126 | 90.126 | 90.126 | 90.126 |
| chinese_SM7KMMQQ9yE | COMPLETED | 432 | 90.116 | 0.209 | 90.116 | 90.116 | 90.116 | 90.116 |
| chinese_WA18WJmXZZE | COMPLETED | 1047 | 117.158 | 0.112 | 90.117 | 90.117 | 117.158 | 117.158 |
| chinese_Y9_-pAk3Iag | COMPLETED | 356 | 90.127 | 0.253 | 90.127 | 90.127 | 90.127 | 90.127 |
| chinese_iKzN26XbOnI | COMPLETED | 277 | 90.113 | 0.325 | 27.065 | 90.113 | 90.113 | 90.113 |
| chinese_kUzay3X1maA | COMPLETED | 526 | 105.144 | 0.2 | 87.103 | 87.103 | 105.144 | 105.144 |
| chinese_nSeVUZDzCUY | COMPLETED | 671 | 99.121 | 0.148 | 90.104 | 90.104 | 99.121 | 99.121 |
| english_-moW9jvvMr4 | COMPLETED | 565 | 90.155 | 0.16 | 21.08 | 90.155 | 90.155 | 90.155 |
| english_4TMPXK9tw5U | COMPLETED | 691 | 105.149 | 0.152 | 21.048 | 87.118 | 105.149 | 105.149 |
| english_5MuIMqhT8DM | COMPLETED | 1158 | 87.104 | 0.075 | 87.104 | 87.104 | 87.104 | 87.104 |
| english_8KkKuTCFvzI | COMPLETED | 767 | 87.127 | 0.114 | 18.046 | 87.127 | 87.127 | 87.127 |
| english_LpSDuDIaBGk | COMPLETED | 575 | 87.12 | 0.152 | 21.05 | 87.12 | 87.12 | 87.12 |
| english_MMmOLN5zBLY | COMPLETED | 304 | 87.106 | 0.287 | 15.037 | 87.106 | 87.106 | 87.106 |
| english_WeJrU-VJGfg | COMPLETED | 893 | 177.212 | 0.198 | 21.055 | 87.105 | 177.212 | 177.212 |
| english__zfN9wnPvU0 | COMPLETED | 592 | 87.1 | 0.147 | 24.05 | 87.1 | 87.1 | 87.1 |
| english_w4rG5GY9IlA | COMPLETED | 746 | 87.107 | 0.117 | 21.052 | 87.107 | 87.107 | 87.107 |
| english_yDAAlojz8NU | COMPLETED | 553 | 69.076 | 0.125 | 69.076 | 69.076 | 69.076 | 69.076 |

## Artifact Completeness Summary Table
| Case | Chunks | Batches | Final | Segments | Empty Translation | Missing Phonetic | Invalid Timestamps | Overlaps | Schema | Progressive Before Final |
| --- | ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: | --- | --- |
| chinese_60xeAEe7H28 | 8 | 4 | yes | 62 | 0 | 0 | 0 | 0 | valid | no |
| chinese_FqqK8hQzPgM | 16 | 7 | yes | 121 | 0 | 3 | 0 | 0 | valid | yes |
| chinese_GOjlcDYurP0 | 14 | 6 | yes | 111 | 0 | 0 | 0 | 0 | valid | no |
| chinese_LcUoiBwG-OA | 18 | 8 | yes | 137 | 0 | 3 | 0 | 0 | valid | no |
| chinese_SM7KMMQQ9yE | 7 | 4 | yes | 51 | 0 | 0 | 0 | 0 | valid | no |
| chinese_WA18WJmXZZE | 28 | 11 | yes | 223 | 0 | 0 | 0 | 0 | valid | yes |
| chinese_Y9_-pAk3Iag | 10 | 5 | yes | 76 | 0 | 1 | 0 | 0 | valid | no |
| chinese_iKzN26XbOnI | 7 | 4 | yes | 54 | 0 | 0 | 0 | 0 | valid | yes |
| chinese_kUzay3X1maA | 15 | 7 | yes | 113 | 0 | 4 | 0 | 0 | valid | yes |
| chinese_nSeVUZDzCUY | 19 | 8 | yes | 146 | 0 | 5 | 0 | 0 | valid | yes |
| english_-moW9jvvMr4 | 8 | 9 | yes | 62 | 0 | 0 | 0 | 0 | valid | yes |
| english_4TMPXK9tw5U | 15 | 16 | yes | 106 | 0 | 6 | 0 | 0 | valid | yes |
| english_5MuIMqhT8DM | 17 | 18 | yes | 136 | 0 | 0 | 0 | 0 | valid | no |
| english_8KkKuTCFvzI | 13 | 14 | yes | 97 | 0 | 4 | 0 | 0 | valid | yes |
| english_LpSDuDIaBGk | 7 | 8 | yes | 51 | 0 | 3 | 0 | 0 | valid | yes |
| english_MMmOLN5zBLY | 3 | 4 | yes | 24 | 0 | 0 | 0 | 0 | valid | yes |
| english_WeJrU-VJGfg | 17 | 18 | yes | 125 | 0 | 15 | 0 | 0 | valid | yes |
| english__zfN9wnPvU0 | 7 | 8 | yes | 52 | 0 | 0 | 0 | 0 | valid | yes |
| english_w4rG5GY9IlA | 12 | 13 | yes | 91 | 0 | 3 | 0 | 0 | valid | yes |
| english_yDAAlojz8NU | 8 | 9 | yes | 57 | 0 | 0 | 0 | 0 | valid | no |

## Transcript Quality Summary Table
| Case | WER | CER | Ref Tokens | Ref Chars | Quality Note |
| --- | ---: | ---: | ---: | ---: | --- |
| chinese_60xeAEe7H28 | - | - | - | - | manual_subtitles_unavailable | reference_unavailable |
| chinese_FqqK8hQzPgM | 0.124 | 0.083 | 1397 | 2211 | manual_review_required |
| chinese_GOjlcDYurP0 | 0.089 | 0.095 | 1001 | 1607 | manual_review_required |
| chinese_LcUoiBwG-OA | 0.12 | 0.081 | 1089 | 1724 | manual_review_required |
| chinese_SM7KMMQQ9yE | - | - | - | - | manual_subtitles_unavailable | reference_unavailable |
| chinese_WA18WJmXZZE | 0.065 | 0.044 | 3079 | 4628 | manual_review_required |
| chinese_Y9_-pAk3Iag | 0.247 | 0.213 | 437 | 694 | manual_review_required |
| chinese_iKzN26XbOnI | - | - | - | - | manual_subtitles_unavailable | reference_unavailable |
| chinese_kUzay3X1maA | - | - | - | - | manual_subtitles_unavailable | reference_unavailable |
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
- Cases with inferable progressive artifacts before final completion: 13/20
- This exporter infers progressive evidence from saved evaluator milestones and status timelines.
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
