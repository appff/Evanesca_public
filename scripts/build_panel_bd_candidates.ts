/**
 * Aggregate candidate hashes for Panel B (Pendle V1) and Panel C (CreamY)
 * by tracing all txs from the known attacker addresses.
 */
import { preTasksForRegressionTest } from "../src/PreTasks";
import "../src/test/attacks/shared/testSetup";
import * as fs from "fs";
import * as path from "path";

preTasksForRegressionTest();

const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY || "";
const PAPER_START = 9193266;
const PAPER_END = 21368000;

const ATTACKERS = [
  { name: "PENDLE_PANEL_B", addr: "0xf90a1afa76ac139fdb453bf13182181d25e96a60", origin_tx: "0xaa03302b6e250acc254259e8252415ddcba5be82b6040b50cc4f180aedf15efc" },
  { name: "CREAMY_PANEL_C", addr: "0xe369c427edd0f409b4f6210b277dbdc0dd6c1d39", origin_tx: "0x48785cd3515f8558109f78b7cfe86a21df5dc6a35238cd20c4aa04a7ed831199" },
];

async function fetchEs(params: Record<string, string>): Promise<any> {
  const axios = require("axios");
  const url = "https://api.etherscan.io/v2/api";
  const fullParams = { chainid: "1", ...params, apikey: ETHERSCAN_API_KEY };
  const r = await axios.get(url, { params: fullParams, timeout: 30000 });
  return r.data;
}

async function paginatedTxList(addr: string, action: string): Promise<any[]> {
  const all: any[] = [];
  let startBlock = PAPER_START;
  while (true) {
    const r = await fetchEs({
      module: "account",
      action,
      address: addr,
      startblock: String(startBlock),
      endblock: String(PAPER_END),
      page: "1",
      offset: "10000",
      sort: "asc",
    });
    if (r.status !== "1") break;
    const res = r.result || [];
    if (res.length === 0) break;
    all.push(...res);
    if (res.length < 10000) break;
    const lastBlock = Number(res[res.length - 1].blockNumber);
    if (!isFinite(lastBlock) || lastBlock <= startBlock) break;
    startBlock = lastBlock + 1;
    await new Promise(r => setTimeout(r, 250));
  }
  return all;
}

async function main() {
  const all: Record<string, { txs: number; internal: number; hashes: string[] }> = {};
  const candidate = new Set<string>();
  for (const a of ATTACKERS) {
    console.log(`\n=== ${a.name}  ${a.addr} ===`);
    const txs = await paginatedTxList(a.addr, "txlist");
    const internal = await paginatedTxList(a.addr, "txlistinternal");
    const hashes = new Set<string>();
    for (const t of txs) hashes.add(t.hash);
    for (const t of internal) hashes.add(t.hash);
    candidate.add(a.origin_tx); // ensure original tx is included
    for (const h of hashes) candidate.add(h);
    all[a.name] = { txs: txs.length, internal: internal.length, hashes: [...hashes] };
    console.log(`  outgoing: ${txs.length}, internal: ${internal.length}, unique hashes: ${hashes.size}`);
  }

  console.log(`\nTotal aggregated candidate hashes: ${candidate.size}`);

  const outDir = path.join(__dirname, "../wiki/raw");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `panel_bc_candidate_hashes_${Date.now()}.json`);
  fs.writeFileSync(outPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    paper_window: { start_block: PAPER_START, end_block: PAPER_END },
    attackers: ATTACKERS,
    per_attacker: all,
    candidate_hashes: [...candidate],
  }, null, 2));
  console.log(`wrote ${outPath}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
