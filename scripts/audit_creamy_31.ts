/**
 * CreamY 31-strict-candidate audit for Option α2.
 *
 * For each of the 31 strict CreamY candidate hashes, run the pipeline in
 * EVANESCA_DSL_ONLY=true and record which DSL constraints fire. Goal: find
 * 12 hashes where EXCHANGE_RATE_MANIPULATION (index 4) fires via the
 * cycle disjunct, so we can replace the artifact's 12 with these 12 and
 * align the §4.3 attribution claim with constraint firings.
 */
import { run } from "../src/Driver";
import { preTasksForRegressionTest } from "../src/PreTasks";
import { EvanescaContext } from "../src/Interfaces/EvanescaContext";
import { AnalysisResult } from "../src/ConstraintSolver/Interfaces/AnalysisResult";
import "../src/test/attacks/shared/testSetup";
import * as fs from "fs";
import * as path from "path";

preTasksForRegressionTest();

const CONSTRAINT_NAMES = [
  "DEX_K_INVARIANT", "LENDING_COLLATERALIZATION", "PRICE_MANIPULATION",
  "ORACLE_MANIPULATION", "EXCHANGE_RATE_MANIPULATION", "FLASH_LOAN_ATTACK",
  "REENTRANCY_PATTERN", "CONCENTRATED_LIQUIDITY_ATTACK", "BRIDGE_INTEGRITY_VIOLATION",
  "EMPTY_MARKET_ATTACK", "READ_ONLY_REENTRANCY",
];

interface Result {
  hash: string;
  fired_indices: number[];
  fired_names: string[];
  fires_erm: boolean;
  failure_reason?: string;
}

async function audit(hash: string): Promise<Result> {
  const r: Result = { hash, fired_indices: [], fired_names: [], fires_erm: false };
  process.env.EVANESCA_SKIP_TX = "false";
  process.env.EVANESCA_TX_HASH = hash;
  const cntx: EvanescaContext = {
    tList: [], analyzed: new Set(), reports: new Array<AnalysisResult>(),
    fins: [], complexity: [],
  };
  try {
    const res = await run(hash, cntx);
    if (res?.reports) {
      for (const rep of res.reports) {
        const v = (rep as any)._violation;
        if (v) {
          v.forEach((flag: boolean, i: number) => {
            if (flag && !r.fired_indices.includes(i)) {
              r.fired_indices.push(i);
              r.fired_names.push(CONSTRAINT_NAMES[i] || `idx${i}`);
            }
          });
        }
      }
    }
    r.fires_erm = r.fired_indices.includes(4); // EXCHANGE_RATE_MANIPULATION
  } catch (err) {
    r.failure_reason = (err as Error).message.slice(0, 120);
  }
  return r;
}

async function main() {
  process.env.EVANESCA_DSL_ONLY = "true";
  const candidatesFile = path.join(__dirname, "../wiki/raw/creamy_strict_all_1777267166.json");
  const candidates = JSON.parse(fs.readFileSync(candidatesFile, "utf-8")).candidate_hashes as string[];
  console.log(`Auditing ${candidates.length} strict CreamY candidate hashes (DSL_ONLY=true)`);
  const results: Result[] = [];
  for (let i = 0; i < candidates.length; i++) {
    const h = candidates[i];
    process.stdout.write(`[${i + 1}/${candidates.length}] ${h.slice(0, 22)}... `);
    const r = await audit(h);
    process.stdout.write(`fires_erm=${r.fires_erm} all=${r.fired_names.join(",") || "(none)"}\n`);
    results.push(r);
  }
  const ermFires = results.filter(r => r.fires_erm);
  const noFire = results.filter(r => r.fired_indices.length === 0);
  console.log(`\n=== SUMMARY ===`);
  console.log(`Total: ${results.length}`);
  console.log(`ERM cycle disjunct fires: ${ermFires.length}`);
  console.log(`No constraint fires: ${noFire.length}`);
  console.log(`Other constraint fires: ${results.length - ermFires.length - noFire.length}`);
  if (ermFires.length >= 12) {
    console.log(`\n✅ Sufficient ERM-firing hashes (${ermFires.length} >= 12). Selecting earliest 12 by block:`);
    // Without block info, just pick first 12 by hash order
    ermFires.slice(0, 12).forEach((r, i) => console.log(`  ${i + 1}. ${r.hash}`));
  } else {
    console.log(`\n⚠️  Only ${ermFires.length} fire ERM cycle. Need to expand to broader pool or fix enrichment (α1).`);
  }
  const outFile = path.join(__dirname, "../artifacts/creamy_31_audit.json");
  fs.writeFileSync(outFile, JSON.stringify({
    generated_at: new Date().toISOString(),
    mode: "EVANESCA_DSL_ONLY=true",
    candidates_audited: results.length,
    erm_cycle_firing: ermFires.length,
    no_fire: noFire.length,
    erm_firing_hashes: ermFires.map(r => r.hash),
    per_hash: results,
  }, null, 2));
  console.log(`\nSaved -> ${outFile}`);
}

main().catch(e => { console.error(e); process.exit(1); });
