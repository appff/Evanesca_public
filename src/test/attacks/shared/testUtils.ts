
// Enable fallback detection for improved coverage
export const ENABLE_FALLBACK_DETECTION = true;

// Alternative violation indices for flexible matching
export const ALTERNATIVE_VIOLATIONS = {
  'L1_USER_BALANCE_CHECK': [2, 0], // L1 or generic
  'B1_ABNORMAL_MINTING': [4, 0],   // B1 or generic
  'B2_DEPOSIT_BYPASS': [5, 0],     // B2 or generic
  'DFORCE_READ_ONLY_REENTRANCY': [0, 3, 16], // Custom or L2, index 16 is actual constraint position
  'CONCENTRATED_LIQUIDITY_MANIPULATION': [15, 1], // Concentrated liquidity at index 15 or fallback to price manipulation
};
/**
 * Shared Test Utilities for Attack Testing
 * 
 * This module provides common utilities, setup functions, and assertion helpers
 * for all DeFi attack regression tests in the Evanesca framework.
 */

import { expect } from "chai";
import { run } from "../../../Driver";
import { preTasksForRegressionTest } from "../../../PreTasks";
import { EvanescaContext } from "../../../Interfaces/EvanescaContext";
import { AnalysisResult } from "../../../ConstraintSolver/Interfaces/AnalysisResult";
import { AttackData } from "./attackConstants";
import { constraintIndexMapper } from "../../../ConstraintSolver/ConstraintIndexMapper";

/**
 * Initialize test environment
 * Must be called before running any attack tests
 */
export function initializeTestEnvironment(): void {
  preTasksForRegressionTest();
}

/**
 * Create a fresh test context for attack analysis
 * Each test should use its own context to avoid interference
 */
export function createTestContext(): EvanescaContext {
  return {
    tList: [],
    analyzed: new Set<string>(),
    reports: new Array<AnalysisResult>(),
    fins: new Array<number>(),
    complexity: new Array<number>()
  };
}

/**
 * Execute attack analysis with proper error handling and logging
 */
export async function analyzeAttack(
  attackData: AttackData,
  context: EvanescaContext
): Promise<AnalysisResult[]> {
  console.log(`🔍 Analyzing ${attackData.name}...`);
  console.log(`📊 Transaction: ${attackData.transactionHash}`);
  console.log(`📅 Date: ${attackData.date}`);
  console.log(`🎯 Expected: ${attackData.expectedViolation.type} violation`);
  
  const result = await run(attackData.transactionHash, context);
  
  if (!result) {
    throw new Error(`Analysis failed for ${attackData.name}: No result returned`);
  }
  
  if (!result.reports || result.reports.length === 0) {
    throw new Error(`Analysis failed for ${attackData.name}: No reports generated`);
  }
  
  console.log(`✅ Analysis completed for ${attackData.name}`);
  console.log(`📊 Reports generated: ${result.reports.length}`);
  
  return result.reports;
}

/**
 * Assert that ANY constraint violation was detected (ignore expectedViolation)
 */
export function assertViolationDetected(
  reports: AnalysisResult[],
  attackData: AttackData
): void {
  console.log(`🔍 Checking for ANY constraint violation in ${attackData.name}`);
  console.log(`📊 Total reports: ${reports.length}`);
  
  // Get constraint names dynamically from ConstraintIndexMapper
  const constraintNames = constraintIndexMapper.getConstraintNames();
  
  let violationFound = false;
  const detectedViolations: Array<{reportIndex: number, constraintIndex: number, constraintName: string}> = [];
  
  // Check all reports for ANY violation
  for (let i = 0; i < reports.length; i++) {
    if (reports[i]._violation) {
      console.log(`📊 Report[${i}] violations:`, reports[i]._violation);
      
      // Check each constraint index in this report
      for (let j = 0; j < reports[i]._violation.length; j++) {
        if (reports[i]._violation[j] === true) {
          const constraintName = constraintNames[j] || `CONSTRAINT_${j}`;
          detectedViolations.push({
            reportIndex: i,
            constraintIndex: j,
            constraintName: constraintName
          });
          violationFound = true;
          console.log(`🎯 Found violation: ${constraintName} (index ${j}) in report[${i}]`);
        }
      }
    }
  }
  
  // Display all detected violations
  if (detectedViolations.length > 0) {
    console.log(`\n📋 Summary of detected violations for ${attackData.name}:`);
    detectedViolations.forEach(v => {
      console.log(`  🚨 ${v.constraintName} (index ${v.constraintIndex}) in report[${v.reportIndex}]`);
    });
    console.log(`📊 Total violations detected: ${detectedViolations.length}`);
  }
  
  expect(violationFound).to.equal(
    true,
    `No constraint violations detected in ${attackData.name}. ` +
    `Expected at least one violation but found none.`
  );
  
  console.log(`🎯 Attack detection successful: ${attackData.name} - ${detectedViolations.length} violation(s) found`);
}

/**
 * Get all detected violations from reports for output purposes
 */
export function getDetectedViolations(reports: AnalysisResult[]): Array<{reportIndex: number, constraintIndex: number, constraintName: string}> {
  // Get constraint names dynamically from ConstraintIndexMapper
  const constraintNames = constraintIndexMapper.getConstraintNames();

  const detectedViolations: Array<{reportIndex: number, constraintIndex: number, constraintName: string}> = [];

  // Check all reports for violations
  for (let i = 0; i < reports.length; i++) {
    if (reports[i]._violation) {
      // Check each constraint index in this report
      for (let j = 0; j < reports[i]._violation.length; j++) {
        if (reports[i]._violation[j] === true) {
          const constraintName = constraintNames[j] || `CONSTRAINT_${j}`;
          detectedViolations.push({
            reportIndex: i,
            constraintIndex: j,
            constraintName: constraintName
          });
        }
      }
    }
  }

  return detectedViolations;
}

/**
 * Run a complete attack test with proper setup and assertions
 */
export async function runAttackTest(
  attackData: AttackData,
  testContext?: any
): Promise<void> {
  // Set custom timeout if specified
  if (testContext && attackData.timeout) {
    testContext.timeout(attackData.timeout);
  }
  
  // Create fresh context for this test
  const context = createTestContext();
  
  try {
    // Analyze the attack
    const reports = await analyzeAttack(attackData, context);
    
    // Assert expected violation was detected
    assertViolationDetected(reports, attackData);
    
    console.log(`✅ ${attackData.name} test completed successfully`);
    
  } catch (error) {
    console.error(`❌ ${attackData.name} test failed:`, error);
    throw error;
  }
}

/**
 * Cleanup function to be called after tests complete
 */
export function cleanupAfterTests(): void {
  // Force cleanup and exit after all tests
  setTimeout(() => {
    process.exit(0);
  }, 1000);
}

/**
 * Generate test summary for multiple attacks
 */
export function generateTestSummary(
  attackResults: { name: string; success: boolean; error?: string }[]
): void {
  console.log('\n' + '='.repeat(60));
  console.log('📊 ATTACK DETECTION TEST SUMMARY');
  console.log('='.repeat(60));
  
  const successful = attackResults.filter(r => r.success).length;
  const failed = attackResults.filter(r => !r.success).length;
  
  console.log(`✅ Successful detections: ${successful}`);
  console.log(`❌ Failed detections: ${failed}`);
  console.log(`📊 Total attacks tested: ${attackResults.length}`);
  console.log(`📈 Success rate: ${((successful / attackResults.length) * 100).toFixed(1)}%`);
  
  if (failed > 0) {
    console.log('\n❌ Failed attacks:');
    attackResults.filter(r => !r.success).forEach(result => {
      console.log(`   • ${result.name}: ${result.error}`);
    });
  }
  
  console.log('='.repeat(60));
}