/**
 * Attack Registry Loader
 * 
 * Helper module to load attack database and initialize the registry
 */

import { AttackRegistry, AttackMetadata } from './AttackRegistry';
const attackDatabase = require('./attackDatabase.json');

/**
 * Load attacks from database and initialize registry
 */
export function loadAttackRegistry(): AttackRegistry {
  const registry = new AttackRegistry();
  
  // Load all attacks from database
  const attacks = attackDatabase.attacks as AttackMetadata[];
  registry.registerAttacks(attacks);
  
  return registry;
}

/**
 * Get pre-initialized global registry
 */
let globalRegistry: AttackRegistry | null = null;

export function getGlobalAttackRegistry(): AttackRegistry {
  if (!globalRegistry) {
    globalRegistry = loadAttackRegistry();
  }
  return globalRegistry;
}

/**
 * Helper to get test number for a specific attack
 */
export function getTestNumber(attackId: string): string {
  return getGlobalAttackRegistry().getTestNumber(attackId);
}

/**
 * Helper to get attack metadata
 */
export function getAttackData(attackId: string): AttackMetadata | undefined {
  return getGlobalAttackRegistry().getAttack(attackId);
}

/**
 * Helper to record test result
 */
export function recordResult(attackId: string, success: boolean, violation?: string, error?: string): void {
  getGlobalAttackRegistry().recordTestResult({
    attackId,
    success,
    violation,
    error
  });
}

/**
 * Helper to record test result with multiple violations
 */
export function recordResultWithViolations(attackId: string, success: boolean, violation?: string, violations?: string[], error?: string): void {
  getGlobalAttackRegistry().recordTestResult({
    attackId,
    success,
    violation,
    violations,
    error
  });
}

/**
 * Helper to generate summary report
 */
export function generateSummary(): string {
  return getGlobalAttackRegistry().generateSummaryReport();
}

/**
 * Get attacks grouped by test group
 */
export function getAttacksByGroup(): Map<string, AttackMetadata[]> {
  const registry = getGlobalAttackRegistry();
  const groups = new Map<string, AttackMetadata[]>();
  
  registry.getAllAttacks().forEach(attack => {
    const group = attack.testGroup || 'ungrouped';
    if (!groups.has(group)) {
      groups.set(group, []);
    }
    groups.get(group)!.push(attack);
  });
  
  return groups;
}

/**
 * Get formatted test title with dynamic numbering
 */
export function getTestTitle(attackId: string): string {
  const registry = getGlobalAttackRegistry();
  const attack = registry.getAttack(attackId);
  
  if (!attack) {
    return `[??/??] Unknown Attack`;
  }
  
  const testNumber = registry.getTestNumber(attackId);
  return `${testNumber} ${attack.name} - ${attack.description}`;
}

/**
 * Get statistics for console output
 */
export function getStatisticsDisplay(): string[] {
  const registry = getGlobalAttackRegistry();
  const detectionStats = registry.getDetectionStats();
  const financialStats = registry.getFinancialStats();
  
  // Import constraint mapper to get constraint count
  const { constraintIndexMapper } = require('../../../ConstraintSolver/ConstraintIndexMapper');
  const constraintCount = constraintIndexMapper.getConstraintCount();
  
  const lines: string[] = [];
  
  // Overall stats
  lines.push(`📊 Total Attacks: ${detectionStats.total}`);
  lines.push(`✅ Detected: ${detectionStats.detected} (${detectionStats.detectionRate.toFixed(1)}%)`);
  lines.push(`❌ Failed: ${detectionStats.failed}`);
  lines.push(`🔧 Active Constraints: ${constraintCount}`);
  
  // Financial coverage
  lines.push(`💰 Total Loss: $${financialStats.totalLoss.toFixed(1)}M`);
  lines.push(`💎 Coverage: ${financialStats.coverageRate.toFixed(1)}%`);
  
  // By chain
  lines.push('');
  lines.push('🌐 Detection by Chain:');
  detectionStats.byChain.forEach((stats, chain) => {
    const rate = stats.total > 0 ? (stats.detected / stats.total * 100).toFixed(1) : '0.0';
    lines.push(`  ${chain}: ${stats.detected}/${stats.total} (${rate}%)`);
  });
  
  return lines;
}

/**
 * Get detailed attack results table for console output
 */
export function getDetailedResultsTable(): string[] {
  const registry = getGlobalAttackRegistry();
  const lines: string[] = [];
  
  lines.push('');
  lines.push('📋 ATTACK DETECTION RESULTS TABLE');
  lines.push('='.repeat(100));
  
  // Header
  const header = formatTableRow(['#', 'Attack Name', 'Chain', 'Loss', 'Status', 'Violated Constraints'], [4, 25, 10, 8, 10, 43]);
  lines.push(header);
  lines.push('-'.repeat(100));
  
  // Data rows
  registry.getAllAttacks().forEach((attack, index) => {
    const result = registry.getTestResults().find(r => r.attackId === attack.id);
    const num = (index + 1).toString().padStart(2, '0');
    const status = result ? (result.success ? '✅' : '❌') : '⏭️';
    
    // Format violations - show all if available
    let violationsDisplay = '-';
    if (result?.violations && result.violations.length > 0) {
      // If more than 3 violations, show count and abbreviated list
      if (result.violations.length > 3) {
        violationsDisplay = `(${result.violations.length}) ${result.violations.slice(0, 2).join(', ')}...`;
      } else {
        violationsDisplay = result.violations.join(', ');
      }
    } else if (result?.violation) {
      violationsDisplay = result.violation;
    }
    
    const loss = `$${attack.loss}M`;
    
    const row = formatTableRow(
      [num, attack.name, attack.chain, loss, status, violationsDisplay],
      [4, 25, 10, 8, 10, 43]
    );
    lines.push(row);
  });
  
  lines.push('='.repeat(100));
  
  return lines;
}

/**
 * Format a table row with column widths
 */
function formatTableRow(columns: string[], widths: number[]): string {
  const formatted = columns.map((col, i) => {
    const width = widths[i];
    if (col.length > width) {
      return col.substring(0, width - 3) + '...';
    }
    return col.padEnd(width);
  });
  return formatted.join(' | ');
}