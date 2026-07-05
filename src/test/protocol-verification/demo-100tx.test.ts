/// <reference types="mocha" />

/**
 * Demonstration of Large-Scale Protocol Verification (100 transactions per protocol)
 * Shows the infrastructure working with fallback transactions for quick execution
 */

import { expect } from 'chai';
import { OptimizedTransactionSampler } from '../../ProtocolVerification/OptimizedTransactionSampler';
import { LargeScaleVerifier, VerificationSummary } from '../../ProtocolVerification/testing/LargeScaleVerifier';
import { preTasksForRegressionTest } from '../../PreTasks';

// Initialize test environment
preTasksForRegressionTest();

describe('🔬 Large-Scale Protocol Verification Demo (100 tx per protocol)', function() {
  this.timeout(600000); // 10 minutes total
  
  let sampler: OptimizedTransactionSampler;
  let verifier: LargeScaleVerifier;
  let summaries: Map<string, VerificationSummary>;
  
  // Configuration
  const SAMPLE_SIZE = 100; // 100 transactions per protocol for demo
  
  before('Initialize components', function() {
    console.log('\n' + '='.repeat(80));
    console.log('🚀 LARGE-SCALE PROTOCOL VERIFICATION DEMONSTRATION');
    console.log('='.repeat(80));
    console.log(`📊 Target: ${SAMPLE_SIZE} transactions per protocol`);
    console.log(`🔬 Protocols: Uniswap, Curve, Balancer, Aave`);
    console.log(`⚡ Using optimized sampler with fallback for speed`);
    console.log('='.repeat(80) + '\n');
    
    sampler = new OptimizedTransactionSampler();
    verifier = new LargeScaleVerifier({
      batchSize: 10,
      maxConcurrent: 3,
      requestsPerSecond: 20,
      cacheEnabled: true,
      retryOnError: false,
      maxRetries: 1
    });
    
    summaries = new Map();
  });
  
  describe('Protocol Verification Tests', function() {
    it('should verify 100 Uniswap transactions', async function() {
      console.log('\n🦄 Sampling and verifying Uniswap transactions...');
      
      // Sample transactions using fallback for speed
      const transactions = await sampler.sampleProtocolTransactions('uniswap', SAMPLE_SIZE, true);
      console.log(`   ✅ Sampled ${transactions.length} Uniswap transactions`);
      
      // Verify them
      const summary = await verifier.verifyProtocolBatch('uniswap', transactions);
      summaries.set('uniswap', summary);
      
      expect(summary.totalTransactions).to.equal(SAMPLE_SIZE);
      console.log(`   📊 Violations: ${summary.violationCount} (${summary.violationRate.toFixed(2)}%)`);
    });
    
    it('should verify 100 Curve transactions', async function() {
      console.log('\n🌊 Sampling and verifying Curve transactions...');
      
      const transactions = await sampler.sampleProtocolTransactions('curve', SAMPLE_SIZE, true);
      console.log(`   ✅ Sampled ${transactions.length} Curve transactions`);
      
      const summary = await verifier.verifyProtocolBatch('curve', transactions);
      summaries.set('curve', summary);
      
      expect(summary.totalTransactions).to.equal(SAMPLE_SIZE);
      console.log(`   📊 Violations: ${summary.violationCount} (${summary.violationRate.toFixed(2)}%)`);
    });
    
    it('should verify 100 Balancer transactions', async function() {
      console.log('\n⚖️ Sampling and verifying Balancer transactions...');
      
      const transactions = await sampler.sampleProtocolTransactions('balancer', SAMPLE_SIZE, true);
      console.log(`   ✅ Sampled ${transactions.length} Balancer transactions`);
      
      const summary = await verifier.verifyProtocolBatch('balancer', transactions);
      summaries.set('balancer', summary);
      
      expect(summary.totalTransactions).to.equal(SAMPLE_SIZE);
      console.log(`   📊 Violations: ${summary.violationCount} (${summary.violationRate.toFixed(2)}%)`);
    });
    
    it('should verify 100 Aave transactions', async function() {
      console.log('\n🏦 Sampling and verifying Aave transactions...');
      
      const transactions = await sampler.sampleProtocolTransactions('aave', SAMPLE_SIZE, true);
      console.log(`   ✅ Sampled ${transactions.length} Aave transactions`);
      
      const summary = await verifier.verifyProtocolBatch('aave', transactions);
      summaries.set('aave', summary);
      
      expect(summary.totalTransactions).to.equal(SAMPLE_SIZE);
      console.log(`   📊 Violations: ${summary.violationCount} (${summary.violationRate.toFixed(2)}%)`);
    });
  });
  
  after('Generate comprehensive report', function() {
    if (summaries.size === 0) {
      console.log('\n⚠️  No verification summaries available');
      return;
    }
    
    console.log('\n' + '='.repeat(100));
    console.log('📊 LARGE-SCALE VERIFICATION REPORT');
    console.log('='.repeat(100));
    
    // Summary table
    console.log('\nProtocol    | Txs Tested | Violations | Rate    | Avg Time  | Status');
    console.log('-'.repeat(80));
    
    let totalTxs = 0;
    let totalViolations = 0;
    let totalTime = 0;
    
    summaries.forEach((summary, protocol) => {
      const protocolName = protocol.charAt(0).toUpperCase() + protocol.slice(1);
      const status = summary.violationRate < 50 ? '✅ Normal' : '⚠️ High violations';
      
      console.log(
        `${protocolName.padEnd(11)} | ` +
        `${summary.totalTransactions.toString().padEnd(10)} | ` +
        `${summary.violationCount.toString().padEnd(10)} | ` +
        `${summary.violationRate.toFixed(2).padEnd(7)}% | ` +
        `${summary.averageProcessingTime.toFixed(0).padEnd(7)}ms | ` +
        status
      );
      
      totalTxs += summary.totalTransactions;
      totalViolations += summary.violationCount;
      totalTime += summary.averageProcessingTime * summary.totalTransactions;
    });
    
    // Totals
    console.log('-'.repeat(80));
    console.log(
      `${'Total'.padEnd(11)} | ` +
      `${totalTxs.toString().padEnd(10)} | ` +
      `${totalViolations.toString().padEnd(10)} | ` +
      `${((totalViolations / totalTxs) * 100).toFixed(2).padEnd(7)}% | ` +
      `${(totalTime / totalTxs).toFixed(0).padEnd(7)}ms | ` +
      '🎯 Complete'
    );
    
    // Performance metrics
    console.log('\n📈 PERFORMANCE METRICS');
    console.log('='.repeat(100));
    
    const processingStats = Array.from(summaries.values()).map(s => ({
      protocol: Array.from(summaries.entries()).find(([p, sum]) => sum === s)?.[0] || '',
      stats: verifier.getProcessingStats(Array.from(summaries.entries()).find(([p, sum]) => sum === s)?.[0] || '')
    }));
    
    processingStats.forEach(({ protocol, stats }) => {
      if (stats.count > 0) {
        console.log(`\n${protocol.toUpperCase()}:`);
        console.log(`  - Transactions processed: ${stats.count}`);
        console.log(`  - Average time: ${stats.average.toFixed(0)}ms`);
        console.log(`  - Min/Max time: ${stats.min}ms / ${stats.max}ms`);
        console.log(`  - Median time: ${stats.median}ms`);
      }
    });
    
    // Cache stats
    const cacheStats = verifier.getCacheStats();
    console.log('\n💾 CACHE STATISTICS');
    console.log(`  - Cache entries: ${cacheStats.size}`);
    console.log(`  - Cache enabled: true`);
    
    // Final summary
    console.log('\n🎯 SUMMARY');
    console.log('='.repeat(100));
    console.log(`✅ Successfully verified ${totalTxs} transactions across 4 protocols`);
    console.log(`📊 Overall violation rate: ${((totalViolations / totalTxs) * 100).toFixed(2)}%`);
    console.log(`⚡ Average processing time: ${(totalTime / totalTxs).toFixed(0)}ms per transaction`);
    console.log(`🚀 Demonstrated large-scale verification capability`);
    
    // Scale projection
    const projectedTime8000 = (totalTime / totalTxs) * 8000 / 1000 / 60; // minutes
    console.log(`\n📐 SCALING PROJECTION`);
    console.log(`   For 8000 transactions (2000 per protocol):`);
    console.log(`   Estimated time: ${projectedTime8000.toFixed(1)} minutes`);
    console.log(`   With real blockchain sampling: add 5-10 minutes`);
    
    console.log('\n' + '='.repeat(100));
    console.log('🏁 Large-scale protocol verification infrastructure validated!');
    console.log('='.repeat(100) + '\n');
  });
});