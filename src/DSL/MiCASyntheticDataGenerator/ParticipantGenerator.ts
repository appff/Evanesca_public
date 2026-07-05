/**
 * MiCA Participant Generator - Phase 2.2
 *
 * Generates synthetic KYC/AML participant profiles for MiCA regulation testing.
 *
 * Distribution targets:
 * - 40% unverified users (EUR 150 daily limit)
 * - 50% verified users (EUR 1,000 daily limit)
 * - 10% institutional users (EUR 10,000+ transactions)
 *
 * Geographic distribution:
 * - 60% EU jurisdictions (compliant)
 * - 20% US (compliant)
 * - 10% high-risk jurisdictions (enhanced due diligence)
 * - 10% prohibited jurisdictions (blocked)
 *
 * Risk profile distribution:
 * - 70% low risk
 * - 20% medium risk
 * - 10% high risk
 *
 * Created: 2025-10-17 (Phase 2: Synthetic Dataset Generation)
 */

import crypto from 'crypto';

// ============================================
// Interfaces (from MICA_EDGE_SCHEMA.md)
// ============================================

export interface MiCAParticipantProfile {
  participant_id: string;
  beneficial_owner_id: string;
  verification_status: "verified" | "unverified" | "institutional";
  jurisdiction: string;
  risk_profile: "low" | "medium" | "high";
  account_age_days: number;
  addresses: string[];
  typical_volume_usd: number;
  daily_transaction_count: number;
  preferred_protocols: string[];
}

export interface GeneratorConfig {
  totalParticipants: number;
  relatedAccountRatio: number;  // % of users with multiple accounts (for wash trading)
  seed?: string;                 // For reproducible random generation
}

// ============================================
// Jurisdiction Lists
// ============================================

const EU_JURISDICTIONS = [
  "FR",  // France
  "DE",  // Germany
  "IT",  // Italy
  "ES",  // Spain
  "NL",  // Netherlands
  "BE",  // Belgium
  "AT",  // Austria
  "SE",  // Sweden
  "DK",  // Denmark
  "FI",  // Finland
  "IE",  // Ireland
  "PT",  // Portugal
  "GR",  // Greece
  "PL",  // Poland
  "CZ",  // Czech Republic
];

const US_JURISDICTIONS = ["US"];

const HIGH_RISK_JURISDICTIONS = [
  "PK",  // Pakistan
  "TR",  // Turkey
  "ZA",  // South Africa
  "PH",  // Philippines
  "YE",  // Yemen
  "UG",  // Uganda
];

const PROHIBITED_JURISDICTIONS = [
  "KP",  // North Korea
  "IR",  // Iran
  "SY",  // Syria
  "MM",  // Myanmar
  "CU",  // Cuba
  "VE",  // Venezuela
  "BY",  // Belarus
];

const DEFI_PROTOCOLS = [
  "Uniswap V2",
  "Uniswap V3",
  "Sushiswap",
  "Curve",
  "Balancer",
  "Aave",
  "Compound",
  "MakerDAO",
];

// ============================================
// Participant Generator
// ============================================

export class MiCAParticipantGenerator {
  private config: GeneratorConfig;
  private rng: () => number;

  constructor(config: GeneratorConfig) {
    this.config = config;

    // Seeded random number generator for reproducibility
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

  /**
   * Hash seed string to numeric value
   */
  private hashSeed(seed: string): number {
    const hash = crypto.createHash('sha256').update(seed).digest('hex');
    return parseInt(hash.substring(0, 8), 16) % 233280;
  }

  /**
   * Generate complete participant pool
   */
  public generateParticipantPool(): MiCAParticipantProfile[] {
    const participants: MiCAParticipantProfile[] = [];

    // Calculate counts for each verification tier
    const unverifiedCount = Math.floor(this.config.totalParticipants * 0.40);
    const verifiedCount = Math.floor(this.config.totalParticipants * 0.50);
    const institutionalCount = this.config.totalParticipants - unverifiedCount - verifiedCount;

    // Generate participants by tier
    for (let i = 0; i < unverifiedCount; i++) {
      participants.push(this.generateParticipant("unverified", i));
    }

    for (let i = 0; i < verifiedCount; i++) {
      participants.push(this.generateParticipant("verified", unverifiedCount + i));
    }

    for (let i = 0; i < institutionalCount; i++) {
      participants.push(this.generateParticipant("institutional", unverifiedCount + verifiedCount + i));
    }

    // Link related accounts for wash trading scenarios
    this.linkRelatedAccounts(participants);

    return participants;
  }

  /**
   * Generate single participant profile
   */
  private generateParticipant(
    verificationStatus: "verified" | "unverified" | "institutional",
    index: number
  ): MiCAParticipantProfile {
    const participantId = `participant-${index.toString().padStart(6, '0')}`;
    const beneficialOwnerId = `owner-${crypto.randomUUID()}`;

    // Generate Ethereum address (deterministic from index for reproducibility)
    const address = this.generateEthereumAddress(index);

    // Assign jurisdiction based on distribution
    const jurisdiction = this.assignJurisdiction();

    // Assign risk profile based on jurisdiction and verification status
    const riskProfile = this.assignRiskProfile(jurisdiction, verificationStatus);

    // Account age: newer accounts for unverified, older for institutional
    const accountAgeDays = this.generateAccountAge(verificationStatus);

    // Transaction behavior parameters
    const { typicalVolume, dailyTxCount } = this.generateTransactionBehavior(verificationStatus);

    // Protocol preferences
    const preferredProtocols = this.selectProtocols(verificationStatus);

    return {
      participant_id: participantId,
      beneficial_owner_id: beneficialOwnerId,
      verification_status: verificationStatus,
      jurisdiction: jurisdiction,
      risk_profile: riskProfile,
      account_age_days: accountAgeDays,
      addresses: [address],
      typical_volume_usd: typicalVolume,
      daily_transaction_count: dailyTxCount,
      preferred_protocols: preferredProtocols,
    };
  }

  /**
   * Generate deterministic Ethereum address from index
   */
  private generateEthereumAddress(index: number): string {
    const hash = crypto.createHash('sha256')
      .update(`address-${index}`)
      .digest('hex');
    return '0x' + hash.substring(0, 40);
  }

  /**
   * Assign jurisdiction based on distribution
   * 60% EU, 20% US, 10% high-risk, 10% prohibited
   */
  private assignJurisdiction(): string {
    const rand = this.rng();

    if (rand < 0.60) {
      // 60% EU
      const idx = Math.floor(this.rng() * EU_JURISDICTIONS.length);
      return EU_JURISDICTIONS[idx];
    } else if (rand < 0.80) {
      // 20% US
      return "US";
    } else if (rand < 0.90) {
      // 10% high-risk
      const idx = Math.floor(this.rng() * HIGH_RISK_JURISDICTIONS.length);
      return HIGH_RISK_JURISDICTIONS[idx];
    } else {
      // 10% prohibited
      const idx = Math.floor(this.rng() * PROHIBITED_JURISDICTIONS.length);
      return PROHIBITED_JURISDICTIONS[idx];
    }
  }

  /**
   * Assign risk profile based on jurisdiction and verification status
   * 70% low, 20% medium, 10% high
   */
  private assignRiskProfile(
    jurisdiction: string,
    verificationStatus: "verified" | "unverified" | "institutional"
  ): "low" | "medium" | "high" {
    // High-risk and prohibited jurisdictions get elevated risk
    if (HIGH_RISK_JURISDICTIONS.includes(jurisdiction)) {
      const rand = this.rng();
      if (rand < 0.30) return "low";
      if (rand < 0.70) return "medium";
      return "high";
    }

    if (PROHIBITED_JURISDICTIONS.includes(jurisdiction)) {
      return "high";  // Always high risk
    }

    // Unverified users have slightly elevated risk
    if (verificationStatus === "unverified") {
      const rand = this.rng();
      if (rand < 0.50) return "low";
      if (rand < 0.85) return "medium";
      return "high";
    }

    // Institutional users are mostly low risk
    if (verificationStatus === "institutional") {
      const rand = this.rng();
      if (rand < 0.95) return "low";
      return "medium";
    }

    // Default distribution (verified users)
    const rand = this.rng();
    if (rand < 0.70) return "low";
    if (rand < 0.90) return "medium";
    return "high";
  }

  /**
   * Generate account age based on verification status
   */
  private generateAccountAge(verificationStatus: "verified" | "unverified" | "institutional"): number {
    if (verificationStatus === "unverified") {
      // 1-90 days (newer accounts)
      return Math.floor(this.rng() * 90) + 1;
    } else if (verificationStatus === "verified") {
      // 30-730 days (up to 2 years)
      return Math.floor(this.rng() * 700) + 30;
    } else {
      // institutional: 365-1825 days (1-5 years)
      return Math.floor(this.rng() * 1460) + 365;
    }
  }

  /**
   * Generate transaction behavior parameters
   */
  private generateTransactionBehavior(verificationStatus: "verified" | "unverified" | "institutional"): {
    typicalVolume: number;
    dailyTxCount: number;
  } {
    if (verificationStatus === "unverified") {
      return {
        typicalVolume: 50 + this.rng() * 100,  // $50-$150
        dailyTxCount: 1 + Math.floor(this.rng() * 3),  // 1-3 tx/day
      };
    } else if (verificationStatus === "verified") {
      return {
        typicalVolume: 200 + this.rng() * 800,  // $200-$1,000
        dailyTxCount: 2 + Math.floor(this.rng() * 5),  // 2-6 tx/day
      };
    } else {
      // institutional
      return {
        typicalVolume: 5000 + this.rng() * 45000,  // $5,000-$50,000
        dailyTxCount: 5 + Math.floor(this.rng() * 20),  // 5-25 tx/day
      };
    }
  }

  /**
   * Select preferred protocols
   */
  private selectProtocols(verificationStatus: "verified" | "unverified" | "institutional"): string[] {
    const count = verificationStatus === "institutional" ? 4 : 2;
    const protocols: string[] = [];

    const shuffled = [...DEFI_PROTOCOLS].sort(() => this.rng() - 0.5);
    return shuffled.slice(0, count);
  }

  /**
   * Link related accounts for wash trading scenarios
   * 5% of participants will have 2-3 related accounts with same beneficial owner
   */
  private linkRelatedAccounts(participants: MiCAParticipantProfile[]): void {
    const relatedAccountCount = Math.floor(participants.length * this.config.relatedAccountRatio);

    // Select random participants to have related accounts
    const shuffled = [...participants].sort(() => this.rng() - 0.5);
    const selectedForRelation = shuffled.slice(0, relatedAccountCount);

    let addressCounter = participants.length;

    for (const participant of selectedForRelation) {
      // Create 1-2 additional addresses with same beneficial owner
      const additionalAddresses = 1 + Math.floor(this.rng() * 2);

      for (let i = 0; i < additionalAddresses; i++) {
        const relatedAddress = this.generateEthereumAddress(addressCounter++);
        participant.addresses.push(relatedAddress);
      }
    }
  }

  /**
   * Get participant by address
   */
  public getParticipantByAddress(
    participants: MiCAParticipantProfile[],
    address: string
  ): MiCAParticipantProfile | undefined {
    return participants.find(p => p.addresses.includes(address));
  }

  /**
   * Get all addresses for a beneficial owner (for wash trading)
   */
  public getRelatedAddresses(
    participants: MiCAParticipantProfile[],
    beneficialOwnerId: string
  ): string[] {
    const owner = participants.find(p => p.beneficial_owner_id === beneficialOwnerId);
    return owner ? owner.addresses : [];
  }

  /**
   * Get statistics about generated participant pool
   */
  public getStatistics(participants: MiCAParticipantProfile[]): {
    total: number;
    byVerification: { unverified: number; verified: number; institutional: number };
    byJurisdiction: { eu: number; us: number; highRisk: number; prohibited: number };
    byRiskProfile: { low: number; medium: number; high: number };
    withMultipleAddresses: number;
    avgAccountAge: number;
  } {
    const stats = {
      total: participants.length,
      byVerification: {
        unverified: 0,
        verified: 0,
        institutional: 0,
      },
      byJurisdiction: {
        eu: 0,
        us: 0,
        highRisk: 0,
        prohibited: 0,
      },
      byRiskProfile: {
        low: 0,
        medium: 0,
        high: 0,
      },
      withMultipleAddresses: 0,
      avgAccountAge: 0,
    };

    let totalAge = 0;

    for (const p of participants) {
      // Verification status
      stats.byVerification[p.verification_status]++;

      // Jurisdiction
      if (EU_JURISDICTIONS.includes(p.jurisdiction)) {
        stats.byJurisdiction.eu++;
      } else if (p.jurisdiction === "US") {
        stats.byJurisdiction.us++;
      } else if (HIGH_RISK_JURISDICTIONS.includes(p.jurisdiction)) {
        stats.byJurisdiction.highRisk++;
      } else if (PROHIBITED_JURISDICTIONS.includes(p.jurisdiction)) {
        stats.byJurisdiction.prohibited++;
      }

      // Risk profile
      stats.byRiskProfile[p.risk_profile]++;

      // Multiple addresses
      if (p.addresses.length > 1) {
        stats.withMultipleAddresses++;
      }

      // Account age
      totalAge += p.account_age_days;
    }

    stats.avgAccountAge = Math.round(totalAge / participants.length);

    return stats;
  }
}

// ============================================
// Default Export
// ============================================

export default MiCAParticipantGenerator;
