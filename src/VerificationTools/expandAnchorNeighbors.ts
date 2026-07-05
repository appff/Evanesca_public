/**
 * Expand an anchor tx-hash set with same-protocol neighbors in a block radius.
 *
 * Motivation (FP validation Option 3):
 * - Build an enriched candidate pool around known case-study / incident anchors.
 * - Keep the pool size manageable and deterministic.
 *
 * Approach:
 * - For each anchor tx:
 *   1) Fetch the anchor transaction to obtain (blockNumber, to).
 *   2) Scan blocks [blockNumber - R, blockNumber + R] (inclusive).
 *   3) Collect tx hashes whose `to` matches the anchor `to` (same contract).
 *   4) Cap neighbors per anchor to bound RPC cost.
 *
 * Output:
 * - plain text, one tx hash per line (compatible with runLargeScaleEvaluation.ts)
 */

import fs from "fs";
import path from "path";
import { addrToNormToken, poolToNormalList, providerManager } from "../PreTasks";

type CLIOptions = {
  anchorsPath: string;
  outputPath: string;
  chainIds: number[];
  blockRadius: number;
  maxNeighborsPerAnchor: number;
  maxRelatedToAddresses: number;
  includeAnchors: boolean;
};

function parseArgs(): CLIOptions {
  const args = process.argv.slice(2);
  const opts: CLIOptions = {
    anchorsPath: "",
    outputPath: "",
    chainIds: [1],
    blockRadius: 50,
    maxNeighborsPerAnchor: 500,
    maxRelatedToAddresses: 8,
    includeAnchors: true,
  };

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--anchors") {
      opts.anchorsPath = args[++i] || "";
      continue;
    }
    if (a.startsWith("--anchors=")) {
      opts.anchorsPath = a.slice("--anchors=".length);
      continue;
    }
    if (a === "--output") {
      opts.outputPath = args[++i] || "";
      continue;
    }
    if (a.startsWith("--output=")) {
      opts.outputPath = a.slice("--output=".length);
      continue;
    }
    // Backward compat: single chain id.
    if (a === "--chain-id") {
      const v = parseInt(args[++i] || "", 10);
      opts.chainIds = [v];
      continue;
    }
    if (a.startsWith("--chain-id=")) {
      const v = parseInt(a.slice("--chain-id=".length), 10);
      opts.chainIds = [v];
      continue;
    }
    // Preferred: comma-separated list (auto-detect which chain the tx exists on).
    if (a === "--chain-ids") {
      const v = args[++i] || "";
      opts.chainIds = v
        .split(",")
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => Number.isFinite(n) && n > 0);
      continue;
    }
    if (a.startsWith("--chain-ids=")) {
      const v = a.slice("--chain-ids=".length);
      opts.chainIds = v
        .split(",")
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => Number.isFinite(n) && n > 0);
      continue;
    }
    if (a === "--block-radius") {
      opts.blockRadius = parseInt(args[++i] || "", 10);
      continue;
    }
    if (a.startsWith("--block-radius=")) {
      opts.blockRadius = parseInt(a.slice("--block-radius=".length), 10);
      continue;
    }
    if (a === "--max-neighbors-per-anchor") {
      opts.maxNeighborsPerAnchor = parseInt(args[++i] || "", 10);
      continue;
    }
    if (a.startsWith("--max-neighbors-per-anchor=")) {
      opts.maxNeighborsPerAnchor = parseInt(
        a.slice("--max-neighbors-per-anchor=".length),
        10,
      );
      continue;
    }
    if (a === "--max-related-to-addresses") {
      opts.maxRelatedToAddresses = parseInt(args[++i] || "", 10);
      continue;
    }
    if (a.startsWith("--max-related-to-addresses=")) {
      opts.maxRelatedToAddresses = parseInt(
        a.slice("--max-related-to-addresses=".length),
        10,
      );
      continue;
    }
    if (a === "--include-anchors") {
      const v = (args[++i] || "").toLowerCase();
      opts.includeAnchors = v === "true" || v === "1" || v === "yes";
      continue;
    }
    if (a.startsWith("--include-anchors=")) {
      const v = a.slice("--include-anchors=".length).toLowerCase();
      opts.includeAnchors = v === "true" || v === "1" || v === "yes";
      continue;
    }
    if (a === "--help" || a === "-h") {
      console.log(`
Expand anchor tx hashes with same-protocol neighbors in a block radius.

Usage:
  npx ts-node --transpile-only src/VerificationTools/expandAnchorNeighbors.ts \\
    --anchors <anchors.txt> \\
    --output <expanded.txt> \\
    --chain-ids <csv> \\
    --block-radius <int> \\
    --max-neighbors-per-anchor <int> \\
    --max-related-to-addresses <int> \\
    --include-anchors <true|false>

Example:
  npx ts-node --transpile-only src/VerificationTools/expandAnchorNeighbors.ts \\
    --anchors docs/experiments/fp_validation_wacco/hashes-incidents40.txt \\
    --output /tmp/hashes-incidents40-expanded-r10.txt \\
    --chain-ids 1,10,42161,56,43114,82,1285 \\
    --block-radius 10 --max-neighbors-per-anchor 200 --max-related-to-addresses 8
`);
      process.exit(0);
    }
  }

  if (!opts.anchorsPath) throw new Error("Missing --anchors");
  if (!opts.outputPath) throw new Error("Missing --output");
  if (!opts.chainIds.length) throw new Error("Missing/invalid --chain-ids");
  if (opts.chainIds.some((c) => !Number.isFinite(c) || c <= 0)) {
    throw new Error(`Invalid --chain-ids: ${opts.chainIds.join(",")}`);
  }
  if (!Number.isFinite(opts.blockRadius) || opts.blockRadius < 0) {
    throw new Error(`Invalid --block-radius: ${opts.blockRadius}`);
  }
  if (
    !Number.isFinite(opts.maxNeighborsPerAnchor) ||
    opts.maxNeighborsPerAnchor <= 0
  ) {
    throw new Error(
      `Invalid --max-neighbors-per-anchor: ${opts.maxNeighborsPerAnchor}`,
    );
  }
  if (
    !Number.isFinite(opts.maxRelatedToAddresses) ||
    opts.maxRelatedToAddresses <= 0
  ) {
    throw new Error(
      `Invalid --max-related-to-addresses: ${opts.maxRelatedToAddresses}`,
    );
  }
  return opts;
}

function readAnchors(p: string): string[] {
  const abs = path.resolve(process.cwd(), p);
  const raw = fs.readFileSync(abs, "utf-8");
  const out: string[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const s = line.trim();
    if (!s) continue;
    if (!/^0x[0-9a-fA-F]{64}$/.test(s)) continue;
    out.push(s.toLowerCase());
  }
  return Array.from(new Set(out));
}

function buildTokenAndPoolSets(): { tokenSet: Set<string>; poolSet: Set<string> } {
  const tokenSet = new Set<string>();
  for (const t of addrToNormToken || []) {
    if (t?.Address) tokenSet.add(String(t.Address).toLowerCase());
  }

  const poolSet = new Set<string>();
  for (const svc of poolToNormalList || []) {
    for (const p of svc?.PoolList || []) {
      if (p?.Address) poolSet.add(String(p.Address).toLowerCase());
    }
  }

  return { tokenSet, poolSet };
}

async function fetchTx(hash: string, chainId: number): Promise<any | null> {
  return providerManager.executeWithFailover(
    (w3) => (w3.eth as any).getTransaction(hash),
    "getTransaction",
    { chainId },
  );
}

async function fetchReceipt(hash: string, chainId: number): Promise<any | null> {
  return providerManager.executeWithFailover(
    (w3) => (w3.eth as any).getTransactionReceipt(hash),
    "getTransactionReceipt",
    { chainId },
  );
}

async function fetchBlock(
  blockNumber: number,
  chainId: number,
): Promise<any | null> {
  return providerManager.executeWithFailover(
    (w3) => (w3.eth as any).getBlock(blockNumber, true),
    "getBlock(fullTxs)",
    { chainId },
  );
}

async function main(): Promise<void> {
  // Keep logs manageable; print progress to stderr only.
  if (process.env.EVANESCA_QUIET === undefined) process.env.EVANESCA_QUIET = "true";
  if (process.env.LOG_LEVEL === undefined) process.env.LOG_LEVEL = "ERROR";

  const opts = parseArgs();
  const anchors = readAnchors(opts.anchorsPath);
  if (anchors.length === 0) {
    throw new Error(`No valid anchors found in: ${opts.anchorsPath}`);
  }
  const { tokenSet, poolSet } = buildTokenAndPoolSets();

  const outSet = new Set<string>();
  const blockCache = new Map<string, any>();

  const absOut = path.resolve(process.cwd(), opts.outputPath);
  fs.mkdirSync(path.dirname(absOut), { recursive: true });

  let expandedAnchors = 0;
  let skippedAnchors = 0;
  let totalNeighbors = 0;

  for (let idx = 0; idx < anchors.length; idx++) {
    const anchor = anchors[idx];
    let chosenChain: number | null = null;
    let tx: any | null = null;
    for (const chainId of opts.chainIds) {
      try {
        const t = await fetchTx(anchor, chainId);
        if (t && t.blockNumber) {
          chosenChain = chainId;
          tx = t;
          break;
        }
      } catch {
        // try next chain
      }
    }

    if (!chosenChain || !tx || !tx.blockNumber) {
      skippedAnchors++;
      console.error(
        `[expand] skip anchor (no tx/block on chains=${opts.chainIds.join(",")}): ${anchor} (${idx + 1}/${anchors.length})`,
      );
      continue;
    }
    const anchorBlock = Number(tx.blockNumber);
    expandedAnchors++;
    if (opts.includeAnchors) outSet.add(anchor);

    // Related-to set: anchor `to` plus the top-K log-emitter addresses from the receipt.
    const relatedTo = new Set<string>();
    const anchorTo = (tx.to as string | null) ? (tx.to as string).toLowerCase() : null;
    if (anchorTo && !tokenSet.has(anchorTo)) relatedTo.add(anchorTo);
    try {
      const receipt = await fetchReceipt(anchor, chosenChain);
      if (receipt && Array.isArray(receipt.logs)) {
        const freq = new Map<string, number>();
        for (const log of receipt.logs) {
          const addr = (log?.address as string | null) ? (log.address as string).toLowerCase() : null;
          if (!addr) continue;
          // Exclude token contracts: they create a huge, low-signal neighbor pool.
          if (tokenSet.has(addr)) continue;
          freq.set(addr, (freq.get(addr) || 0) + 1);
        }
        const top = Array.from(freq.entries())
          .sort((a, b) => {
            // Prefer known pool/protocol addresses first.
            const ap = poolSet.has(a[0]) ? 1 : 0;
            const bp = poolSet.has(b[0]) ? 1 : 0;
            if (ap !== bp) return bp - ap;
            // Then prefer higher log frequency.
            if (a[1] !== b[1]) return b[1] - a[1];
            return a[0].localeCompare(b[0]);
          })
          .slice(0, opts.maxRelatedToAddresses)
          .map(([a]) => a);
        for (const a of top) relatedTo.add(a);
      }
    } catch {
      // best-effort enrichment; continue with just anchorTo
    }
    if (relatedTo.size === 0) {
      skippedAnchors++;
      console.error(
        `[expand] skip anchor (no related to-addresses): ${anchor} chain=${chosenChain} block=${anchorBlock} (${idx + 1}/${anchors.length})`,
      );
      continue;
    }

    let addedForThisAnchor = 0;
    const start = Math.max(0, anchorBlock - opts.blockRadius);
    const end = anchorBlock + opts.blockRadius;

    for (let b = start; b <= end; b++) {
      if (addedForThisAnchor >= opts.maxNeighborsPerAnchor) break;

      const cacheKey = `${chosenChain}:${b}`;
      let block = blockCache.get(cacheKey);
      if (!block) {
        try {
          block = await fetchBlock(b, chosenChain);
        } catch (e: any) {
          block = null;
        }
        blockCache.set(cacheKey, block);
        // Simple bound on cache growth (avoid unbounded memory).
        if (blockCache.size > 4000) {
          // Delete oldest inserted key.
          const firstKey = blockCache.keys().next().value;
          blockCache.delete(firstKey);
        }
      }
      if (!block || !Array.isArray(block.transactions)) continue;

      for (const t of block.transactions) {
        if (addedForThisAnchor >= opts.maxNeighborsPerAnchor) break;
        const to = (t.to as string | null) ? (t.to as string).toLowerCase() : null;
        if (!to) continue;
        if (tokenSet.has(to)) continue;
        if (!relatedTo.has(to)) continue;
        const h = (t.hash as string | null) ? (t.hash as string).toLowerCase() : null;
        if (!h || !/^0x[0-9a-f]{64}$/.test(h)) continue;
        if (!outSet.has(h)) {
          outSet.add(h);
          addedForThisAnchor++;
          totalNeighbors++;
        }
      }
    }

    console.error(
      `[expand] anchor ${idx + 1}/${anchors.length} chain=${chosenChain} block=${anchorBlock} related_to=${relatedTo.size} +${addedForThisAnchor} neighbors (total_out=${outSet.size})`,
    );
  }

  const outList = Array.from(outSet);
  outList.sort();
  fs.writeFileSync(absOut, outList.join("\n") + "\n", "utf-8");

  console.error(
    `[expand] done: anchors_valid=${anchors.length} anchors_expanded=${expandedAnchors} anchors_skipped=${skippedAnchors} neighbors_added=${totalNeighbors} out=${outList.length} -> ${absOut}`,
  );
}

main().catch((e) => {
  console.error(`[expand] fatal: ${e?.message || e}`);
  process.exit(1);
});
