#!/usr/bin/env npx ts-node

import fs from "fs";
import path from "path";

interface AttackDbEntry {
  name: string;
  year: number;
  chain: string;
  transactionHash: string;
}

function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .replace(/\\#/g, "#")
    .replace(/\\s+/g, " ")
    .replace(/[^a-z0-9# ]/g, "")
    .trim();
}

function chainCodeToName(code: string): string {
  const m: Record<string, string> = {
    ETH: "Ethereum",
    BSC: "BSC",
    ARB: "Arbitrum",
    OP: "Optimism",
    AVAX: "Avalanche",
    MOVR: "Moonriver",
  };
  return m[code] || code;
}

function parseTblRange(tex: string): { incident: string; year: number; chain: string }[] {
  const out: { incident: string; year: number; chain: string }[] = [];
  const lines = tex.split(/\r?\n/);
  for (const line of lines) {
    // Example:
    // 1 & CreamFinance \#1 & 2020 & ETH & 2 & Harvest \#1 & 2020 & ETH \\
    if (!line.includes("&")) continue;
    if (!/\\\\\s*$/.test(line.trim())) continue;
    const parts = line
      .replace(/\\\\\s*$/, "")
      .split("&")
      .map((s) => s.trim());
    if (parts.length < 8) continue;

    // Left tuple
    const inc1 = parts[1]?.replace(/\\#/g, "#").trim();
    const year1 = parseInt(parts[2] || "", 10);
    const chain1 = parts[3]?.trim();
    if (inc1 && Number.isFinite(year1) && chain1) {
      out.push({ incident: inc1, year: year1, chain: chainCodeToName(chain1) });
    }

    // Right tuple
    const inc2 = parts[5]?.replace(/\\#/g, "#").trim();
    const year2 = parseInt(parts[6] || "", 10);
    const chain2 = parts[7]?.trim();
    if (inc2 && Number.isFinite(year2) && chain2) {
      out.push({ incident: inc2, year: year2, chain: chainCodeToName(chain2) });
    }
  }
  return out;
}

function bestMatch(
  incident: { incident: string; year: number; chain: string },
  attacks: AttackDbEntry[],
): AttackDbEntry | null {
  const target = normalizeName(incident.incident);

  const candidates = attacks.filter((a) => {
    if (!a.transactionHash?.startsWith("0x")) return false;
    if (a.year !== incident.year) return false;
    if (a.chain !== incident.chain) return false;
    return true;
  });

  const scored: { a: AttackDbEntry; score: number }[] = [];
  for (const a of candidates) {
    const n = normalizeName(a.name);
    // exact
    if (n === target) scored.push({ a, score: 100 });
    // table often omits "Attack"
    else if (n.replace(/\battack\b/g, "").replace(/\s+/g, " ").trim() === target) {
      scored.push({ a, score: 95 });
    } else if (n.includes(target)) scored.push({ a, score: 80 });
    else if (target.includes(n)) scored.push({ a, score: 70 });
  }

  scored.sort((x, y) => y.score - x.score);
  return scored[0]?.a || null;
}

function main(): void {
  const args = process.argv.slice(2);
  const inTexArg = args.find((a) => a.startsWith("--tbl="))?.split("=", 2)[1];
  const outArg = args.find((a) => a.startsWith("--out="))?.split("=", 2)[1];
  const dbArg = args.find((a) => a.startsWith("--db="))?.split("=", 2)[1];

  const tblPath = path.resolve(process.cwd(), inTexArg || "docs/papers/evanesca/tables/tbl_range.tex");
  const outPath = path.resolve(process.cwd(), outArg || "fp_audit/hashes-incidents40.txt");
  const dbPath = path.resolve(
    process.cwd(),
    dbArg || "src/test/attacks/shared/attackDatabase.json",
  );

  const tex = fs.readFileSync(tblPath, "utf-8");
  const parsed = parseTblRange(tex);

  const rawDb = JSON.parse(fs.readFileSync(dbPath, "utf-8"));
  const attacks: AttackDbEntry[] = (rawDb.attacks || []).map((a: any) => ({
    name: a.name,
    year: a.year,
    chain: a.chain,
    transactionHash: a.transactionHash,
  }));

  const missing: string[] = [];
  const hashes: string[] = [];
  for (const inc of parsed) {
    const m = bestMatch(inc, attacks);
    if (!m) {
      missing.push(`${inc.incident} (${inc.year}, ${inc.chain})`);
      continue;
    }
    hashes.push(m.transactionHash);
  }

  const uniq = Array.from(new Set(hashes.map((h) => h.toLowerCase())));
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, uniq.join("\n") + "\n", "utf-8");

  console.log(`Extracted ${uniq.length} incident tx hashes -> ${outPath}`);
  if (missing.length) {
    console.log(`Missing ${missing.length} incidents (no match found):`);
    for (const m of missing) console.log(`- ${m}`);
    process.exitCode = 2;
  }
}

main();

