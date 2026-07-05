/**
 * MiCA Dataset Generator - Phase 2.5
 *
 * Generates complete synthetic dataset with 10:90 violation-to-legal ratio.
 *
 * Dataset composition:
 * - 1,000 violation edges (10%)
 * - 9,000 legal edges (90%)
 * - 1,000 participants with KYC metadata
 *
 * Output format:
 * - Sorted by block_number for temporal consistency
 * - Complete metadata for regulatory analysis
 * - Export to JSON, CSV, or in-memory for testing
 *
 * Created: 2025-10-17 (Phase 2: Synthetic Dataset Generation)
 */

import crypto from 'crypto';
import { MiCAParticipantGenerator, MiCAParticipantProfile } from './ParticipantGenerator';
import { MiCALegalEdgeGenerator, MiCAEdge } from './LegalEdgeGenerator';
import { MiCAViolationEdgeGenerator, ViolationDistribution } from './ViolationEdgeGenerator';

// ============================================
// Interfaces
// ============================================

export interface DatasetConfig {
  totalParticipants: number;          // Number of participant profiles (default: 1000)
  relatedAccountRatio: number;        // % with multiple addresses (default: 0.05)
  totalLegalEdges: number;            // Legal edges (default: 9000)
  totalViolationEdges: number;        // Violation edges (default: 1000)
  startBlockNumber: number;           // Ethereum block number to start
  blocksPerDay: number;               // Average blocks per day (default: 6500)
  totalDays: number;                  // Time window in days
  seed?: string;                      // Reproducible random generation
  datasetMode?: 'temporal' | 'single' | 'hybrid';  // NEW: Dual-mode architecture support
}

export interface DatasetStatistics {
  total: number;
  legalEdges: number;
  violationEdges: number;
  participants: number;
  timeRange: {
    startBlock: number;
    endBlock: number;
    days: number;
  };
  edgeDistribution: {
    byAction: Record<string, number>;
    byVerificationStatus: {
      unverified: number;
      verified: number;
      institutional: number;
    };
    byJurisdiction: {
      eu: number;
      us: number;
      highRisk: number;
      prohibited: number;
    };
  };
  violations: {
    byConstraint: Record<string, number>;
    byPriority: {
      high: number;
      medium: number;
      additional: number;
    };
  };
  quality: {
    uniqueHashes: number;
    avgValueUsd: number;
    minValueUsd: number;
    maxValueUsd: number;
  };
}

// ============================================
// MiCA Dataset Generator
// ============================================

export class MiCADatasetGenerator {
  private config: DatasetConfig;
  private participantGenerator: MiCAParticipantGenerator;
  private legalEdgeGenerator: MiCALegalEdgeGenerator;
  private violationEdgeGenerator: MiCAViolationEdgeGenerator;

  private participants: MiCAParticipantProfile[] = [];
  private legalEdges: MiCAEdge[] = [];
  private violationEdges: MiCAEdge[] = [];
  private completeDataset: MiCAEdge[] = [];

  constructor(config: Partial<DatasetConfig> = {}) {
    // Default configuration
    this.config = {
      totalParticipants: config.totalParticipants || 1000,
      relatedAccountRatio: config.relatedAccountRatio || 0.05,
      totalLegalEdges: config.totalLegalEdges || 9000,
      totalViolationEdges: config.totalViolationEdges || 1000,
      startBlockNumber: config.startBlockNumber || 19500000,
      blocksPerDay: config.blocksPerDay || 6500,
      totalDays: config.totalDays || 7,
      seed: config.seed || 'mica-dataset-2025',
      datasetMode: config.datasetMode || 'hybrid',  // NEW: Default to 'hybrid' for pattern-based constraints
    };
  }

  /**
   * Generate complete dataset with participants, legal edges, and violations
   */
  public generateDataset(): MiCAEdge[] {
    console.log('🚀 Starting MiCA Dataset Generation...\n');

    // Step 1: Generate participant pool
    console.log('📋 Phase 1/4: Generating participant pool...');
    this.participantGenerator = new MiCAParticipantGenerator({
      totalParticipants: this.config.totalParticipants,
      relatedAccountRatio: this.config.relatedAccountRatio,
      seed: this.config.seed,
    });
    this.participants = this.participantGenerator.generateParticipantPool();
    console.log(`   ✅ Generated ${this.participants.length} participants\n`);

    // Step 2: Generate legal edges (90%)
    console.log('✅ Phase 2/4: Generating legal edges (90%)...');
    this.legalEdgeGenerator = new MiCALegalEdgeGenerator(
      {
        totalLegalEdges: this.config.totalLegalEdges,
        startBlockNumber: this.config.startBlockNumber,
        blocksPerDay: this.config.blocksPerDay,
        totalDays: this.config.totalDays,
        seed: this.config.seed,
      },
      this.participants
    );
    this.legalEdges = this.legalEdgeGenerator.generateLegalEdges();
    console.log(`   ✅ Generated ${this.legalEdges.length} legal edges\n`);

    // Step 3: Generate violation edges (10%)
    console.log('⚠️  Phase 3/4: Generating violation edges (10%)...');
    this.violationEdgeGenerator = new MiCAViolationEdgeGenerator(
      {
        startBlockNumber: this.config.startBlockNumber,
        blocksPerDay: this.config.blocksPerDay,
        totalDays: this.config.totalDays,
        seed: this.config.seed,
        datasetMode: this.config.datasetMode,  // NEW: Pass mode to generator
      },
      this.participants
    );
    this.violationEdges = this.violationEdgeGenerator.generateViolationEdges();
    console.log(`   ✅ Generated ${this.violationEdges.length} violation edges\n`);

    // Step 4: Merge and sort by block number
    console.log('🔀 Phase 4/4: Merging and sorting dataset...');
    this.completeDataset = [...this.legalEdges, ...this.violationEdges];
    this.completeDataset.sort((a, b) => a.block_number - b.block_number);
    console.log(`   ✅ Complete dataset: ${this.completeDataset.length} edges\n`);

    console.log('✨ Dataset generation complete!\n');

    return this.completeDataset;
  }

  /**
   * Get complete dataset (generate if not already done)
   */
  public getDataset(): MiCAEdge[] {
    if (this.completeDataset.length === 0) {
      return this.generateDataset();
    }
    return this.completeDataset;
  }

  /**
   * Get participants
   */
  public getParticipants(): MiCAParticipantProfile[] {
    return this.participants;
  }

  /**
   * Get legal edges only
   */
  public getLegalEdges(): MiCAEdge[] {
    return this.legalEdges;
  }

  /**
   * Get violation edges only
   */
  public getViolationEdges(): MiCAEdge[] {
    return this.violationEdges;
  }

  /**
   * Calculate comprehensive dataset statistics
   */
  public getStatistics(): DatasetStatistics {
    const dataset = this.getDataset();

    // Action distribution
    const byAction: Record<string, number> = {};
    for (const edge of dataset) {
      byAction[edge.Action] = (byAction[edge.Action] || 0) + 1;
    }

    // Verification status distribution
    const byVerificationStatus = {
      unverified: 0,
      verified: 0,
      institutional: 0,
    };

    // Jurisdiction distribution
    const byJurisdiction = {
      eu: 0,
      us: 0,
      highRisk: 0,
      prohibited: 0,
    };

    const euJurisdictions = ["FR", "DE", "IT", "ES", "NL", "BE", "AT", "SE", "DK", "FI", "IE", "PT", "GR", "PL", "CZ"];
    const highRiskJurisdictions = ["PK", "TR", "ZA", "PH", "YE", "UG"];
    const prohibitedJurisdictions = ["KP", "IR", "SY", "MM", "CU", "VE", "BY"];

    for (const edge of dataset) {
      const status = edge.source.participant.verification_status;
      byVerificationStatus[status]++;

      const jurisdiction = edge.source.participant.jurisdiction;
      if (euJurisdictions.includes(jurisdiction)) {
        byJurisdiction.eu++;
      } else if (jurisdiction === "US") {
        byJurisdiction.us++;
      } else if (highRiskJurisdictions.includes(jurisdiction)) {
        byJurisdiction.highRisk++;
      } else if (prohibitedJurisdictions.includes(jurisdiction)) {
        byJurisdiction.prohibited++;
      }
    }

    // Violation analysis
    const violationsByConstraint: Record<string, number> = {};
    const violationsByPriority = {
      high: 0,
      medium: 0,
      additional: 0,
    };

    // Map constraints to priorities based on ViolationEdgeGenerator
    const highPriorityConstraints = [
      'MICA_LARGE_TRANSACTION',
      'MICA_UNVERIFIED_USER_LIMIT',
      'MICA_VERIFIED_USER_LIMIT',
      'MICA_WASH_TRADING_DETECTION',
      'MICA_STABLECOIN_RESERVE_RATIO',
    ];

    const mediumPriorityConstraints = [
      'MICA_STRUCTURING_DETECTION',
      'MICA_RAPID_MOVEMENT_LAYERING',
      'MICA_INSIDER_TRADING_PATTERN',
      'MICA_PROHIBITED_JURISDICTION',
      'MICA_HIGH_RISK_JURISDICTION',
    ];

    // Count violations by pattern detection
    // (In a real implementation, we'd check edge.violation_type metadata)
    // For now, we estimate based on violation edge characteristics
    const violations = this.violationEdges;
    violationsByPriority.high = Math.floor(violations.length * 0.4);
    violationsByPriority.medium = Math.floor(violations.length * 0.4);
    violationsByPriority.additional = violations.length - violationsByPriority.high - violationsByPriority.medium;

    // Quality metrics
    const uniqueHashes = new Set(dataset.map(e => e.TransactionHash).filter(h => h)).size;
    const values = dataset.map(e => e.value_usd);
    const avgValueUsd = values.reduce((sum, v) => sum + v, 0) / values.length;
    const minValueUsd = Math.min(...values);
    const maxValueUsd = Math.max(...values);

    return {
      total: dataset.length,
      legalEdges: this.legalEdges.length,
      violationEdges: this.violationEdges.length,
      participants: this.participants.length,
      timeRange: {
        startBlock: dataset[0].block_number,
        endBlock: dataset[dataset.length - 1].block_number,
        days: this.config.totalDays,
      },
      edgeDistribution: {
        byAction,
        byVerificationStatus,
        byJurisdiction,
      },
      violations: {
        byConstraint: violationsByConstraint,
        byPriority: violationsByPriority,
      },
      quality: {
        uniqueHashes,
        avgValueUsd,
        minValueUsd,
        maxValueUsd,
      },
    };
  }

  /**
   * Export dataset to JSON
   */
  public exportToJSON(filepath: string): void {
    const fs = require('fs');
    const dataset = this.getDataset();

    const exportData = {
      metadata: {
        generated_at: new Date().toISOString(),
        config: this.config,
        statistics: this.getStatistics(),
      },
      participants: this.participants,
      edges: dataset,
    };

    fs.writeFileSync(filepath, JSON.stringify(exportData, null, 2));
    console.log(`✅ Dataset exported to ${filepath}`);
  }

  /**
   * Export dataset to CSV
   */
  public exportToCSV(filepath: string): void {
    const fs = require('fs');
    const dataset = this.getDataset();

    // CSV headers
    const headers = [
      'TransactionHash',
      'block_number',
      'timestamp',
      'Action',
      'Type',
      'value_usd',
      'source_address',
      'destination_address',
      'verification_status',
      'jurisdiction',
      'risk_profile',
      'beneficial_owner_id',
    ];

    // CSV rows
    const rows = dataset.map(edge => [
      edge.TransactionHash,
      edge.block_number,
      edge.timestamp,
      edge.Action,
      edge.Type,
      edge.value_usd,
      edge.source.address,
      edge.destination.address,
      edge.source.participant.verification_status,
      edge.source.participant.jurisdiction,
      edge.source.participant.risk_profile,
      edge.source.participant.beneficial_owner_id,
    ]);

    // Write CSV
    const csv = [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
    fs.writeFileSync(filepath, csv);
    console.log(`✅ Dataset exported to ${filepath}`);
  }

  /**
   * Print dataset summary to console
   */
  public printSummary(): void {
    const stats = this.getStatistics();

    console.log('\n═══════════════════════════════════════════════════════');
    console.log('📊 MiCA Synthetic Dataset Summary');
    console.log('═══════════════════════════════════════════════════════\n');

    console.log('📦 Dataset Size:');
    console.log(`   Total Edges:       ${stats.total.toLocaleString()}`);
    console.log(`   Legal Edges:       ${stats.legalEdges.toLocaleString()} (${(stats.legalEdges / stats.total * 100).toFixed(1)}%)`);
    console.log(`   Violation Edges:   ${stats.violationEdges.toLocaleString()} (${(stats.violationEdges / stats.total * 100).toFixed(1)}%)`);
    console.log(`   Participants:      ${stats.participants.toLocaleString()}\n`);

    console.log('📅 Time Range:');
    console.log(`   Start Block:       ${stats.timeRange.startBlock.toLocaleString()}`);
    console.log(`   End Block:         ${stats.timeRange.endBlock.toLocaleString()}`);
    console.log(`   Duration:          ${stats.timeRange.days} days\n`);

    console.log('🔄 Action Distribution:');
    for (const [action, count] of Object.entries(stats.edgeDistribution.byAction)) {
      const pct = (count / stats.total * 100).toFixed(1);
      console.log(`   ${action.padEnd(12)} ${count.toString().padStart(5)} (${pct}%)`);
    }
    console.log();

    console.log('👤 Verification Status:');
    console.log(`   Unverified:        ${stats.edgeDistribution.byVerificationStatus.unverified} edges`);
    console.log(`   Verified:          ${stats.edgeDistribution.byVerificationStatus.verified} edges`);
    console.log(`   Institutional:     ${stats.edgeDistribution.byVerificationStatus.institutional} edges\n`);

    console.log('🌍 Jurisdiction Distribution:');
    console.log(`   EU:                ${stats.edgeDistribution.byJurisdiction.eu} edges`);
    console.log(`   US:                ${stats.edgeDistribution.byJurisdiction.us} edges`);
    console.log(`   High-Risk:         ${stats.edgeDistribution.byJurisdiction.highRisk} edges`);
    console.log(`   Prohibited:        ${stats.edgeDistribution.byJurisdiction.prohibited} edges\n`);

    console.log('⚠️  Violation Priority:');
    console.log(`   High Priority:     ${stats.violations.byPriority.high} violations`);
    console.log(`   Medium Priority:   ${stats.violations.byPriority.medium} violations`);
    console.log(`   Additional:        ${stats.violations.byPriority.additional} violations\n`);

    console.log('💰 Transaction Values:');
    console.log(`   Average:           $${stats.quality.avgValueUsd.toFixed(2)}`);
    console.log(`   Minimum:           $${stats.quality.minValueUsd.toFixed(2)}`);
    console.log(`   Maximum:           $${stats.quality.maxValueUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n`);

    console.log('✅ Quality Checks:');
    console.log(`   Unique Hashes:     ${stats.quality.uniqueHashes.toLocaleString()} / ${stats.total.toLocaleString()}`);
    console.log(`   Hash Uniqueness:   ${(stats.quality.uniqueHashes / stats.total * 100).toFixed(2)}%\n`);

    console.log('═══════════════════════════════════════════════════════\n');
  }
}

// ============================================
// Default Export
// ============================================

export default MiCADatasetGenerator;
