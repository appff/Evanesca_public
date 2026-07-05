/**
 * Cross-Chain Transaction Correlator Interface
 * 
 * This interface defines the contract for linking related transactions across different blockchains,
 * specifically designed for detecting bridge attacks like Qubit Finance ($80M) and Meter.io ($4.4M).
 * 
 * Based on bridge-attack-detection-architecture.md specification.
 */

import { TransactionReceipt } from 'web3-core';

// =============================================================================
// Core Correlation Types
// =============================================================================

/**
 * Supported chain types for cross-chain correlation
 */
export type ChainType = 'ethereum' | 'bsc' | 'arbitrum' | 'polygon' | 'avalanche';

/**
 * Correlation confidence score with detailed factor breakdown
 */
export interface CorrelationScore {
  /** Overall confidence score (0-1, where 1 is perfect match) */
  score: number;
  
  /** Individual correlation factors */
  factors: {
    /** Time proximity factor (0-1) - closer in time = higher score */
    temporal: number;
    
    /** Amount similarity factor (0-1) - similar amounts = higher score */
    amount: number;
    
    /** Address relationship factor (0-1) - same user/protocol = higher score */
    address: number;
    
    /** Protocol matching factor (0-1) - same bridge protocol = higher score */
    protocol: number;
  };
  
  /** Supporting evidence for the correlation */
  evidence: string[];
}

/**
 * Related transaction information
 */
export interface RelatedTransaction {
  /** Transaction receipt */
  receipt: TransactionReceipt;
  
  /** Chain where the transaction occurred */
  chain: ChainType;
  
  /** Correlation score with the original transaction */
  correlationScore: CorrelationScore;
  
  /** Type of relationship */
  relationshipType: 'deposit' | 'mint' | 'bridge_message' | 'withdrawal';
  
  /** Estimated relationship confidence */
  confidence: number;
}

/**
 * Bridge deposit information extracted from transaction
 */
export interface BridgeDepositInfo {
  /** Transaction hash */
  txHash: string;
  
  /** Source chain */
  sourceChain: ChainType;
  
  /** Bridge protocol name */
  bridgeProtocol: string;
  
  /** Depositor address */
  depositor: string;
  
  /** Token address being deposited */
  tokenAddress: string;
  
  /** Token symbol */
  tokenSymbol: string;
  
  /** Deposit amount (in token's smallest unit) */
  amount: string;
  
  /** USD value at time of deposit */
  usdValue: number;
  
  /** Block number */
  blockNumber: number;
  
  /** Block timestamp */
  timestamp: number;
  
  /** Target chain for minting */
  targetChain?: ChainType;
  
  /** Bridge-specific metadata */
  metadata: {
    [key: string]: any;
  };
}

/**
 * Bridge mint information extracted from transaction
 */
export interface BridgeMintInfo {
  /** Transaction hash */
  txHash: string;
  
  /** Target chain */
  targetChain: ChainType;
  
  /** Bridge protocol name */
  bridgeProtocol: string;
  
  /** Recipient address */
  recipient: string;
  
  /** Token address being minted */
  tokenAddress: string;
  
  /** Token symbol */
  tokenSymbol: string;
  
  /** Mint amount (in token's smallest unit) */
  amount: string;
  
  /** USD value at time of mint */
  usdValue: number;
  
  /** Block number */
  blockNumber: number;
  
  /** Block timestamp */
  timestamp: number;
  
  /** Source chain reference */
  sourceChain?: ChainType;
  
  /** Bridge-specific metadata */
  metadata: {
    [key: string]: any;
  };
}

/**
 * Bridge conservation validation result
 */
export interface ConservationResult {
  /** Whether conservation principle is maintained */
  isValid: boolean;
  
  /** Total deposits on source chain */
  totalDeposits: string;
  
  /** Total mints on target chain */
  totalMints: string;
  
  /** Conservation ratio (mints/deposits) */
  ratio: number;
  
  /** Expected ratio (should be close to 1.0 for healthy bridges) */
  expectedRatio: number;
  
  /** Deviation from expected ratio */
  deviation: number;
  
  /** Validation details */
  details: {
    /** Number of deposit transactions analyzed */
    depositCount: number;
    
    /** Number of mint transactions analyzed */
    mintCount: number;
    
    /** Time window analyzed (in seconds) */
    timeWindow: number;
    
    /** Any detected anomalies */
    anomalies: string[];
  };
}

// =============================================================================
// Core Interface Definition
// =============================================================================

/**
 * Main interface for cross-chain transaction correlation
 * 
 * This interface provides methods to:
 * 1. Correlate transactions across different blockchains
 * 2. Identify bridge deposits and corresponding mints
 * 3. Validate bridge conservation principles
 * 4. Find related transactions within time windows
 */
export interface ITransactionCorrelator {
  // =============================================================================
  // Core Correlation Methods
  // =============================================================================
  
  /**
   * Correlate two transactions to determine their relationship strength
   * 
   * @param tx1 First transaction receipt
   * @param tx2 Second transaction receipt
   * @returns Promise resolving to correlation score
   */
  correlateTransactions(
    tx1: TransactionReceipt, 
    tx2: TransactionReceipt
  ): Promise<CorrelationScore>;
  
  /**
   * Find transactions related to the given transaction on specified chain
   * 
   * @param tx Source transaction
   * @param chain Target chain to search
   * @param timeWindow Time window in seconds (default: 3600)
   * @returns Promise resolving to array of related transactions
   */
  findRelatedTransactions(
    tx: TransactionReceipt, 
    chain: ChainType,
    timeWindow?: number
  ): Promise<RelatedTransaction[]>;
  
  // =============================================================================
  // Bridge-Specific Correlation Methods
  // =============================================================================
  
  /**
   * Identify if transaction is a bridge deposit and extract relevant information
   * 
   * @param tx Transaction receipt to analyze
   * @returns Bridge deposit info if detected, null otherwise
   */
  identifyBridgeDeposit(tx: TransactionReceipt): Promise<BridgeDepositInfo | null>;
  
  /**
   * Find the corresponding mint transaction for a bridge deposit
   * 
   * @param deposit Bridge deposit information
   * @param timeWindow Maximum time to wait for mint (default: 3600 seconds)
   * @returns Promise resolving to mint info if found, null otherwise
   */
  findCorrespondingMint(
    deposit: BridgeDepositInfo,
    timeWindow?: number
  ): Promise<BridgeMintInfo | null>;
  
  /**
   * Find the corresponding deposit transaction for a bridge mint
   * 
   * @param mint Bridge mint information
   * @param timeWindow Maximum time to look back for deposit (default: 3600 seconds)
   * @returns Promise resolving to deposit info if found, null otherwise
   */
  findCorrespondingDeposit(
    mint: BridgeMintInfo,
    timeWindow?: number
  ): Promise<BridgeDepositInfo | null>;
  
  // =============================================================================
  // Validation Methods
  // =============================================================================
  
  /**
   * Validate bridge conservation principle for a deposit-mint pair
   * 
   * @param deposit Bridge deposit information
   * @param mint Bridge mint information
   * @returns Conservation validation result
   */
  validateBridgeConservation(
    deposit: BridgeDepositInfo, 
    mint: BridgeMintInfo
  ): Promise<ConservationResult>;
  
  /**
   * Validate bridge conservation across time window for a protocol
   * 
   * @param bridgeProtocol Bridge protocol name
   * @param startTime Start timestamp for analysis
   * @param endTime End timestamp for analysis
   * @returns Overall conservation result for time period
   */
  validateProtocolConservation(
    bridgeProtocol: string,
    startTime: number,
    endTime: number
  ): Promise<ConservationResult>;
  
  // =============================================================================
  // Cache and Performance Methods
  // =============================================================================
  
  /**
   * Clear correlation cache
   */
  clearCache(): void;
  
  /**
   * Get cache statistics
   * 
   * @returns Cache usage statistics
   */
  getCacheStats(): {
    hits: number;
    misses: number;
    size: number;
    maxSize: number;
  };
  
  /**
   * Warm up correlation cache with known transaction pairs
   * 
   * @param transactionPairs Array of transaction pairs to pre-correlate
   */
  warmupCache(transactionPairs: Array<[TransactionReceipt, TransactionReceipt]>): Promise<void>;
}

// =============================================================================
// Configuration Types
// =============================================================================

/**
 * Configuration for transaction correlator
 */
export interface TransactionCorrelatorConfig {
  /** Maximum correlation time window in seconds */
  maxTimeWindow: number;
  
  /** Minimum correlation score to consider transactions related */
  minCorrelationScore: number;
  
  /** Cache size for correlation results */
  cacheSize: number;
  
  /** Cache TTL in seconds */
  cacheTTL: number;
  
  /** Supported bridge protocols */
  supportedBridges: string[];
  
  /** Chain-specific configurations */
  chainConfigs: {
    [chain in ChainType]?: {
      /** Average block time in seconds */
      blockTime: number;
      
      /** Maximum reorg depth to consider */
      maxReorgDepth: number;
      
      /** Chain-specific correlation weights */
      correlationWeights: {
        temporal: number;
        amount: number;
        address: number;
        protocol: number;
      };
    };
  };
  
  /** Bridge-specific configurations */
  bridgeConfigs: {
    [bridgeProtocol: string]: {
      /** Supported chains */
      supportedChains: ChainType[];
      
      /** Expected mint/deposit ratio */
      expectedRatio: number;
      
      /** Maximum ratio deviation before flagging as suspicious */
      maxRatioDeviation: number;
      
      /** Bridge fee percentage */
      bridgeFeePercent: number;
    };
  };
}

/**
 * Default configuration values
 */
export const DEFAULT_CORRELATOR_CONFIG: TransactionCorrelatorConfig = {
  maxTimeWindow: 3600, // 1 hour
  minCorrelationScore: 0.7,
  cacheSize: 10000,
  cacheTTL: 3600, // 1 hour
  supportedBridges: ['QubitBridge', 'MeterBridge', 'PolyBridge'],
  
  chainConfigs: {
    ethereum: {
      blockTime: 12,
      maxReorgDepth: 7,
      correlationWeights: { temporal: 0.3, amount: 0.3, address: 0.25, protocol: 0.15 }
    },
    bsc: {
      blockTime: 3,
      maxReorgDepth: 15,
      correlationWeights: { temporal: 0.25, amount: 0.35, address: 0.25, protocol: 0.15 }
    },
    arbitrum: {
      blockTime: 1,
      maxReorgDepth: 50,
      correlationWeights: { temporal: 0.2, amount: 0.4, address: 0.25, protocol: 0.15 }
    }
  },
  
  bridgeConfigs: {
    QubitBridge: {
      supportedChains: ['ethereum', 'bsc'],
      expectedRatio: 1.0,
      maxRatioDeviation: 0.05, // 5%
      bridgeFeePercent: 0.1
    },
    MeterBridge: {
      supportedChains: ['ethereum', 'arbitrum'],
      expectedRatio: 1.0,
      maxRatioDeviation: 0.03, // 3%
      bridgeFeePercent: 0.05
    }
  }
};