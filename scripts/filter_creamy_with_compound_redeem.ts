/**
 * Filter CreamY candidate hashes for those with BOTH CreamY pool log
 * AND Compound cUSDC Redeem event in the same receipt — i.e., the
 * Panel C complete cycle pattern (CreamY swap → Compound redeem).
 *
 * These are the only candidates where the ERM cycle disjunct can possibly
 * fire (the disjunct requires a Lending Withdraw/Redeem edge whose target
 * matches a prior swap output).
 */
import * as fs from "fs";
import * as path from "path";

const CREAMY_POOL = "0x1d09144f3479bb805cb7c92346987420bcbdc10c";
const CUSDC = "0x39aa39c021dfbae8fac545936693ac917d5e7563";

// Compound cToken Redeem event topic0
// keccak256("Redeem(address,uint256,uint256)")
const REDEEM_TOPIC0 = "0xe5b754fb1abb7f01b499791d0b820ae3b6af3424ac1c59768edb53f4ec31a929";

const CACHE_DIR = path.join(__dirname, "../cache/receipts");

interface FilterResult {
  hash: string;
  has_creamy_log: boolean;
  has_cusdc_log: boolean;
  has_cusdc_redeem: boolean;
  block?: number;
}

function checkReceipt(hash: string): FilterResult | null {
  const file = path.join(CACHE_DIR, `${hash.slice(2)}.json`);
  if (!fs.existsSync(file)) return null;
  try {
    const r = JSON.parse(fs.readFileSync(file, "utf-8"));
    const logs = r.logs || [];
    let has_creamy = false, has_cusdc = false, has_cusdc_redeem = false;
    for (const log of logs) {
      const addr = (log.address || "").toLowerCase();
      if (addr === CREAMY_POOL) has_creamy = true;
      if (addr === CUSDC) {
        has_cusdc = true;
        const t0 = (log.topics?.[0] || "").toLowerCase();
        if (t0 === REDEEM_TOPIC0) has_cusdc_redeem = true;
      }
    }
    return {
      hash,
      has_creamy_log: has_creamy,
      has_cusdc_log: has_cusdc,
      has_cusdc_redeem,
      block: Number(r.blockNumber),
    };
  } catch {
    return null;
  }
}

async function main() {
  const heavy = JSON.parse(fs.readFileSync(
    path.join(__dirname, "../wiki/raw/creamy_pool_heavy_candidates.json"), "utf-8"
  )).candidate_hashes as string[];
  console.log(`Filtering ${heavy.length} CreamY pool candidates for Compound Redeem...`);

  const results: FilterResult[] = [];
  let cached = 0, uncached = 0;
  for (const h of heavy) {
    const r = checkReceipt(h);
    if (r) {
      results.push(r);
      cached++;
    } else {
      uncached++;
    }
  }
  console.log(`Receipts available in cache: ${cached}, uncached: ${uncached}`);

  const withCycle = results.filter(r => r.has_creamy_log && r.has_cusdc_redeem);
  const withCusdcLog = results.filter(r => r.has_creamy_log && r.has_cusdc_log);
  const cusdcOnlyTransfers = withCusdcLog.length - withCycle.length;
  console.log(`\n=== Filter Results ===`);
  console.log(`CreamY log + cUSDC Redeem event:        ${withCycle.length}  (Panel C complete cycle)`);
  console.log(`CreamY log + cUSDC log (no Redeem):    ${cusdcOnlyTransfers}  (token transfer only, no redeem)`);
  console.log(`CreamY log only (no cUSDC interact):   ${results.length - withCusdcLog.length}`);

  // Sort by block ascending so paper-window selection is deterministic
  withCycle.sort((a, b) => (a.block || 0) - (b.block || 0));
  console.log(`\nFirst 20 hashes with complete CreamY+Compound Redeem cycle:`);
  withCycle.slice(0, 20).forEach((r, i) =>
    console.log(`  ${i + 1}. ${r.hash} (block ${r.block})`)
  );

  const outFile = path.join(__dirname, "../artifacts/creamy_compound_redeem_filtered.json");
  fs.writeFileSync(outFile, JSON.stringify({
    generated_at: new Date().toISOString(),
    source: "wiki/raw/creamy_pool_heavy_candidates.json",
    total_candidates: heavy.length,
    receipts_cached: cached,
    creamy_with_compound_redeem: withCycle.length,
    creamy_with_cusdc_log_no_redeem: cusdcOnlyTransfers,
    creamy_only_no_cusdc: results.length - withCusdcLog.length,
    panel_c_cycle_hashes: withCycle.map(r => ({ hash: r.hash, block: r.block })),
  }, null, 2));
  console.log(`\nSaved -> ${outFile}`);
}

main().catch(e => { console.error(e); process.exit(1); });
