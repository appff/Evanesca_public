/// <reference types="mocha" />

/**
 * Improved DeFi Attack Detection Regression Test Suite
 * 
 * This version uses the AttackRegistry for dynamic attack management:
 * - No hardcoded attack counts
 * - Automatic test numbering
 * - Dynamic statistics calculation
 * - Easy attack addition/removal
 */

import { expect } from "chai";
import { 
  initializeTestEnvironment, 
  cleanupAfterTests, 
  createTestContext,
  analyzeAttack,
  assertViolationDetected,
  getDetectedViolations
} from "./shared/testUtils";
import { 
  getGlobalAttackRegistry, 
  getTestTitle, 
  recordResult,
  recordResultWithViolations,
  generateSummary,
  getAttacksByGroup,
  getStatisticsDisplay,
  getDetailedResultsTable
} from "./shared/attackRegistryLoader";
import { AttackMetadata } from "./shared/AttackRegistry";
import { constraintIndexMapper, validateConstraintIntegrity } from "../../ConstraintSolver/ConstraintIndexMapper";

// Initialize test environment
initializeTestEnvironment();

// Get the attack registry
const registry = getGlobalAttackRegistry();

describe('🎯 Evanesca DeFi Attack Detection - Smart Registry Version', () => {
  
  // Validate DSL-test integrity before running tests
  before(() => {
    console.log('\n🔍 Validating DSL-Test Integrity...');
    
    const validation = validateConstraintIntegrity();
    const constraintCount = constraintIndexMapper.getConstraintCount();
    const constraintNames = constraintIndexMapper.getConstraintNames();
    
    console.log(`📊 DSL Constraint Summary:`);
    console.log(`   - Total Constraints: ${constraintCount}`);
    console.log(`   - Integrity Status: ${validation.isValid ? '✅ VALID' : '❌ INVALID'}`);
    
    if (validation.errors.length > 0) {
      console.log(`❌ Validation Errors:`);
      validation.errors.forEach(error => console.log(`   - ${error}`));
    }
    
    if (validation.warnings.length > 0) {
      console.log(`⚠️ Validation Warnings:`);
      validation.warnings.forEach(warning => console.log(`   - ${warning}`));
    }
    
    // Display constraint mapping for verification
    console.log(`\n📋 Active Constraints (first 5):`);
    constraintNames.slice(0, 5).forEach((name, index) => {
      console.log(`   [${index.toString().padStart(2, '0')}] ${name}`);
    });
    if (constraintNames.length > 5) {
      console.log(`   ... and ${constraintNames.length - 5} more constraints`);
    }
    
    // Fail tests if DSL integrity is compromised
    if (!validation.isValid) {
      throw new Error('DSL constraint integrity validation failed! Fix DSL file before running tests.');
    }
    
    console.log('✅ DSL-Test integrity validation passed!\n');
  });
  
  after(() => {
    cleanupAfterTests();
    
    // Generate and display final summary with detailed table
    console.log('\n' + '='.repeat(100));
    console.log(generateSummary());
    
    // Display detailed results table
    const detailedTable = getDetailedResultsTable();
    detailedTable.forEach(line => console.log(line));
    
    console.log('='.repeat(100));
  });

  // Helper function to run attack test
  async function runRegisteredAttackTest(attack: AttackMetadata, context: any): Promise<void> {
    try {
      console.log(`🔍 Testing ${attack.name} (${attack.date})`);
      
      const attackData = {
        name: attack.name,
        description: attack.description,
        transactionHash: attack.transactionHash,
        date: attack.date,
        expectedViolation: { 
          index: getConstraintIndex(attack.constraints[0]), // Map constraint name to correct index
          type: attack.constraints[0], 
          description: attack.description 
        },
        attackType: attack.type,
        protocols: attack.protocols,
        estimatedLoss: `$${attack.loss}M`,
        timeout: 60000,
        chainId: getChainId(attack.chain)
      };
      
      const reports = await analyzeAttack(attackData, context);
      assertViolationDetected(reports, attackData);
      
      // Get actually detected violations from reports
      const detectedViolations = getDetectedViolations(reports);
      const violationNames = detectedViolations.map(v => v.constraintName);
      
      // Record success with first detected violation and all violations
      const primaryViolation = violationNames.length > 0 ? violationNames[0] : attack.constraints[0];
      recordResultWithViolations(attack.id, true, primaryViolation, violationNames);
      
      // Display violations compactly - use indices if too many
      let violationDisplay = '';
      if (violationNames.length > 3) {
        // Show indices for compact display
        const indices = detectedViolations.map(v => v.constraintIndex);
        violationDisplay = `[${indices.join(',')}]`;
        console.log(`  ✅ Attack detected with ${violationNames.length} violations (indices): ${violationDisplay}`);
        console.log(`     Constraints: ${violationNames.join(', ')}`);
      } else {
        violationDisplay = violationNames.join(', ');
        console.log(`  ✅ Attack detected with violations: ${violationDisplay}`);
      }
    } catch (error: any) {
      // Record failure
      recordResult(attack.id, false, undefined, error.message);
      
      console.log(`  ❌ Detection failed: ${error.message}`);
      throw error;
    }
  }

  // Helper to get chain ID
  function getChainId(chain: string): number {
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

  // Helper to get constraint index from constraint name using automated mapping
  function getConstraintIndex(constraintName: string): number {
    const index = constraintIndexMapper.getConstraintIndex(constraintName);
    
    if (index === -1) {
      console.warn(`⚠️ Constraint not found in DSL: ${constraintName}`);
    }
    
    return index;
  }

  // Generate test groups dynamically
  const attackGroups = getAttacksByGroup();
  
  // Create describe blocks for each group
  attackGroups.forEach((attacks, groupName) => {
    // Format group name for display
    const displayName = groupName
      .replace(/-/g, ' ')
      .replace(/\b\w/g, l => l.toUpperCase())
      .replace(/Attacks/, 'Attacks Detection');
    
    // Count attacks by chain in this group
    const chainCounts = new Map<string, number>();
    attacks.forEach(attack => {
      chainCounts.set(attack.chain, (chainCounts.get(attack.chain) || 0) + 1);
    });
    
    describe(`${displayName} (${attacks.length} attacks)`, () => {
      
      // Display group statistics
      before(() => {
        console.log(`\n📊 ${displayName}:`);
        console.log(`   Total: ${attacks.length} attacks`);
        
        // Show chain distribution
        const chains = Array.from(chainCounts.entries())
          .map(([chain, count]) => `${chain} (${count})`)
          .join(', ');
        console.log(`   Chains: ${chains}`);
        
        // Calculate total loss for this group
        const totalLoss = attacks.reduce((sum, a) => sum + a.loss, 0);
        console.log(`   Total Loss: $${totalLoss.toFixed(1)}M`);
      });
      
      // Generate tests for each attack in the group
      attacks.forEach(attack => {
        // Skip attacks with known issues
        if ((attack as any).skipReason) {
          it.skip(getTestTitle(attack.id) + ' [SKIPPED: Known Issue]', async function() {
            console.log(`⚠️ Skipped: ${(attack as any).skipReason}`);
          });
        } else {
          it(getTestTitle(attack.id), async function() {
            this.timeout(120000);
            const context = createTestContext();
            await runRegisteredAttackTest(attack, context);
          });
        }
      });
    });
  });

  // Summary display after all tests complete
  after(function() {
    const stats = registry.getDetectionStats();
    const financial = registry.getFinancialStats();
    
    // Display statistics with detailed table
    console.log('\n' + '='.repeat(100));
    console.log('📊 ATTACK DETECTION SUMMARY REPORT');
    console.log('='.repeat(100));
    getStatisticsDisplay().forEach(line => console.log(line));
    
    // Display detailed results table
    const detailedTable = getDetailedResultsTable();
    detailedTable.forEach(line => console.log(line));
    
    console.log('='.repeat(100));
    
    // Validate detection rate (excluding skipped attacks)
    const allAttacks = registry.getAllAttacks();
    const skippedAttacks = allAttacks.filter(a => (a as any).skipReason);
    const testableAttacks = allAttacks.filter(a => !(a as any).skipReason);
    const detectedAttacks = testableAttacks
      .filter(a => {
        const result = registry.getTestResults()
          .find(r => r.attackId === a.id);
        return result?.success;
      });
    
    console.log(`\n📊 Test Statistics:`);
    console.log(`   Total Attacks: ${allAttacks.length}`);
    console.log(`   Skipped (Known Issues): ${skippedAttacks.length}`);
    console.log(`   Testable: ${testableAttacks.length}`);
    console.log(`   Detected: ${detectedAttacks.length}`);
    
    // Check overall detection rate
    console.log(`\n🎯 Overall Detection Rate: ${stats.detectionRate.toFixed(1)}%`);
    console.log(`💰 Financial Coverage: ${financial.coverageRate.toFixed(1)}%`);
    
    // Performance grade
    let grade = 'F';
    let gradeEmoji = '❌';
    if (stats.detectionRate >= 95) { grade = 'A+'; gradeEmoji = '🌟'; }
    else if (stats.detectionRate >= 90) { grade = 'A'; gradeEmoji = '⭐'; }
    else if (stats.detectionRate >= 85) { grade = 'B+'; gradeEmoji = '✨'; }
    else if (stats.detectionRate >= 80) { grade = 'B'; gradeEmoji = '👍'; }
    else if (stats.detectionRate >= 75) { grade = 'C+'; gradeEmoji = '📈'; }
    else if (stats.detectionRate >= 70) { grade = 'C'; gradeEmoji = '📊'; }
    else if (stats.detectionRate >= 60) { grade = 'D'; gradeEmoji = '⚠️'; }
    
    console.log(`\n${gradeEmoji} PERFORMANCE GRADE: ${grade}`);
  });

  // Visual progress helper
  describe('🔄 Live Progress Tracking', () => {
    beforeEach(function() {
      const currentTest = this.currentTest?.title || '';
      const match = currentTest.match(/\[(\d+)\/(\d+)\]/);
      if (match) {
        const [, current, total] = match;
        const percentage = (parseInt(current) / parseInt(total) * 100).toFixed(1);
        const filled = Math.round(40 * parseInt(current) / parseInt(total));
        const empty = 40 - filled;
        const bar = '█'.repeat(filled) + '░'.repeat(empty);
        console.log(`\nProgress: ${bar} ${percentage}%`);
      }
    });
  });
});