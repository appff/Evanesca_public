import w3 from 'web3';
import { getFeeds } from "./Utils/Chainlink/ChainlinkFeedParser"
import { AddressWithNorlizedToken, PoolToNormlizedToken } from './SemanticFinancialGraph/EdgeAdderUtils';
import { Web3ProviderManager } from './Utils/Web3/Web3ProviderManager';
import { getAlchemyUrl, getAllThatNodeUrl, getInfuraUrl } from './config/env';

export const cheerio = require ("cheerio");
export const fs = require("fs");
export const path = require("path");

// Initialize Web3 Provider Manager with multiple endpoints
const web3ProviderManager = new Web3ProviderManager();

// Prefer Infura for large-scale runs (project-wide configuration).
try {
  web3ProviderManager.addProvider({
    name: 'eth-infura',
    url: getInfuraUrl('eth'),
    chainId: 1,
    priority: 1,
    timeout: 30000,
    maxRetries: 3,
    healthCheckInterval: 60000,
  });
} catch (error) {
  console.warn('⚠️  Infura Ethereum provider not configured:', (error as Error).message);
}

// Fallbacks for Ethereum mainnet receipts when Infura is not configured.
// (Public endpoints are often unreliable for historical receipts.)
try {
  web3ProviderManager.addProvider({
    name: 'eth-allthatnode',
    url: getAllThatNodeUrl('eth'),
    chainId: 1,
    priority: 2,
    timeout: 35000,
    maxRetries: 3,
    healthCheckInterval: 60000,
  });
} catch (error) {
  console.warn('⚠️  AllThatNode Ethereum provider not configured:', (error as Error).message);
}

try {
  web3ProviderManager.addProvider({
    name: 'eth-alchemy',
    url: getAlchemyUrl('eth'),
    chainId: 1,
    priority: 3,
    timeout: 35000,
    maxRetries: 3,
    healthCheckInterval: 60000,
  });
} catch (error) {
  console.warn('⚠️  Alchemy Ethereum provider not configured:', (error as Error).message);
}

// Infura Arbitrum (if enabled on the project).
try {
  web3ProviderManager.addProvider({
    name: 'arb-infura',
    url: getInfuraUrl('arb'),
    chainId: 42161,
    priority: 10,
    timeout: 30000,
    maxRetries: 3,
    healthCheckInterval: 60000,
  });
} catch (error) {
  console.warn('⚠️  Infura Arbitrum provider not configured:', (error as Error).message);
}

// Prefer Alchemy for Arbitrum receipts (fallbacks to Infura/public as needed).
try {
  web3ProviderManager.addProvider({
    name: 'arb-alchemy',
    url: getAlchemyUrl('arb'),
    chainId: 42161,
    priority: 5,
    timeout: 30000,
    maxRetries: 3,
    healthCheckInterval: 60000,
  });
} catch (error) {
  console.warn('⚠️  Alchemy Arbitrum provider not configured:', (error as Error).message);
}

// Prefer AllThatNode/Alchemy for BSC receipts when available.
try {
  web3ProviderManager.addProvider({
    name: 'bsc-infura',
    url: getInfuraUrl('bsc'),
    chainId: 56,
    priority: 7,
    timeout: 30000,
    maxRetries: 3,
    healthCheckInterval: 60000,
  });
} catch (error) {
  console.warn('⚠️  Infura BSC provider not configured:', (error as Error).message);
}

try {
  web3ProviderManager.addProvider({
    name: 'bsc-allthatnode',
    url: getAllThatNodeUrl('bsc'),
    chainId: 56,
    priority: 8,
    timeout: 35000,
    maxRetries: 3,
    healthCheckInterval: 90000,
  });
} catch (error) {
  console.warn('⚠️  AllThatNode BSC provider not configured:', (error as Error).message);
}

try {
  web3ProviderManager.addProvider({
    name: 'bsc-alchemy',
    url: getAlchemyUrl('bsc'),
    chainId: 56,
    priority: 9,
    timeout: 35000,
    maxRetries: 3,
    healthCheckInterval: 90000,
  });
} catch (error) {
  console.warn('⚠️  Alchemy BSC provider not configured:', (error as Error).message);
}

// Add public Ethereum RPC endpoints as last resort (NO RECEIPT SUPPORT)
web3ProviderManager.addProvider({
  name: 'public-eth',
  url: 'https://eth-mainnet.public.blastapi.io',
  chainId: 1,
  priority: 20,  // Lowest priority - public nodes can't fetch old receipts
  timeout: 40000,
  maxRetries: 2,
  healthCheckInterval: 120000
});

// Add public BSC RPC endpoint as last resort (NO RECEIPT SUPPORT)
web3ProviderManager.addProvider({
  name: 'public-bsc',
  url: 'https://bsc-dataseed.binance.org/',
  chainId: 56,
  priority: 21,  // Lowest priority - public nodes can't fetch old receipts
  timeout: 40000,
  maxRetries: 2,
  healthCheckInterval: 120000
});

// Add Meter Network provider (for Meter.io bridge attack)
web3ProviderManager.addProvider({
  name: 'meter-public',
  url: 'https://meter.blockpi.network/v1/rpc/public',
  chainId: 82,
  priority: 6,
  timeout: 35000,
  maxRetries: 3,
  healthCheckInterval: 90000
});

// Add Moonriver provider (for Meter.io bridge attack - actual transaction location)
web3ProviderManager.addProvider({
  name: 'moonriver-public',
  url: 'https://rpc.api.moonriver.moonbeam.network',
  chainId: 1285,
  priority: 7,
  timeout: 35000,
  maxRetries: 3,
  healthCheckInterval: 90000
});

// Infura Optimism (if enabled on the project).
try {
  web3ProviderManager.addProvider({
    name: 'optimism-infura',
    url: getInfuraUrl('optimism'),
    chainId: 10,
    priority: 15,
    timeout: 35000,
    maxRetries: 3,
    healthCheckInterval: 90000
  });
} catch (error) {
  console.warn('⚠️  Infura Optimism provider not configured:', (error as Error).message);
}

// Prefer AllThatNode for Optimism receipts (if configured).
try {
  web3ProviderManager.addProvider({
    name: 'optimism-allthatnode',
    url: getAllThatNodeUrl('optimism'),
    chainId: 10,
    priority: 9,
    timeout: 35000,
    maxRetries: 3,
    healthCheckInterval: 90000,
  });
} catch (error) {
  console.warn('⚠️  AllThatNode Optimism provider not configured:', (error as Error).message);
}

// Infura Avalanche (for Platypus Finance 2023 attack)
try {
  web3ProviderManager.addProvider({
    name: 'avalanche-infura',
    url: getInfuraUrl('avalanche'),
    chainId: 43114,
    priority: 6,
    timeout: 30000,
    maxRetries: 3,
    healthCheckInterval: 60000,
  });
} catch (error) {
  console.warn('⚠️  Infura Avalanche provider not configured:', (error as Error).message);
}

// Add Avalanche public RPC as fallback
web3ProviderManager.addProvider({
  name: 'avalanche-public',
  url: 'https://api.avax.network/ext/bc/C/rpc',
  chainId: 43114,
  priority: 30,
  timeout: 35000,
  maxRetries: 2,
  healthCheckInterval: 120000,
});

// Export the managed Web3 instance
export const web3 = web3ProviderManager.getWeb3();
export const providerManager = web3ProviderManager;

export let poolToNormalList: PoolToNormlizedToken[];
export let addrToNormToken: AddressWithNorlizedToken[];

// Legacy endpoint removed - replaced with web3ProviderManager for multi-chain support
// export const infuraEndpoint = "https://eth-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}";

poolToNormalList = JSON.parse(fs.readFileSync(path.join(__dirname, "./jsons/PoolToNormalizedToken.json")));
addrToNormToken = JSON.parse(fs.readFileSync(path.join(__dirname, "./jsons/AddressWithNormalizedToken.json")));

export async function preTasksForRegressionTest() {
  getFeeds();
}
