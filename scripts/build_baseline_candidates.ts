/**
 * Build baseline candidates: txs touching the top Uniswap V2 stable pools
 * that probably represent routine arbitrage (no flash-loan, no oracle, no
 * multi-protocol). After running the pipeline we filter to PM-firing txs
 * WITHOUT flash-loan to map onto the paper's baseline definition.
 */
import { preTasksForRegressionTest } from "../src/PreTasks";
import "../src/test/attacks/shared/testSetup";
import * as fs from "fs";
import * as path from "path";

preTasksForRegressionTest();

const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY || "";
const PAPER_START = 9193266;
const PAPER_END = 21368000;

const POOLS = [
  { name: "USDC/WETH-V2", addr: "0xb4e16d0168e52d35cacd2c6185b44281ec28c9dc" },
  { name: "DAI/WETH-V2",  addr: "0xa478c2975ab1ea89e8196811f51a7b7ade33eb11" },
  { name: "WBTC/WETH-V2", addr: "0xbb2b8038a1640196fbe3e38816f3e67cba72d940" },
  { name: "USDT/WETH-V2", addr: "0x0d4a11d5eeaac28ec3f61d100daf4d40471f1852" },
];

async function fetchEs(p: Record<string,string>): Promise<any> {
  const axios = require("axios");
  const url = "https://api.etherscan.io/v2/api";
  const r = await axios.get(url, { params: { chainid:"1", ...p, apikey: ETHERSCAN_API_KEY }, timeout: 30000 });
  return r.data;
}

async function tokentxBatch(addr: string, startBlock: number, endBlock: number): Promise<any[]> {
  const r = await fetchEs({ module:"account", action:"tokentx", address:addr, startblock:String(startBlock), endblock:String(endBlock), page:"1", offset:"10000", sort:"asc" });
  if (r.status !== "1") return [];
  return r.result || [];
}

async function main() {
  const allHashes = new Set<string>();
  for (const p of POOLS) {
    console.log(`\n=== ${p.name}  ${p.addr} ===`);
    let start = PAPER_START;
    let chunkCount = 0;
    while (start <= PAPER_END) {
      const records = await tokentxBatch(p.addr, start, PAPER_END);
      if (records.length === 0) break;
      for (const r of records) allHashes.add(r.hash);
      const lastBlk = Number(records[records.length-1].blockNumber);
      console.log(`  blocks from ${start}: ${records.length} records (cumulative unique hashes: ${allHashes.size})`);
      if (records.length < 10000 || !isFinite(lastBlk)) break;
      start = lastBlk + 1;
      chunkCount++;
      if (chunkCount > 80) break; // safety
      await new Promise(r => setTimeout(r, 250));
    }
  }
  console.log(`\nTotal unique baseline candidate hashes: ${allHashes.size}`);
  const outDir = path.join(__dirname, "../wiki/raw");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `baseline_candidate_hashes_${Date.now()}.json`);
  fs.writeFileSync(outPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    paper_window: { start_block: PAPER_START, end_block: PAPER_END },
    pools: POOLS,
    candidate_hashes: [...allHashes],
  }, null, 2));
  console.log(`wrote ${outPath}`);
}

main().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1);});
