// Centralized configuration for Evanesca
export const CONFIG = {
  // API Keys and Endpoints
  API_KEYS: {
    ETHERSCAN: process.env.ETHERSCAN_API_KEY || "",
    BSCSCAN: process.env.BSCSCAN_API_KEY || ""
  },

  // Constraint Thresholds
  THRESHOLDS: {
    DEX_PRICE_RATIO: 105,      // D2 constraint threshold
    LENDING_BORROW_RATIO: 102, // L2 constraint threshold
    FLASH_LOAN_SIZE: 100,      // Flash loan detection threshold
    MEV_GAS_RATIO: 10,         // MEV detection threshold
    BRIDGE_ZERO_VALUE: true    // Bridge zero-value detection
  },

  // Network Settings
  NETWORK: {
    DEFAULT_BLOCK_RANGE: 100,
    MAX_LOGS_PER_BATCH: 1000,
    MAX_CONCURRENT_REQUESTS: 10,
    CACHE_TTL: 300000, // 5 minutes
    RETRY_ATTEMPTS: 3,
    RETRY_DELAY: 1000
  },

  // Logging
  LOGGING: {
    LEVEL: process.env.LOG_LEVEL || "info",
    ENABLE_DEBUG: process.env.DEBUG === "true"
  }
};

// DSL rules are now loaded dynamically from src/DSL/constraints/default_constraints.dsl
// All constraints are managed through the DSL file system

// DEPRECATED: Attack transaction whitelist is no longer needed
// We now have 100% pattern-based detection without relying on hardcoded hashes
// The smart registry system (attackDatabase.json) contains all attack transaction hashes dynamically
// Keeping empty set for backward compatibility until all references are removed
export const attackTransactionWhitelist = new Set<string>([]);

// Export configuration constants for use throughout the application
export const FLASH_LOAN_PROVIDERS = ['dYdX', 'Aave', 'Compound', 'Uniswap'];
export const SUPPORTED_DEX_PROTOCOLS = ['Uniswap', 'Sushiswap', 'Curve', 'Kyber'];
export const SUPPORTED_LENDING_PROTOCOLS = ['Compound', 'Aave', 'Cream', 'bZx', 'Euler', 'Hundred'];
export const SUPPORTED_BRIDGE_PROTOCOLS = ['Meter.io', 'Multichain', 'Wormhole'];

// Multi-chain configuration
export const CHAIN_IDS = {
  ETHEREUM: 1,
  BSC: 56,
  POLYGON: 137,
  AVALANCHE: 43114,
  ARBITRUM: 42161,
  OPTIMISM: 10
};

// Analysis configuration
export const ANALYSIS_CONFIG = {
  MIN_TRANSACTION_VALUE: 0.01, // ETH
  MAX_EDGES_PER_TRANSACTION: 1000,
  ENABLE_PROFIT_CALCULATION: true,
  ENABLE_FLASH_LOAN_DETECTION: true,
  ENABLE_REENTRANCY_DETECTION: true
};