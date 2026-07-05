/// <reference types="mocha" />

/**
 * Quick Protocol Verification Test
 * Tests infrastructure with known transaction hashes
 */

import { expect } from 'chai';
import { LargeScaleVerifier } from '../../ProtocolVerification/testing/LargeScaleVerifier';
import { preTasksForRegressionTest } from '../../PreTasks';

preTasksForRegressionTest();

describe('Quick Protocol Verification Test', function() {
  this.timeout(300000); // 5 minutes
  
  let verifier: LargeScaleVerifier;
  
  before('Initialize verifier', function() {
    verifier = new LargeScaleVerifier({
      batchSize: 5,
      maxConcurrent: 2,
      requestsPerSecond: 10,
      cacheEnabled: true,
      retryOnError: false,
      maxRetries: 1
    });
  });
  
  it('should verify a single attack transaction', async function() {
    // Test with just bZx attack transaction that definitely works
    const testTx = '0x0fe2542079644e107cbf13690eb9c2c65963ccb79089ff96bfaf8dced2331c92'; // bZx attack
    
    console.log('\n📊 Testing with single bZx attack transaction...');
    console.log(`   Transaction: ${testTx}`);
    
    const summary = await verifier.verifyProtocolBatch('uniswap', [testTx]);
    
    console.log('\n📊 Quick Test Results:');
    console.log(`   Total tested: ${summary.totalTransactions}`);
    console.log(`   Violations: ${summary.violationCount}`);
    console.log(`   Violation rate: ${summary.violationRate.toFixed(2)}%`);
    console.log(`   Avg processing time: ${summary.averageProcessingTime.toFixed(0)}ms`);
    console.log(`   Errors: ${summary.errors.length}`);
    
    expect(summary.totalTransactions).to.equal(1);
    // bZx is an attack so we expect it to violate  
    expect(summary.violationRate).to.be.greaterThan(0);
    
    if (summary.errors.length > 0) {
      console.log('\n⚠️ Errors encountered:');
      summary.errors.forEach(err => {
        console.log(`   - ${err.transactionHash}: ${err.error}`);
      });
    }
  });
  
  after('Cleanup', function() {
    verifier.clearCache();
  });
});