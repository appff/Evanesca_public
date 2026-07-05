/**
 * Build candidate hash list from all txs that touched dYdX SoloMargin
 * within the paper window (block 9193266 - 21368000 = 2020-01-01 to 2024-12-13).
 *
 * Strategy: tokentx (any token transfer to/from SoloMargin) gives us all txs
 * that performed flash loans (SoloMargin Operate semantics). Free Etherscan V2
 * API caps each call at 10000 records, so paginate by block range.
 */

import { preTasksForRegressionTest } from "../src/PreTasks";
import "../src/test/attacks/shared/testSetup";
import * as fs from "fs";
import * as path from "path";

preTasksForRegressionTest();

const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY || "";
const SOLO_MARGIN = "0x1E0447b19BB6EcFdAe1e4AE1694b0C3659614e4e";
const PAPER_START = 9193266; // 2020-01-01
const PAPER_END = 21368000;  // 2024-12-13

async function fetchEtherscan(params: Record<string, string>): Promise<any> {
  const axios = require("axios");
  const url = "https://api.etherscan.io/v2/api";
  const fullParams = { chainid: "1", ...params, apikey: ETHERSCAN_API_KEY };
  const r = await axios.get(url, { params: fullParams, timeout: 30000 });
  return r.data;
}

async function tokentxBatch(addr: string, startBlock: number, endBlock: number): Promise<any[]> {
  const r = await fetchEtherscan({
    module: "account",
    action: "tokentx",
    address: addr,
    startblock: String(startBlock),
    endblock: String(endBlock),
    page: "1",
    offset: "10000",
    sort: "asc",
  });
  if (r.status !== "1") {
    return [];
  }
  return r.result || [];
}

async function txlistBatch(addr: string, startBlock: number, endBlock: number): Promise<any[]> {
  const r = await fetchEtherscan({
    module: "account",
    action: "txlist",
    address: addr,
    startblock: String(startBlock),
    endblock: String(endBlock),
    page: "1",
    offset: "10000",
    sort: "asc",
  });
  if (r.status !== "1") return [];
  return r.result || [];
}

async function main() {
  console.log(`\n=========== dYdX SoloMargin tx search ===========`);
  console.log(`Range: blocks ${PAPER_START} - ${PAPER_END}`);
  console.log(`SoloMargin: ${SOLO_MARGIN}`);

  // Iterate in chunks; tokentx is capped at 10000 per call
  // Use adaptive chunking by block range
  const allHashes = new Set<string>();
  const tokenSightings = new Map<string, Set<string>>(); // tokenAddr -> set of tx hashes
  const blockChunks: Array<[number, number]> = [];
  const CHUNK = 200_000;
  for (let s = PAPER_START; s <= PAPER_END; s += CHUNK) {
    blockChunks.push([s, Math.min(s + CHUNK - 1, PAPER_END)]);
  }
  console.log(`block chunks: ${blockChunks.length}`);

  for (const [s, e] of blockChunks) {
    const records = await tokentxBatch(SOLO_MARGIN, s, e);
    for (const r of records) {
      allHashes.add(r.hash);
      const ta = (r.contractAddress || "").toLowerCase();
      if (!tokenSightings.has(ta)) tokenSightings.set(ta, new Set());
      tokenSightings.get(ta)!.add(r.hash);
    }
    console.log(`  blocks ${s}-${e}: ${records.length} tokentx records (cumulative unique tx: ${allHashes.size})`);
    // brief sleep to respect free-tier rate limit
    await new Promise(r => setTimeout(r, 300));
  }

  console.log(`\nUnique txs touching SoloMargin (tokentx): ${allHashes.size}`);
  console.log(`Unique tokens involved: ${tokenSightings.size}`);

  // Top tokens by tx count
  const tokenStats = [...tokenSightings.entries()]
    .map(([ta, set]) => ({ tokenAddr: ta, txCount: set.size }))
    .sort((a, b) => b.txCount - a.txCount);
  console.log(`\nTop tokens by tx count:`);
  for (const t of tokenStats.slice(0, 15)) {
    console.log(`  ${t.tokenAddr}  txs=${t.txCount}`);
  }

  const outDir = path.join(__dirname, "../wiki/raw");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `dydx_candidate_hashes_${Date.now()}.json`);
  fs.writeFileSync(
    outPath,
    JSON.stringify({
      timestamp: new Date().toISOString(),
      paper_window: { start_block: PAPER_START, end_block: PAPER_END },
      solo_margin: SOLO_MARGIN,
      total_unique_tx: allHashes.size,
      total_tokens: tokenSightings.size,
      candidate_hashes: [...allHashes],
      top_tokens: tokenStats.slice(0, 100),
    }, null, 2),
  );
  console.log(`\nwrote ${outPath}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
