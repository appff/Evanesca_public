/**
 * Test for fetching real transactions from Etherscan API
 * Demonstrates fetching actual DeFi protocol transactions for verification
 */

import { expect } from 'chai';
import { EtherscanTransactionFetcher } from '../../ProtocolVerification/EtherscanTransactionFetcher';
import * as fs from 'fs';
import * as path from 'path';

describe('Etherscan Transaction Fetcher - Real Data Collection', function() {
  this.timeout(600000); // 10 minutes timeout for API calls
  
  let fetcher: EtherscanTransactionFetcher;
  
  before(() => {
    fetcher = new EtherscanTransactionFetcher();
  });
  
  it('should fetch real Uniswap transactions from major pools', async () => {
    console.log('\n🔄 Fetching Uniswap transactions from Etherscan...');
    
    const txHashes = await fetcher.fetchTransactions({
      protocol: 'uniswap',
      count: 100, // Start with 100 for testing
      startBlock: 18000000,
      endBlock: 18100000
    });
    
    expect(txHashes).to.be.an('array');
    expect(txHashes.length).to.be.greaterThan(0);
    console.log(`✅ Fetched ${txHashes.length} Uniswap transactions`);
    
    // Verify uniqueness
    const uniqueHashes = new Set(txHashes);
    expect(uniqueHashes.size).to.equal(txHashes.length);
    
    // Save for inspection
    const outputDir = path.join(__dirname, '../../../verification-results/etherscan-test');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    fs.writeFileSync(
      path.join(outputDir, 'uniswap-sample.json'),
      JSON.stringify(txHashes.slice(0, 10), null, 2)
    );
    
    console.log('Sample transactions:', txHashes.slice(0, 3));
  });
  
  it('should fetch transactions for all protocols', async () => {
    console.log('\n🔄 Fetching transactions for all protocols...');
    
    const protocols = ['uniswap', 'curve', 'balancer', 'aave'] as const;
    const results = new Map<string, string[]>();
    
    for (const protocol of protocols) {
      console.log(`\n📊 Fetching ${protocol} transactions...`);
      
      const txHashes = await fetcher.fetchTransactions({
        protocol,
        count: 50, // Small batch for testing
        startBlock: 18000000,
        endBlock: 18050000
      });
      
      results.set(protocol, txHashes);
      console.log(`✅ ${protocol}: ${txHashes.length} transactions`);
      
      // Rate limiting between protocols
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    // Save all results
    const outputDir = path.join(__dirname, '../../../verification-results/etherscan-test');
    EtherscanTransactionFetcher.saveTransactions(results, outputDir);
    
    // Verify each protocol has transactions
    results.forEach((txHashes, protocol) => {
      expect(txHashes).to.be.an('array');
      expect(txHashes.length).to.be.greaterThan(0);
      
      // Check uniqueness
      const unique = new Set(txHashes);
      expect(unique.size).to.equal(txHashes.length);
    });
  });
  
});

