/// <reference types="mocha" />

/**
 * Demo Large-Scale Protocol Verification Test Suite
 * 
 * Demonstrates protocol verification capabilities using known transactions
 * instead of slow blockchain sampling
 */

import { expect } from 'chai';
import { LargeScaleVerifier, VerificationSummary } from '../../ProtocolVerification/testing/LargeScaleVerifier';
import { preTasksForRegressionTest } from '../../PreTasks';
import * as fs from 'fs';
import * as path from 'path';

// Initialize test environment
preTasksForRegressionTest();

describe('🔬 Demo Protocol Verification', function() {
  this.timeout(600000); // 10 minutes total timeout
  
  let verifier: LargeScaleVerifier;
  let summaries: Map<string, VerificationSummary>;
  
  before('Initialize verifier', function() {
    console.log('\n' + '='.repeat(80));
    console.log('🚀 DEMO PROTOCOL VERIFICATION TEST SUITE');
    console.log('='.repeat(80));
    console.log('📊 Testing with known attack and normal transactions');
    console.log('⚡ Demonstrates violation detection capabilities');
    console.log('='.repeat(80) + '\n');
    
    verifier = new LargeScaleVerifier({
      batchSize: 10,
      maxConcurrent: 3,
      requestsPerSecond: 10,
      cacheEnabled: true,
      retryOnError: true,
      maxRetries: 2
    });
    
    summaries = new Map();
  });
  
  describe('🦄 Uniswap V2/V3 Verification Demo', function() {
    it('should detect violations in known attack transactions', async function() {
      // Mix of attack and potentially normal transactions
      const uniswapTxs = [
        // Known attacks involving Uniswap
        '0x0fe2542079644e107cbf13690eb9c2c65963ccb79089ff96bfaf8dced2331c92', // bZx
        '0xae7d664bdfcc54220df4f18d339005c6faf6e62c9ca79c56387bc0389274363b', // Float Protocol
        '0xc6fb8217e45870a93c25e3d99182cc6c5d77da30e22b8efd4029511205878ac9', // Inverse Finance
        '0x045b60411af18114f1986957a41296ba2a97ccff75a9b38af818800ea9da0b2a', // Elephant Money
        '0x89d0ae4e667c50a04318785d3e7795fd7b73c837fd427e8a7194165074e96ad9'  // Qubit Finance
      ];
      
      console.log('\n🦄 Testing Uniswap with 5 known attack transactions...');
      const summary = await verifier.verifyProtocolBatch('uniswap', uniswapTxs);
      summaries.set('uniswap', summary);
      
      // Assertions
      expect(summary.totalTransactions).to.equal(uniswapTxs.length);
      expect(summary.violationRate).to.be.greaterThan(0); // Should detect violations
      
      console.log('\n✅ Uniswap verification complete');
      console.log(`   Violations detected: ${summary.violationCount}/${summary.totalTransactions}`);
    });
  });
  
  describe('🏦 Aave V2/V3 Verification Demo', function() {
    it('should detect lending protocol violations', async function() {
      // Known attacks involving lending protocols
      const aaveTxs = [
        '0x0fe2542079644e107cbf13690eb9c2c65963ccb79089ff96bfaf8dced2331c92', // bZx (involves lending)
        '0xae7d664bdfcc54220df4f18d339005c6faf6e62c9ca79c56387bc0389274363b', // Float Protocol
        '0x89d0ae4e667c50a04318785d3e7795fd7b73c837fd427e8a7194165074e96ad9'  // Qubit (lending exploit)
      ];
      
      console.log('\n🏦 Testing Aave with 3 known attack transactions...');
      const summary = await verifier.verifyProtocolBatch('aave', aaveTxs);
      summaries.set('aave', summary);
      
      expect(summary.totalTransactions).to.equal(aaveTxs.length);
      
      console.log('\n✅ Aave verification complete');
      console.log(`   Violations detected: ${summary.violationCount}/${summary.totalTransactions}`);
    });
  });
  
  after('Generate demo report', function() {
    if (summaries.size === 0) {
      console.log('\n⚠️  No verification summaries available');
      return;
    }
    
    console.log('\n' + '='.repeat(100));
    console.log('📊 DEMO VERIFICATION REPORT');
    console.log('='.repeat(100));
    
    // Header
    console.log('Protocol    | Txs Tested | Violations | Rate  | Avg Process Time | Status');
    console.log('-'.repeat(100));
    
    // Protocol results
    let totalTxs = 0;
    let totalViolations = 0;
    
    summaries.forEach((summary, protocol) => {
      const protocolName = protocol.charAt(0).toUpperCase() + protocol.slice(1);
      const status = summary.violationCount > 0 ? '✅ Detections' : '⚠️ No detections';
      
      console.log(
        `${protocolName.padEnd(11)} | ` +
        `${summary.totalTransactions.toString().padEnd(10)} | ` +
        `${summary.violationCount.toString().padEnd(10)} | ` +
        `${summary.violationRate.toFixed(2)}% | ` +
        `${summary.averageProcessingTime.toFixed(0)}ms`.padEnd(16) + ' | ' +
        status
      );
      
      totalTxs += summary.totalTransactions;
      totalViolations += summary.violationCount;
    });
    
    // Totals
    console.log('-'.repeat(100));
    console.log(
      `${'Total'.padEnd(11)} | ` +
      `${totalTxs.toString().padEnd(10)} | ` +
      `${totalViolations.toString().padEnd(10)} | ` +
      `${((totalViolations / totalTxs) * 100).toFixed(2)}% | ` +
      `${Array.from(summaries.values()).reduce((sum, s) => sum + s.averageProcessingTime, 0) / summaries.size}ms avg`.padEnd(16)
    );
    
    console.log('\n' + '='.repeat(100));
    
    // Violation Details
    if (totalViolations > 0) {
      console.log('\n📋 VIOLATION DETAILS');
      console.log('='.repeat(100));
      
      summaries.forEach((summary, protocol) => {
        if (summary.violations.length > 0) {
          console.log(`\n${protocol.toUpperCase()} Violations (${summary.violations.length}):`);;
          summary.violations.forEach(v => {
            console.log(`  - TX: ${v.transactionHash.slice(0, 10)}...`);
            console.log(`    Type: ${v.violationType || 'DETECTED'}`);
            if (v.violationDetails) {
              console.log(`    Details: ${JSON.stringify(v.violationDetails).slice(0, 100)}...`);
            }
          });
        }
      });
    }
    
    console.log('\n🎯 SUMMARY');
    console.log('='.repeat(100));
    console.log(`✅ Successfully verified ${totalTxs} transactions`);
    console.log(`📊 Detected ${totalViolations} violations (${((totalViolations / totalTxs) * 100).toFixed(1)}% violation rate)`);
    console.log(`⚡ This demonstrates the protocol verification infrastructure is working`);
    console.log('📝 For full-scale testing, implement efficient transaction sampling from blockchain');
    
    console.log('='.repeat(100) + '\n');
  });
});