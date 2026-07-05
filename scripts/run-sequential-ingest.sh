#!/bin/bash
set -e

# ==========================================
# CONFIGURATION
# ==========================================
RPS=10
CONCURRENCY=5
OUTPUT_BASE="large-scale-ingest"
SCRIPT="src/VerificationTools/runLargeScaleIngest.ts"
COMPLETED_LOG="${OUTPUT_BASE}/completed.log"

# Ensure completed log exists
mkdir -p "$OUTPUT_BASE"
touch "$COMPLETED_LOG"

# ==========================================
# HELPER FUNCTION
# ==========================================
run_quarter() {
  YEAR=$1
  QUARTER=$2
  START_BLOCK=$3
  END_BLOCK=$4

  DIR_NAME="${YEAR}-${QUARTER}"
  OUTPUT_DIR="${OUTPUT_BASE}/${DIR_NAME}"
  CHECKPOINT="${OUTPUT_DIR}/checkpoint.json"
  LOG_FILE="ingest-${DIR_NAME}.log"

  echo "------------------------------------------------"
  echo "Checking ${DIR_NAME} (${START_BLOCK} ~ ${END_BLOCK})"

  # 1. Check global completion log first (survives directory deletion)
  if grep -q "^${DIR_NAME}$" "$COMPLETED_LOG" 2>/dev/null; then
    echo "✅ ${DIR_NAME} already recorded in completed.log. Skipping."
    return
  fi

  # 2. Check checkpoint inside quarter directory
  if [ -f "$CHECKPOINT" ]; then
    LAST_BLOCK=$(grep -o '"lastBlock": [0-9]*' "$CHECKPOINT" | awk '{print $2}')

    if [ "$LAST_BLOCK" -ge "$END_BLOCK" ]; then
      echo "✅ ${DIR_NAME} is already complete (Last: $LAST_BLOCK). Recording & skipping."
      echo "${DIR_NAME}" >> "$COMPLETED_LOG"
      return
    fi

    echo "🔄 Resuming ${DIR_NAME} from checkpoint (Last: $LAST_BLOCK)..."
    MODE_FLAG="--resume"
  else
    echo "🚀 Starting ${DIR_NAME} from scratch..."
    MODE_FLAG="--start ${START_BLOCK} --end ${END_BLOCK}"
  fi

  # Execute Ingest
  CMD="npx ts-node --transpile-only $SCRIPT \
    --output $OUTPUT_DIR \
    --rps $RPS \
    --concurrency $CONCURRENCY \
    $MODE_FLAG"

  echo "Running: $CMD"
  $CMD 2>&1 | tee -a $LOG_FILE

  # Record completion in global log
  echo "${DIR_NAME}" >> "$COMPLETED_LOG"
  echo "✅ ${DIR_NAME} Finished!"
  sleep 5
}

echo "=========================================="
echo "Full Sequential Ingest (2023 - 2025)"
echo "RPS: $RPS | Concurrency: $CONCURRENCY"
echo "=========================================="

# ==========================================
# 2023 (Historical)
# ==========================================
run_quarter "2023" "q1" 16308190 16988000
run_quarter "2023" "q2" 16988001 17600000
run_quarter "2023" "q3" 17600001 18200000
run_quarter "2023" "q4" 18200001 18908890

# ==========================================
# 2024 (Historical)
# ==========================================
# Block times are approx 12s.
run_quarter "2024" "q1" 18908891 19560000
run_quarter "2024" "q2" 19560001 20210000
run_quarter "2024" "q3" 20210001 20860000
run_quarter "2024" "q4" 20860001 21510000

# ==========================================
# 2025 (Projected/Historical)
# ==========================================
run_quarter "2025" "q1" 21510001 22160000
run_quarter "2025" "q2" 22160001 22810000
run_quarter "2025" "q3" 22810001 23460000
run_quarter "2025" "q4" 23460001 24120000

echo "=========================================="
echo "🎉 ALL TARGETS (2023-2025) COMPLETED!"
echo "=========================================="
