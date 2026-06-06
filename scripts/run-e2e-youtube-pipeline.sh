#!/usr/bin/env bash
# ============================================================
# run-e2e-youtube-pipeline.sh — macOS/Linux E2E pipeline runner
#
# Equivalent of run-e2e-youtube-pipeline.ps1 for Unix systems.
#
# Usage:
#   ./scripts/run-e2e-youtube-pipeline.sh
#   ./scripts/run-e2e-youtube-pipeline.sh --case-id english_-moW9jvvMr4
#   ./scripts/run-e2e-youtube-pipeline.sh --case-id english_-moW9jvvMr4,chinese_WA18WJmXZZE
#   ./scripts/run-e2e-youtube-pipeline.sh --target-language zh
#   ./scripts/run-e2e-youtube-pipeline.sh --output-dir outputs/e2e-benchmarks/runs/my-run
#   ./scripts/run-e2e-youtube-pipeline.sh --keep-processes
# ============================================================

set -euo pipefail

# ── Parse arguments ──────────────────────────────────────────

CASE_IDS=""
TARGET_LANGUAGE="vi"
OUTPUT_DIR=""
KEEP_PROCESSES=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --case-id)
      CASE_IDS="$2"
      shift 2
      ;;
    --target-language)
      TARGET_LANGUAGE="$2"
      shift 2
      ;;
    --output-dir)
      OUTPUT_DIR="$2"
      shift 2
      ;;
    --keep-processes)
      KEEP_PROCESSES=true
      shift
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

# ── Resolve paths ────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKEND_PATH="$REPO_ROOT/apps/backend-api"
AI_ENGINE_PATH="$REPO_ROOT/apps/ai-engine"
PYTHON_PATH="$AI_ENGINE_PATH/.venv/bin/python"
NODE_SCRIPT="$SCRIPT_DIR/manage-infra.mjs"

# ── Validate prerequisites ───────────────────────────────────

if ! command -v node &>/dev/null; then
  echo "Error: Node.js is required." >&2
  exit 1
fi
if ! command -v pnpm &>/dev/null; then
  echo "Error: pnpm is required." >&2
  exit 1
fi
if [[ ! -f "$PYTHON_PATH" ]]; then
  echo "Error: AI engine Python interpreter not found at $PYTHON_PATH" >&2
  exit 1
fi
if ! command -v ffmpeg &>/dev/null; then
  echo "Error: ffmpeg is required (brew install ffmpeg)." >&2
  exit 1
fi
if ! command -v yt-dlp &>/dev/null; then
  echo "Error: yt-dlp is required (pip3 install yt-dlp)." >&2
  exit 1
fi

# Ensure AI Engine .env matches the current platform
AI_ENV="$AI_ENGINE_PATH/.env"
AI_ENV_MAC="$AI_ENGINE_PATH/.env.mac"
if [[ "$(uname)" == "Darwin" ]] && [[ -f "$AI_ENV_MAC" ]]; then
  current_device=$(grep "^DEVICE=" "$AI_ENV" 2>/dev/null | cut -d= -f2 || echo "")
  if [[ "$current_device" == "cuda" ]]; then
    echo "==> macOS detected — applying .env.mac (DEVICE=cpu)"
    cp "$AI_ENV_MAC" "$AI_ENV"
  fi
fi

# ── Set up output directories ────────────────────────────────

TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
if [[ -z "$OUTPUT_DIR" ]]; then
  OUTPUT_DIR="$REPO_ROOT/outputs/e2e-benchmarks/runs/$TIMESTAMP"
elif [[ "$OUTPUT_DIR" != /* ]]; then
  OUTPUT_DIR="$REPO_ROOT/$OUTPUT_DIR"
fi

LOGS_DIR="$OUTPUT_DIR/logs"
RESULTS_DIR="$OUTPUT_DIR/results"
mkdir -p "$LOGS_DIR" "$RESULTS_DIR"

BACKEND_LOG="$LOGS_DIR/backend-api.log"
BACKEND_ERR="$LOGS_DIR/backend-api.err.log"
WORKER_LOG="$LOGS_DIR/backend-worker.log"
WORKER_ERR="$LOGS_DIR/backend-worker.err.log"
AI_LOG="$LOGS_DIR/ai-engine.log"
AI_ERR="$LOGS_DIR/ai-engine.err.log"

# ── Process tracking ─────────────────────────────────────────

PIDS=()

cleanup() {
  if [[ ${#PIDS[@]} -eq 0 ]]; then
    return
  fi

  if [[ "$KEEP_PROCESSES" == true ]]; then
    echo ""
    echo "Processes left running (--keep-processes):"
    for pid in "${PIDS[@]}"; do
      if kill -0 "$pid" 2>/dev/null; then
        echo "  PID $pid"
      fi
    done
    return
  fi

  echo ""
  echo "Stopping background processes..."
  for pid in "${PIDS[@]}"; do
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
    fi
  done
  sleep 2
  for pid in "${PIDS[@]}"; do
    if kill -0 "$pid" 2>/dev/null; then
      kill -9 "$pid" 2>/dev/null || true
    fi
  done
  echo "All processes stopped."
}

trap cleanup EXIT

start_logged_process() {
  local cmd="$1"
  shift
  local workdir="$1"
  shift
  local stdout="$1"
  shift
  local stderr="$1"
  shift

  pushd "$workdir" > /dev/null
  "$cmd" "$@" >"$stdout" 2>"$stderr" &
  local pid=$!
  popd > /dev/null
  echo "$pid"
}

wait_for_api() {
  local url="$1"
  local timeout="${2:-90}"
  local deadline=$((SECONDS + timeout))

  echo "Waiting for API at $url (timeout: ${timeout}s)..."
  while ((SECONDS < deadline)); do
    if curl -s -o /dev/null -w "%{http_code}" --max-time 5 "$url" 2>/dev/null | grep -qE '^[23]'; then
      echo "API is ready."
      return 0
    fi
    sleep 2
  done

  echo "Error: Timed out waiting for API readiness at $url" >&2
  exit 1
}

check_processes() {
  for pid in "${PIDS[@]}"; do
    if ! kill -0 "$pid" 2>/dev/null; then
      echo "Error: A required process (PID $pid) exited early. Check logs under $LOGS_DIR" >&2
      exit 1
    fi
  done
}

# ── Main ─────────────────────────────────────────────────────

# Kill any stale processes on required ports
echo "==> Cleaning up stale processes"
for port in 3000; do
  stale_pids=$(lsof -ti :$port 2>/dev/null || true)
  if [[ -n "$stale_pids" ]]; then
    echo "  Killing stale process on port $port: $stale_pids"
    echo "$stale_pids" | xargs kill -9 2>/dev/null || true
    sleep 1
  fi
done

for pattern in \
  "$BACKEND_PATH/dist/src/worker.js" \
  "$AI_ENGINE_PATH/.venv/bin/python -m src.main"
do
  stale_pids=$(pgrep -f "$pattern" 2>/dev/null || true)
  if [[ -n "$stale_pids" ]]; then
    echo "  Killing stale worker process for pattern '$pattern': $stale_pids"
    echo "$stale_pids" | xargs kill -9 2>/dev/null || true
    sleep 1
  fi
done

echo "==> Bringing up local infra"
node "$NODE_SCRIPT" up

echo "==> Building backend"
(cd "$BACKEND_PATH" && pnpm build)

echo "==> Starting backend API"
BACKEND_PID=$(start_logged_process \
  "node" "$BACKEND_PATH" "$BACKEND_LOG" "$BACKEND_ERR" \
  dist/src/main.js)
PIDS+=("$BACKEND_PID")
echo "  Backend API PID: $BACKEND_PID"

echo "==> Starting backend worker"
WORKER_PID=$(start_logged_process \
  "node" "$BACKEND_PATH" "$WORKER_LOG" "$WORKER_ERR" \
  dist/src/worker.js)
PIDS+=("$WORKER_PID")
echo "  Backend Worker PID: $WORKER_PID"

echo "==> Starting AI engine"
AI_PID=$(start_logged_process \
  "$PYTHON_PATH" "$AI_ENGINE_PATH" "$AI_LOG" "$AI_ERR" \
  -m src.main)
PIDS+=("$AI_PID")
echo "  AI Engine PID: $AI_PID"

wait_for_api "http://localhost:3000/api/docs" 90
sleep 5

check_processes

echo "==> Running E2E evaluator"
EVAL_ARGS=(
  "exec" "tsx" "scripts/e2e-youtube-pipeline-eval.ts"
  "--output-dir" "$RESULTS_DIR"
  "--target-language" "$TARGET_LANGUAGE"
)

if [[ -n "$CASE_IDS" ]]; then
  IFS=',' read -ra CASE_ARRAY <<< "$CASE_IDS"
  for case_id in "${CASE_ARRAY[@]}"; do
    EVAL_ARGS+=("--case-id" "$(echo "$case_id" | xargs)")
  done
fi

(cd "$BACKEND_PATH" && pnpm "${EVAL_ARGS[@]}")

# ── Write run manifest ──────────────────────────────────────

cat > "$OUTPUT_DIR/run.manifest.json" <<EOF
{
  "startedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "outputDir": "$OUTPUT_DIR",
  "logsDir": "$LOGS_DIR",
  "resultsDir": "$RESULTS_DIR",
  "caseIds": "$(echo "$CASE_IDS" | sed 's/,/","/g')",
  "targetLanguage": "$TARGET_LANGUAGE",
  "backendPid": $BACKEND_PID,
  "workerPid": $WORKER_PID,
  "aiEnginePid": $AI_PID
}
EOF

echo ""
echo "============================================"
echo "E2E run complete."
echo "Logs:    $LOGS_DIR"
echo "Results: $RESULTS_DIR"
echo "============================================"
