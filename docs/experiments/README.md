# Experiments

This folder holds thesis-oriented experiment notes and exported benchmark evidence.

## Run A Subset Benchmark

From repository root:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\run-e2e-youtube-pipeline.ps1 `
  -CaseIds english_-moW9jvvMr4,chinese_60xeAEe7H28 `
  -PollMs 1000 `
  -OutputDir outputs\e2e-benchmarks\runs\chapter3-subset
```

## Run The Full Benchmark

From repository root:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\run-e2e-youtube-pipeline.ps1 `
  -PollMs 1000 `
  -OutputDir outputs\e2e-benchmarks\runs\chapter3-full
```

## Export Chapter 3 Evidence From A Saved Run

From `apps/backend-api`:

```powershell
pnpm exec tsx scripts/export-chapter3-benchmark.ts `
  --run-dir ..\..\outputs\e2e-benchmarks\runs\chapter3-subset `
  --out-dir ..\..\docs\experiments
```

Equivalent package script:

```powershell
pnpm export:chapter3 -- --run-dir ..\..\outputs\e2e-benchmarks\runs\chapter3-subset --out-dir ..\..\docs\experiments
```

Optional flags:

- `--manual-review-limit 10`
- `--command "powershell -ExecutionPolicy Bypass -File scripts\run-e2e-youtube-pipeline.ps1 -CaseIds english_-moW9jvvMr4,chinese_60xeAEe7H28 -OutputDir outputs\e2e-benchmarks\runs\chapter3-subset"`

## Exported Files

The Chapter 3 exporter writes:

- `chapter3_results.json`
- `chapter3_cases.csv`
- `chapter3_performance_metrics.csv`
- `chapter3_policy_metrics.csv`
- `chapter3_artifact_metrics.csv`
- `chapter3_quality_metrics.csv`
- `chapter3_manual_translation_review.csv`
- `chapter3_benchmark_report.md`
- `chapter3_evidence_index.md`

The exporter reads an existing benchmark run bundle. It does not rerun the benchmark and does not change model behavior.

Timing milestones in the report and CSV outputs are polling-observed: they come from backend status polling, not exact socket, Redis, MinIO, or client-perceived timestamps. Precision depends on the polling interval used for the run.
