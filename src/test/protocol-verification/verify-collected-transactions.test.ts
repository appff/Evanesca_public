/**
 * Verification test for already-collected Etherscan transactions
 */

import { expect } from 'chai';
import { run } from '../../Driver';
import { preTasksForRegressionTest } from '../../PreTasks';
import { EvanescaContext } from '../../Interfaces/EvanescaContext';
import * as fs from 'fs';
import * as path from 'path';

describe('Verify Collected Etherscan Transactions', function() {
  this.timeout(600000); // 10 minutes
  
  before(() => {
    console.log('\n🔧 Initializing test environment...');
    preTasksForRegressionTest();
  });
  
  it('should verify a sample of collected transactions', async () => {
    // Load collected transactions
    const sessionDir = path.join(__dirname, '../../../verification-results/etherscan-2025-08-27T04-19-13-150Z');
    const protocols = ['uniswap', 'curve', 'balancer', 'aave'];
    const SAMPLE_SIZE = 10; // Test with 10 transactions per protocol
    
    console.log(`\n📁 Loading transactions from: ${sessionDir}`);
    
    const results: any[] = [];
    
    for (const protocol of protocols) {
      const txFile = path.join(sessionDir, `${protocol}-transactions.json`);
      
      if (!fs.existsSync(txFile)) {
        console.log(`⚠️ Skipping ${protocol} - file not found`);
        continue;
      }
      
      const txHashes = JSON.parse(fs.readFileSync(txFile, 'utf8'));
      const sample = txHashes.slice(0, SAMPLE_SIZE);
      
      console.log(`\n📡 Verifying ${protocol.toUpperCase()} transactions (${sample.length} samples)...`);
      
      let successCount = 0;
      let violationCount = 0;
      let errorCount = 0;
      
      for (let i = 0; i < sample.length; i++) {
        const txHash = sample[i];
        console.log(`  [${i + 1}/${sample.length}] ${txHash}`);
        
        const context: EvanescaContext = {
          tList: [],
          analyzed: new Set<string>(),
          reports: [],
          fins: [],
          complexity: []
        };
        
        try {
          const startTime = Date.now();
          const result = await run(txHash, context);
          const processingTime = Date.now() - startTime;
          
          if (result && result.reports) {
            successCount++;
            
            // Check for violations
            let hasViolation = false;
            result.reports.forEach(report => {
              if (report._violation && report._violation.some((v: any) => v > 0)) {
                hasViolation = true;
              }
            });
            
            if (hasViolation) {
              violationCount++;
              console.log(`    ⚠️ Violation detected (${processingTime}ms)`);
            } else {
              console.log(`    ✅ No violations (${processingTime}ms)`);
            }
            
            results.push({
              protocol,
              txHash,
              success: true,
              hasViolation,
              processingTime,
              reportCount: result.reports.length
            });
          } else {
            errorCount++;
            console.log(`    ❌ Analysis failed`);
            results.push({
              protocol,
              txHash,
              success: false,
              error: 'No result returned'
            });
          }
        } catch (error: any) {
          errorCount++;
          console.log(`    ❌ Error: ${error.message}`);
          results.push({
            protocol,
            txHash,
            success: false,
            error: error.message
          });
        }
      }
      
      // Protocol summary
      const violationRate = successCount > 0 ? (violationCount / successCount * 100).toFixed(1) : '0';
      console.log(`\n  📊 ${protocol.toUpperCase()} Summary:`);
      console.log(`     - Success: ${successCount}/${sample.length}`);
      console.log(`     - Violations: ${violationCount}`);
      console.log(`     - Violation Rate: ${violationRate}%`);
      console.log(`     - Errors: ${errorCount}`);
    }
    
    // Save results
    const outputDir = path.join(__dirname, '../../../verification-results/test-results');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    const outputFile = path.join(outputDir, `verification-${Date.now()}.json`);
    fs.writeFileSync(outputFile, JSON.stringify(results, null, 2));
    
    // Final summary
    const totalSuccess = results.filter(r => r.success).length;
    const totalViolations = results.filter(r => r.hasViolation).length;
    const totalErrors = results.filter(r => !r.success).length;
    
    console.log('\n' + '='.repeat(50));
    console.log('📊 OVERALL SUMMARY');
    console.log('='.repeat(50));
    console.log(`Total Transactions: ${results.length}`);
    console.log(`Successful Verifications: ${totalSuccess}`);
    console.log(`Violations Detected: ${totalViolations}`);
    console.log(`Errors: ${totalErrors}`);
    console.log(`Overall Violation Rate: ${totalSuccess > 0 ? (totalViolations / totalSuccess * 100).toFixed(1) : '0'}%`);
    console.log('='.repeat(50));
    
    console.log(`\n📁 Results saved to: ${outputFile}`);
    
    // Assertions
    expect(results.length).to.be.greaterThan(0);
    expect(totalSuccess).to.be.greaterThan(0);
  });
});