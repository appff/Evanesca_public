/**
 * Inspect why a tx fires LENDING_COLLATERALIZATION only (not PRICE_MANIPULATION).
 * Dumps edge-level info: Type, Action, USD totals, ratios.
 */
import { run } from "../src/Driver";
import { preTasksForRegressionTest } from "../src/PreTasks";
import { EvanescaContext } from "../src/Interfaces/EvanescaContext";
import { AnalysisResult } from "../src/ConstraintSolver/Interfaces/AnalysisResult";

preTasksForRegressionTest();

async function inspect(hash: string) {
  console.log(`\n========= ${hash} =========`);
  const cntx: EvanescaContext = {
    tList: [], analyzed: new Set(),
    reports: new Array<AnalysisResult>(),
    fins: [], complexity: [],
  };
  const res = await run(hash, cntx);
  if (!res || !res.reports || res.reports.length === 0) {
    console.log("  no result");
    return;
  }
  console.log(`  reports: ${res.reports.length}`);
  for (const r of res.reports) {
    const v = (r as any)._violation;
    const fired = v ? v.map((x: boolean, i: number) => x ? i : -1).filter((i: number) => i >= 0) : [];
    console.log(`  fired: [${fired.join(",")}]  comment: ${(r as any)._comment || ""}`);
  }
  // Dump edges
  const edges = (cntx as any).edges || (res as any).edges;
  if (edges && Array.isArray(edges)) {
    console.log(`  edges count: ${edges.length}`);
    edges.slice(0, 20).forEach((e: any, i: number) => {
      console.log(
        `    e#${i} Type=${e.Type || "?"} Action=${e.Action || "?"} ` +
        `Token0=${e.Token0 || "?"} Token1=${e.Token1 || "?"} ` +
        `In=${e.AmountIn || e.Amount || "?"} Out=${e.AmountOut || "?"}`,
      );
    });
  }
}

async function main() {
  const hashes = process.argv.slice(2);
  if (hashes.length === 0) {
    const data = JSON.parse(require("fs").readFileSync("/tmp/lc_only_hashes.json", "utf-8"));
    hashes.push(...data.slice(0, 3));
  }
  for (const h of hashes) await inspect(h);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
