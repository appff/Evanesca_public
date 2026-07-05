#!/usr/bin/env npx ts-node

import fs from "fs";
import path from "path";
import readline from "readline";

type OutputFormat = "csv";

interface CLIOptions {
  input: string;
  output: string;
  sample: number;
  seed: number;
  minPerConstraint: number;
  anchorsPath?: string;
  maxAnchors: number;
  excludeConstraints: Set<string>;
  format: OutputFormat;
}

interface ViolationRecord {
  tx_hash: string;
  block_number?: number | null;
  constraint_id: string;
  evidence?: any;
  profit_loss?: {
    in_usd?: number;
    out_usd?: number;
    ratio?: number;
  };
  protocol?: string | null;
}

interface TxAgg {
  tx_hash: string;
  block_number: number | null;
  protocol: string | null;
  constraints: Set<string>;
  in_usd: number;
  out_usd: number;
  ratio: number;
}

// ---------------------------------------------------------------------------
// CLI parsing
// ---------------------------------------------------------------------------

function parseArgs(): CLIOptions {
  const args = process.argv.slice(2);
  const opts: CLIOptions = {
    input: "",
    output: "",
    sample: 50,
    seed: 42,
    minPerConstraint: 2,
    anchorsPath: undefined,
    maxAnchors: Number.POSITIVE_INFINITY,
    excludeConstraints: new Set<string>(),
    format: "csv",
  };

  for (const arg of args) {
    const eq = arg.indexOf("=");
    if (eq === -1) continue;
    const key = arg.slice(0, eq);
    const value = arg.slice(eq + 1);

    if (key === "--input") opts.input = value;
    if (key === "--output") opts.output = value;
    if (key === "--sample") opts.sample = parseInt(value, 10);
    if (key === "--seed") opts.seed = parseInt(value, 10);
    if (key === "--min-per-constraint") opts.minPerConstraint = parseInt(value, 10);
    if (key === "--anchors") opts.anchorsPath = value;
    if (key === "--max-anchors") opts.maxAnchors = parseInt(value, 10);
    if (key === "--format") opts.format = (value as OutputFormat) || "csv";
    if (key === "--exclude-constraints") {
      const parts = value
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      for (const p of parts) opts.excludeConstraints.add(p);
    }
  }

  if (!opts.input) {
    console.error("Missing required --input=PATH (violations.jsonl)");
    process.exit(1);
  }
  if (!opts.output) {
    console.error("Missing required --output=PATH (labeling CSV)");
    process.exit(1);
  }
  if (!Number.isFinite(opts.sample) || opts.sample <= 0) {
    console.error("Invalid --sample (must be > 0)");
    process.exit(1);
  }
  if (!Number.isFinite(opts.minPerConstraint) || opts.minPerConstraint < 0) {
    console.error("Invalid --min-per-constraint (must be >= 0)");
    process.exit(1);
  }
  if (!Number.isFinite(opts.maxAnchors) || opts.maxAnchors < 0) {
    console.error("Invalid --max-anchors (must be >= 0)");
    process.exit(1);
  }

  return opts;
}

function loadHashSetFromFile(p: string): Set<string> {
  const raw = fs.readFileSync(p, "utf-8");
  const set = new Set<string>();
  for (const line of raw.split(/\r?\n/)) {
    const s = line.trim();
    if (!s) continue;
    // Allow comma-separated lists as well.
    for (const part of s.split(",")) {
      const h = part.trim();
      if (!h) continue;
      if (h.startsWith("0x")) set.add(h.toLowerCase());
    }
  }
  return set;
}

// ---------------------------------------------------------------------------
// Deterministic RNG helpers
// ---------------------------------------------------------------------------

function fnv1a32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleInPlace<T>(arr: T[], rand: () => number): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

// ---------------------------------------------------------------------------
// CSV helpers
// ---------------------------------------------------------------------------

function csvEscape(v: string): string {
  if (v.includes('"') || v.includes(",") || v.includes("\n") || v.includes("\r")) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}

function toCsvRow(cols: string[]): string {
  return cols.map(csvEscape).join(",");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const opts = parseArgs();
  const inputPath = path.resolve(process.cwd(), opts.input);
  if (!fs.existsSync(inputPath)) {
    console.error(`Input not found: ${inputPath}`);
    process.exit(1);
  }

  const anchors =
    opts.anchorsPath && fs.existsSync(path.resolve(process.cwd(), opts.anchorsPath))
      ? loadHashSetFromFile(path.resolve(process.cwd(), opts.anchorsPath))
      : new Set<string>();

  const txMap = new Map<string, TxAgg>();
  const constraintToTxs = new Map<string, Set<string>>();

  const rl = readline.createInterface({
    input: fs.createReadStream(inputPath),
    crlfDelay: Infinity,
  });

  let lines = 0;
  let parsed = 0;
  for await (const line of rl) {
    lines++;
    const s = line.trim();
    if (!s) continue;
    let rec: ViolationRecord;
    try {
      rec = JSON.parse(s) as ViolationRecord;
      parsed++;
    } catch {
      continue;
    }
    if (!rec.tx_hash || !rec.constraint_id) continue;
    if (opts.excludeConstraints.has(rec.constraint_id)) continue;

    let agg = txMap.get(rec.tx_hash);
    if (!agg) {
      agg = {
        tx_hash: rec.tx_hash,
        block_number: rec.block_number ?? null,
        protocol: rec.protocol ?? null,
        constraints: new Set<string>(),
        in_usd: rec.profit_loss?.in_usd ?? 0,
        out_usd: rec.profit_loss?.out_usd ?? 0,
        ratio: rec.profit_loss?.ratio ?? 0,
      };
      txMap.set(rec.tx_hash, agg);
    } else {
      // Merge sparse metadata conservatively.
      if (agg.block_number == null && rec.block_number != null) agg.block_number = rec.block_number;
      if (agg.protocol == null && rec.protocol) agg.protocol = rec.protocol;
      // Keep max ratio as a rough "salience" indicator.
      const r = rec.profit_loss?.ratio ?? 0;
      if (r > agg.ratio) {
        agg.ratio = r;
        agg.in_usd = rec.profit_loss?.in_usd ?? agg.in_usd;
        agg.out_usd = rec.profit_loss?.out_usd ?? agg.out_usd;
      }
    }

    agg.constraints.add(rec.constraint_id);

    let set = constraintToTxs.get(rec.constraint_id);
    if (!set) {
      set = new Set<string>();
      constraintToTxs.set(rec.constraint_id, set);
    }
    set.add(rec.tx_hash);
  }

  console.log(
    `Loaded ${txMap.size} unique txs from ${parsed}/${lines} JSONL lines; ` +
      `${constraintToTxs.size} constraints present.`,
  );

  const selected = new Set<string>();
  const selectedList: string[] = [];
  let anchorPicked = 0;

  // Step 1: stratified picks per constraint.
  const constraints = Array.from(constraintToTxs.keys()).sort();
  for (const cid of constraints) {
    if (selectedList.length >= opts.sample) break;
    const txs = Array.from(constraintToTxs.get(cid) || []);
    if (txs.length === 0) continue;
    const rand = mulberry32((opts.seed ^ fnv1a32(cid)) >>> 0);
    shuffleInPlace(txs, rand);

    let picked = 0;
    for (const tx of txs) {
      if (selectedList.length >= opts.sample) break;
      if (selected.has(tx)) continue;
      const isAnchor = anchors.has(tx.toLowerCase());
      if (isAnchor && anchorPicked >= opts.maxAnchors) continue;
      selected.add(tx);
      selectedList.push(tx);
      picked++;
      if (isAnchor) anchorPicked++;
      if (picked >= opts.minPerConstraint) break;
    }
  }

  // Step 2: fill remainder uniformly from the rest.
  if (selectedList.length < opts.sample) {
    const remaining = Array.from(txMap.keys()).filter((tx) => !selected.has(tx));
    const rand = mulberry32(opts.seed >>> 0);
    shuffleInPlace(remaining, rand);
    for (const tx of remaining) {
      if (selectedList.length >= opts.sample) break;
      const isAnchor = anchors.has(tx.toLowerCase());
      if (isAnchor && anchorPicked >= opts.maxAnchors) continue;
      selected.add(tx);
      selectedList.push(tx);
      if (isAnchor) anchorPicked++;
    }
  }

  if (selectedList.length === 0) {
    console.error("No candidates selected. Check input / exclude filters.");
    process.exit(1);
  }

  const outPath = path.resolve(process.cwd(), opts.output);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });

  if (opts.format !== "csv") {
    console.error(`Unsupported --format=${opts.format} (only csv is supported).`);
    process.exit(1);
  }

  const header = [
    "tx_hash",
    "block_number",
    "protocol",
    "is_anchor",
    "primary_constraint",
    "constraints",
    "in_usd",
    "out_usd",
    "ratio",
    "label",
    "notes",
  ];
  const rows: string[] = [toCsvRow(header)];

  for (const tx of selectedList) {
    const agg = txMap.get(tx);
    if (!agg) continue;
    const cids = Array.from(agg.constraints).sort();
    const primary = cids[0] || "";
    const isAnchor = anchors.has(agg.tx_hash.toLowerCase());
    rows.push(
      toCsvRow([
        agg.tx_hash,
        agg.block_number == null ? "" : String(agg.block_number),
        agg.protocol || "",
        isAnchor ? "true" : "false",
        primary,
        cids.join("|"),
        String(agg.in_usd ?? 0),
        String(agg.out_usd ?? 0),
        String(agg.ratio ?? 0),
        "",
        "",
      ]),
    );
  }

  fs.writeFileSync(outPath, rows.join("\n") + "\n", "utf-8");
  console.log(`Wrote labeling sheet (${selectedList.length} rows): ${outPath}`);
}

main().catch((err) => {
  console.error("generateFpLabelingSheet failed:", err);
  process.exit(1);
});
