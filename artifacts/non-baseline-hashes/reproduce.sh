#!/usr/bin/env bash
#
# reproduce.sh - re-derive the non-baseline tx hash artifact from scratch.
# Requires: Ethereum archive-node RPC, Etherscan v2 API key, ts-node, npm install.
#
# Usage:
#   ETHERSCAN_API_KEY=... ./reproduce.sh                # discover candidates + run pipeline
#   ETHERSCAN_API_KEY=... ./reproduce.sh verify <hash>  # re-verify a single hash

set -eu

cd "$(dirname "$0")/../.."

if [ "${1:-}" = "verify" ]; then
  hash="${2:-}"
  if [ -z "$hash" ]; then echo "usage: reproduce.sh verify <0xtxhash>"; exit 1; fi
  cat > /tmp/_one.json <<EOF
{ "candidate_hashes": ["$hash"] }
EOF
  EVANESCA_DSL_ONLY=true CANDIDATE_FILE=/tmp/_one.json MAX_TXS=1 \
    npx ts-node scripts/run_tend_candidates.ts | tail -20
  exit 0
fi

echo "[1/4] Token-side candidates: TEND, WING"
TARGET_INDEX=0 MIN_TRANSFERS=2 npx ts-node scripts/find_tend_attacks.ts
TARGET_INDEX=2 MIN_TRANSFERS=2 npx ts-node scripts/find_tend_attacks.ts

echo "[2/4] Attacker-side candidates: Pendle, CreamY"
npx ts-node scripts/build_panel_bd_candidates.ts

echo "[3/4] CreamY pool tokentx heavy candidates"
python3 scripts/build_creamy_heavy.py 2>/dev/null || true

echo "[4/4] Run pipeline (DSL_ONLY) per candidate file"
for f in wiki/raw/tend_candidate_hashes_*.json \
         wiki/raw/wing-cb3df_candidate_hashes_*.json \
         wiki/raw/pendle_panel_b_candidates.json \
         wiki/raw/creamy_pool_heavy_candidates.json; do
  [ -f "$f" ] || continue
  EVANESCA_DSL_ONLY=true CANDIDATE_FILE="$f" MAX_TXS=10000 \
    npx ts-node scripts/run_tend_candidates.ts 2>&1 | tail -10
done

echo "Reproduction complete. Compare PM hashes to artifacts/non-baseline-hashes/master.json."
