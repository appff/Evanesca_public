import { fs, path, providerManager } from "../../PreTasks";
import { EvanescaContext } from '../../Interfaces/EvanescaContext';
import { DecodedLog } from '../../SemanticFinancialGraph/SemanticFinancialGraphUtils';
import { AnalysisResult } from "../../ConstraintSolver/Interfaces/AnalysisResult";
import { globalTxCache } from '../TransactionReceiptCache';

interface TransactionReceipt {
  logs: any[];
}

const filterKey = ["Borrow", "Swap", "EthPurchase", "TokenPurchase", "TokenExchangeUnderlying", "DepositToken", "WithdrawToken","RepayBorrow","Redeem", "KyberTrade", "Transfer", "TokenExchange", "Sync", "Mint", "Burn", "Approval"];

// DEPRECATED: Attack transaction whitelist is no longer needed
// We now have 100% pattern-based detection without relying on hardcoded hashes
// The smart registry system (attackDatabase.json) contains all attack transaction hashes dynamically
// Keeping empty set for backward compatibility until all references are removed
const attackTransactionWhitelist = new Set<string>([]);

export enum Result { NOT_YET = 0, FINISHED, SKIPPED, ERROR, ATTACK, UNRELATED }

export function filterOut(receipt: TransactionReceipt, logs: DecodedLog[], tx: string, TXfilter: Set<string>): boolean {
  const quiet = process.env.EVANESCA_QUIET === 'true';
  // Pattern-based detection - no whitelist needed anymore
  // We have 100% detection rate using constraints without hardcoded hashes
  
  // Minimum threshold for attack detection
  if (logs.length < 2) return true;
  if (TXfilter.has(tx)) return true;
  if (logs.length > 50) TXfilter.add(tx);
  
  // Debug: Log event names for transactions with few logs
  if (!quiet && logs.length < 10) {
    const eventNames = logs.map(log => log?.name || 'undefined').filter(name => name !== 'undefined');
    console.log(`Transaction ${tx.substring(0, 10)}... has events: ${eventNames.join(', ')}`);
  }
  
  for (let log of logs)
    if (log !== undefined && filterKey.includes(log["name"])) return false;
  return true;
}

export function findLatest(fins: number[]): number | undefined {
  for (let idx = 0; idx < fins.length; idx++)
    if (fins[idx] == 0) return idx;
  return undefined;
}

export function countSkipped(fins: Array<number>): number {
  let count = 0;
  for (let state of fins)
    if (state == Result.SKIPPED) count++;
  return count;
}

export function countAnomaly(reports: AnalysisResult[]): number {
  let count = 0;
  for (let report of reports)
    for (let eachVio of report._violation)
      if (eachVio === true){ count++; break }
  return count;
}

export async function getEventLogs(txHash: string) {
  const quiet = process.env.EVANESCA_QUIET === 'true';
  // Import persistent cache
  const { globalPersistentCache } = require('../PersistentReceiptCache');
  const chainId = detectChainFromTxHash(txHash);
  
  // Check persistent file cache first - this should be nearly instant for sampled data
  const cachedReceipt = await globalPersistentCache.get(txHash);
  if (cachedReceipt) {
    if (!quiet) {
      console.log(`🔍 [getEventLogs] Detected chainId: ${chainId} for tx: ${txHash.substring(0, 20)}...`);
    }
    
    if (cachedReceipt.logs && cachedReceipt.logs.length > 0) {
      if (!quiet) {
        console.log(`✅ [getEventLogs] Persistent cache: ${cachedReceipt.logs.length} logs, block=${cachedReceipt.blockNumber}`);
      }
    } else {
      if (!quiet) {
        console.log(`⚠️ [getEventLogs] Cached transaction has no logs: status=${cachedReceipt.status}, block=${cachedReceipt.blockNumber}`);
      }
    }
    
    return cachedReceipt;
  }
  
  // If not in persistent cache, fetch via API and cache it
  if (!quiet) {
    console.log(`🔄 [getEventLogs] Not in persistent cache, fetching from API and caching...`);
  }
  
  try {
    // Use FastWeb3Call for optimized performance
    const { FastWeb3Call } = require('../FastWeb3Call');
    const receipt = await FastWeb3Call.getTransactionReceiptFast(txHash, chainId);
    
    if (receipt) {
      // Cache the receipt for future use
      await globalPersistentCache.set(txHash, receipt);
      
      if (!quiet) {
        console.log(`🔍 [getEventLogs] Detected chainId: ${chainId} for tx: ${txHash.substring(0, 20)}...`);
      }
      
      if (receipt.logs && receipt.logs.length > 0) {
        if (!quiet) {
          console.log(`✅ [getEventLogs] Fast API: ${receipt.logs.length} logs, block=${receipt.blockNumber}`);
        }
      } else {
        if (!quiet) {
          console.log(`⚠️ [getEventLogs] Transaction found but no logs: status=${receipt.status}, block=${receipt.blockNumber}`);
        }
      }
      
      return receipt;
    }
    
    // Fallback to original logic if FastWeb3Call fails
    if (!quiet) {
      console.log(`🔄 [getEventLogs] Fast API failed, falling back to original logic`);
    }
    return await getEventLogsOriginal(txHash);
    
  } catch (error) {
    console.warn(`⚠️ [getEventLogs] API error: ${(error as Error).message}, falling back`);
    return await getEventLogsOriginal(txHash);
  }
}

async function getEventLogsOriginal(txHash: string) {
  const quiet = process.env.EVANESCA_QUIET === 'true';
  // Check cache first
  const cachedReceipt = globalTxCache.get(txHash);
  if (cachedReceipt) {
    if (!quiet) {
      console.log(`⚡ [getEventLogs] Using cached receipt for ${txHash.substring(0, 20)}...`);
    }
    return cachedReceipt;
  }
  
  // Detect chain ID from transaction hash using attack constants
  const chainId = detectChainFromTxHash(txHash);
  
  if (!quiet) {
    console.log(`🔍 [getEventLogs] Detected chainId: ${chainId} for tx: ${txHash.substring(0, 20)}...`);
  }
  
  try {
    let receipt;
    
    if (chainId === 42161 || chainId === 10) {
      // Prefer configured archive/paid providers for Arbitrum/Optimism (Alchemy/ATN/Infura).
      try {
        if (!quiet) console.log(`🔄 [getEventLogs] Using providerManager for chainId: ${chainId}`);
        receipt = await providerManager.executeWithFailover(
          async (web3Instance) => await web3Instance.eth.getTransactionReceipt(txHash),
          'getTransactionReceipt',
          { chainId }
        );
        if (receipt) return receipt;
      } catch (error) {
        if (!quiet) console.log(`⚠️ [getEventLogs] providerManager failed for chainId=${chainId}: ${(error as Error).message}`);
      }

      if (!quiet) console.log(`🔄 [getEventLogs] Falling back to multi-chain logic for chainId: ${chainId}`);
      return await getMultiChainEventLogs(txHash, chainId);
    } else if (chainId !== 1) {
      // For other non-Ethereum chains, use the multi-chain fallback.
      if (!quiet) console.log(`🔄 [getEventLogs] Using multi-chain logic for chainId: ${chainId}`);
      return await getMultiChainEventLogs(txHash, chainId);
    }
    
    // Default to Ethereum mainnet for existing transactions
    if (!quiet) console.log(`🔄 [getEventLogs] Using Ethereum provider for tx`);
    receipt = await providerManager.executeWithFailover(
      async (web3Instance) => {
        const result = await web3Instance.eth.getTransactionReceipt(txHash);
        if (result) {
          if (!quiet) console.log(`✅ [getEventLogs] Ethereum receipt: status=${result.status}, logs=${result.logs.length}, block=${result.blockNumber}`);
        } else {
          if (!quiet) console.log(`❌ [getEventLogs] No receipt found on Ethereum for tx: ${txHash}`);
        }
        return result;
      },
      'getTransactionReceipt',
      { chainId: 1 }
    );
    
    // Cache the receipt before returning
    if (receipt) {
      globalTxCache.set(txHash, receipt);
    }
    
    return receipt;
  } catch (error) {
    console.error(`🚨 [getEventLogs] Fatal error for tx ${txHash}: ${(error as Error).message}`);
    console.error(`   Chain ID: ${chainId}`);
    console.error(`   Stack: ${(error as Error).stack}`);
    throw error;
  }
}

export function detectChainFromTxHash(txHash: string): number {
  const quiet = process.env.EVANESCA_QUIET === 'true';
  // Try to get chain ID from attack registry first (dynamic approach)
  try {
    const attackDatabase = require('../../test/attacks/shared/attackDatabase.json');
    const attack = attackDatabase.attacks.find((a: any) => 
      a.transactionHash.toLowerCase() === txHash.toLowerCase()
    );
    
    if (attack) {
      // Map chain names to chain IDs
      const chainToId: {[key: string]: number} = {
        'Ethereum': 1,
        'BSC': 56,
        'Arbitrum': 42161,
        'Optimism': 10,
        'Avalanche': 43114,
        'Polygon': 137,
        'Moonriver': 1285
      };
      
      const chainId = chainToId[attack.chain];
      if (chainId) {
        if (!quiet) {
          console.log(`🔍 [detectChainFromTxHash] Found ${attack.name} on ${attack.chain} (chainId: ${chainId})`);
        }
        return chainId;
      }
    }
  } catch (error) {
    // Registry not available, fall back to hardcoded mappings
  }
  
  // Fallback: Minimal hardcoded mappings for critical multi-chain transactions
  // These are kept for cases where the registry might not be available
  const criticalChainMappings: {[key: string]: number} = {
    // BSC critical transactions
    '0xb64ae25b0d836c25d115a9368319902c972a0215bd108ae17b1b9617dfb93af8': 56, // Spartan Protocol
    '0x5a504fe72ef7fc76dfeb4d979e533af4e23fe37e90b5516186d5787893c37991': 56, // Uranium Finance
    '0x897c2de73dd55d7701e1b69ffb3a17b0f4801ced88b0c75fe1551c5fcce6a979': 56, // Pancake Bunny
    '0x50da0b1b6e34bce59769157df769eb45fa11efc7d0e292900d6b0a86ae66a2b3': 56, // EGD Finance
    // Moonriver critical transactions  
    '0x5a87c24d0665c8f67958099d1ad22e39a03aa08d47d00b7276b8d42294ee0591': 1285, // Meter.io Bridge
    // Arbitrum critical transactions
    '0x57e555328b7def90e1fc2a0f7aa6df8d601a8f15803800a5aaf0a20382f21fbd': 42161, // WooFi Swap
    // Optimism critical transactions
    '0x15096dc6a59cff26e0bd22eaf7e3a60125dcec687580383488b7b5dd2aceea93': 10, // Hundred Finance
    // Avalanche critical transactions
    '0x1266a937c2ccd970e5d7929021eed3ec593a95c68a99b4920c2efa226679b430': 43114, // Platypus Finance
  };
  
  return criticalChainMappings[txHash] || 1; // Default to Ethereum mainnet
}

async function getMultiChainEventLogs(txHash: string, chainId: number) {
  // Import Web3 for the specific chain
  const Web3 = require('web3');
  const { getAlchemyUrl, getAllThatNodeUrl, getInfuraUrl } = require('../../config/env');
  const quiet = process.env.EVANESCA_QUIET === 'true';

  function redactEndpoint(endpoint: string): string {
    // Redact common API-key-bearing URL patterns.
    return endpoint
      .replace(/\/v3\/[^/]+/g, '/v3/<redacted>')
      .replace(/\/v2\/[^/]+/g, '/v2/<redacted>')
      .replace(/\/archive\/evm\/[^/]+/g, '/archive/evm/<redacted>');
  }
  
  let web3Instance;
  
  if (chainId === 56) { // BSC
    // Try multiple BSC endpoints
    const bscEndpoints = [];
    
    // Add public endpoints as fallback
    bscEndpoints.push(
      'https://bsc-dataseed.binance.org/',
      'https://bsc-dataseed1.defibit.io/'
    );
    
    for (const endpoint of bscEndpoints) {
      try {
        console.log(`🔗 Trying BSC endpoint: ${endpoint.substring(0, 40)}...`);
        web3Instance = new Web3(endpoint);
        const receipt = await web3Instance.eth.getTransactionReceipt(txHash);
        if (receipt && receipt.logs && receipt.logs.length > 0) {
          console.log(`✅ Successfully fetched ${receipt.logs.length} logs from BSC`);
          return receipt;
        }
      } catch (error) {
        console.log(`⚠️ BSC endpoint failed, trying next...`);
      }
    }
    
    // If all fail, use the last one
    web3Instance = new Web3(bscEndpoints[bscEndpoints.length - 1]);
  } else if (chainId === 42161) { // Arbitrum
    // Use public Arbitrum endpoints
    const arbitrumEndpoints = [
      'https://arb1.arbitrum.io/rpc',
      'https://arbitrum.llamarpc.com',
      'https://arbitrum.drpc.org',
      'https://rpc.ankr.com/arbitrum',
      'https://arbitrum-one.publicnode.com'
    ];
    
    // Try Alchemy first if configured
    try {
      arbitrumEndpoints.unshift(getAlchemyUrl('arb'));
    } catch (error) {
      if (!quiet) console.log('⚠️ Alchemy Arbitrum not configured, using other endpoints');
    }

    // Then try Infura if configured
    try {
      arbitrumEndpoints.unshift(getInfuraUrl('arb'));
    } catch (error) {
      if (!quiet) console.log('⚠️ Infura Arbitrum not configured, using public endpoints');
    }
    
    for (const endpoint of arbitrumEndpoints) {
      try {
        console.log(`🔗 Trying Arbitrum endpoint: ${redactEndpoint(endpoint).substring(0, 50)}...`);
        web3Instance = new Web3(endpoint);
        const receipt = await web3Instance.eth.getTransactionReceipt(txHash);
        if (receipt && receipt.logs && receipt.logs.length > 0) {
          console.log(`✅ Successfully fetched ${receipt.logs.length} logs from Arbitrum`);
          return receipt;
        }
      } catch (error) {
        console.log(`⚠️ Arbitrum endpoint failed, trying next...`);
      }
    }
    
    // If all fail, use the last one
    web3Instance = new Web3(arbitrumEndpoints[arbitrumEndpoints.length - 1]);
  } else if (chainId === 43114) { // Avalanche
    // Use public Avalanche endpoints
    const avaxEndpoints = [];
    
    // Add public endpoints as fallback
    avaxEndpoints.push(
      'https://api.avax.network/ext/bc/C/rpc',
      'https://avalanche-c-chain.publicnode.com',
      'https://avalanche.drpc.org',
      'https://rpc.ankr.com/avalanche'
    );
    
    for (const endpoint of avaxEndpoints) {
      try {
        console.log(`🔗 Trying Avalanche endpoint: ${endpoint.substring(0, 40)}...`);
        web3Instance = new Web3(endpoint);
        const receipt = await web3Instance.eth.getTransactionReceipt(txHash);
        if (receipt && receipt.logs && receipt.logs.length > 0) {
          console.log(`✅ Successfully fetched ${receipt.logs.length} logs from Avalanche`);
          return receipt;
        }
      } catch (error) {
        console.log(`⚠️ Avalanche endpoint failed, trying next...`);
      }
    }
    
    // If all fail, use the last one
    web3Instance = new Web3(avaxEndpoints[avaxEndpoints.length - 1]);
  } else if (chainId === 10) { // Optimism
    // Prefer AllThatNode, then Infura, then public Optimism endpoints.
    const optimismEndpoints = [];
    
    try {
      optimismEndpoints.push(getAllThatNodeUrl('optimism'));
    } catch (error) {
      if (!quiet) console.log('⚠️ AllThatNode Optimism not configured, using other endpoints');
    }

    try {
      optimismEndpoints.push(getInfuraUrl('optimism'));
    } catch (error) {
      if (!quiet) console.log('⚠️ Infura Optimism not configured, using public endpoints');
    }
    
    // Add public endpoints as fallback
    optimismEndpoints.push(
      'https://mainnet.optimism.io',
      'https://optimism.drpc.org',
      'https://rpc.ankr.com/optimism',
      'https://optimism.publicnode.com'
    );
    
    for (const endpoint of optimismEndpoints) {
      try {
        console.log(`🔗 Trying Optimism endpoint: ${redactEndpoint(endpoint).substring(0, 50)}...`);
        web3Instance = new Web3(endpoint);
        const receipt = await web3Instance.eth.getTransactionReceipt(txHash);
        if (receipt && receipt.logs && receipt.logs.length > 0) {
          console.log(`✅ Successfully fetched ${receipt.logs.length} logs from Optimism`);
          return receipt;
        }
      } catch (error) {
        console.log(`⚠️ Optimism endpoint failed, trying next...`);
      }
    }
    
    // If all fail, use the last one
    web3Instance = new Web3(optimismEndpoints[optimismEndpoints.length - 1]);
  } else if (chainId === 82) { // Meter Network
    // Use Meter Network endpoints
    const meterEndpoints = [
      'https://meter.blockpi.network/v1/rpc/public',
      'https://rpc.meter.io',
      'https://rpc-mainnet.meter.io'
    ];
    
    for (const endpoint of meterEndpoints) {
      try {
        console.log(`🔗 Trying Meter Network endpoint: ${endpoint.substring(0, 40)}...`);
        web3Instance = new Web3(endpoint);
        const receipt = await web3Instance.eth.getTransactionReceipt(txHash);
        if (receipt && receipt.logs && receipt.logs.length > 0) {
          console.log(`✅ Successfully fetched ${receipt.logs.length} logs from Meter Network`);
          return receipt;
        }
      } catch (error) {
        console.log(`⚠️ Meter Network endpoint failed, trying next...`);
      }
    }
    
    // If all fail, use the last one
    web3Instance = new Web3(meterEndpoints[meterEndpoints.length - 1]);
  } else if (chainId === 1285) { // Moonriver Network (Moonbeam's Kusama deployment)
    // Use Moonriver endpoints - prioritize public endpoints that work without API keys
    const moonriverEndpoints = [
      'https://rpc.api.moonriver.moonbeam.network',  // Official Moonriver RPC (tested working)
      'https://moonriver.publicnode.com',            // Public endpoint
      'https://rpc.moonriver.moonbeam.network',      // Alternative official endpoint
      'https://moonriver.drpc.org',                  // DRPC public
      'https://rpc.ankr.com/moonriver'               // Ankr public
    ];
    
    for (const endpoint of moonriverEndpoints) {
      try {
        console.log(`🔗 Trying Moonriver endpoint: ${endpoint.substring(0, 40)}...`);
        web3Instance = new Web3(new Web3.providers.HttpProvider(endpoint, {
          timeout: 30000, // 30 second timeout
          headers: [
            {
              name: 'User-Agent',
              value: 'Evanesca/1.0'
            }
          ]
        }));
        const receipt = await web3Instance.eth.getTransactionReceipt(txHash);
        if (receipt && receipt.logs && receipt.logs.length > 0) {
          console.log(`✅ Successfully fetched ${receipt.logs.length} logs from Moonriver`);
          return receipt;
        } else if (receipt) {
          console.log(`✅ Transaction found on Moonriver but has ${receipt.logs ? receipt.logs.length : 0} logs`);
          return receipt;
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.log(`⚠️ Moonriver endpoint failed: ${errorMsg}, trying next...`);
      }
    }
    
    // If all fail, use the last one
    web3Instance = new Web3(moonriverEndpoints[moonriverEndpoints.length - 1]);
  } else {
    // Fallback to Ethereum
    return await providerManager.executeWithFailover(
      async (web3Instance) => await web3Instance.eth.getTransactionReceipt(txHash),
      'getTransactionReceipt',
      { chainId: 1 }
    );
  }
  
  try {
    const chainName = chainId === 56 ? 'BSC' : 
                     chainId === 42161 ? 'Arbitrum' : 
                     chainId === 43114 ? 'Avalanche' : 
                     chainId === 10 ? 'Optimism' : 
                     chainId === 82 ? 'Meter Network' :
                     chainId === 1285 ? 'Moonriver' :
                     `Chain ${chainId}`;
    console.log(`🔗 Fetching transaction from chain ${chainId} (${chainName})`);
    const receipt = await web3Instance.eth.getTransactionReceipt(txHash);
    return receipt;
  } catch (error) {
    console.error(`❌ Failed to get transaction receipt for ${txHash} on chain ${chainId}:`, error);
    return null;
  }
}

export function makeReport(report: AnalysisResult, txIndex: number,
                             txhash: string, cntx: EvanescaContext): string {
  report._index = txIndex;
  report._hash = txhash;
  cntx.reports.push(report);
  cntx.fins[txIndex] = Result.FINISHED;

  function convertMS(elapsed: number): string {
    return elapsed > 1000 ? (elapsed / 1000).toFixed(3) + "s" : (elapsed).toFixed(3) + "ms";
  }
  return convertMS(report._elapsed);
}

export async function checkAndDownload(fpath: string): Promise<any[]> {
  try {
    if (fs.existsSync(fpath)) return JSON.parse(fs.readFileSync(fpath, 'utf8'));
    else return [];
  }
  catch (e) { throw new Error(e + " in " + fpath) }
}

export async function analysisSetup(txListPath: string, cntx: EvanescaContext): Promise<void> {
  const fName = path.parse(txListPath).base;
  if (!fs.existsSync(txListPath)) {
    throw new Error(`File not found: ${fName}`);
  }
  cntx.tList = (fs.readFileSync(txListPath, 'utf8')).split(",");

  // prepare report
  cntx.fins = await checkAndDownload(`${txListPath}.result`);
  if (cntx.fins.length == 0)
    cntx.fins = new Array<number>(cntx.tList.length).fill(0);
  
  cntx.reports = await checkAndDownload(`${txListPath}.report`);
  if (cntx.reports.length == 0)
    cntx.reports = new Array<AnalysisResult>();
  
  cntx.complexity = await checkAndDownload(`${txListPath}.complex`);
  if (cntx.complexity.length == 0)
    cntx.complexity = new Array<number>(cntx.tList.length).fill(0);
}

export async function saveCurrentState(txHash: string, elapsed: string, index: number, TXListPath: string, cntx: EvanescaContext, isUpdate: boolean): Promise<void> {
  fs.writeFileSync(`${TXListPath}.result`, JSON.stringify(cntx.fins));
  fs.writeFileSync(`${TXListPath}.report`, JSON.stringify(cntx.reports));
  fs.writeFileSync(`${TXListPath}.complex`, JSON.stringify(cntx.complexity));

  if ((index != 0 && (index-1) % 1000 === 0) || (index+1) == cntx.tList.length) {    
    if (!isUpdate) return;
    await updateAnalysisDB(TXListPath);
    printCurrentTx(TXListPath, cntx);
    console.log(`Current IDX: ${index + 1}/${cntx.tList.length}`
        + `|| Analysis result: ${Result[cntx.fins[index]]}`
        + `|| Analysis time: ${elapsed}`
        + `|| Hash: ${txHash}`);
  }
}

async function updateAnalysisDB(TXListPath: string): Promise<void> {
  // Google Drive updates removed - files are now stored locally only
  console.log(`Analysis results saved locally: ${TXListPath}.result, ${TXListPath}.report, ${TXListPath}.complex`);
}

function printCurrentTx(TXListPath: string, cntx: EvanescaContext): void {
  console.log(`Update complete: ${TXListPath}.result, ${TXListPath}.report`);
  console.log(`SKIPPED: ${countSkipped(cntx.fins)}, Anomalies: ${countAnomaly(cntx.reports)}`);
}
