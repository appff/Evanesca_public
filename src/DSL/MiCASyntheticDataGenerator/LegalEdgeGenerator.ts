/**
 * MiCA Legal Edge Generator - Phase 2.3
 *
 * Generates 90% legal (compliant) transaction edges for MiCA constraint testing.
 *
 * Legal edges comply with ALL MiCA regulation constraints:
 * - Unverified users: EUR 150 daily limit
 * - Verified users: EUR 1,000 daily limit
 * - No wash trading between related accounts
 * - Stablecoin reserves ≥100% + 30% liquid
 * - No prohibited jurisdictions
 * - No excessive structuring/layering/velocity
 *
 * Edge types generated:
 * - DEX Swaps (40%)
 * - Transfers (30%)
 * - Lending (Borrow/Repay) (20%)
 * - Bridge (10%)
 *
 * Created: 2025-10-17 (Phase 2: Synthetic Dataset Generation)
 */

import { MiCAParticipantProfile } from './ParticipantGenerator';

// ============================================
// Interfaces (from MICA_EDGE_SCHEMA.md)
// ============================================

export interface MiCAEdge {
  Action: string;
  Type?: string;
  block_number: number;
  value_usd: number;
  timestamp?: number;

  source: {
    address: string;
    participant: {
      verification_status: "verified" | "unverified" | "institutional";
      beneficial_owner_id: string;
      jurisdiction: string;
      risk_profile: "low" | "medium" | "high";
      account_age_days?: number;
    };
  };

  destination: {
    address: string;
    protocol_type?: string;
    protocol_metadata?: {
      reserves_usd?: number;
      circulating_supply_usd?: number;
      liquid_reserves_usd?: number;
      [key: string]: any;
    };
  };

  asset_in?: string;
  asset_out?: string;
  AmountIn?: string;
  AmountOut?: string;
  Token0?: string;
  Token1?: string;
  Token0Addr?: string;
  Token1Addr?: string;
  Amount?: string;
  Token?: string;
  TokenAddr?: string;
  SourceChain?: string;
  DestChain?: string;
  BridgeId?: string;
  Service?: string;
  TransactionHash?: string;

  [key: string]: any;
}

export interface EdgeGeneratorConfig {
  totalLegalEdges: number;      // 9,000 for 90% of 10,000
  startBlockNumber: number;      // Starting block (e.g., 19500000)
  blocksPerDay: number;          // ~6,500 blocks per day (12s/block)
  totalDays: number;             // Spread edges over N days
  seed?: string;                 // For reproducibility
}

// ============================================
// Token and Protocol Definitions
// ============================================

const TOKENS = ["ETH", "USDC", "USDT", "DAI", "WETH", "WBTC", "UNI", "LINK", "AAVE"];

const TOKEN_ADDRESSES: { [key: string]: string } = {
  ETH: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
  USDC: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  USDT: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
  DAI: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
  WETH: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
  WBTC: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599",
  UNI: "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984",
  LINK: "0x514910771AF9Ca656af840dff83E8264EcF986CA",
  AAVE: "0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9",
};

const TOKEN_DECIMALS: { [key: string]: number } = {
  ETH: 18,
  USDC: 6,
  USDT: 6,
  DAI: 18,
  WETH: 18,
  WBTC: 8,
  UNI: 18,
  LINK: 18,
  AAVE: 18,
};

const DEX_PROTOCOLS = [
  { name: "Uniswap V2", address: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D" },
  { name: "Uniswap V3", address: "0xE592427A0AEce92De3Edee1F18E0157C05861564" },
  { name: "Sushiswap", address: "0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F" },
];

const LENDING_PROTOCOLS = [
  { name: "Aave", address: "0x7d2768dE32b0b80b7a3454c06BdAc94A69DDc7A9" },
  { name: "Compound", address: "0x3d9819210A31b4961b30EF54bE2aeD79B9c9Cd3B" },
];

const BRIDGE_PROTOCOLS = [
  { name: "Hop Protocol", address: "0x3666f603Cc164936C1b87e207F36BEBa4AC5f18a" },
  { name: "Stargate", address: "0x8731d54E9D02c286767d56ac03e8037C07e01e98" },
];

// ============================================
// Legal Edge Generator
// ============================================

export class MiCALegalEdgeGenerator {
  private config: EdgeGeneratorConfig;
  private participants: MiCAParticipantProfile[];
  private rng: () => number;

  // Track daily volumes for limit compliance
  private dailyVolumes: Map<string, Map<number, number>> = new Map();

  constructor(config: EdgeGeneratorConfig, participants: MiCAParticipantProfile[]) {
    this.config = config;
    this.participants = participants;

    // Filter out prohibited jurisdictions for legal edges
    this.participants = participants.filter(p =>
      !["KP", "IR", "SY", "MM", "CU", "VE", "BY"].includes(p.jurisdiction)
    );

    // Seeded RNG for reproducibility
    if (config.seed) {
      let seed = this.hashSeed(config.seed);
      this.rng = () => {
        seed = (seed * 9301 + 49297) % 233280;
        return seed / 233280;
      };
    } else {
      this.rng = Math.random;
    }
  }

  private hashSeed(seed: string): number {
    const crypto = require('crypto');
    const hash = crypto.createHash('sha256').update(seed).digest('hex');
    return parseInt(hash.substring(0, 8), 16) % 233280;
  }

  /**
   * Generate complete set of legal edges
   */
  public generateLegalEdges(): MiCAEdge[] {
    const edges: MiCAEdge[] = [];
    const totalBlocks = this.config.totalDays * this.config.blocksPerDay;

    // Distribute edges across blocks
    for (let i = 0; i < this.config.totalLegalEdges; i++) {
      const blockOffset = Math.floor((i / this.config.totalLegalEdges) * totalBlocks);
      const blockNumber = this.config.startBlockNumber + blockOffset;

      const edge = this.generateSingleLegalEdge(blockNumber, i);
      if (edge) {
        edges.push(edge);
      }
    }

    return edges;
  }

  /**
   * Generate single legal edge
   */
  private generateSingleLegalEdge(blockNumber: number, edgeIndex: number): MiCAEdge | null {
    // Select participant (exclude those from prohibited jurisdictions)
    const participant = this.selectRandomParticipant();
    if (!participant) {
      return null;
    }

    // Select edge type based on distribution
    const rand = this.rng();
    let edgeType: string;

    if (rand < 0.40) {
      edgeType = "Swap";  // 40% DEX swaps
    } else if (rand < 0.70) {
      edgeType = "Transfer";  // 30% transfers
    } else if (rand < 0.90) {
      edgeType = "Lending";  // 20% lending
    } else {
      edgeType = "Bridge";  // 10% bridge
    }

    // Generate edge based on type
    switch (edgeType) {
      case "Swap":
        return this.generateDEXSwap(participant, blockNumber, edgeIndex);
      case "Transfer":
        return this.generateTransfer(participant, blockNumber, edgeIndex);
      case "Lending":
        return this.generateLending(participant, blockNumber, edgeIndex);
      case "Bridge":
        return this.generateBridge(participant, blockNumber, edgeIndex);
      default:
        return null;
    }
  }

  /**
   * Generate legal DEX swap
   */
  private generateDEXSwap(
    participant: MiCAParticipantProfile,
    blockNumber: number,
    edgeIndex: number
  ): MiCAEdge {
    // Select tokens
    const tokenInIdx = Math.floor(this.rng() * TOKENS.length);
    const tokenOutIdx = (tokenInIdx + 1 + Math.floor(this.rng() * (TOKENS.length - 1))) % TOKENS.length;

    const tokenIn = TOKENS[tokenInIdx];
    const tokenOut = TOKENS[tokenOutIdx];

    // Calculate compliant volume
    const valueUsd = this.getCompliantVolume(participant, blockNumber);

    // Simple 1:1 ratio for tokens (unrealistic but sufficient for testing)
    const amountIn = this.formatTokenAmount(valueUsd, tokenIn);
    const amountOut = this.formatTokenAmount(valueUsd * 0.98, tokenOut);  // 2% slippage

    // Select protocol
    const protocol = DEX_PROTOCOLS[Math.floor(this.rng() * DEX_PROTOCOLS.length)];

    // Record volume
    this.recordDailyVolume(participant.addresses[0], blockNumber, valueUsd);

    return {
      Action: "Swap",
      Type: "DEX",
      block_number: blockNumber,
      value_usd: valueUsd,
      timestamp: this.blockToTimestamp(blockNumber),

      source: {
        address: participant.addresses[0],
        participant: {
          verification_status: participant.verification_status,
          beneficial_owner_id: participant.beneficial_owner_id,
          jurisdiction: participant.jurisdiction,
          risk_profile: participant.risk_profile,
          account_age_days: participant.account_age_days,
        },
      },

      destination: {
        address: protocol.address,
        protocol_type: "dex",
      },

      asset_in: tokenIn,
      asset_out: tokenOut,
      AmountIn: amountIn,
      AmountOut: amountOut,
      Token0: tokenIn,
      Token1: tokenOut,
      Token0Addr: TOKEN_ADDRESSES[tokenIn],
      Token1Addr: TOKEN_ADDRESSES[tokenOut],

      Service: protocol.name,
      TransactionHash: this.generateTxHash(edgeIndex),
    };
  }

  /**
   * Generate legal transfer
   */
  private generateTransfer(
    participant: MiCAParticipantProfile,
    blockNumber: number,
    edgeIndex: number
  ): MiCAEdge {
    const token = TOKENS[Math.floor(this.rng() * TOKENS.length)];
    const valueUsd = this.getCompliantVolume(participant, blockNumber);
    const amount = this.formatTokenAmount(valueUsd, token);

    // Generate random destination address (not related to participant)
    const destAddress = this.generateRandomAddress(edgeIndex);

    this.recordDailyVolume(participant.addresses[0], blockNumber, valueUsd);

    return {
      Action: "Transfer",
      Type: "Transfer",
      block_number: blockNumber,
      value_usd: valueUsd,
      timestamp: this.blockToTimestamp(blockNumber),

      source: {
        address: participant.addresses[0],
        participant: {
          verification_status: participant.verification_status,
          beneficial_owner_id: participant.beneficial_owner_id,
          jurisdiction: participant.jurisdiction,
          risk_profile: participant.risk_profile,
          account_age_days: participant.account_age_days,
        },
      },

      destination: {
        address: destAddress,
        protocol_type: "wallet",
      },

      Amount: amount,
      Token: token,
      TokenAddr: TOKEN_ADDRESSES[token],

      TransactionHash: this.generateTxHash(edgeIndex),
    };
  }

  /**
   * Generate legal lending operation
   */
  private generateLending(
    participant: MiCAParticipantProfile,
    blockNumber: number,
    edgeIndex: number
  ): MiCAEdge {
    const token = TOKENS[Math.floor(this.rng() * TOKENS.length)];
    const valueUsd = this.getCompliantVolume(participant, blockNumber);
    const amount = this.formatTokenAmount(valueUsd, token);

    const action = this.rng() < 0.5 ? "Borrow" : "Repay";
    const protocol = LENDING_PROTOCOLS[Math.floor(this.rng() * LENDING_PROTOCOLS.length)];

    this.recordDailyVolume(participant.addresses[0], blockNumber, valueUsd);

    return {
      Action: action,
      Type: "Lending",
      block_number: blockNumber,
      value_usd: valueUsd,
      timestamp: this.blockToTimestamp(blockNumber),

      source: {
        address: participant.addresses[0],
        participant: {
          verification_status: participant.verification_status,
          beneficial_owner_id: participant.beneficial_owner_id,
          jurisdiction: participant.jurisdiction,
          risk_profile: participant.risk_profile,
          account_age_days: participant.account_age_days,
        },
      },

      destination: {
        address: protocol.address,
        protocol_type: "lending",
      },

      Amount: amount,
      Token: token,
      TokenAddr: TOKEN_ADDRESSES[token],

      Service: protocol.name,
      TransactionHash: this.generateTxHash(edgeIndex),
    };
  }

  /**
   * Generate legal bridge transaction
   */
  private generateBridge(
    participant: MiCAParticipantProfile,
    blockNumber: number,
    edgeIndex: number
  ): MiCAEdge {
    const token = TOKENS[Math.floor(this.rng() * TOKENS.length)];
    const valueUsd = this.getCompliantVolume(participant, blockNumber);
    const amount = this.formatTokenAmount(valueUsd, token);

    const protocol = BRIDGE_PROTOCOLS[Math.floor(this.rng() * BRIDGE_PROTOCOLS.length)];

    this.recordDailyVolume(participant.addresses[0], blockNumber, valueUsd);

    return {
      Action: "Bridge",
      Type: "Bridge",
      block_number: blockNumber,
      value_usd: valueUsd,
      timestamp: this.blockToTimestamp(blockNumber),

      source: {
        address: participant.addresses[0],
        participant: {
          verification_status: participant.verification_status,
          beneficial_owner_id: participant.beneficial_owner_id,
          jurisdiction: participant.jurisdiction,
          risk_profile: participant.risk_profile,
          account_age_days: participant.account_age_days,
        },
      },

      destination: {
        address: protocol.address,
        protocol_type: "bridge",
      },

      Amount: amount,
      Token: token,
      TokenAddr: TOKEN_ADDRESSES[token],

      SourceChain: "ethereum",
      DestChain: this.rng() < 0.5 ? "arbitrum" : "optimism",
      BridgeId: protocol.name,

      Service: protocol.name,
      TransactionHash: this.generateTxHash(edgeIndex),
    };
  }

  /**
   * Get compliant transaction volume for participant
   */
  private getCompliantVolume(participant: MiCAParticipantProfile, blockNumber: number): number {
    const dailyVolume = this.getDailyVolume(participant.addresses[0], blockNumber);
    const dayInBlocks = this.config.blocksPerDay;
    const currentDay = Math.floor((blockNumber - this.config.startBlockNumber) / dayInBlocks);

    // Get daily limit based on verification status
    let dailyLimitEur: number;
    if (participant.verification_status === "unverified") {
      dailyLimitEur = 150;
    } else if (participant.verification_status === "verified") {
      dailyLimitEur = 1000;
    } else {
      dailyLimitEur = 50000;  // Institutional: high limit
    }

    const dailyLimitUsd = dailyLimitEur * 1.1;  // EUR to USD conversion
    const remainingLimit = dailyLimitUsd - dailyVolume;

    // Generate transaction within remaining limit
    // Use 30-70% of typical volume, capped by remaining limit
    const typicalVolume = participant.typical_volume_usd;
    const minVolume = typicalVolume * 0.3;
    const maxVolume = Math.min(typicalVolume * 0.7, remainingLimit * 0.8);

    if (maxVolume <= minVolume) {
      // No room left, use small transaction
      return Math.min(10, remainingLimit * 0.5);
    }

    return minVolume + this.rng() * (maxVolume - minVolume);
  }

  /**
   * Record daily volume for limit tracking
   */
  private recordDailyVolume(address: string, blockNumber: number, valueUsd: number): void {
    const dayInBlocks = this.config.blocksPerDay;
    const day = Math.floor((blockNumber - this.config.startBlockNumber) / dayInBlocks);

    if (!this.dailyVolumes.has(address)) {
      this.dailyVolumes.set(address, new Map());
    }

    const addressVolumes = this.dailyVolumes.get(address)!;
    const currentVolume = addressVolumes.get(day) || 0;
    addressVolumes.set(day, currentVolume + valueUsd);
  }

  /**
   * Get current daily volume for address
   */
  private getDailyVolume(address: string, blockNumber: number): number {
    const dayInBlocks = this.config.blocksPerDay;
    const day = Math.floor((blockNumber - this.config.startBlockNumber) / dayInBlocks);

    const addressVolumes = this.dailyVolumes.get(address);
    if (!addressVolumes) {
      return 0;
    }

    return addressVolumes.get(day) || 0;
  }

  /**
   * Select random participant
   */
  private selectRandomParticipant(): MiCAParticipantProfile | null {
    if (this.participants.length === 0) {
      return null;
    }

    const idx = Math.floor(this.rng() * this.participants.length);
    return this.participants[idx];
  }

  /**
   * Format token amount with correct decimals
   */
  private formatTokenAmount(valueUsd: number, token: string): string {
    const decimals = TOKEN_DECIMALS[token] || 18;

    // Simple price assumption: 1 token = $2000 for ETH/WETH/WBTC, $1 for stablecoins
    let tokenPrice = 1;
    if (token === "ETH" || token === "WETH") {
      tokenPrice = 2000;
    } else if (token === "WBTC") {
      tokenPrice = 40000;
    }

    const tokenAmount = valueUsd / tokenPrice;
    const rawAmount = Math.floor(tokenAmount * Math.pow(10, decimals));

    return rawAmount.toString();
  }

  /**
   * Convert block number to timestamp
   */
  private blockToTimestamp(blockNumber: number): number {
    const ETHEREUM_GENESIS_TIMESTAMP = 1438269988;  // July 30, 2015
    const SECONDS_PER_BLOCK = 12;

    return ETHEREUM_GENESIS_TIMESTAMP + (blockNumber * SECONDS_PER_BLOCK);
  }

  /**
   * Generate transaction hash
   */
  private generateTxHash(edgeIndex: number): string {
    const crypto = require('crypto');
    const hash = crypto.createHash('sha256')
      .update(`legal-edge-${edgeIndex}`)
      .digest('hex');
    return '0x' + hash;
  }

  /**
   * Generate random Ethereum address
   */
  private generateRandomAddress(seed: number): string {
    const crypto = require('crypto');
    const hash = crypto.createHash('sha256')
      .update(`random-address-${seed}-${this.rng()}`)
      .digest('hex');
    return '0x' + hash.substring(0, 40);
  }

  /**
   * Get statistics about generated edges
   */
  public getStatistics(edges: MiCAEdge[]): {
    total: number;
    byAction: { [action: string]: number };
    byVerificationStatus: { unverified: number; verified: number; institutional: number };
    avgValueUsd: number;
    minValueUsd: number;
    maxValueUsd: number;
    blockRange: { min: number; max: number };
  } {
    const stats = {
      total: edges.length,
      byAction: {} as { [action: string]: number },
      byVerificationStatus: { unverified: 0, verified: 0, institutional: 0 },
      avgValueUsd: 0,
      minValueUsd: Number.MAX_VALUE,
      maxValueUsd: 0,
      blockRange: { min: Number.MAX_VALUE, max: 0 },
    };

    let totalValue = 0;

    for (const edge of edges) {
      // Action counts
      stats.byAction[edge.Action] = (stats.byAction[edge.Action] || 0) + 1;

      // Verification status
      stats.byVerificationStatus[edge.source.participant.verification_status]++;

      // Value statistics
      totalValue += edge.value_usd;
      stats.minValueUsd = Math.min(stats.minValueUsd, edge.value_usd);
      stats.maxValueUsd = Math.max(stats.maxValueUsd, edge.value_usd);

      // Block range
      stats.blockRange.min = Math.min(stats.blockRange.min, edge.block_number);
      stats.blockRange.max = Math.max(stats.blockRange.max, edge.block_number);
    }

    stats.avgValueUsd = totalValue / edges.length;

    return stats;
  }
}

// ============================================
// Default Export
// ============================================

export default MiCALegalEdgeGenerator;
