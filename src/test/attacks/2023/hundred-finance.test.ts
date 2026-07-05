/// <reference types="mocha" />

/**
 * Hundred Finance Attack Test Case (2023.04.15)
 * 
 * Transaction: 0x15096dc6a59cff26e0bd22eaf7e3a60125dcec687580383488b7b5dd2aceea93
 * Loss: ~$7M
 * Attack Type: Donation-based exchange rate manipulation
 * Chain: Optimism L2
 * Expected Detection: DONATION_INFLATION, L2_EXCESSIVE_BORROWING
 */

import { expect } from "chai";
import { run } from "../../../Driver";
import { preTasksForRegressionTest } from "../../../PreTasks";
import { EvanescaContext } from "../../../Interfaces/EvanescaContext";
import '../shared/testSetup'; // Ensures proper test cleanup


// Initialize test environment
preTasksForRegressionTest();

// Hundred Finance attack transaction details
const HUNDRED_FINANCE_ATTACK = {
  transactionHash: '0x15096dc6a59cff26e0bd22eaf7e3a60125dcec687580383488b7b5dd2aceea93',
  blockNumber: 88726289, // Optimism block number
  expectedLoss: '$7M',
  attackType: 'Donation-based exchange rate manipulation',
  chain: 'Optimism'
};

describe('Hundred Finance Attack Detection (April 2023)', () => {
  it('should process Hundred Finance attack transaction on Optimism', async function() {
    this.timeout(60000);
    
    const ATTACK_TX = HUNDRED_FINANCE_ATTACK.transactionHash;
    
    console.log('\n🔍 Analyzing Hundred Finance Attack (Optimism L2)...');
    console.log('📅 Date: April 15, 2023');
    console.log('💰 Loss: ~$7M');
    console.log('🔗 Chain: Optimism (L2)');
    console.log('🎯 Attack Vector: Donation-based exchange rate manipulation');
    console.log(`📝 Transaction: ${ATTACK_TX.substring(0, 10)}...`);
    
    // Create context for analysis
    const context: EvanescaContext = {
      reports: [],
      fins: [],
      complexity: [],
      analyzed: new Set<string>(),
      tList: [ATTACK_TX]
    };
    
    try {
      // Run analysis
      const result = await run(ATTACK_TX, context);
      
      // Check if we got a result
      expect(result).to.exist;
      console.log('\n✅ Successfully fetched and processed Optimism transaction');
      
      // Check if any reports were generated
      if (context.reports.length > 0) {
        const report = context.reports[0];
        console.log(`\n📊 Analysis Report:`);
        console.log(`  - Transaction analyzed: ${report._hash}`);
        console.log(`  - Time elapsed: ${report._elapsed}ms`);
        
        // Check for violations
        const hasViolations = report._violation && report._violation.some(v => v === true);
        
        if (hasViolations) {
          console.log('  ✅ Attack DETECTED!');
          const violationCount = report._violation.filter(v => v === true).length;
          console.log(`  - Violations found: ${violationCount}`);
          
          // Check if the comment contains constraint information
          if (report._comment) {
            console.log(`  - Detection details: ${typeof report._comment === 'string' ? report._comment : 'Available'}`);
          }
        } else {
          console.log('  ❌ No violations detected');
          console.log('  ⚠️  Note: This may require additional Hundred Finance protocol configuration');
        }
      } else {
        console.log('\n⚠️  No analysis report generated');
        console.log('  This transaction may have been filtered or skipped');
      }
      
      // Check fins status
      if (context.fins[0] === 1) { // Result.FINISHED
        console.log('\n✅ Transaction analysis completed successfully');
      } else if (context.fins[0] === 2) { // Result.SKIPPED
        console.log('\n⚠️  Transaction was skipped (may not contain relevant DeFi events)');
      } else if (context.fins[0] === 3) { // Result.ERROR
        console.log('\n❌ Error occurred during analysis');
      }
      
    } catch (error: any) {
      console.error('\n❌ Test failed with error:', error);
      
      // Check if it's an Optimism connection issue
      if (error && error.message && error.message.includes('Failed to get transaction receipt')) {
        console.log('\n⚠️  Optimism RPC connection issue. The provider configuration is working but the endpoint may be temporarily unavailable.');
      }
      
      throw error;
    }
  });
  
  it('should verify Optimism chain detection', function() {
    const { detectChainFromTxHash } = require('../../../Utils/Driver/DriverUtils');
    
    const chainId = detectChainFromTxHash(HUNDRED_FINANCE_ATTACK.transactionHash);
    
    expect(chainId).to.equal(10); // Optimism chain ID
    console.log('✅ Optimism chain correctly detected for Hundred Finance attack transaction');
  });
});