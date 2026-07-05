/**
 * Take TEND candidate tx hashes and run them through the Evanesca pipeline.
 * Output: per-tx violation summary + final list of recovered TEND/WING attacks.
 */

import { run } from "../src/Driver";
import { preTasksForRegressionTest } from "../src/PreTasks";
import { EvanescaContext } from "../src/Interfaces/EvanescaContext";
import { AnalysisResult } from "../src/ConstraintSolver/Interfaces/AnalysisResult";
import * as fs from "fs";
import * as path from "path";

preTasksForRegressionTest();

const CANDIDATE_FILE_GLOB = process.argv[2] || "wiki/raw/tend_candidate_hashes_*.json";
const MAX_TXS = Number(process.env.MAX_TXS || "200");

async function findLatestCandidateFile(): Promise<string> {
  const explicit = process.env.CANDIDATE_FILE;
  if (explicit) {
    if (!fs.existsSync(explicit)) {
      throw new Error(`CANDIDATE_FILE not found: ${explicit}`);
    }
    return explicit;
  }
  const prefix = process.env.CANDIDATE_PREFIX || "tend_candidate_hashes_";
  const dir = path.join(__dirname, "../wiki/raw");
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.startsWith(prefix) && f.endsWith(".json"))
    .map((f) => ({
      name: f,
      mtime: fs.statSync(path.join(dir, f)).mtimeMs,
    }))
    .sort((a, b) => b.mtime - a.mtime);
  if (files.length === 0) {
    throw new Error(`No ${prefix}*.json in ${dir}`);
  }
  return path.join(dir, files[0].name);
}

async function main() {
  const file = await findLatestCandidateFile();
  console.log(`Using candidate file: ${file}`);
  const data = JSON.parse(fs.readFileSync(file, "utf-8"));

  // Prefer heavy_tend_top first (most likely attack), then candidate_hashes
  const heavySet: string[] = (data.heavy_tend_top || []).map((h: any) => h.hash);
  const allCandidates: string[] = data.candidate_hashes || [];
  const ordered = Array.from(new Set([...heavySet, ...allCandidates])).slice(0, MAX_TXS);

  console.log(`Total to analyze: ${ordered.length}`);

  const fired: Array<{ hash: string; firedIndices: number[]; firedNames: string[] }> = [];
  const noFire: string[] = [];
  const errored: Array<{ hash: string; error: string }> = [];

  // Constraint name lookup (DSL order)
  const constraintNames = [
    "DEX_K_INVARIANT",
    "LENDING_COLLATERALIZATION",
    "PRICE_MANIPULATION",
    "ORACLE_MANIPULATION",
    "EXCHANGE_RATE_MANIPULATION",
    "FLASH_LOAN_ATTACK",
    "REENTRANCY_PATTERN",
    "CONCENTRATED_LIQUIDITY_ATTACK",
    "BRIDGE_INTEGRITY_VIOLATION",
    "EMPTY_MARKET_ATTACK",
    "READ_ONLY_REENTRANCY",
  ];

  // Optional block range filter (paper dataset 2020-01-01 to 2024-12-13)
  const minBlock = Number(process.env.MIN_BLOCK || "9193266"); // 2020-01-01
  const maxBlock = Number(process.env.MAX_BLOCK || "21368000"); // 2024-12-13

  for (let i = 0; i < ordered.length; i++) {
    const hash = ordered[i];
    process.stdout.write(`[${i + 1}/${ordered.length}] ${hash}... `);
    // Reset per-tx env state so the SKIP_UNKNOWN_PRICE machinery works correctly
    process.env.EVANESCA_SKIP_TX = "false";
    process.env.EVANESCA_TX_HASH = hash;
    const cntx: EvanescaContext = {
      tList: [],
      analyzed: new Set<string>(),
      reports: new Array<AnalysisResult>(),
      fins: new Array<number>(),
      complexity: new Array<number>(),
    };
    try {
      const res = await run(hash, cntx);
      if (!res || !res.reports || res.reports.length === 0) {
        noFire.push(hash);
        process.stdout.write(`no-fire\n`);
        continue;
      }
      // Filter by block range (paper dataset)
      const blockNo = res.reports[0]?.blockNumber;
      if (blockNo !== undefined && (blockNo < minBlock || blockNo > maxBlock)) {
        process.stdout.write(`out-of-range (block=${blockNo})\n`);
        continue;
      }
      const allViolations = new Set<number>();
      for (const r of res.reports) {
        const v = (r as any)._violation;
        if (v) {
          v.forEach((flag: boolean, idx: number) => {
            if (flag) allViolations.add(idx);
          });
        }
      }
      if (allViolations.size === 0) {
        noFire.push(hash);
        process.stdout.write(`no-fire (reports=${res.reports.length})\n`);
        continue;
      }
      const firedIndices = [...allViolations].sort();
      const firedNames = firedIndices.map((i) => constraintNames[i] || `idx${i}`);
      fired.push({ hash, firedIndices, firedNames });
      process.stdout.write(`FIRED [${firedNames.join(",")}]\n`);
    } catch (e) {
      errored.push({ hash, error: (e as Error).message });
      process.stdout.write(`error: ${(e as Error).message.slice(0, 60)}\n`);
    }
  }

  const outDir = path.join(__dirname, "../wiki/raw");
  const outPath = path.join(outDir, `tend_pipeline_results_${Date.now()}.json`);
  fs.writeFileSync(
    outPath,
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        candidate_file: file,
        analyzed: ordered.length,
        fired_count: fired.length,
        no_fire_count: noFire.length,
        errored_count: errored.length,
        fired,
        no_fire: noFire,
        errored,
      },
      null,
      2,
    ),
  );

  console.log(`\n=========== SUMMARY ===========`);
  console.log(`analyzed:   ${ordered.length}`);
  console.log(`fired:      ${fired.length}`);
  console.log(`no-fire:    ${noFire.length}`);
  console.log(`errored:    ${errored.length}`);
  console.log(`Output:     ${outPath}`);

  // Most common constraint mix
  const comboCount = new Map<string, number>();
  for (const f of fired) {
    const k = f.firedNames.join("+");
    comboCount.set(k, (comboCount.get(k) || 0) + 1);
  }
  console.log(`\nFired constraint mix histogram:`);
  for (const [combo, c] of [...comboCount.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${combo}: ${c}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("error:", err);
    process.exit(1);
  });
