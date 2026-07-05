/// <reference types="mocha" />

/**
 * Test for OptimizedTransactionSampler
 */

import { expect } from 'chai';
import { OptimizedTransactionSampler } from '../../ProtocolVerification/OptimizedTransactionSampler';
import { preTasksForRegressionTest } from '../../PreTasks';

preTasksForRegressionTest();

describe('Optimized Transaction Sampler Test', function() {
  this.timeout(60000); // 1 minute timeout
  
  let sampler: OptimizedTransactionSampler;
  
  before('Initialize sampler', function() {
    sampler = new OptimizedTransactionSampler();
  });
  
  it('should quickly sample Uniswap transactions using fallback', async function() {
    console.log('\n🚀 Testing optimized sampler with Uniswap...');
    
    const startTime = Date.now();
    // Force use of fallback for testing
    const transactions = await sampler.sampleProtocolTransactions('uniswap', 10, true);
    const elapsed = Date.now() - startTime;
    
    console.log(`✅ Sampled ${transactions.length} transactions in ${elapsed}ms`);
    console.log(`   Sample transactions:`, transactions.slice(0, 3));
    
    expect(transactions).to.have.length(10);
    expect(elapsed).to.be.lessThan(100); // Should be instant with fallback
  });
  
  it('should sample multiple protocols quickly', async function() {
    console.log('\n📊 Testing multi-protocol sampling...');
    
    const protocols: ('uniswap' | 'curve' | 'balancer' | 'aave')[] = ['uniswap', 'curve', 'balancer', 'aave'];
    
    for (const protocol of protocols) {
      const startTime = Date.now();
      const transactions = await sampler.sampleProtocolTransactions(protocol, 5, true);
      const elapsed = Date.now() - startTime;
      
      console.log(`   ${protocol}: ${transactions.length} txs in ${elapsed}ms`);
      expect(transactions).to.have.length(5);
      expect(elapsed).to.be.lessThan(100);
    }
  });
  
  after('Clear cache', function() {
    sampler.clearCache();
  });
});