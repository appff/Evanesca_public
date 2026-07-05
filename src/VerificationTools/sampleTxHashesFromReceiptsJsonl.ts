/**
 * Deterministically sample tx hashes from Evanesca receipt JSONL dumps.
 *
 * Input format (one JSON object per line) as produced by runLargeScaleIngest.ts:
 *   {"txHash":"0x...","blockNumber":...,"timestamp":...,...}
 *
 * Supports:
 * - single file input: --input path/to/receipts-YYYY-MM.jsonl
 * - directory input:   --input path/to/dir (reads receipts-*.jsonl under it, recursive)
 *
 * Output:
 * - plain text, one tx hash per line (compatible with runLargeScaleEvaluation.ts)
 */

import fs from "fs";
import path from "path";
import readline from "readline";

type CLIOptions = {
  inputs: string[];
  output: string;
  limit: number;
  seed: number;
  minLogs: number;
  maxLogs: number;
  requireStatus: boolean;
};

function parseArgs(): CLIOptions {
  const args = process.argv.slice(2);
  const opts: CLIOptions = {
    inputs: [],
    output: "",
    limit: 1000,
    seed: 1,
    minLogs: 0,
    maxLogs: Number.POSITIVE_INFINITY,
    requireStatus: true,
  };

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--input") {
      const v = args[++i];
      if (!v) throw new Error("--input requires a value");
      // allow comma-separated list as a convenience
      for (const part of v.split(",")) {
        const p = part.trim();
        if (p) opts.inputs.push(p);
      }
      continue;
    }
    if (a.startsWith("--input=")) {
      const v = a.slice("--input=".length);
      for (const part of v.split(",")) {
        const p = part.trim();
        if (p) opts.inputs.push(p);
      }
      continue;
    }
    if (a === "--output") {
      opts.output = args[++i] || "";
      continue;
    }
    if (a.startsWith("--output=")) {
      opts.output = a.slice("--output=".length);
      continue;
    }
    if (a === "--limit") {
      opts.limit = parseInt(args[++i] || "", 10);
      continue;
    }
    if (a.startsWith("--limit=")) {
      opts.limit = parseInt(a.slice("--limit=".length), 10);
      continue;
    }
    if (a === "--seed") {
      opts.seed = parseInt(args[++i] || "", 10);
      continue;
    }
    if (a.startsWith("--seed=")) {
      opts.seed = parseInt(a.slice("--seed=".length), 10);
      continue;
    }
    if (a === "--min-logs") {
      opts.minLogs = parseInt(args[++i] || "", 10);
      continue;
    }
    if (a.startsWith("--min-logs=")) {
      opts.minLogs = parseInt(a.slice("--min-logs=".length), 10);
      continue;
    }
    if (a === "--max-logs") {
      const v = args[++i] || "";
      opts.maxLogs = v.toLowerCase() === "inf" ? Number.POSITIVE_INFINITY : parseInt(v, 10);
      continue;
    }
    if (a.startsWith("--max-logs=")) {
      const v = a.slice("--max-logs=".length);
      opts.maxLogs = v.toLowerCase() === "inf" ? Number.POSITIVE_INFINITY : parseInt(v, 10);
      continue;
    }
    if (a === "--require-status") {
      const v = (args[++i] || "").toLowerCase();
      opts.requireStatus = v === "true" || v === "1" || v === "yes";
      continue;
    }
    if (a.startsWith("--require-status=")) {
      const v = a.slice("--require-status=".length).toLowerCase();
      opts.requireStatus = v === "true" || v === "1" || v === "yes";
      continue;
    }
    if (a === "--help" || a === "-h") {
      console.log(`
Sample tx hashes from receipts JSONL.

Usage:
  npx ts-node --transpile-only src/VerificationTools/sampleTxHashesFromReceiptsJsonl.ts \\
    --input <file-or-dir>[,<file-or-dir>...] \\
    --output <hashes.txt> \\
    --limit <N> \\
    --seed <int> \\
    --min-logs <N> \\
    --max-logs <N|inf> \\
    --require-status <true|false>

Examples:
  npx ts-node --transpile-only src/VerificationTools/sampleTxHashesFromReceiptsJsonl.ts \\
    --input large-scale-ingest/2024-q1 \\
    --output pilot/hashes-2024q1.txt \\
    --limit 5000 --seed 42

  # Prefer higher-information txs (more logs) to increase constraint diversity:
  npx ts-node --transpile-only src/VerificationTools/sampleTxHashesFromReceiptsJsonl.ts \\
    --input large-scale-ingest/2023-q1,large-scale-ingest/2023-q2,large-scale-ingest/2023-q3,large-scale-ingest/2023-q4 \\
    --output fp_audit/hashes-2023-minlogs10-n10000-seed42.txt \\
    --limit 10000 --seed 42 --min-logs 10
`);
      process.exit(0);
    }
  }

  if (opts.inputs.length === 0) throw new Error("Missing --input");
  if (!opts.output) throw new Error("Missing --output");
  if (!Number.isFinite(opts.limit) || opts.limit <= 0) {
    throw new Error(`Invalid --limit: ${opts.limit}`);
  }
  if (!Number.isFinite(opts.seed)) {
    throw new Error(`Invalid --seed: ${opts.seed}`);
  }
  if (!Number.isFinite(opts.minLogs) || opts.minLogs < 0) {
    throw new Error(`Invalid --min-logs: ${opts.minLogs}`);
  }
  if (opts.maxLogs !== Number.POSITIVE_INFINITY && !Number.isFinite(opts.maxLogs)) {
    throw new Error(`Invalid --max-logs: ${opts.maxLogs}`);
  }
  if (opts.maxLogs < opts.minLogs) {
    throw new Error(`Invalid --max-logs: ${opts.maxLogs}`);
  }

  return opts;
}

// xorshift32 for deterministic sampling
function makeRng(seed: number): () => number {
  let x = seed | 0;
  if (x === 0) x = 1;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    // Convert to [0,1)
    return (x >>> 0) / 0x100000000;
  };
}

function isDir(p: string): boolean {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function collectJsonlFiles(inputPath: string): string[] {
  const resolved = path.resolve(process.cwd(), inputPath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Input not found: ${resolved}`);
  }

  if (!isDir(resolved)) return [resolved];

  const out: string[] = [];
  const stack: string[] = [resolved];
  while (stack.length) {
    const cur = stack.pop()!;
    const entries = fs.readdirSync(cur, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(cur, e.name);
      if (e.isDirectory()) stack.push(full);
      else if (
        e.isFile() &&
        e.name.startsWith("receipts-") &&
        e.name.endsWith(".jsonl")
      ) {
        out.push(full);
      }
    }
  }
  out.sort();
  return out;
}

async function reservoirSampleFromFile(
  filePath: string,
  limit: number,
  rng: () => number,
  reservoir: string[],
  reservoirSet: Set<string>,
  filter: { minLogs: number; maxLogs: number; requireStatus: boolean },
  counter: { seen: number; parsed: number; bad: number; candidates: number },
): Promise<void> {
  const rl = readline.createInterface({
    input: fs.createReadStream(filePath),
    crlfDelay: Infinity,
  });

  // Fast-path extractor for our receipt JSONL format.
  // Avoid JSON.parse on tens of millions of lines.
  const tryExtractHashFast = (line: string): string | undefined => {
    const markers = [
      '"txHash":"',
      '"tx_hash":"',
      '"transactionHash":"',
      '"hash":"',
    ];
    for (const m of markers) {
      const idx = line.indexOf(m);
      if (idx === -1) continue;
      const start = idx + m.length;
      // Typical format is 0x + 64 hex chars.
      if (
        line.length >= start + 66 &&
        line[start] === "0" &&
        line[start + 1] === "x"
      ) {
        const cand = line.slice(start, start + 66);
        return cand;
      }
      // Fallback: find closing quote.
      const end = line.indexOf('"', start);
      if (end > start) {
        const cand = line.slice(start, end);
        if (cand.startsWith("0x")) return cand;
      }
    }
    return undefined;
  };

  const tryExtractIntFast = (
    line: string,
    marker: string,
  ): number | undefined => {
    const idx = line.indexOf(marker);
    if (idx === -1) return undefined;
    let i = idx + marker.length;
    while (i < line.length && (line[i] === " " || line[i] === "\t")) i++;
    // handle optional quotes
    if (line[i] === '"') i++;
    let j = i;
    while (j < line.length && line[j] >= "0" && line[j] <= "9") j++;
    if (j === i) return undefined;
    const n = Number(line.slice(i, j));
    return Number.isFinite(n) ? n : undefined;
  };

  const tryExtractBoolFast = (
    line: string,
    marker: string,
  ): boolean | undefined => {
    const idx = line.indexOf(marker);
    if (idx === -1) return undefined;
    const start = idx + marker.length;
    if (line.startsWith("true", start)) return true;
    if (line.startsWith("false", start)) return false;
    return undefined;
  };

  for await (const line of rl) {
    counter.seen++;
    if (!line.trim()) continue;

    // Apply eligibility filter first (logsCount + status) to bias toward richer txs.
    let logsCount = tryExtractIntFast(line, '"logsCount":');
    let status = tryExtractBoolFast(line, '"status":');

    let hash = tryExtractHashFast(line);
    if (!hash) {
      // Keep a small correctness fallback for unexpected formats.
      try {
        const obj: any = JSON.parse(line);
        counter.parsed++;
        if (logsCount === undefined) logsCount = obj.logsCount;
        if (status === undefined) status = obj.status;
        const h: string | undefined =
          obj.txHash || obj.tx_hash || obj.hash || obj.transactionHash;
        if (!h || typeof h !== "string" || !h.startsWith("0x")) continue;
        hash = h;
      } catch {
        counter.bad++;
        continue;
      }
    }

    const lc = typeof logsCount === "number" ? logsCount : 0;
    const st = typeof status === "boolean" ? status : true;
    if (filter.requireStatus && st !== true) continue;
    if (lc < filter.minLogs || lc > filter.maxLogs) continue;

    // Avoid duplicates in the reservoir to simplify evaluation accounting.
    if (reservoirSet.has(hash)) continue;
    counter.candidates++;

    if (reservoir.length < limit) {
      reservoir.push(hash);
      reservoirSet.add(hash);
      continue;
    }

    // Reservoir sampling over eligible candidates.
    const j = Math.floor(rng() * counter.candidates);
    if (j < limit) {
      const old = reservoir[j];
      reservoirSet.delete(old);
      reservoir[j] = hash;
      reservoirSet.add(hash);
    }
  }
}

async function main(): Promise<void> {
  const opts = parseArgs();
  const rng = makeRng(opts.seed);

  const files: string[] = [];
  for (const inp of opts.inputs) {
    files.push(...collectJsonlFiles(inp));
  }

  if (files.length === 0)
    throw new Error("No receipts-*.jsonl files found under inputs");

  const reservoir: string[] = [];
  const reservoirSet = new Set<string>();
  const counter = { seen: 0, parsed: 0, bad: 0, candidates: 0 };

  for (const f of files) {
    console.log(`[sample] reading ${f}`);
    await reservoirSampleFromFile(
      f,
      opts.limit,
      rng,
      reservoir,
      reservoirSet,
      { minLogs: opts.minLogs, maxLogs: opts.maxLogs, requireStatus: opts.requireStatus },
      counter,
    );
  }

  fs.mkdirSync(path.dirname(path.resolve(process.cwd(), opts.output)), {
    recursive: true,
  });
  fs.writeFileSync(
    path.resolve(process.cwd(), opts.output),
    reservoir.join("\n") + "\n",
    "utf-8",
  );

  console.log(
    `[sample] done: wrote ${reservoir.length} hashes (limit=${opts.limit}, seed=${opts.seed})`,
  );
  console.log(
    `[sample] filter=minLogs:${opts.minLogs},maxLogs:${opts.maxLogs},requireStatus:${opts.requireStatus}`,
  );
  console.log(
    `[sample] lines seen=${counter.seen}, parsed=${counter.parsed}, bad_json=${counter.bad}, eligible_candidates=${counter.candidates}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
