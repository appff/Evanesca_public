/// <reference types="mocha" />

/**
 * Large-Scale Protocol Verification Test Suite
 * 
 * Tests protocol invariants across 2000 transactions per protocol (2020-2024)
 * Protocols tested: Uniswap V2/V3, Curve, Balancer, Aave V2/V3
 * Total transactions: ~8000
 */

import { expect } from 'chai';
import { OptimizedTransactionSampler } from '../../ProtocolVerification/OptimizedTransactionSampler';
import { LargeScaleVerifier, VerificationSummary } from '../../ProtocolVerification/testing/LargeScaleVerifier';
import { preTasksForRegressionTest } from '../../PreTasks';
import * as fs from 'fs';
import * as path from 'path';

// Initialize test environment
preTasksForRegressionTest();

describe('🔬 Large-Scale Protocol Verification (2020-2024)', function() {
  // Extended timeout for large-scale testing
  this.timeout(3600000); // 1 hour total timeout
  
  let sampler: OptimizedTransactionSampler;
  let verifier: LargeScaleVerifier;
  let samples: Map<string, string[]>;
  let summaries: Map<string, VerificationSummary>;
  
  // Configuration
  const SAMPLE_SIZE_PER_PROTOCOL = 2000;
  const BATCH_SIZE = 100;
  const MAX_CONCURRENT = 10;
  const CACHE_ENABLED = true;
  
  // Expected violation rates (based on historical data)
  const EXPECTED_VIOLATION_RATES = {
    uniswap: 0.5,    // 0.5% expected violation rate
    curve: 0.4,      // 0.4% for stable pools
    balancer: 0.6,   // 0.6% for weighted pools
    aave: 0.1        // 0.1% for lending (very strict)
  };

  before('Initialize and collect transaction samples', async function() {
    this.timeout(600000); // 10 minutes for sampling
    
    console.log('\\n' + '='.repeat(80));
    console.log('🚀 LARGE-SCALE PROTOCOL VERIFICATION TEST SUITE');
    console.log('='.repeat(80));
    console.log(`📊 Target: ${SAMPLE_SIZE_PER_PROTOCOL} transactions per protocol`);
    console.log(`🗓️  Period: 2020-2024`);
    console.log(`⚡ Batch Size: ${BATCH_SIZE}, Max Concurrent: ${MAX_CONCURRENT}`);
    console.log('='.repeat(80) + '\\n');
    
    // Initialize components
    sampler = new OptimizedTransactionSampler();
    verifier = new LargeScaleVerifier({
      batchSize: BATCH_SIZE,
      maxConcurrent: MAX_CONCURRENT,
      requestsPerSecond: 50,
      cacheEnabled: CACHE_ENABLED,
      retryOnError: true,
      maxRetries: 3
    });
    
    samples = new Map();
    summaries = new Map();
    
    // Check if we have cached samples
    const cacheFile = path.join(__dirname, 'sample-cache.json');
    if (fs.existsSync(cacheFile) && process.env.USE_CACHE === 'true') {
      console.log('📦 Loading cached transaction samples...');
      const cached = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
      for (const [protocol, txs] of Object.entries(cached)) {
        samples.set(protocol, txs as string[]);
      }
      console.log(`✅ Loaded ${samples.size} protocol samples from cache\\n`);
    } else {
      console.log('🔍 Collecting transaction samples (this may take a while)...');
      
      // Define year distribution (400 txs per year for even coverage)
      const yearDistribution = new Map([
        [2020, 400],
        [2021, 400],
        [2022, 400],
        [2023, 400],
        [2024, 400]
      ]);
      
      // Sample Uniswap transactions (use optimized sampling)
      console.log('\\n📈 Sampling Uniswap V2/V3 transactions...');
      const uniswapSamples = await sampler.sampleProtocolTransactions('uniswap', SAMPLE_SIZE_PER_PROTOCOL);
      samples.set('uniswap', uniswapSamples);
      console.log(`   ✅ Collected ${uniswapSamples.length} Uniswap transactions`);
      
      // Sample Curve transactions (use optimized sampling)
      console.log('\\n📈 Sampling Curve transactions...');
      const curveSamples = await sampler.sampleProtocolTransactions('curve', SAMPLE_SIZE_PER_PROTOCOL);
      samples.set('curve', curveSamples);
      console.log(`   ✅ Collected ${curveSamples.length} Curve transactions`);
      
      // Sample Balancer transactions (use optimized sampling)
      console.log('\\n📈 Sampling Balancer transactions...');
      const balancerSamples = await sampler.sampleProtocolTransactions('balancer', SAMPLE_SIZE_PER_PROTOCOL);
      samples.set('balancer', balancerSamples);
      console.log(`   ✅ Collected ${balancerSamples.length} Balancer transactions`);
      
      // Sample Aave transactions (use optimized sampling)
      console.log('\\n📈 Sampling Aave V2/V3 transactions...');
      const aaveSamples = await sampler.sampleProtocolTransactions('aave', SAMPLE_SIZE_PER_PROTOCOL);
      samples.set('aave', aaveSamples);
      console.log(`   ✅ Collected ${aaveSamples.length} Aave transactions`);
      
      // Cache samples for future runs
      const cacheData: any = {};
      samples.forEach((txs, protocol) => {
        cacheData[protocol] = txs;
      });
      fs.writeFileSync(cacheFile, JSON.stringify(cacheData, null, 2));
      console.log('\\n💾 Cached samples for future test runs');
    }
    
    console.log('\\n' + '='.repeat(80));
    console.log('📊 Sample Collection Complete');
    console.log(`   Total protocols: ${samples.size}`);
    console.log(`   Total transactions: ${Array.from(samples.values()).reduce((sum, txs) => sum + txs.length, 0)}`);
    console.log('='.repeat(80) + '\\n');
  });
  
  describe('🦄 Uniswap V2/V3 Verification', function() {
    it('should verify 2000 Uniswap transactions with <0.5% violation rate', async function() {
      this.timeout(1200000); // 20 minutes
      
      const uniswapSamples = samples.get('uniswap')!;
      expect(uniswapSamples).to.have.length.greaterThan(0);
      
      console.log('\\n🦄 Starting Uniswap V2/V3 verification...');
      const summary = await verifier.verifyProtocolBatch('uniswap', uniswapSamples);
      summaries.set('uniswap', summary);
      
      // Assertions
      expect(summary.totalTransactions).to.equal(uniswapSamples.length);
      expect(summary.violationRate).to.be.lessThan(EXPECTED_VIOLATION_RATES.uniswap);
      
      // Log violations for analysis
      if (summary.violations.length > 0) {
        console.log(`\\n⚠️  Found ${summary.violations.length} Uniswap violations:`);
        summary.violations.slice(0, 5).forEach(v => {
          console.log(`   - ${v.transactionHash}: ${v.violationType}`);
        });
        if (summary.violations.length > 5) {
          console.log(`   ... and ${summary.violations.length - 5} more`);
        }
      }
      
      console.log(`\\n✅ Uniswap verification complete`);
    });
  });
  
  describe('🌊 Curve StableSwap Verification', function() {
    it('should verify 2000 Curve transactions with <0.4% violation rate', async function() {
      this.timeout(1200000); // 20 minutes
      
      const curveSamples = samples.get('curve')!;
      expect(curveSamples).to.have.length.greaterThan(0);
      
      console.log('\\n🌊 Starting Curve verification...');
      const summary = await verifier.verifyProtocolBatch('curve', curveSamples);
      summaries.set('curve', summary);
      
      // Assertions
      expect(summary.totalTransactions).to.equal(curveSamples.length);
      expect(summary.violationRate).to.be.lessThan(EXPECTED_VIOLATION_RATES.curve);
      
      // Log violations
      if (summary.violations.length > 0) {
        console.log(`\\n⚠️  Found ${summary.violations.length} Curve violations:`);
        summary.violations.slice(0, 5).forEach(v => {
          console.log(`   - ${v.transactionHash}: ${v.violationType}`);
        });
      }
      
      console.log(`\\n✅ Curve verification complete`);
    });
  });
  
  describe('⚖️ Balancer Weighted Pool Verification', function() {
    it('should verify 2000 Balancer transactions with <0.6% violation rate', async function() {
      this.timeout(1200000); // 20 minutes
      
      const balancerSamples = samples.get('balancer')!;
      expect(balancerSamples).to.have.length.greaterThan(0);
      
      console.log('\\n⚖️ Starting Balancer verification...');
      const summary = await verifier.verifyProtocolBatch('balancer', balancerSamples);
      summaries.set('balancer', summary);
      
      // Assertions
      expect(summary.totalTransactions).to.equal(balancerSamples.length);
      expect(summary.violationRate).to.be.lessThan(EXPECTED_VIOLATION_RATES.balancer);
      
      // Log violations
      if (summary.violations.length > 0) {
        console.log(`\\n⚠️  Found ${summary.violations.length} Balancer violations:`);
        summary.violations.slice(0, 5).forEach(v => {
          console.log(`   - ${v.transactionHash}: ${v.violationType}`);
        });
      }
      
      console.log(`\\n✅ Balancer verification complete`);
    });
  });
  
  describe('🏦 Aave V2/V3 Health Factor Verification', function() {
    it('should verify 2000 Aave transactions with <0.1% violation rate', async function() {
      this.timeout(1200000); // 20 minutes
      
      const aaveSamples = samples.get('aave')!;
      expect(aaveSamples).to.have.length.greaterThan(0);
      
      console.log('\\n🏦 Starting Aave V2/V3 verification...');
      const summary = await verifier.verifyProtocolBatch('aave', aaveSamples);
      summaries.set('aave', summary);
      
      // Assertions
      expect(summary.totalTransactions).to.equal(aaveSamples.length);
      expect(summary.violationRate).to.be.lessThan(EXPECTED_VIOLATION_RATES.aave);
      
      // Log violations
      if (summary.violations.length > 0) {
        console.log(`\\n⚠️  Found ${summary.violations.length} Aave violations:`);
        summary.violations.slice(0, 5).forEach(v => {
          console.log(`   - ${v.transactionHash}: ${v.violationType}`);
        });
      }
      
      console.log(`\\n✅ Aave verification complete`);
    });
  });
  
  after('Generate comprehensive report', function() {
    if (summaries.size === 0) {
      console.log('\\n⚠️  No verification summaries available');
      return;
    }
    
    console.log('\\n' + '='.repeat(100));
    console.log('📊 PROTOCOL VERIFICATION REPORT (2020-2024)');
    console.log('='.repeat(100));
    
    // Header
    console.log('Protocol    | Txs Tested | Violations | Rate  | Avg Process Time | Status');
    console.log('-'.repeat(100));
    
    // Protocol results
    let totalTxs = 0;
    let totalViolations = 0;
    let totalTime = 0;
    
    summaries.forEach((summary, protocol) => {
      const protocolName = protocol.charAt(0).toUpperCase() + protocol.slice(1);
      const status = summary.violationRate < EXPECTED_VIOLATION_RATES[protocol as keyof typeof EXPECTED_VIOLATION_RATES] ? '✅' : '❌';
      
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
      totalTime += summary.averageProcessingTime;
    });
    
    // Totals
    console.log('-'.repeat(100));
    console.log(
      `${'Total'.padEnd(11)} | ` +
      `${totalTxs.toString().padEnd(10)} | ` +
      `${totalViolations.toString().padEnd(10)} | ` +
      `${((totalViolations / totalTxs) * 100).toFixed(3)}% | ` +
      `${(totalTime / summaries.size).toFixed(0)}ms avg`.padEnd(16) + ' | ' +
      (totalViolations / totalTxs < 0.01 ? '✅' : '⚠️')
    );
    
    console.log('\\n' + '='.repeat(100));
    
    // Violation Breakdown
    if (totalViolations > 0) {
      console.log('\\n📋 VIOLATION BREAKDOWN');
      console.log('='.repeat(100));
      
      summaries.forEach((summary, protocol) => {
        if (summary.violations.length > 0) {
          console.log(`\\n${protocol.toUpperCase()} Violations (${summary.violations.length}):`);
          
          // Group by violation type
          const violationTypes = new Map<string, number>();
          summary.violations.forEach(v => {
            const type = v.violationType || 'UNKNOWN';
            violationTypes.set(type, (violationTypes.get(type) || 0) + 1);
          });
          
          violationTypes.forEach((count, type) => {
            console.log(`  - ${type}: ${count} (${((count / summary.violations.length) * 100).toFixed(1)}%)`);
          });
        }
      });
    }
    
    // Processing Statistics
    console.log('\\n📈 PERFORMANCE METRICS');
    console.log('='.repeat(100));
    
    summaries.forEach((summary, protocol) => {
      const stats = verifier.getProcessingStats(protocol);
      if (stats.count > 0) {
        console.log(`\\n${protocol.toUpperCase()}:`);
        console.log(`  - Transactions: ${stats.count}`);
        console.log(`  - Avg Time: ${stats.average.toFixed(0)}ms`);
        console.log(`  - Min Time: ${stats.min}ms`);
        console.log(`  - Max Time: ${stats.max}ms`);
        console.log(`  - Median Time: ${stats.median}ms`);
      }
    });
    
    // Cache Statistics
    const cacheStats = verifier.getCacheStats();
    console.log('\\n💾 CACHE STATISTICS');
    console.log('='.repeat(100));
    console.log(`  - Cache Size: ${cacheStats.size} entries`);
    console.log(`  - Cache Enabled: ${CACHE_ENABLED}`);
    
    // Final Summary
    console.log('\\n🎯 FINAL SUMMARY');
    console.log('='.repeat(100));
    console.log(`✅ Successfully verified ${totalTxs} transactions across 4 major DeFi protocols`);
    console.log(`📊 Overall violation rate: ${((totalViolations / totalTxs) * 100).toFixed(3)}%`);
    console.log(`⚡ Average processing time: ${(totalTime / summaries.size).toFixed(0)}ms per transaction`);
    
    const allPassed = Array.from(summaries.values()).every(
      (s, i) => s.violationRate < Object.values(EXPECTED_VIOLATION_RATES)[i]
    );
    
    if (allPassed) {
      console.log('\\n🌟 ALL PROTOCOLS PASSED VERIFICATION THRESHOLDS! 🌟');
    } else {
      console.log('\\n⚠️  Some protocols exceeded expected violation rates');
    }
    
    console.log('='.repeat(100) + '\\n');
    
    // Save full report to file
    const reportFile = path.join(__dirname, `verification-report-${Date.now()}.json`);
    const reportData = {
      timestamp: new Date().toISOString(),
      summaries: Array.from(summaries.entries()).map(([protocol, summary]) => ({
        protocol,
        ...summary
      })),
      statistics: {
        totalTransactions: totalTxs,
        totalViolations,
        overallViolationRate: (totalViolations / totalTxs) * 100,
        averageProcessingTime: totalTime / summaries.size
      }
    };
    
    fs.writeFileSync(reportFile, JSON.stringify(reportData, null, 2));
    console.log(`📁 Full report saved to: ${reportFile}`);
  });
});