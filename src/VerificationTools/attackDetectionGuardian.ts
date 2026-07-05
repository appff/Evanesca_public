#!/usr/bin/env ts-node

/**
 * Attack Detection Guardian - Continuous Protection System
 * 
 * Monitors and validates that all 42 attacks remain detectable
 * after any system changes. Designed to prevent detection failures.
 * 
 * Usage:
 *   ts-node src/verification-tools/attack-detection-guardian.ts
 *   ts-node src/verification-tools/attack-detection-guardian.ts --chain Ethereum
 *   ts-node src/verification-tools/attack-detection-guardian.ts --constraint D2_ABNORMAL_SWAP
 */

import { getGlobalAttackRegistry } from '../test/attacks/shared/attackRegistryLoader';
import { analyzeAttack, createTestContext } from '../test/attacks/shared/testUtils';
import { constraintIndexMapper, validateConstraintIntegrity } from '../ConstraintSolver/ConstraintIndexMapper';
import * as fs from 'fs';
import * as path from 'path';

interface AttackDetectionGuardConfig {
  outputDirectory: string;
  targetChain?: string;
  targetConstraint?: string;
  verbose: boolean;
  saveDetailedResults: boolean;
}

interface AttackTestResult {
  attackId: string;
  attackName: string;
  chain: string;
  transactionHash: string;
  detected: boolean;
  detectedConstraints: string[];
  processingTime: number;
  error?: string;
  previousResults?: {
    detected: boolean;
    constraints: string[];
  };
}

interface AttackDetectionGuardResult {
  totalAttacks: number;
  detectedAttacks: number;
  detectionRate: number;
  failureCount: number;
  improvementCount: number;
  chainBreakdown: { [chain: string]: { total: number; detected: number } };
  constraintBreakdown: { [constraint: string]: { attacks: number; detections: number } };
  failedAttacks: AttackTestResult[];
  failures: AttackTestResult[];
  improvements: AttackTestResult[];
  testDuration: number;
  timestamp: string;
}

export class AttackDetectionGuardian {
  private config: AttackDetectionGuardConfig;
  private attackRegistry: any;
  private previousResults: Map<string, AttackTestResult> = new Map();

  constructor(config: Partial<AttackDetectionGuardConfig> = {}) {
    this.config = {
      outputDirectory: 'verification-results/attack-detection-guard',
      targetChain: config.targetChain,
      targetConstraint: config.targetConstraint,
      verbose: config.verbose || false,
      saveDetailedResults: config.saveDetailedResults || true
    };

    this.ensureOutputDirectory();
    this.attackRegistry = getGlobalAttackRegistry();
    this.loadPreviousResults();
  }

  private ensureOutputDirectory(): void {
    if (!fs.existsSync(this.config.outputDirectory)) {
      fs.mkdirSync(this.config.outputDirectory, { recursive: true });
    }
  }

  private loadPreviousResults(): void {
    const previousResultsPath = path.join(this.config.outputDirectory, 'latest-results.json');
    
    if (fs.existsSync(previousResultsPath)) {
      try {
        const data = JSON.parse(fs.readFileSync(previousResultsPath, 'utf8'));
        if (data.attackResults) {
          data.attackResults.forEach((result: AttackTestResult) => {
            this.previousResults.set(result.attackId, result);
          });
        }
        console.log(`📊 Loaded ${this.previousResults.size} previous test results for comparison`);
      } catch (error) {
        console.warn('⚠️ Failed to load previous results:', error);
      }
    }
  }

  /**
   * Main attack detection guard execution
   */
  async runAttackDetectionGuard(): Promise<AttackDetectionGuardResult> {
    const startTime = Date.now();
    
    console.log('\n' + '='.repeat(80));
    console.log('🛡️ ATTACK DETECTION GUARDIAN - CONTINUOUS PROTECTION');
    console.log('='.repeat(80));
    console.log('🎯 Mission: Ensure all 42 attacks remain detectable');
    console.log('🔍 Scope:', this.config.targetChain ? `Chain: ${this.config.targetChain}` : 'All Chains');
    if (this.config.targetConstraint) {
      console.log('🎚️ Constraint:', this.config.targetConstraint);
    }
    console.log('⏰ Previous Results:', this.previousResults.size > 0 ? `${this.previousResults.size} attacks` : 'None (baseline run)');
    console.log('='.repeat(80));

    // Validate DSL integrity first
    await this.validateSystemIntegrity();

    // Get attack list with filtering
    const allAttacks = this.attackRegistry.getAllAttacks();
    const testableAttacks = allAttacks.filter((attack: any) => {
      if ((attack as any).skipReason) return false;
      if (this.config.targetChain && attack.chain !== this.config.targetChain) return false;
      if (this.config.targetConstraint && !attack.constraints.includes(this.config.targetConstraint)) return false;
      return true;
    });

    console.log(`\n📋 Test Scope:`);
    console.log(`   • Total Attacks: ${allAttacks.length}`);
    console.log(`   • Testable Attacks: ${testableAttacks.length}`);
    if (this.config.targetChain) {
      console.log(`   • Chain Filter: ${this.config.targetChain}`);
    }
    if (this.config.targetConstraint) {
      console.log(`   • Constraint Filter: ${this.config.targetConstraint}`);
    }

    // Execute tests
    const attackResults: AttackTestResult[] = [];
    const context = createTestContext();
    let processedCount = 0;

    console.log(`\n🔄 Testing ${testableAttacks.length} attacks...`);

    for (const attack of testableAttacks) {
      const result = await this.testAttack(attack, context);
      attackResults.push(result);
      processedCount++;

      // Progress reporting
      if (processedCount % 5 === 0 || processedCount === testableAttacks.length) {
        const progress = ((processedCount / testableAttacks.length) * 100).toFixed(1);
        const currentDetectionRate = (attackResults.filter(r => r.detected).length / processedCount * 100).toFixed(1);
        console.log(`   📊 Progress: ${progress}% (${processedCount}/${testableAttacks.length}) | Detection Rate: ${currentDetectionRate}%`);
      }
    }

    // Calculate results and comparisons
    const result = this.calculateResults(attackResults, startTime);
    
    // Save results
    await this.saveResults(result, attackResults);

    // Display summary
    this.displaySummary(result);

    return result;
  }

  /**
   * Validate system integrity before testing
   */
  private async validateSystemIntegrity(): Promise<void> {
    console.log('\n🔍 Validating system integrity...');

    // DSL constraint integrity
    const validation = validateConstraintIntegrity();
    const constraintCount = constraintIndexMapper.getConstraintCount();
    
    console.log(`   • DSL Constraints: ${constraintCount} active`);
    console.log(`   • Integrity Status: ${validation.isValid ? '✅ VALID' : '❌ INVALID'}`);

    if (!validation.isValid) {
      console.error('❌ DSL constraint integrity check failed:');
      validation.errors.forEach(error => console.error(`   • ${error}`));
      throw new Error('System integrity validation failed');
    }

    if (validation.warnings.length > 0) {
      console.warn('⚠️ DSL warnings detected:');
      validation.warnings.forEach(warning => console.warn(`   • ${warning}`));
    }

    console.log('   ✅ System integrity validated');
  }

  /**
   * Test individual attack
   */
  private async testAttack(attack: any, context: any): Promise<AttackTestResult> {
    const attackStartTime = Date.now();
    const previousResult = this.previousResults.get(attack.id);

    if (this.config.verbose) {
      console.log(`\n   🔍 Testing ${attack.name} (${attack.chain})...`);
    }

    try {
      const attackData = {
        name: attack.name,
        description: attack.description,
        transactionHash: attack.transactionHash,
        date: attack.date,
        expectedViolation: { 
          index: constraintIndexMapper.getConstraintIndex(attack.constraints[0]), 
          type: attack.constraints[0], 
          description: attack.description 
        },
        attackType: attack.type,
        protocols: attack.protocols,
        estimatedLoss: `$${attack.loss}M`,
        timeout: 60000,
        chainId: this.getChainId(attack.chain)
      };

      const reports = await analyzeAttack(attackData, context);
      const detectedViolations = this.getDetectedViolations(reports);
      const detected = detectedViolations.length > 0;
      const constraintNames = detectedViolations.map(v => v.constraintName);

      const result: AttackTestResult = {
        attackId: attack.id,
        attackName: attack.name,
        chain: attack.chain,
        transactionHash: attack.transactionHash,
        detected,
        detectedConstraints: constraintNames,
        processingTime: Date.now() - attackStartTime,
        previousResults: previousResult ? {
          detected: previousResult.detected,
          constraints: previousResult.detectedConstraints
        } : undefined
      };

      if (this.config.verbose) {
        const status = detected ? '✅' : '❌';
        const constraintInfo = constraintNames.length > 0 ? ` (${constraintNames.join(', ')})` : '';
        console.log(`      ${status} ${detected ? 'Detected' : 'Failed'}${constraintInfo}`);
      }

      return result;

    } catch (error) {
      const result: AttackTestResult = {
        attackId: attack.id,
        attackName: attack.name,
        chain: attack.chain,
        transactionHash: attack.transactionHash,
        detected: false,
        detectedConstraints: [],
        processingTime: Date.now() - attackStartTime,
        error: error?.toString(),
        previousResults: previousResult ? {
          detected: previousResult.detected,
          constraints: previousResult.detectedConstraints
        } : undefined
      };

      if (this.config.verbose) {
        console.log(`      ❌ Error: ${error?.toString().slice(0, 60)}...`);
      }

      return result;
    }
  }

  /**
   * Calculate comprehensive results
   */
  private calculateResults(attackResults: AttackTestResult[], startTime: number): AttackDetectionGuardResult {
    const totalAttacks = attackResults.length;
    const detectedAttacks = attackResults.filter(r => r.detected).length;
    const detectionRate = totalAttacks > 0 ? detectedAttacks / totalAttacks : 0;

    // Chain breakdown
    const chainBreakdown: { [chain: string]: { total: number; detected: number } } = {};
    attackResults.forEach(result => {
      if (!chainBreakdown[result.chain]) {
        chainBreakdown[result.chain] = { total: 0, detected: 0 };
      }
      chainBreakdown[result.chain].total++;
      if (result.detected) {
        chainBreakdown[result.chain].detected++;
      }
    });

    // Constraint breakdown
    const constraintBreakdown: { [constraint: string]: { attacks: number; detections: number } } = {};
    attackResults.forEach(result => {
      result.detectedConstraints.forEach(constraint => {
        if (!constraintBreakdown[constraint]) {
          constraintBreakdown[constraint] = { attacks: 0, detections: 0 };
        }
        constraintBreakdown[constraint].attacks++;
        constraintBreakdown[constraint].detections++;
      });
    });

    // Compare with previous results
    const failures: AttackTestResult[] = [];
    const improvements: AttackTestResult[] = [];
    const failedAttacks: AttackTestResult[] = attackResults.filter(r => !r.detected);

    attackResults.forEach(result => {
      if (result.previousResults) {
        // Check for failure (previously detected, now not detected)
        if (result.previousResults.detected && !result.detected) {
          failures.push(result);
        }
        // Check for improvement (previously not detected, now detected)
        else if (!result.previousResults.detected && result.detected) {
          improvements.push(result);
        }
      }
    });

    return {
      totalAttacks,
      detectedAttacks,
      detectionRate,
      failureCount: failures.length,
      improvementCount: improvements.length,
      chainBreakdown,
      constraintBreakdown,
      failedAttacks,
      failures,
      improvements,
      testDuration: Date.now() - startTime,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Display comprehensive summary
   */
  private displaySummary(result: AttackDetectionGuardResult): void {
    console.log('\n' + '='.repeat(80));
    console.log('🛡️ ATTACK DETECTION GUARDIAN RESULTS');
    console.log('='.repeat(80));

    // Overall status
    const overallStatus = result.detectionRate >= 0.95 ? '✅ PROTECTED' : 
                         result.detectionRate >= 0.90 ? '⚠️ WARNING' : '❌ BREACH';
    
    console.log(`🎯 Overall Status: ${overallStatus}`);
    console.log(`📊 Detection Rate: ${(result.detectionRate * 100).toFixed(1)}% (${result.detectedAttacks}/${result.totalAttacks})`);
    console.log(`⏱️ Test Duration: ${(result.testDuration / 1000 / 60).toFixed(1)} minutes`);

    // Failure analysis
    if (this.previousResults.size > 0) {
      console.log(`\n📈 Change Analysis:`);
      console.log(`   • Failures: ${result.failureCount} (previously working, now failing)`);
      console.log(`   • Improvements: ${result.improvementCount} (previously failing, now working)`);
      
      if (result.failureCount > 0) {
        console.log('\n❌ CRITICAL FAILURES:');
        result.failures.slice(0, 5).forEach(reg => {
          console.log(`   • ${reg.attackName} (${reg.chain}) - ${reg.error || 'Detection failed'}`);
        });
        if (result.failures.length > 5) {
          console.log(`   ... and ${result.failures.length - 5} more failures`);
        }
      }

      if (result.improvementCount > 0) {
        console.log('\n✅ IMPROVEMENTS:');
        result.improvements.slice(0, 3).forEach(imp => {
          console.log(`   • ${imp.attackName} (${imp.chain}) - ${imp.detectedConstraints.join(', ')}`);
        });
        if (result.improvements.length > 3) {
          console.log(`   ... and ${result.improvements.length - 3} more improvements`);
        }
      }
    }

    // Chain coverage
    console.log('\n🌐 Chain Coverage:');
    Object.entries(result.chainBreakdown)
      .sort(([,a], [,b]) => (b.detected / b.total) - (a.detected / a.total))
      .forEach(([chain, data]) => {
        const rate = (data.detected / data.total * 100).toFixed(1);
        const status = data.detected === data.total ? '✅' : data.detected / data.total >= 0.9 ? '⚠️' : '❌';
        console.log(`   ${status} ${chain}: ${rate}% (${data.detected}/${data.total})`);
      });

    // Top constraints
    console.log('\n🎚️ Top Constraint Usage:');
    Object.entries(result.constraintBreakdown)
      .sort(([,a], [,b]) => b.detections - a.detections)
      .slice(0, 5)
      .forEach(([constraint, data]) => {
        console.log(`   • ${constraint}: ${data.detections} detections`);
      });

    // Failed attacks summary
    if (result.failedAttacks.length > 0) {
      console.log(`\n❌ Failed Attacks (${result.failedAttacks.length}):`);
      result.failedAttacks.slice(0, 5).forEach(failed => {
        const reason = failed.error?.slice(0, 40) || 'No constraints violated';
        console.log(`   • ${failed.attackName} (${failed.chain}): ${reason}`);
      });
      if (result.failedAttacks.length > 5) {
        console.log(`   ... and ${result.failedAttacks.length - 5} more failures`);
      }
    }

    // Action items
    console.log('\n💡 Action Items:');
    if (result.failureCount > 0) {
      console.log('   🚨 HIGH PRIORITY: Investigate and fix detection failures');
    }
    if (result.detectionRate < 0.95) {
      console.log('   🔍 MEDIUM PRIORITY: Improve detection rate to >95%');
    }
    if (result.detectionRate >= 0.95 && result.failureCount === 0) {
      console.log('   ✅ All systems operational - continue monitoring');
    }

    console.log('='.repeat(80));
  }

  /**
   * Save comprehensive results
   */
  private async saveResults(result: AttackDetectionGuardResult, attackResults: AttackTestResult[]): Promise<void> {
    // Save latest results for future comparisons
    const latestResultsPath = path.join(this.config.outputDirectory, 'latest-results.json');
    const latestData = {
      ...result,
      attackResults
    };
    fs.writeFileSync(latestResultsPath, JSON.stringify(latestData, null, 2));

    // Save timestamped detailed report
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const detailedReportPath = path.join(this.config.outputDirectory, `attack-detection-guard-${timestamp}.md`);
    
    const reportContent = this.generateDetailedReport(result, attackResults);
    fs.writeFileSync(detailedReportPath, reportContent);

    console.log(`\n💾 Results saved:`);
    console.log(`   • Latest: ${latestResultsPath}`);
    console.log(`   • Detailed: ${detailedReportPath}`);
  }

  /**
   * Generate detailed markdown report
   */
  private generateDetailedReport(result: AttackDetectionGuardResult, attackResults: AttackTestResult[]): string {
    return `# Attack Detection Guardian Report

## Executive Summary

**Test Date**: ${result.timestamp}
**Detection Rate**: ${(result.detectionRate * 100).toFixed(1)}%
**Overall Status**: ${result.detectionRate >= 0.95 ? '✅ PROTECTED' : result.detectionRate >= 0.90 ? '⚠️ WARNING' : '❌ BREACH'}

### Key Metrics
- **Total Attacks Tested**: ${result.totalAttacks}
- **Successfully Detected**: ${result.detectedAttacks}
- **Failed Detections**: ${result.totalAttacks - result.detectedAttacks}
- **Test Duration**: ${(result.testDuration / 1000 / 60).toFixed(1)} minutes

${this.previousResults.size > 0 ? `
### Change Analysis
- **Failures**: ${result.failureCount} (critical issues)
- **Improvements**: ${result.improvementCount}
- **Net Change**: ${result.improvementCount - result.failureCount > 0 ? '+' : ''}${result.improvementCount - result.failureCount}
` : ''}

## Chain Coverage Analysis

${Object.entries(result.chainBreakdown)
  .sort(([,a], [,b]) => (b.detected / b.total) - (a.detected / a.total))
  .map(([chain, data]) => {
    const rate = (data.detected / data.total * 100).toFixed(1);
    const status = data.detected === data.total ? '✅' : data.detected / data.total >= 0.9 ? '⚠️' : '❌';
    return `- **${chain}**: ${status} ${rate}% (${data.detected}/${data.total} attacks)`;
  }).join('\n')}

## Constraint Usage Analysis

${Object.entries(result.constraintBreakdown)
  .sort(([,a], [,b]) => b.detections - a.detections)
  .slice(0, 10)
  .map(([constraint, data]) => `- **${constraint}**: ${data.detections} detections`)
  .join('\n')}

${result.failureCount > 0 ? `
## 🚨 Critical Failures

${result.failures.map(reg => `
### ${reg.attackName} (${reg.chain})
- **Transaction**: \`${reg.transactionHash}\`
- **Previous Status**: ✅ Detected (${reg.previousResults?.constraints.join(', ')})
- **Current Status**: ❌ Failed
- **Error**: ${reg.error || 'No constraints violated'}
- **Processing Time**: ${reg.processingTime}ms
`).join('')}
` : ''}

${result.improvementCount > 0 ? `
## ✅ Improvements

${result.improvements.map(imp => `
### ${imp.attackName} (${imp.chain})
- **Transaction**: \`${imp.transactionHash}\`
- **Previous Status**: ❌ Failed
- **Current Status**: ✅ Detected (${imp.detectedConstraints.join(', ')})
- **Processing Time**: ${imp.processingTime}ms
`).join('')}
` : ''}

${result.failedAttacks.length > 0 ? `
## ❌ Failed Attacks

${result.failedAttacks.map(failed => `
### ${failed.attackName} (${failed.chain})
- **Transaction**: \`${failed.transactionHash}\`
- **Status**: ❌ Not detected
- **Reason**: ${failed.error || 'No constraints violated'}
- **Processing Time**: ${failed.processingTime}ms
`).join('')}
` : ''}

## Detailed Test Results

| Attack | Chain | Status | Constraints | Time (ms) |
|--------|-------|--------|-------------|-----------|
${attackResults.map(result => 
  `| ${result.attackName} | ${result.chain} | ${result.detected ? '✅' : '❌'} | ${result.detectedConstraints.join(', ') || 'None'} | ${result.processingTime} |`
).join('\n')}

## Recommendations

${result.failureCount > 0 ? '- 🚨 **URGENT**: Investigate and fix detection failures immediately' : ''}
${result.detectionRate < 0.95 ? '- 🔍 **HIGH**: Improve overall detection rate to exceed 95%' : ''}
${result.detectionRate < 0.90 ? '- 📋 **HIGH**: Review failed attacks and enhance constraint system' : ''}
${result.detectionRate >= 0.95 && result.failureCount === 0 ? '- ✅ **GOOD**: System is performing optimally, continue monitoring' : ''}

---
*Generated by Attack Detection Guardian on ${new Date().toISOString()}*
`;
  }

  // Helper methods
  private getChainId(chain: string): number {
    const chainIds: { [key: string]: number } = {
      'Ethereum': 1,
      'BSC': 56,
      'Arbitrum': 42161,
      'Optimism': 10,
      'Avalanche': 43114,
      'Polygon': 137,
      'Moonriver': 1285
    };
    return chainIds[chain] || 1;
  }

  private getDetectedViolations(reports: any[]): Array<{ constraintName: string; constraintIndex: number }> {
    const violations: Array<{ constraintName: string; constraintIndex: number }> = [];
    
    for (const report of reports) {
      if (report.violatedConstraints) {
        for (const violation of report.violatedConstraints) {
          violations.push({
            constraintName: violation.name || violation.type || 'Unknown',
            constraintIndex: violation.index || -1
          });
        }
      }
    }
    
    return violations;
  }
}

// CLI execution
if (require.main === module) {
  const args = process.argv.slice(2);
  
  const config: Partial<AttackDetectionGuardConfig> = {
    verbose: args.includes('--verbose') || args.includes('-v'),
    saveDetailedResults: true
  };

  // Parse chain filter
  const chainIndex = args.findIndex(arg => arg === '--chain');
  if (chainIndex !== -1 && chainIndex + 1 < args.length) {
    config.targetChain = args[chainIndex + 1];
  }

  // Parse constraint filter
  const constraintIndex = args.findIndex(arg => arg === '--constraint');
  if (constraintIndex !== -1 && constraintIndex + 1 < args.length) {
    config.targetConstraint = args[constraintIndex + 1];
  }

  const guardian = new AttackDetectionGuardian(config);
  
  guardian.runAttackDetectionGuard()
    .then((result) => {
      const exitCode = result.detectionRate >= 0.95 && result.failureCount === 0 ? 0 : 1;
      console.log(`\n${exitCode === 0 ? '✅' : '❌'} Attack detection guardian completed with ${exitCode === 0 ? 'success' : 'issues'}`);
      process.exit(exitCode);
    })
    .catch((error) => {
      console.error('\n❌ Attack detection guardian failed:', error);
      process.exit(1);
    });
}

export { AttackDetectionGuardian };