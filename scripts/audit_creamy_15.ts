/**
 * Quick audit of 15 hashes from the 139 Panel-C complete-cycle pool.
 * Goal: confirm whether ERM cycle disjunct fires uniformly (=> α2 viable)
 * or rarely (=> enrichment bug, must do α1).
 */
import { run } from "../src/Driver";
import { preTasksForRegressionTest } from "../src/PreTasks";
import { EvanescaContext } from "../src/Interfaces/EvanescaContext";
import { AnalysisResult } from "../src/ConstraintSolver/Interfaces/AnalysisResult";
import "../src/test/attacks/shared/testSetup";
import * as fs from "fs";
import * as path from "path";

preTasksForRegressionTest();

const NAMES = [
  "DEX_K_INVARIANT", "LENDING_COLLATERALIZATION", "PRICE_MANIPULATION",
  "ORACLE_MANIPULATION", "EXCHANGE_RATE_MANIPULATION", "FLASH_LOAN_ATTACK",
  "REENTRANCY_PATTERN", "CONCENTRATED_LIQUIDITY_ATTACK", "BRIDGE_INTEGRITY_VIOLATION",
  "EMPTY_MARKET_ATTACK", "READ_ONLY_REENTRANCY",
];

async function audit(hash: string) {
  process.env.EVANESCA_SKIP_TX = "false";
  process.env.EVANESCA_TX_HASH = hash;
  const cntx: EvanescaContext = {
    tList: [], analyzed: new Set(), reports: new Array<AnalysisResult>(),
    fins: [], complexity: [],
  };
  const fired = new Set<string>();
  try {
    const res = await run(hash, cntx);
    if (res?.reports) {
      for (const rep of res.reports) {
        const v = (rep as any)._violation;
        if (v) {
          v.forEach((flag: boolean, i: number) => {
            if (flag && NAMES[i]) fired.add(NAMES[i]);
          });
        }
      }
    }
  } catch (e) {
    return { hash, fired: [], err: (e as Error).message.slice(0, 80) };
  }
  return { hash, fired: Array.from(fired), err: undefined };
}

async function main() {
  process.env.EVANESCA_DSL_ONLY = "true";
  const data = JSON.parse(fs.readFileSync(
    path.join(__dirname, "../artifacts/creamy_compound_redeem_filtered.json"), "utf-8"
  ));
  const hashes = data.panel_c_cycle_hashes.slice(0, 15).map((x: any) => x.hash) as string[];
  console.log(`Auditing ${hashes.length} from Panel-C complete-cycle pool`);
  const out: any[] = [];
  for (let i = 0; i < hashes.length; i++) {
    process.stdout.write(`[${i + 1}/${hashes.length}] ${hashes[i].slice(0, 18)}... `);
    const r = await audit(hashes[i]);
    process.stdout.write(`erm=${r.fired.includes("EXCHANGE_RATE_MANIPULATION")} fired=[${r.fired.join(",")}]\n`);
    out.push(r);
  }
  const erm = out.filter(r => r.fired.includes("EXCHANGE_RATE_MANIPULATION"));
  console.log(`\nERM cycle fires: ${erm.length}/${hashes.length}`);
  fs.writeFileSync(
    path.join(__dirname, "../artifacts/creamy_15_quick_audit.json"),
    JSON.stringify({ generated_at: new Date().toISOString(), erm_fires: erm.length, total: hashes.length, per_hash: out }, null, 2)
  );
}

main().catch(e => { console.error(e); process.exit(1); });
