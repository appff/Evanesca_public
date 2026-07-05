/**
 * Find more TEND/WING attack transactions by searching:
 * (a) all txs from the known TEND attacker address
 * (b) all txs that interact with TEND/WING token contracts
 * Reuses Etherscan API and the existing web3 setup.
 */

import { preTasksForRegressionTest } from "../src/PreTasks";
import { web3 } from "../src/PreTasks";
import * as fs from "fs";
import * as path from "path";

preTasksForRegressionTest();

const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY || "";

const TOKEN_TARGETS = [
  {
    name: "TEND",
    token: "0x1453Dbb8A29551adE11D89825CA812e05317EaEB",
    pool: "0xcfb8cf118B4F0aBb2e8ce6dBEB90D6Bc0a62693d", // TEND/WETH UniV2
    knownAttacker: "0xcb50b02d2f87a1f908c6f14ffe8ea4a952e47d61",
  },
  {
    name: "WINGW",
    token: "0x3b358b2Cca708C09eb95e82a60bDf3aa5b79077e",
    pool: "",
    knownAttacker: "",
  },
  {
    name: "WING-cB3df", // Wings (WING) - chicken wing icon match
    token: "0xcB3df3108635932D912632ef7132d03EcFC39080",
    pool: "",
    knownAttacker: "",
  },
  {
    name: "WINGS-old", // WINGS (WINGS) - 2017 era, Wings DAO
    token: "0x667088b212ce3d06a1b553a7221E1fD19000d9aF",
    pool: "",
    knownAttacker: "",
  },
  {
    name: "pWING", // Poly Ontology Wing Token
    token: "0xDb0f18081b505A7DE20B18ac41856BCB4Ba86A1a",
    pool: "",
    knownAttacker: "",
  },
];

// Picked up dynamically from CLI: the script will iterate all targets
// (pre-existing TEND lookup is preserved with the first item)
const TARGETS = TOKEN_TARGETS[Number(process.env.TARGET_INDEX || "0")];

async function fetchEtherscan(params: Record<string, string>): Promise<any> {
  const axios = require("axios");
  // Etherscan V2 multichain endpoint (chainid=1 = mainnet)
  const url = "https://api.etherscan.io/v2/api";
  const fullParams = { chainid: "1", ...params, apikey: ETHERSCAN_API_KEY };
  const r = await axios.get(url, { params: fullParams, timeout: 30000 });
  return r.data;
}

async function listTxsByAddress(addr: string): Promise<any[]> {
  const r = await fetchEtherscan({
    module: "account",
    action: "txlist",
    address: addr,
    startblock: "0",
    endblock: "99999999",
    sort: "asc",
  });
  if (r.status !== "1") {
    console.log(`  no txs or error: ${r.message}`);
    return [];
  }
  return r.result || [];
}

async function listInternalTxs(addr: string): Promise<any[]> {
  const r = await fetchEtherscan({
    module: "account",
    action: "txlistinternal",
    address: addr,
    startblock: "0",
    endblock: "99999999",
    sort: "asc",
  });
  if (r.status !== "1") {
    console.log(`  no internal txs or error: ${r.message}`);
    return [];
  }
  return r.result || [];
}

async function listTokenTransfers(tokenAddr: string): Promise<any[]> {
  const r = await fetchEtherscan({
    module: "account",
    action: "tokentx",
    contractaddress: tokenAddr,
    page: "1",
    offset: "10000",
    sort: "asc",
  });
  if (r.status !== "1") {
    console.log(`  no transfers or error: ${r.message}`);
    return [];
  }
  return r.result || [];
}

async function main() {
  console.log("\n=========== TEND/WING ATTACK SEARCH ===========");
  console.log(`Etherscan API key set? ${ETHERSCAN_API_KEY ? "yes" : "NO -- set ETHERSCAN_API_KEY env var"}`);

  const candidateHashes = new Set<string>();

  if (TARGETS.knownAttacker) {
    console.log(`\n[1] Outgoing txs from attacker ${TARGETS.knownAttacker}...`);
    const fromAttacker = await listTxsByAddress(TARGETS.knownAttacker);
    console.log(`  found ${fromAttacker.length} txs`);
    for (const tx of fromAttacker) {
      candidateHashes.add(tx.hash);
    }

    console.log(`\n[2] Internal txs touching attacker...`);
    const internalAtt = await listInternalTxs(TARGETS.knownAttacker);
    console.log(`  found ${internalAtt.length} internal txs`);
    for (const tx of internalAtt) {
      candidateHashes.add(tx.hash);
    }
  } else {
    console.log(`\n[1,2] No known attacker for ${TARGETS.name}; skipping attacker-trace step.`);
  }

  console.log(`\n[3] Token transfers of ${TARGETS.name} (${TARGETS.token})...`);
  const tokenTransfers = await listTokenTransfers(TARGETS.token);
  console.log(`  found ${tokenTransfers.length} ${TARGETS.name} transfer events`);
  // Group by tx hash to dedupe
  const tendTxHashes = new Set<string>();
  for (const t of tokenTransfers) {
    tendTxHashes.add(t.hash);
  }
  console.log(`  unique txs touching ${TARGETS.name}: ${tendTxHashes.size}`);

  // Filter: heavy token activity (suspect attack candidates)
  // Group transfers per tx, count, and flag txs with >=3 transfers (typical reward-pump)
  const txTransferCount = new Map<string, number>();
  for (const t of tokenTransfers) {
    txTransferCount.set(t.hash, (txTransferCount.get(t.hash) || 0) + 1);
  }
  const minTransfers = Number(process.env.MIN_TRANSFERS || "3");
  const heavyTxs = [...txTransferCount.entries()]
    .filter(([_, cnt]) => cnt >= minTransfers)
    .map(([h, cnt]) => ({ hash: h, transferCount: cnt }))
    .sort((a, b) => b.transferCount - a.transferCount);
  console.log(`\n  heavy ${TARGETS.name}-touching txs (>=${minTransfers} transfers): ${heavyTxs.length}`);
  for (const h of heavyTxs.slice(0, 10)) {
    candidateHashes.add(h.hash);
    console.log(`    ${h.hash}  transfers=${h.transferCount}`);
  }
  // Add all heavy
  for (const h of heavyTxs) candidateHashes.add(h.hash);

  console.log(`\n[summary] total candidate tx hashes collected: ${candidateHashes.size}`);

  const outDir = path.join(__dirname, "../wiki/raw");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `${TARGETS.name.toLowerCase()}_candidate_hashes_${Date.now()}.json`);
  fs.writeFileSync(
    outPath,
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        targets: TARGETS,
        token_transfer_events: tokenTransfers.length,
        unique_token_txs: tendTxHashes.size,
        heavy_token_txs: heavyTxs.length,
        candidate_hashes: [...candidateHashes],
        heavy_tend_top: heavyTxs.slice(0, 200),
      },
      null,
      2,
    ),
  );
  console.log(`\nwrote candidates to ${outPath}`);

  console.log("================================================\n");
}

main().catch((err) => {
  console.error("error:", err);
  process.exit(1);
});
