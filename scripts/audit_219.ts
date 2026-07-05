/**
 * Forensic audit of the 219 public-release defect hashes.
 * For each hash: confirm receipt available, in paper window, the relevant
 * defect-family contracts are present in the logs, and the pipeline still
 * fires PRICE_MANIPULATION end-to-end.
 */
import { run } from "../src/Driver";
import { preTasksForRegressionTest } from "../src/PreTasks";
import { EvanescaContext } from "../src/Interfaces/EvanescaContext";
import { AnalysisResult } from "../src/ConstraintSolver/Interfaces/AnalysisResult";
import "../src/test/attacks/shared/testSetup";
import * as fs from "fs";
import * as path from "path";

preTasksForRegressionTest();

const PAPER_START = 9193266;
const PAPER_END = 21368000;

const TEND_TOKEN = "0x1453Dbb8A29551adE11D89825CA812e05317EaEB".toLowerCase();
const WING_TOKEN = "0xcB3df3108635932D912632ef7132d03EcFC39080".toLowerCase();
const CREAMY_POOL = "0x1D09144F3479bb805CB7c92346987420BcbDC10C".toLowerCase();
const YYCRV = "0x5dbcF33D8c2E976c6b560249878e6F1491Bca25c".toLowerCase();
const CUSDC = "0x39aa39c021dfbae8fac545936693ac917d5e7563".toLowerCase();

interface AuditEntry {
  hash: string;
  family: string;
  receipt_present: boolean;
  block: number | null;
  in_paper_window: boolean;
  has_tend: boolean;
  has_wing: boolean;
  has_yycrv: boolean;
  has_cusdc: boolean;
  has_creamy_pool: boolean;
  pm_fires: boolean;
  fired_indices: number[];
  fired_names: string[];
  failure_reason?: string;
}

async function audit(hash: string, family: string): Promise<AuditEntry> {
  const e: AuditEntry = {
    hash, family,
    receipt_present: false, block: null, in_paper_window: false,
    has_tend: false, has_wing: false, has_yycrv: false, has_cusdc: false, has_creamy_pool: false,
    pm_fires: false, fired_indices: [], fired_names: [],
  };
  // Receipt check
  const rfile = path.join(__dirname, "../cache/receipts", `${hash.slice(2)}.json`);
  if (!fs.existsSync(rfile)) {
    e.failure_reason = "receipt missing";
    return e;
  }
  e.receipt_present = true;
  const receipt = JSON.parse(fs.readFileSync(rfile, "utf-8"));
  e.block = Number(receipt.blockNumber);
  e.in_paper_window = e.block !== null && e.block >= PAPER_START && e.block <= PAPER_END;
  const addrs = new Set<string>((receipt.logs || []).map((l: any) => (l.address || "").toLowerCase()));
  e.has_tend = addrs.has(TEND_TOKEN);
  e.has_wing = addrs.has(WING_TOKEN);
  e.has_yycrv = addrs.has(YYCRV);
  e.has_cusdc = addrs.has(CUSDC);
  e.has_creamy_pool = addrs.has(CREAMY_POOL);

  // Pipeline analysis
  process.env.EVANESCA_SKIP_TX = "false";
  process.env.EVANESCA_TX_HASH = hash;
  const cntx: EvanescaContext = {
    tList: [], analyzed: new Set(), reports: new Array<AnalysisResult>(),
    fins: [], complexity: [],
  };
  const constraintNames = [
    "DEX_K_INVARIANT", "LENDING_COLLATERALIZATION", "PRICE_MANIPULATION",
    "ORACLE_MANIPULATION", "EXCHANGE_RATE_MANIPULATION", "FLASH_LOAN_ATTACK",
    "REENTRANCY_PATTERN", "CONCENTRATED_LIQUIDITY_ATTACK", "BRIDGE_INTEGRITY_VIOLATION",
    "EMPTY_MARKET_ATTACK", "READ_ONLY_REENTRANCY",
  ];
  try {
    const res = await run(hash, cntx);
    if (res?.reports) {
      for (const r of res.reports) {
        const v = (r as any)._violation;
        if (v) {
          v.forEach((flag: boolean, i: number) => {
            if (flag && !e.fired_indices.includes(i)) {
              e.fired_indices.push(i);
              e.fired_names.push(constraintNames[i] || `idx${i}`);
            }
          });
        }
      }
    }
    e.pm_fires = e.fired_indices.includes(2);
  } catch (err) {
    e.failure_reason = (err as Error).message.slice(0, 80);
  }
  return e;
}

async function main() {
  process.env.EVANESCA_DSL_ONLY = "true";
  const masterFile = path.join(__dirname, "../artifacts/defect-hashes-public/master.json");
  const master = JSON.parse(fs.readFileSync(masterFile, "utf-8"));
  const tw = master.defect_families.reward_distribution_TEND_WING.hashes as string[];
  const cy = master.defect_families.yield_bearing_CreamY_yyCRV.hashes as string[];
  const all = [
    ...tw.map(h => ({h, f: "reward_TEND_WING"})),
    ...cy.map(h => ({h, f: "yield_CreamY_yyCRV"})),
  ];
  console.log(`Auditing ${all.length} hashes (${tw.length} TEND/WING + ${cy.length} CreamY)`);
  const results: AuditEntry[] = [];
  for (let i = 0; i < all.length; i++) {
    process.stdout.write(`[${i+1}/${all.length}] ${all[i].h.slice(0,20)}... `);
    const r = await audit(all[i].h, all[i].f);
    process.stdout.write(`block=${r.block} pm=${r.pm_fires} window=${r.in_paper_window} family-tokens-present=${
      all[i].f === "reward_TEND_WING" ? (r.has_tend || r.has_wing) :
      (r.has_yycrv && r.has_cusdc && r.has_creamy_pool)
    }\n`);
    results.push(r);
  }
  // Aggregate
  const summary = {
    total: results.length,
    receipt_present: results.filter(r => r.receipt_present).length,
    in_paper_window: results.filter(r => r.in_paper_window).length,
    pm_fires: results.filter(r => r.pm_fires).length,
    family_token_present: {
      reward_TEND_WING: results.filter(r => r.family === "reward_TEND_WING" && (r.has_tend || r.has_wing)).length,
      yield_CreamY: results.filter(r => r.family === "yield_CreamY_yyCRV" && r.has_yycrv && r.has_cusdc && r.has_creamy_pool).length,
    },
    failures: results.filter(r => r.failure_reason).map(r => ({hash: r.hash, family: r.family, reason: r.failure_reason})),
  };
  console.log(`\n=== AUDIT SUMMARY ===`);
  console.log(JSON.stringify(summary, null, 2));
  fs.writeFileSync(
    path.join(__dirname, "../artifacts/defect-hashes-public/audit_report.json"),
    JSON.stringify({summary, per_hash: results}, null, 2),
  );
  console.log("saved -> artifacts/defect-hashes-public/audit_report.json");
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
