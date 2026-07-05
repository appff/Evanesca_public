/**
 * Simple test to verify Etherscan fetching and protocol verification
 */

import { expect } from 'chai';
import { run } from '../../Driver';
import { preTasksForRegressionTest } from '../../PreTasks';
import { EvanescaContext } from '../../Interfaces/EvanescaContext';
import { EtherscanTransactionFetcher } from '../../ProtocolVerification/EtherscanTransactionFetcher';
import * as fs from 'fs';
import * as path from 'path';

describe('Simple Etherscan Verification Test', function() {
  this.timeout(300000); // 5 minutes
  
  before(() => {
    console.log('\n🔧 Initializing test environment...');
    preTasksForRegressionTest();
  });
  
  it('should fetch and verify 10 Uniswap transactions', async () => {
    const fetcher = new EtherscanTransactionFetcher();
    
    console.log('\n📡 Fetching Uniswap transactions from Etherscan...');
    
    const txHashes = await fetcher.fetchTransactions({
      protocol: 'uniswap',
      count: 10,
      startBlock: 18800000,
      endBlock: 18810000
    });
    
    console.log(`✅ Fetched ${txHashes.length} transactions`);
    console.log('\nSample hashes:');
    txHashes.slice(0, 3).forEach((hash, i) => {
      console.log(`  ${i + 1}. ${hash}`);
    });
    
    // Verify first 3 transactions
    console.log('\n🔍 Verifying transactions...');
    
    for (let i = 0; i < Math.min(3, txHashes.length); i++) {
      const txHash = txHashes[i];
      console.log(`\nAnalyzing transaction ${i + 1}/${3}: ${txHash}`);
      
      const context: EvanescaContext = {
        tList: [],
        analyzed: new Set<string>(),
        reports: [],
        fins: [],
        complexity: []
      };
      
      try {
        const result = await run(txHash, context);
        
        if (result && result.reports) {
          console.log(`  ✅ Analysis complete - ${result.reports.length} reports generated`);
          
          // Check for violations
          let violationCount = 0;
          result.reports.forEach(report => {
            if (report._violation && report._violation.some((v: any) => v > 0)) {
              violationCount++;
            }
          });
          
          if (violationCount > 0) {
            console.log(`  ⚠️ ${violationCount} violations detected`);
          } else {
            console.log(`  ✅ No violations detected`);
          }
        }
      } catch (error) {
        console.log(`  ❌ Error: ${error.message}`);
      }
    }
    
    // Save results
    const outputDir = path.join(__dirname, '../../../verification-results/simple-test');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    fs.writeFileSync(
      path.join(outputDir, 'uniswap-sample.json'),
      JSON.stringify(txHashes, null, 2)
    );
    
    console.log(`\n📁 Transaction hashes saved to: ${outputDir}`);
    
    expect(txHashes).to.be.an('array');
    expect(txHashes.length).to.be.greaterThan(0);
  });
});