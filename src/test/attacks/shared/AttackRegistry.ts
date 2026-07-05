/**
 * Attack Registry - Dynamic Attack Management System
 * 
 * Centralized system for managing DeFi attack test data, providing:
 * - Dynamic test numbering
 * - Automatic statistics calculation
 * - Attack categorization and filtering
 * - Test result tracking
 */

export type AttackStatus = 'detected' | 'failed' | 'skipped' | 'pending';
export type AttackChain = 'Ethereum' | 'BSC' | 'Arbitrum' | 'Optimism' | 'Avalanche' | 'Polygon' | 'Moonriver' | 'Cross-chain';
export type AttackType = 
  | 'flash_loan' 
  | 'reentrancy' 
  | 'oracle_manipulation' 
  | 'price_manipulation' 
  | 'governance' 
  | 'bridge' 
  | 'logic_vulnerability'
  | 'donation_attack';

export interface AttackMetadata {
  id: string;                    // Unique identifier
  name: string;                   // Display name
  year: number;                   // Year of attack
  date: string;                   // Full date (YYYY-MM-DD)
  chain: AttackChain;            // Blockchain
  type: AttackType;              // Attack category
  protocols: string[];           // Affected protocols
  transactionHash: string;       // On-chain transaction
  loss: number;                  // Loss in USD (millions)
  status?: AttackStatus;         // Current test status
  constraints: string[];         // Expected constraint violations
  testGroup?: string;            // Test group/category
  priority: number;              // Test priority (1-10)
  description: string;           // Attack description
}

export interface TestResult {
  attackId: string;
  success: boolean;
  violation?: string;
  violations?: string[];  // Array of all detected constraint violations
  error?: string;
  executionTime?: number;
}

export interface DetectionStats {
  total: number;
  detected: number;
  failed: number;
  skipped: number;
  detectionRate: number;
  byChain: Map<AttackChain, { total: number; detected: number }>;
  byYear: Map<number, { total: number; detected: number }>;
  byType: Map<AttackType, { total: number; detected: number }>;
}

export interface FinancialStats {
  totalLoss: number;
  detectedLoss: number;
  coverageRate: number;
  byChain: Map<AttackChain, number>;
  byYear: Map<number, number>;
}

export class AttackRegistry {
  private attacks: Map<string, AttackMetadata> = new Map();
  private testResults: Map<string, TestResult> = new Map();
  private testOrder: string[] = [];

  constructor(attacks?: AttackMetadata[]) {
    if (attacks) {
      this.registerAttacks(attacks);
    }
  }

  /**
   * Register multiple attacks at once
   */
  registerAttacks(attacks: AttackMetadata[]): void {
    attacks.forEach(attack => this.registerAttack(attack));
    this.sortTestOrder();
  }

  /**
   * Register a single attack
   */
  registerAttack(attack: AttackMetadata): void {
    this.attacks.set(attack.id, attack);
    if (!this.testOrder.includes(attack.id)) {
      this.testOrder.push(attack.id);
    }
  }

  /**
   * Sort test order by priority, year, and name
   */
  private sortTestOrder(): void {
    this.testOrder.sort((a, b) => {
      const attackA = this.attacks.get(a)!;
      const attackB = this.attacks.get(b)!;
      
      // First by year
      if (attackA.year !== attackB.year) {
        return attackA.year - attackB.year;
      }
      
      // Then by priority
      if (attackA.priority !== attackB.priority) {
        return attackB.priority - attackA.priority; // Higher priority first
      }
      
      // Finally by name
      return attackA.name.localeCompare(attackB.name);
    });
  }

  /**
   * Get dynamic test number for an attack
   * Returns format like "[01/41]"
   */
  getTestNumber(attackId: string): string {
    const index = this.testOrder.indexOf(attackId);
    if (index === -1) {
      return '[??/??]';
    }
    const num = (index + 1).toString().padStart(2, '0');
    const total = this.testOrder.length;
    return `[${num}/${total}]`;
  }

  /**
   * Get attack by ID
   */
  getAttack(attackId: string): AttackMetadata | undefined {
    return this.attacks.get(attackId);
  }

  /**
   * Get all attacks
   */
  getAllAttacks(): AttackMetadata[] {
    return this.testOrder.map(id => this.attacks.get(id)!);
  }

  /**
   * Get attacks by chain
   */
  getAttacksByChain(chain: AttackChain): AttackMetadata[] {
    return this.getAllAttacks().filter(attack => attack.chain === chain);
  }

  /**
   * Get attacks by year
   */
  getAttacksByYear(year: number): AttackMetadata[] {
    return this.getAllAttacks().filter(attack => attack.year === year);
  }

  /**
   * Get attacks by type
   */
  getAttacksByType(type: AttackType): AttackMetadata[] {
    return this.getAllAttacks().filter(attack => attack.type === type);
  }


  /**
   * Record test result
   */
  recordTestResult(result: TestResult): void {
    this.testResults.set(result.attackId, result);
    
    // Update attack status
    const attack = this.attacks.get(result.attackId);
    if (attack) {
      attack.status = result.success ? 'detected' : 'failed';
    }
  }

  /**
   * Get test results
   */
  getTestResults(): TestResult[] {
    return Array.from(this.testResults.values());
  }

  /**
   * Calculate detection statistics
   */
  getDetectionStats(): DetectionStats {
    const stats: DetectionStats = {
      total: this.attacks.size,
      detected: 0,
      failed: 0,
      skipped: 0,
      detectionRate: 0,
      byChain: new Map(),
      byYear: new Map(),
      byType: new Map()
    };

    // Initialize maps
    const chains = new Set<AttackChain>();
    const years = new Set<number>();
    const types = new Set<AttackType>();

    this.getAllAttacks().forEach(attack => {
      chains.add(attack.chain);
      years.add(attack.year);
      types.add(attack.type);
    });

    chains.forEach(chain => stats.byChain.set(chain, { total: 0, detected: 0 }));
    years.forEach(year => stats.byYear.set(year, { total: 0, detected: 0 }));
    types.forEach(type => stats.byType.set(type, { total: 0, detected: 0 }));

    // Calculate statistics
    this.getAllAttacks().forEach(attack => {
      const result = this.testResults.get(attack.id);
      
      // Update totals
      stats.byChain.get(attack.chain)!.total++;
      stats.byYear.get(attack.year)!.total++;
      stats.byType.get(attack.type)!.total++;

      if (result?.success) {
        stats.detected++;
        stats.byChain.get(attack.chain)!.detected++;
        stats.byYear.get(attack.year)!.detected++;
        stats.byType.get(attack.type)!.detected++;
      } else if (result && !result.success) {
        stats.failed++;
      } else {
        stats.skipped++;
      }
    });

    stats.detectionRate = stats.total > 0 ? (stats.detected / stats.total) * 100 : 0;

    return stats;
  }

  /**
   * Calculate financial coverage statistics
   */
  getFinancialStats(): FinancialStats {
    const stats: FinancialStats = {
      totalLoss: 0,
      detectedLoss: 0,
      coverageRate: 0,
      byChain: new Map(),
      byYear: new Map()
    };

    this.getAllAttacks().forEach(attack => {
      const loss = attack.loss;
      stats.totalLoss += loss;

      // Add to chain stats
      const chainLoss = stats.byChain.get(attack.chain) || 0;
      stats.byChain.set(attack.chain, chainLoss + loss);

      // Add to year stats
      const yearLoss = stats.byYear.get(attack.year) || 0;
      stats.byYear.set(attack.year, yearLoss + loss);

      // If detected, add to detected loss
      const result = this.testResults.get(attack.id);
      if (result?.success) {
        stats.detectedLoss += loss;
      }
    });

    stats.coverageRate = stats.totalLoss > 0 ? (stats.detectedLoss / stats.totalLoss) * 100 : 0;

    return stats;
  }

  /**
   * Get total count
   */
  getTotalCount(): number {
    return this.attacks.size;
  }

  /**
   * Get count by chain
   */
  getCountByChain(chain: AttackChain): number {
    return this.getAttacksByChain(chain).length;
  }

  /**
   * Get count by year
   */
  getCountByYear(year: number): number {
    return this.getAttacksByYear(year).length;
  }

  /**
   * Get count by type
   */
  getCountByType(type: AttackType): number {
    return this.getAttacksByType(type).length;
  }

  /**
   * Generate summary report
   */
  generateSummaryReport(): string {
    const detectionStats = this.getDetectionStats();
    const financialStats = this.getFinancialStats();
    
    // Import constraint mapper to get constraint count
    const { constraintIndexMapper } = require('../../../ConstraintSolver/ConstraintIndexMapper');
    const constraintCount = constraintIndexMapper.getConstraintCount();

    const lines: string[] = [
      '='.repeat(80),
      '📊 ATTACK DETECTION SUMMARY REPORT',
      '='.repeat(80),
      '',
      `Total Attacks: ${detectionStats.total}`,
      `Detected: ${detectionStats.detected} (${detectionStats.detectionRate.toFixed(1)}%)`,
      `Failed: ${detectionStats.failed}`,
      `Skipped: ${detectionStats.skipped}`,
      `Active Constraints: ${constraintCount}`,
      '',
      '💰 FINANCIAL COVERAGE',
      '-'.repeat(40),
      `Total Loss: $${financialStats.totalLoss.toFixed(1)}M`,
      `Detected Loss: $${financialStats.detectedLoss.toFixed(1)}M`,
      `Coverage Rate: ${financialStats.coverageRate.toFixed(1)}%`,
      '',
      '🌐 DETECTION BY CHAIN',
      '-'.repeat(40)
    ];

    detectionStats.byChain.forEach((stats, chain) => {
      const rate = stats.total > 0 ? (stats.detected / stats.total * 100).toFixed(1) : '0.0';
      lines.push(`${chain}: ${stats.detected}/${stats.total} (${rate}%)`);
    });

    lines.push('', '📅 DETECTION BY YEAR', '-'.repeat(40));
    
    Array.from(detectionStats.byYear.entries())
      .sort(([a], [b]) => a - b)
      .forEach(([year, stats]) => {
        const rate = stats.total > 0 ? (stats.detected / stats.total * 100).toFixed(1) : '0.0';
        lines.push(`${year}: ${stats.detected}/${stats.total} (${rate}%)`);
      });

    lines.push('', '🎯 DETECTION BY TYPE', '-'.repeat(40));
    
    detectionStats.byType.forEach((stats, type) => {
      const rate = stats.total > 0 ? (stats.detected / stats.total * 100).toFixed(1) : '0.0';
      lines.push(`${type.replace(/_/g, ' ')}: ${stats.detected}/${stats.total} (${rate}%)`);
    });

    lines.push('', '='.repeat(80));

    return lines.join('\n');
  }

  /**
   * Format a table row with column widths
   */
  private formatTableRow(columns: string[], widths: number[]): string {
    const formatted = columns.map((col, i) => {
      const width = widths[i];
      if (col.length > width) {
        return col.substring(0, width - 3) + '...';
      }
      return col.padEnd(width);
    });
    return formatted.join(' ');
  }

  /**
   * Export registry data as JSON
   */
  toJSON(): object {
    return {
      attacks: Array.from(this.attacks.entries()),
      testResults: Array.from(this.testResults.entries()),
      testOrder: this.testOrder,
      statistics: {
        detection: this.getDetectionStats(),
        financial: this.getFinancialStats()
      }
    };
  }

  /**
   * Load registry data from JSON
   */
  static fromJSON(data: any): AttackRegistry {
    const registry = new AttackRegistry();
    
    if (data.attacks) {
      data.attacks.forEach(([id, attack]: [string, AttackMetadata]) => {
        registry.attacks.set(id, attack);
      });
    }
    
    if (data.testResults) {
      data.testResults.forEach(([id, result]: [string, TestResult]) => {
        registry.testResults.set(id, result);
      });
    }
    
    if (data.testOrder) {
      registry.testOrder = data.testOrder;
    }
    
    return registry;
  }
}

// Export singleton instance for global use
export const globalAttackRegistry = new AttackRegistry();