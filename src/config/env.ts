import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables from .env file
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export interface EnvConfig {
  // Alchemy Configuration
  alchemyApiKey: string;
  alchemyEthUrl: string;
  alchemyBscUrl: string;
  alchemyArbUrl: string;
  
  // AllThatNode Configuration
  allThatNodeApiKey: string;
  allThatNodeEthUrl: string;
  allThatNodeBscUrl: string;
  allThatNodeOptimismUrl: string;
  allThatNodeAvalancheUrl: string;
  
  // Alternative Providers
  infuraProjectId?: string;
  // Infura URL overrides (optional). If set, these take precedence over infuraProjectId.
  // Useful when the runtime environment provides a full Infura RPC URL via export.
  infuraUrl?: string; // legacy: Ethereum mainnet only
  infuraEthUrl?: string;
  infuraArbUrl?: string;
  infuraOptimismUrl?: string;
  
  // Etherscan API Keys
  etherscanApiKey?: string;
  bscscanApiKey?: string;
  arbiscanApiKey?: string;
  
  // BigQuery Configuration
  bigQueryProjectId?: string;
  bigQueryDatasetId?: string;
}

export const env: EnvConfig = {
  // Alchemy Configuration
  alchemyApiKey: process.env.ALCHEMY_API_KEY || '',
  alchemyEthUrl: process.env.ALCHEMY_ETH_URL || 'https://eth-mainnet.g.alchemy.com/v2/',
  alchemyBscUrl: process.env.ALCHEMY_BSC_URL || 'https://bnb-mainnet.g.alchemy.com/v2/',
  alchemyArbUrl: process.env.ALCHEMY_ARB_URL || 'https://arb-mainnet.g.alchemy.com/v2/',
  
  // AllThatNode Configuration
  allThatNodeApiKey: process.env.ALLTHATNODE_API_KEY || '',
  allThatNodeEthUrl: process.env.ALLTHATNODE_ETH_URL || 'https://ethereum-mainnet.l.allthatnode.com/archive/evm/',
  allThatNodeBscUrl: process.env.ALLTHATNODE_BSC_URL || 'https://bsc-mainnet.l.allthatnode.com/archive/evm/',
  // Accept both *_OPTIMISM_URL and legacy *_OPT_URL to match .env.example variations.
  allThatNodeOptimismUrl:
    process.env.ALLTHATNODE_OPTIMISM_URL ||
    process.env.ALLTHATNODE_OPT_URL ||
    'https://optimism-mainnet.l.allthatnode.com/archive/evm/',
  // Accept both *_AVALANCHE_URL and legacy *_AVAX_URL to match .env.example variations.
  allThatNodeAvalancheUrl:
    process.env.ALLTHATNODE_AVALANCHE_URL ||
    process.env.ALLTHATNODE_AVAX_URL ||
    'https://avalanche-mainnet.l.allthatnode.com/archive/evm/',
  
  // Alternative Providers
  // Infura "API key" is effectively the Project ID in the standard /v3/<id> JSON-RPC URLs.
  // Accept common aliases to match user environments.
  infuraProjectId:
    process.env.INFURA_PROJECT_ID ||
    process.env.INFURA_API_KEY ||
    process.env.INFURA_KEY,
  infuraUrl: process.env.INFURA_URL,
  infuraEthUrl: process.env.INFURA_ETH_URL,
  infuraArbUrl: process.env.INFURA_ARB_URL,
  infuraOptimismUrl: process.env.INFURA_OPTIMISM_URL,
  
  // Etherscan API Keys
  etherscanApiKey: process.env.ETHERSCAN_API_KEY,
  bscscanApiKey: process.env.BSCSCAN_API_KEY,
  arbiscanApiKey: process.env.ARBISCAN_API_KEY,
  
  // BigQuery Configuration
  bigQueryProjectId: process.env.BIGQUERY_PROJECT_ID,
  bigQueryDatasetId: process.env.BIGQUERY_DATASET_ID,
};

function isPlaceholder(value?: string): boolean {
  if (!value) return true;
  return value.includes("your-") || value.includes("your_infura") || value.includes("project-id-here");
}

export function getInfuraUrl(chain: 'eth' | 'arb' | 'optimism' | 'bsc' | 'avalanche'): string {
  // If a full RPC URL is provided via env, prefer it.
  if (chain === 'eth') {
    if (env.infuraEthUrl && !isPlaceholder(env.infuraEthUrl)) return env.infuraEthUrl;
    if (env.infuraUrl && !isPlaceholder(env.infuraUrl)) return env.infuraUrl;
  }
  if (chain === 'arb' && env.infuraArbUrl && !isPlaceholder(env.infuraArbUrl)) return env.infuraArbUrl;
  if (chain === 'optimism' && env.infuraOptimismUrl && !isPlaceholder(env.infuraOptimismUrl)) return env.infuraOptimismUrl;

  if (!env.infuraProjectId || isPlaceholder(env.infuraProjectId)) {
    throw new Error('INFURA_PROJECT_ID not configured. Please set it in your .env file.');
  }

  switch (chain) {
    case 'eth':
      return `https://mainnet.infura.io/v3/${env.infuraProjectId}`;
    case 'arb':
      return `https://arbitrum-mainnet.infura.io/v3/${env.infuraProjectId}`;
    case 'optimism':
      return `https://optimism-mainnet.infura.io/v3/${env.infuraProjectId}`;
    case 'bsc':
      return `https://bsc-mainnet.infura.io/v3/${env.infuraProjectId}`;
    case 'avalanche':
      return `https://avalanche-mainnet.infura.io/v3/${env.infuraProjectId}`;
    default:
      throw new Error(`Unsupported chain for Infura: ${chain}`);
  }
}

// Helper functions to construct full RPC URLs
export function getAlchemyUrl(chain: 'eth' | 'bsc' | 'arb'): string {
  if (!env.alchemyApiKey) {
    throw new Error('ALCHEMY_API_KEY not configured. Please set it in your .env file.');
  }
  
  switch (chain) {
    case 'eth':
      return env.alchemyEthUrl + env.alchemyApiKey;
    case 'bsc':
      return env.alchemyBscUrl + env.alchemyApiKey;
    case 'arb':
      return env.alchemyArbUrl + env.alchemyApiKey;
    default:
      throw new Error(`Unsupported chain: ${chain}`);
  }
}

export function getAllThatNodeUrl(chain: 'eth' | 'bsc' | 'optimism' | 'avalanche'): string {
  if (!env.allThatNodeApiKey) {
    throw new Error('ALLTHATNODE_API_KEY not configured. Please set it in your .env file.');
  }
  
  switch (chain) {
    case 'eth':
      return env.allThatNodeEthUrl + env.allThatNodeApiKey;
    case 'bsc':
      return env.allThatNodeBscUrl + env.allThatNodeApiKey;
    case 'optimism':
      return env.allThatNodeOptimismUrl + env.allThatNodeApiKey;
    case 'avalanche':
      // Avalanche requires special path suffix
      return env.allThatNodeAvalancheUrl + env.allThatNodeApiKey + '/ext/bc/C/rpc';
    default:
      throw new Error(`Unsupported chain for AllThatNode: ${chain}`);
  }
}

// Validate required environment variables
export function validateEnv(): void {
  const warnings: string[] = [];
  
  if (!env.alchemyApiKey) {
    warnings.push('⚠️  ALCHEMY_API_KEY is not set. Alchemy providers will not work.');
  }
  
  if (!env.allThatNodeApiKey) {
    warnings.push('⚠️  ALLTHATNODE_API_KEY is not set. AllThatNode providers will not work.');
  }

  const hasInfuraEth =
    (env.infuraEthUrl && !isPlaceholder(env.infuraEthUrl)) ||
    (env.infuraUrl && !isPlaceholder(env.infuraUrl)) ||
    (env.infuraProjectId && !isPlaceholder(env.infuraProjectId));
  const hasInfuraArb =
    (env.infuraArbUrl && !isPlaceholder(env.infuraArbUrl)) ||
    (env.infuraProjectId && !isPlaceholder(env.infuraProjectId));
  const hasInfuraOpt =
    (env.infuraOptimismUrl && !isPlaceholder(env.infuraOptimismUrl)) ||
    (env.infuraProjectId && !isPlaceholder(env.infuraProjectId));

  if (!hasInfuraEth) {
    warnings.push('⚠️  Infura Ethereum RPC not configured (set INFURA_PROJECT_ID or INFURA_URL/INFURA_ETH_URL).');
  }
  if (!hasInfuraArb) {
    warnings.push('⚠️  Infura Arbitrum RPC not configured (set INFURA_PROJECT_ID or INFURA_ARB_URL).');
  }
  if (!hasInfuraOpt) {
    warnings.push('⚠️  Infura Optimism RPC not configured (set INFURA_PROJECT_ID or INFURA_OPTIMISM_URL).');
  }
  
  if (warnings.length > 0) {
    console.warn('\n=== Environment Configuration Warnings ===');
    warnings.forEach(warning => console.warn(warning));
    console.warn('Please copy .env.example to .env and configure your API keys.\n');
  }
}

// Auto-validate on import (can be disabled if needed)
if (process.env.NODE_ENV !== 'test') {
  validateEnv();
}
