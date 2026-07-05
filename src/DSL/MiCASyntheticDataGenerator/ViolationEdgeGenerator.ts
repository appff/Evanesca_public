/**
 * MiCA Violation Edge Generator - Phase 2.4
 *
 * Generates 10% violation (non-compliant) transaction edges for MiCA constraint testing.
 *
 * Violation distribution (1,000 edges out of 10,000 total):
 * - High Priority: 400 violations (4% of dataset)
 * - Medium Priority: 400 violations (4% of dataset)
 * - Additional Priority: 200 violations (2% of dataset)
 *
 * Each generator creates edges that specifically violate one constraint while
 * maintaining realistic transaction patterns.
 *
 * Created: 2025-10-17 (Phase 2: Synthetic Dataset Generation)
 */

import { MiCAParticipantProfile } from './ParticipantGenerator';
import { MiCAEdge } from './LegalEdgeGenerator';

// ============================================
// Configuration
// ============================================

export interface ViolationDistribution {
  // High Priority (400 total)
  MICA_LARGE_TRANSACTION: number;           // 100
  MICA_UNVERIFIED_USER_LIMIT: number;       // 100
  MICA_VERIFIED_USER_LIMIT: number;         // 100
  MICA_WASH_TRADING_DETECTION: number;      // 50
  MICA_STABLECOIN_RESERVE_RATIO: number;    // 50

  // Medium Priority (400 total)
  MICA_STRUCTURING_DETECTION: number;       // 100
  MICA_RAPID_MOVEMENT_LAYERING: number;     // 100
  MICA_INSIDER_TRADING_PATTERN: number;     // 80
  MICA_PROHIBITED_JURISDICTION: number;     // 60
  MICA_HIGH_RISK_JURISDICTION: number;      // 60

  // Additional Priority (200 total)
  MICA_CIRCULAR_TRADING: number;            // 50
  MICA_UNUSUAL_VELOCITY: number;            // 50
  MICA_VOLUME_SPIKE: number;                // 50
  MICA_BRIDGE_LIMIT_EVASION: number;        // 30
  MICA_INSTITUTIONAL_VERIFICATION: number;  // 20
}

export interface ViolationGeneratorConfig {
  distribution: ViolationDistribution;
  startBlockNumber: number;
  blocksPerDay: number;
  totalDays: number;
  seed?: string;
  datasetMode?: 'temporal' | 'single' | 'hybrid';  // Hybrid-mode support for pattern-based constraints
}

const DEFAULT_DISTRIBUTION: ViolationDistribution = {
  // Adjusted for rounding: sets/pairs/triplets lose edges due to Math.floor
  // Total = 1,000 violations exactly
  MICA_LARGE_TRANSACTION: 101,
  MICA_UNVERIFIED_USER_LIMIT: 99,        // 33 sets * 3 = 99
  MICA_VERIFIED_USER_LIMIT: 102,         // 34 sets * 3 = 102
  MICA_WASH_TRADING_DETECTION: 50,       // 25 pairs * 2 = 50
  MICA_STABLECOIN_RESERVE_RATIO: 50,
  MICA_STRUCTURING_DETECTION: 102,       // 34 sets * 3 = 102
  MICA_RAPID_MOVEMENT_LAYERING: 102,     // 34 chains * 3 = 102
  MICA_INSIDER_TRADING_PATTERN: 80,
  MICA_PROHIBITED_JURISDICTION: 60,
  MICA_HIGH_RISK_JURISDICTION: 60,
  MICA_CIRCULAR_TRADING: 48,             // 16 sets * 3 = 48
  MICA_UNUSUAL_VELOCITY: 48,             // 4 bursts * 12 = 48
  MICA_VOLUME_SPIKE: 48,                 // 8 bursts * 6 = 48
  MICA_BRIDGE_LIMIT_EVASION: 30,         // 15 pairs * 2 = 30
  MICA_INSTITUTIONAL_VERIFICATION: 20,
};

// ============================================
// Violation Edge Generator
// ============================================

export class MiCAViolationEdgeGenerator {
  private config: ViolationGeneratorConfig;
  private participants: MiCAParticipantProfile[];
  private rng: () => number;
  private edgeCounter: number = 0;

  constructor(config: Partial<ViolationGeneratorConfig>, participants: MiCAParticipantProfile[]) {
    this.config = {
      distribution: config.distribution || DEFAULT_DISTRIBUTION,
      startBlockNumber: config.startBlockNumber || 19500000,
      blocksPerDay: config.blocksPerDay || 6500,
      totalDays: config.totalDays || 7,
      seed: config.seed,
      datasetMode: config.datasetMode || 'single',  // Default to 'single' for basic dataset
    };

    this.participants = participants;

    // Seeded RNG
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
   * Generate all violation edges (with dual-mode architecture support)
   */
  public generateViolationEdges(): MiCAEdge[] {
    const edges: MiCAEdge[] = [];
    const dist = this.config.distribution;
    const mode = this.config.datasetMode || 'hybrid';

    // Temporal-mode constraints (9 constraints)
    if (mode === 'temporal') {
      edges.push(...this.generateUnverifiedLimitViolations(dist.MICA_UNVERIFIED_USER_LIMIT));
      edges.push(...this.generateVerifiedLimitViolations(dist.MICA_VERIFIED_USER_LIMIT));
      edges.push(...this.generateStructuringViolations(dist.MICA_STRUCTURING_DETECTION));
      edges.push(...this.generateLayeringViolations(dist.MICA_RAPID_MOVEMENT_LAYERING));
      edges.push(...this.generateInsiderTradingViolations(dist.MICA_INSIDER_TRADING_PATTERN));
      edges.push(...this.generateHighRiskJurisdictionViolations(dist.MICA_HIGH_RISK_JURISDICTION));
      edges.push(...this.generateUnusualVelocityViolations(dist.MICA_UNUSUAL_VELOCITY));
      edges.push(...this.generateVolumeSpikeViolations(dist.MICA_VOLUME_SPIKE));
      edges.push(...this.generateBridgeEvasionViolations(dist.MICA_BRIDGE_LIMIT_EVASION));
    }

    // Single-edge mode constraints (4 constraints)
    if (mode === 'single') {
      edges.push(...this.generateLargeTransactionViolations(dist.MICA_LARGE_TRANSACTION));
      edges.push(...this.generateProhibitedJurisdictionViolations(dist.MICA_PROHIBITED_JURISDICTION));
      edges.push(...this.generateStablecoinReserveViolations(dist.MICA_STABLECOIN_RESERVE_RATIO));
      edges.push(...this.generateInstitutionalVerificationViolations(dist.MICA_INSTITUTIONAL_VERIFICATION));
    }

    // Hybrid-mode constraints (2 constraints - pattern-based)
    // Only M4 (WASH_TRADING) and M11 (CIRCULAR_TRADING) are activated
    if (mode === 'hybrid') {
      edges.push(...this.generateWashTradingViolations(dist.MICA_WASH_TRADING_DETECTION));
      edges.push(...this.generateCircularTradingViolations(dist.MICA_CIRCULAR_TRADING));
    }

    return edges;
  }

  // ============================================
  // High Priority Violations
  // ============================================

  /**
   * MICA_LARGE_TRANSACTION: EUR 1,000+ transactions (non-institutional users only)
   */
  private generateLargeTransactionViolations(count: number): MiCAEdge[] {
    const edges: MiCAEdge[] = [];
    const nonInstitutional = this.participants.filter(p => p.verification_status !== "institutional");

    // Safety check: if no non-institutional users, skip generation
    if (nonInstitutional.length === 0) {
      console.warn(`⚠️  No non-institutional users found - skipping ${count} large transaction violations`);
      return edges;
    }

    for (let i = 0; i < count; i++) {
      const participant = nonInstitutional[i % nonInstitutional.length];
      const blockNumber = this.getRandomBlock();
      const valueUsd = 1100 + this.rng() * 4900;  // $1,100 - $6,000 (EUR 1,000+)

      edges.push({
        Action: "Swap",
        Type: "DEX",
        block_number: blockNumber,
        value_usd: valueUsd,
        timestamp: this.blockToTimestamp(blockNumber),

        source: this.createSourceNode(participant),
        destination: {
          address: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
          protocol_type: "dex",
        },

        asset_in: "USDC",
        asset_out: "ETH",
        AmountIn: this.formatTokenAmount(valueUsd, 6),
        AmountOut: this.formatTokenAmount(valueUsd * 0.98 / 2000, 18),
        Token0: "USDC",
        Token1: "ETH",

        Service: "Uniswap V2",
        TransactionHash: this.generateTxHash(),
      });
    }

    return edges;
  }

  /**
   * MICA_UNVERIFIED_USER_LIMIT: >EUR 150 daily for unverified users
   */
  private generateUnverifiedLimitViolations(count: number): MiCAEdge[] {
    const edges: MiCAEdge[] = [];
    const unverifiedUsers = this.participants.filter(p => p.verification_status === "unverified");

    // Safety check: if no unverified users, skip generation
    if (unverifiedUsers.length === 0) {
      console.warn(`⚠️  No unverified users found - skipping ${count} unverified limit violations`);
      return edges;
    }

    const setsOf3 = Math.floor(count / 3);  // Generate in sets of 3 txs

    for (let i = 0; i < setsOf3; i++) {
      const participant = unverifiedUsers[i % unverifiedUsers.length];
      const day = Math.floor(i / (unverifiedUsers.length / 7));
      const dayStartBlock = this.config.startBlockNumber + (day * this.config.blocksPerDay);

      // Generate 3 transactions totaling >EUR 150
      for (let j = 0; j < 3; j++) {
        const blockNumber = dayStartBlock + Math.floor(this.rng() * this.config.blocksPerDay);
        const valueUsd = 60 + this.rng() * 40;  // $60-$100 each, total >$180 (EUR 165)

        edges.push({
          Action: "Transfer",
          Type: "Transfer",
          block_number: blockNumber,
          value_usd: valueUsd,
          timestamp: this.blockToTimestamp(blockNumber),

          source: this.createSourceNode(participant),
          destination: {
            address: this.generateRandomAddress(),
            protocol_type: "wallet",
          },

          Amount: this.formatTokenAmount(valueUsd, 6),
          Token: "USDC",
          TokenAddr: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",

          TransactionHash: this.generateTxHash(),
        });
      }
    }

    return edges;
  }

  /**
   * MICA_VERIFIED_USER_LIMIT: >EUR 1,000 daily for verified users
   */
  private generateVerifiedLimitViolations(count: number): MiCAEdge[] {
    const edges: MiCAEdge[] = [];
    const verifiedUsers = this.participants.filter(p => p.verification_status === "verified");

    // Safety check: if no verified users, skip generation
    if (verifiedUsers.length === 0) {
      console.warn(`⚠️  No verified users found - skipping ${count} verified limit violations`);
      return edges;
    }

    const setsOf3 = Math.floor(count / 3);

    for (let i = 0; i < setsOf3; i++) {
      const participant = verifiedUsers[i % verifiedUsers.length];
      const day = Math.floor(i / (verifiedUsers.length / 7));
      const dayStartBlock = this.config.startBlockNumber + (day * this.config.blocksPerDay);

      for (let j = 0; j < 3; j++) {
        const blockNumber = dayStartBlock + Math.floor(this.rng() * this.config.blocksPerDay);
        const valueUsd = 400 + this.rng() * 200;  // $400-$600 each, total >$1,200 (EUR 1,100)

        edges.push({
          Action: "Swap",
          Type: "DEX",
          block_number: blockNumber,
          value_usd: valueUsd,
          timestamp: this.blockToTimestamp(blockNumber),

          source: this.createSourceNode(participant),
          destination: {
            address: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
            protocol_type: "dex",
          },

          asset_in: "USDC",
          asset_out: "ETH",
          AmountIn: this.formatTokenAmount(valueUsd, 6),
          AmountOut: this.formatTokenAmount(valueUsd * 0.98 / 2000, 18),
          Token0: "USDC",
          Token1: "ETH",

          Service: "Uniswap V2",
          TransactionHash: this.generateTxHash(),
        });
      }
    }

    return edges;
  }

  /**
   * MICA_WASH_TRADING_DETECTION: Coordinated trades between related accounts
   */
  private generateWashTradingViolations(count: number): MiCAEdge[] {
    const edges: MiCAEdge[] = [];
    const withMultipleAddresses = this.participants.filter(p => p.addresses.length > 1);

    // Safety check: if no participants with multiple addresses, skip generation
    if (withMultipleAddresses.length === 0) {
      console.warn(`⚠️  No participants with multiple addresses found - skipping ${count} wash trading violations`);
      return edges;
    }

    const pairsNeeded = Math.floor(count / 2);

    for (let i = 0; i < pairsNeeded; i++) {
      const participant = withMultipleAddresses[i % withMultipleAddresses.length];
      const blockNumber = this.getRandomBlock();
      const valueUsd = 500 + this.rng() * 1500;

      // Transaction 1: Address A buys ETH with USDC
      edges.push({
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
          },
        },
        destination: {
          address: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
          protocol_type: "dex",
        },

        asset_in: "USDC",
        asset_out: "ETH",
        AmountIn: this.formatTokenAmount(valueUsd, 6),
        AmountOut: this.formatTokenAmount(valueUsd * 0.98 / 2000, 18),
        Token0: "USDC",
        Token1: "ETH",

        Service: "Uniswap V2",
        TransactionHash: this.generateTxHash(),
      });

      // Transaction 2: Address B (same owner) sells ETH for USDC within 300 blocks
      const blockNumber2 = blockNumber + 50 + Math.floor(this.rng() * 200);
      const valueUsd2 = valueUsd * (0.97 + this.rng() * 0.06);  // Within 5% variance

      edges.push({
        Action: "Swap",
        Type: "DEX",
        block_number: blockNumber2,
        value_usd: valueUsd2,
        timestamp: this.blockToTimestamp(blockNumber2),

        source: {
          address: participant.addresses[1],  // Different address, same owner
          participant: {
            verification_status: participant.verification_status,
            beneficial_owner_id: participant.beneficial_owner_id,  // SAME owner
            jurisdiction: participant.jurisdiction,
            risk_profile: participant.risk_profile,
          },
        },
        destination: {
          address: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
          protocol_type: "dex",
        },

        asset_in: "ETH",  // Opposite direction
        asset_out: "USDC",
        AmountIn: this.formatTokenAmount(valueUsd2 / 2000, 18),
        AmountOut: this.formatTokenAmount(valueUsd2, 6),
        Token0: "ETH",
        Token1: "USDC",

        Service: "Uniswap V2",
        TransactionHash: this.generateTxHash(),
      });
    }

    return edges;
  }

  /**
   * MICA_STABLECOIN_RESERVE_RATIO: <100% reserves or <30% liquid
   */
  private generateStablecoinReserveViolations(count: number): MiCAEdge[] {
    const edges: MiCAEdge[] = [];

    for (let i = 0; i < count; i++) {
      const participant = this.selectRandomParticipant();
      const blockNumber = this.getRandomBlock();
      const valueUsd = 100 + this.rng() * 400;

      // Violating stablecoin protocol metadata
      const circulatingSupply = 100000000;  // $100M
      const reserves = 95000000;  // $95M (95% < 100% required)
      const liquidReserves = 25000000;  // $25M (25% < 30% required)

      const stablecoinAddress = this.generateRandomAddress();

      edges.push({
        Action: "Transfer",
        Type: "Stablecoin",
        block_number: blockNumber,
        value_usd: valueUsd,
        timestamp: this.blockToTimestamp(blockNumber),

        source: this.createSourceNode(participant),
        destination: {
          address: stablecoinAddress,
          protocol_type: "stablecoin",
          protocol_metadata: {
            reserves_usd: reserves,
            circulating_supply_usd: circulatingSupply,
            liquid_reserves_usd: liquidReserves,
          },
        },

        Amount: this.formatTokenAmount(valueUsd, 6),
        Token: "UNDER_COLLATERALIZED_STABLE",
        TokenAddr: stablecoinAddress,

        TransactionHash: this.generateTxHash(),
      });
    }

    return edges;
  }

  // ============================================
  // Medium Priority Violations
  // ============================================

  /**
   * MICA_STRUCTURING_DETECTION: Multiple similar-amount txs <EUR 150
   */
  private generateStructuringViolations(count: number): MiCAEdge[] {
    const edges: MiCAEdge[] = [];
    const setsOf3 = Math.floor(count / 3);

    for (let i = 0; i < setsOf3; i++) {
      const participant = this.selectRandomParticipant();
      const baseBlock = this.getRandomBlock();
      const baseAmount = 80 + this.rng() * 40;  // $80-$120 base

      // Generate 3 similar-amount transactions within 300 blocks
      for (let j = 0; j < 3; j++) {
        const blockNumber = baseBlock + Math.floor(j * 100 + this.rng() * 50);
        const valueUsd = baseAmount + (this.rng() - 0.5) * 10;  // Low variance

        edges.push({
          Action: "Transfer",
          Type: "Transfer",
          block_number: blockNumber,
          value_usd: valueUsd,
          timestamp: this.blockToTimestamp(blockNumber),

          source: this.createSourceNode(participant),
          destination: {
            address: this.generateRandomAddress(),
            protocol_type: "wallet",
          },

          Amount: this.formatTokenAmount(valueUsd, 6),
          Token: "USDC",
          TokenAddr: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",

          TransactionHash: this.generateTxHash(),
        });
      }
    }

    return edges;
  }

  /**
   * MICA_RAPID_MOVEMENT_LAYERING: Rapid transfers through multiple addresses
   */
  private generateLayeringViolations(count: number): MiCAEdge[] {
    const edges: MiCAEdge[] = [];
    const chainsOf3 = Math.floor(count / 3);

    for (let i = 0; i < chainsOf3; i++) {
      const participant = this.selectRandomParticipant();
      const baseBlock = this.getRandomBlock();
      const valueUsd = 200 + this.rng() * 800;

      let currentAddress = participant.addresses[0];

      // Generate 3-hop chain: A → B → C → D
      for (let hop = 0; hop < 3; hop++) {
        const blockNumber = baseBlock + hop * 15;  // 15 blocks apart (~3 minutes)
        const nextAddress = this.generateRandomAddress();

        edges.push({
          Action: "Transfer",
          Type: "Transfer",
          block_number: blockNumber,
          value_usd: valueUsd * 0.99,  // Small fee
          timestamp: this.blockToTimestamp(blockNumber),

          source: {
            address: currentAddress,
            participant: {
              verification_status: participant.verification_status,
              beneficial_owner_id: participant.beneficial_owner_id,
              jurisdiction: participant.jurisdiction,
              risk_profile: participant.risk_profile,
            },
          },
          destination: {
            address: nextAddress,
            protocol_type: "wallet",
          },

          Amount: this.formatTokenAmount(valueUsd * 0.99, 18),
          Token: "ETH",
          TokenAddr: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",

          TransactionHash: this.generateTxHash(),
        });

        currentAddress = nextAddress;
      }
    }

    return edges;
  }

  /**
   * MICA_INSIDER_TRADING_PATTERN: Unusual trade size (>5x historical avg)
   */
  private generateInsiderTradingViolations(count: number): MiCAEdge[] {
    const edges: MiCAEdge[] = [];

    for (let i = 0; i < count; i++) {
      const participant = this.selectRandomParticipant();
      const blockNumber = this.getRandomBlock();

      // Unusually large trade (>5x typical volume)
      const typicalVolume = participant.typical_volume_usd;
      const valueUsd = typicalVolume * (5.5 + this.rng() * 4.5);  // 5.5x - 10x

      edges.push({
        Action: "Swap",
        Type: "DEX",
        block_number: blockNumber,
        value_usd: valueUsd,
        timestamp: this.blockToTimestamp(blockNumber),

        source: this.createSourceNode(participant),
        destination: {
          address: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
          protocol_type: "dex",
        },

        asset_in: "USDC",
        asset_out: "ETH",
        AmountIn: this.formatTokenAmount(valueUsd, 6),
        AmountOut: this.formatTokenAmount(valueUsd * 0.98 / 2000, 18),
        Token0: "USDC",
        Token1: "ETH",

        Service: "Uniswap V2",
        TransactionHash: this.generateTxHash(),
      });
    }

    return edges;
  }

  /**
   * MICA_PROHIBITED_JURISDICTION: Transactions from blocked countries
   */
  private generateProhibitedJurisdictionViolations(count: number): MiCAEdge[] {
    const edges: MiCAEdge[] = [];
    const prohibitedJurisdictions = ["KP", "IR", "SY", "MM", "CU", "VE", "BY"];
    const prohibitedUsers = this.participants.filter(p =>
      prohibitedJurisdictions.includes(p.jurisdiction)
    );

    // Safety check: if no prohibited jurisdiction users, skip generation
    if (prohibitedUsers.length === 0) {
      console.warn(`⚠️  No participants from prohibited jurisdictions found - skipping ${count} prohibited jurisdiction violations`);
      return edges;
    }

    for (let i = 0; i < count; i++) {
      const participant = prohibitedUsers[i % prohibitedUsers.length];
      const blockNumber = this.getRandomBlock();
      const valueUsd = 50 + this.rng() * 450;

      edges.push({
        Action: "Swap",
        Type: "DEX",
        block_number: blockNumber,
        value_usd: valueUsd,
        timestamp: this.blockToTimestamp(blockNumber),

        source: this.createSourceNode(participant),
        destination: {
          address: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
          protocol_type: "dex",
        },

        asset_in: "USDC",
        asset_out: "ETH",
        AmountIn: this.formatTokenAmount(valueUsd, 6),
        AmountOut: this.formatTokenAmount(valueUsd * 0.98 / 2000, 18),
        Token0: "USDC",
        Token1: "ETH",

        Service: "Uniswap V2",
        TransactionHash: this.generateTxHash(),
      });
    }

    return edges;
  }

  /**
   * MICA_HIGH_RISK_JURISDICTION: High-risk country + high volume
   */
  private generateHighRiskJurisdictionViolations(count: number): MiCAEdge[] {
    const edges: MiCAEdge[] = [];
    const highRiskJurisdictions = ["PK", "TR", "ZA", "PH", "YE", "UG"];
    const highRiskUsers = this.participants.filter(p =>
      highRiskJurisdictions.includes(p.jurisdiction) && p.risk_profile === "high"
    );

    // Safety check: if no high-risk users, skip generation
    if (highRiskUsers.length === 0) {
      console.warn(`⚠️  No participants from high-risk jurisdictions with high risk profile found - skipping ${count} high-risk jurisdiction violations`);
      return edges;
    }

    for (let i = 0; i < count; i++) {
      const participant = highRiskUsers[i % highRiskUsers.length];
      const blockNumber = this.getRandomBlock();
      const valueUsd = 5500 + this.rng() * 4500;  // >$5,000 from high-risk jurisdiction

      edges.push({
        Action: "Swap",
        Type: "DEX",
        block_number: blockNumber,
        value_usd: valueUsd,
        timestamp: this.blockToTimestamp(blockNumber),

        source: this.createSourceNode(participant),
        destination: {
          address: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
          protocol_type: "dex",
        },

        asset_in: "USDC",
        asset_out: "ETH",
        AmountIn: this.formatTokenAmount(valueUsd, 6),
        AmountOut: this.formatTokenAmount(valueUsd * 0.98 / 2000, 18),
        Token0: "USDC",
        Token1: "ETH",

        Service: "Uniswap V2",
        TransactionHash: this.generateTxHash(),
      });
    }

    return edges;
  }

  // ============================================
  // Additional Priority Violations
  // ============================================

  /**
   * MICA_CIRCULAR_TRADING: A→B→C→A pattern
   */
  private generateCircularTradingViolations(count: number): MiCAEdge[] {
    const edges: MiCAEdge[] = [];
    const setsOf3 = Math.floor(count / 3);

    for (let i = 0; i < setsOf3; i++) {
      const participant = this.selectRandomParticipant();
      const baseBlock = this.getRandomBlock();
      const valueUsd = 300 + this.rng() * 700;

      // Swap 1: USDC → ETH
      edges.push({
        Action: "Swap",
        Type: "DEX",
        block_number: baseBlock,
        value_usd: valueUsd,
        timestamp: this.blockToTimestamp(baseBlock),

        source: this.createSourceNode(participant),
        destination: {
          address: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
          protocol_type: "dex",
        },

        asset_in: "USDC",
        asset_out: "ETH",
        AmountIn: this.formatTokenAmount(valueUsd, 6),
        AmountOut: this.formatTokenAmount(valueUsd * 0.98 / 2000, 18),
        Token0: "USDC",
        Token1: "ETH",

        Service: "Uniswap V2",
        TransactionHash: this.generateTxHash(),
      });

      // Swap 2: ETH → DAI
      edges.push({
        Action: "Swap",
        Type: "DEX",
        block_number: baseBlock + 30,
        value_usd: valueUsd * 0.97,
        timestamp: this.blockToTimestamp(baseBlock + 30),

        source: this.createSourceNode(participant),
        destination: {
          address: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
          protocol_type: "dex",
        },

        asset_in: "ETH",
        asset_out: "DAI",
        AmountIn: this.formatTokenAmount(valueUsd * 0.97 / 2000, 18),
        AmountOut: this.formatTokenAmount(valueUsd * 0.97, 18),
        Token0: "ETH",
        Token1: "DAI",

        Service: "Uniswap V2",
        TransactionHash: this.generateTxHash(),
      });

      // Swap 3: DAI → USDC (completes circle)
      edges.push({
        Action: "Swap",
        Type: "DEX",
        block_number: baseBlock + 60,
        value_usd: valueUsd * 0.94,
        timestamp: this.blockToTimestamp(baseBlock + 60),

        source: this.createSourceNode(participant),
        destination: {
          address: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
          protocol_type: "dex",
        },

        asset_in: "DAI",
        asset_out: "USDC",  // Back to original asset
        AmountIn: this.formatTokenAmount(valueUsd * 0.94, 18),
        AmountOut: this.formatTokenAmount(valueUsd * 0.94, 6),
        Token0: "DAI",
        Token1: "USDC",

        Service: "Uniswap V2",
        TransactionHash: this.generateTxHash(),
      });
    }

    return edges;
  }

  /**
   * MICA_UNUSUAL_VELOCITY: >10 txs in 100 blocks with high velocity
   */
  private generateUnusualVelocityViolations(count: number): MiCAEdge[] {
    const edges: MiCAEdge[] = [];
    const burstsOf12 = Math.floor(count / 12);

    for (let i = 0; i < burstsOf12; i++) {
      const participant = this.selectRandomParticipant();
      const baseBlock = this.getRandomBlock();
      const valueUsd = 150 + this.rng() * 350;

      // Generate 12 transactions in 100 blocks (velocity > 0.10)
      for (let j = 0; j < 12; j++) {
        const blockNumber = baseBlock + Math.floor(j * 8 + this.rng() * 4);

        edges.push({
          Action: "Swap",
          Type: "DEX",
          block_number: blockNumber,
          value_usd: valueUsd,
          timestamp: this.blockToTimestamp(blockNumber),

          source: this.createSourceNode(participant),
          destination: {
            address: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
            protocol_type: "dex",
          },

          asset_in: "USDC",
          asset_out: "ETH",
          AmountIn: this.formatTokenAmount(valueUsd, 6),
          AmountOut: this.formatTokenAmount(valueUsd * 0.98 / 2000, 18),
          Token0: "USDC",
          Token1: "ETH",

          Service: "Uniswap V2",
          TransactionHash: this.generateTxHash(),
        });
      }
    }

    return edges;
  }

  /**
   * MICA_VOLUME_SPIKE: Recent hour >5x historical average
   */
  private generateVolumeSpikeViolations(count: number): MiCAEdge[] {
    const edges: MiCAEdge[] = [];
    const burstsOf6 = Math.floor(count / 6);

    for (let i = 0; i < burstsOf6; i++) {
      const participant = this.selectRandomParticipant();
      const baseBlock = this.getRandomBlock();
      const typicalVolume = participant.typical_volume_usd;
      const spikeVolume = typicalVolume * (6 + this.rng() * 4);  // 6x-10x spike

      // Generate 6 transactions in recent hour (300 blocks)
      for (let j = 0; j < 6; j++) {
        const blockNumber = baseBlock + Math.floor(j * 50 + this.rng() * 20);
        const valueUsd = spikeVolume / 6;

        edges.push({
          Action: "Swap",
          Type: "DEX",
          block_number: blockNumber,
          value_usd: valueUsd,
          timestamp: this.blockToTimestamp(blockNumber),

          source: this.createSourceNode(participant),
          destination: {
            address: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
            protocol_type: "dex",
          },

          asset_in: "USDC",
          asset_out: "ETH",
          AmountIn: this.formatTokenAmount(valueUsd, 6),
          AmountOut: this.formatTokenAmount(valueUsd * 0.98 / 2000, 18),
          Token0: "USDC",
          Token1: "ETH",

          Service: "Uniswap V2",
          TransactionHash: this.generateTxHash(),
        });
      }
    }

    return edges;
  }

  /**
   * MICA_BRIDGE_LIMIT_EVASION: >EUR 150 via bridges
   */
  private generateBridgeEvasionViolations(count: number): MiCAEdge[] {
    const edges: MiCAEdge[] = [];
    const setsOf2 = Math.floor(count / 2);

    for (let i = 0; i < setsOf2; i++) {
      const participant = this.selectRandomParticipant();
      const baseBlock = this.getRandomBlock();

      // Generate 2 bridge transactions totaling >EUR 150
      for (let j = 0; j < 2; j++) {
        const blockNumber = baseBlock + j * 100;
        const valueUsd = 100 + this.rng() * 50;  // $100-$150 each

        edges.push({
          Action: "Bridge",
          Type: "Bridge",
          block_number: blockNumber,
          value_usd: valueUsd,
          timestamp: this.blockToTimestamp(blockNumber),

          source: this.createSourceNode(participant),
          destination: {
            address: "0x3666f603Cc164936C1b87e207F36BEBa4AC5f18a",
            protocol_type: "bridge",
          },

          Amount: this.formatTokenAmount(valueUsd, 6),
          Token: "USDC",
          TokenAddr: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",

          SourceChain: "ethereum",
          DestChain: "arbitrum",
          BridgeId: "Hop Protocol",

          Service: "Hop Protocol",
          TransactionHash: this.generateTxHash(),
        });
      }
    }

    return edges;
  }

  /**
   * MICA_INSTITUTIONAL_VERIFICATION: Large tx without institutional status
   */
  private generateInstitutionalVerificationViolations(count: number): MiCAEdge[] {
    const edges: MiCAEdge[] = [];
    const nonInstitutional = this.participants.filter(p => p.verification_status !== "institutional");

    // Safety check: if no non-institutional users, skip generation
    if (nonInstitutional.length === 0) {
      console.warn(`⚠️  No non-institutional participants found - skipping ${count} institutional verification violations`);
      return edges;
    }

    for (let i = 0; i < count; i++) {
      const participant = nonInstitutional[i % nonInstitutional.length];
      const blockNumber = this.getRandomBlock();
      const valueUsd = 11000 + this.rng() * 39000;  // $11,000 - $50,000 (institutional-size)

      edges.push({
        Action: "Swap",
        Type: "DEX",
        block_number: blockNumber,
        value_usd: valueUsd,
        timestamp: this.blockToTimestamp(blockNumber),

        source: this.createSourceNode(participant),
        destination: {
          address: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
          protocol_type: "dex",
        },

        asset_in: "USDC",
        asset_out: "ETH",
        AmountIn: this.formatTokenAmount(valueUsd, 6),
        AmountOut: this.formatTokenAmount(valueUsd * 0.98 / 2000, 18),
        Token0: "USDC",
        Token1: "ETH",

        Service: "Uniswap V2",
        TransactionHash: this.generateTxHash(),
      });
    }

    return edges;
  }

  // ============================================
  // Helper Methods
  // ============================================

  private selectRandomParticipant(): MiCAParticipantProfile {
    const idx = Math.floor(this.rng() * this.participants.length);
    return this.participants[idx];
  }

  private getRandomBlock(): number {
    const totalBlocks = this.config.totalDays * this.config.blocksPerDay;
    // Leave 300 blocks of headroom for multi-transaction violations with offsets
    // (e.g., wash trading +250, circular trading +60, structuring +300)
    const maxOffset = totalBlocks - 300;
    const offset = Math.floor(this.rng() * maxOffset);
    return this.config.startBlockNumber + offset;
  }

  private createSourceNode(participant: MiCAParticipantProfile): any {
    return {
      address: participant.addresses[0],
      participant: {
        verification_status: participant.verification_status,
        beneficial_owner_id: participant.beneficial_owner_id,
        jurisdiction: participant.jurisdiction,
        risk_profile: participant.risk_profile,
        account_age_days: participant.account_age_days,
      },
    };
  }

  private formatTokenAmount(valueUsd: number, decimals: number): string {
    const rawAmount = Math.floor(valueUsd * Math.pow(10, decimals));
    return rawAmount.toString();
  }

  private blockToTimestamp(blockNumber: number): number {
    const ETHEREUM_GENESIS_TIMESTAMP = 1438269988;
    const SECONDS_PER_BLOCK = 12;
    return ETHEREUM_GENESIS_TIMESTAMP + (blockNumber * SECONDS_PER_BLOCK);
  }

  private generateTxHash(): string {
    const crypto = require('crypto');
    const hash = crypto.createHash('sha256')
      .update(`violation-edge-${this.edgeCounter++}-${this.rng()}`)
      .digest('hex');
    return '0x' + hash;
  }

  private generateRandomAddress(): string {
    const crypto = require('crypto');
    const hash = crypto.createHash('sha256')
      .update(`random-address-${this.edgeCounter}-${this.rng()}`)
      .digest('hex');
    return '0x' + hash.substring(0, 40);
  }

  /**
   * Get statistics about generated violation edges
   */
  public getStatistics(edges: MiCAEdge[]): {
    total: number;
    byConstraint: { [constraint: string]: number };
  } {
    // This is a simplified version - actual constraint detection would be done by ConstraintManager
    return {
      total: edges.length,
      byConstraint: {
        high_priority: 400,
        medium_priority: 400,
        additional_priority: 200,
      },
    };
  }
}

// ============================================
// Default Export
// ============================================

export default MiCAViolationEdgeGenerator;
