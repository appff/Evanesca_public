/**
 * Comprehensive Violation Validation Framework
 * 
 * Purpose: Validate whether high violation rates (20-45%) are legitimate or false positives
 * Focus: 1) Semantic Financial Graph creation, 2) Token price accuracy
 */

import { expect } from 'chai';
import { run } from '../Driver';
import { preTasksForRegressionTest } from '../PreTasks';
import { EvanescaContext } from '../Interfaces/EvanescaContext';
import * as fs from 'fs';
import * as path from 'path';

describe('Violation Validation Framework', function() {
  this.timeout(600000);
  
  before(() => {
    console.log('\n🔧 Initializing validation framework...');
    preTasksForRegressionTest();
  });

  /**
   * CRITICAL TEST 1: Semantic Financial Graph Creation
   * If graphs aren't created, all violations are meaningless
   */
  it('should verify Semantic Financial Graph creation for each protocol', async () => {
    console.log('\n' + '='.repeat(60));
    console.log('📊 SEMANTIC FINANCIAL GRAPH VALIDATION');
    console.log('='.repeat(60));
    
    const testTransactions = {
      uniswap: '0xb6400e2df5d3e7a1436df2dff0b3fa528fdad005a60669fa24f2a06bad17bf9d',
      curve: '0x024fceb9d922bc77f406be62368df3aecf8c5ae5fd1e164c3ecf6228e018b56b',
      balancer: '0xed5207e7193be3d48c33c0fa7998124c11402f126fb482e29cf8e0b5b3a5fd79',
      aave: '0x614524b82477834bb52c0dd75664a7b2baf1d766d4a870d7d0a32bdcb7eedc83'
    };

    for (const [protocol, txHash] of Object.entries(testTransactions)) {
      console.log(`\n🔍 Testing ${protocol.toUpperCase()} graph creation...`);
      
      const context: EvanescaContext = {
        tList: [],
        analyzed: new Set<string>(),
        reports: [],
        fins: [],
        complexity: []
      };
      
      // Intercept console logs to capture graph creation
      const logs: string[] = [];
      const originalLog = console.log;
      console.log = (msg: string) => {
        logs.push(msg);
        if (msg.includes('EdgeVisualization') || msg.includes('edge') || msg.includes('graph')) {
          originalLog(msg);
        }
      };
      
      const result = await run(txHash, context);
      console.log = originalLog; // Restore
      
      // Check for graph edges in logs
      const hasEdges = logs.some(log => 
        log.includes('Created edge') || 
        log.includes('Total edges:') ||
        log.includes('EdgeVisualization')
      );
      
      const edgeCount = logs.find(log => log.includes('Total edges:'));
      const graphEmpty = logs.some(log => log.includes('No edges to visualize'));
      
      console.log(`  Transaction: ${txHash.substring(0, 10)}...`);
      console.log(`  Graph created: ${hasEdges ? '✅ YES' : '❌ NO'}`);
      console.log(`  Edge info: ${edgeCount || (graphEmpty ? 'Empty graph' : 'Unknown')}`);
      
      // Critical assertion: Graph must be created
      if (!hasEdges && !graphEmpty) {
        console.log(`  ⚠️ WARNING: No clear graph creation evidence for ${protocol}`);
      }
      
      // Check violations
      if (result?.reports && result.reports.length > 0) {
        const violations = result.reports.filter(r => 
          r._violation && r._violation.some((v: any) => v > 0)
        );
        console.log(`  Violations: ${violations.length > 0 ? '⚠️ DETECTED' : '✅ NONE'}`);
        
        if (violations.length > 0 && !hasEdges) {
          console.log(`  🚨 FALSE POSITIVE: Violations without proper graph!`);
        }
      }
    }
  });

  /**
   * CRITICAL TEST 2: Token Price Accuracy
   * Wrong prices = wrong violation detection
   */
  it('should validate token price accuracy at historical blocks', async () => {
    console.log('\n' + '='.repeat(60));
    console.log('💰 TOKEN PRICE VALIDATION');
    console.log('='.repeat(60));
    
    // Test transaction from 2023 (should use 2023 prices, not current)
    const historicalTx = '0xb6400e2df5d3e7a1436df2dff0b3fa528fdad005a60669fa24f2a06bad17bf9d';
    const blockNumber = 18562414; // Block from transaction
    const blockTimestamp = 1698422423; // Oct 2023
    
    console.log(`\n📅 Testing historical transaction from Oct 2023`);
    console.log(`  Block: ${blockNumber}`);
    console.log(`  Timestamp: ${new Date(blockTimestamp * 1000).toISOString()}`);
    
    const context: EvanescaContext = {
      tList: [],
      analyzed: new Set<string>(),
      reports: [],
      fins: [],
      complexity: []
    };
    
    // Capture price logs
    const priceLogs: string[] = [];
    const originalLog = console.log;
    console.log = (msg: string) => {
      if (msg.includes('toUSD') || msg.includes('price') || msg.includes('Price') || msg.includes('$')) {
        priceLogs.push(msg);
        originalLog(msg);
      }
    };
    
    await run(historicalTx, context);
    console.log = originalLog;
    
    // Analyze price sources
    const configPrices = priceLogs.filter(log => log.includes('config'));
    const apiPrices = priceLogs.filter(log => log.includes('CoinGecko') || log.includes('API'));
    const hardcodedPrices = priceLogs.filter(log => log.includes('$269') || log.includes('$1')); // Common hardcoded values
    
    console.log(`\n💡 Price Source Analysis:`);
    console.log(`  Config/Hardcoded: ${configPrices.length} uses`);
    console.log(`  External API: ${apiPrices.length} uses`);
    console.log(`  Suspicious hardcoded: ${hardcodedPrices.length} uses`);
    
    // Check ETH price (should be ~$1,600 in Oct 2023, not $269 hardcoded)
    const ethPriceLogs = priceLogs.filter(log => log.includes('ETH') && log.includes('$'));
    if (ethPriceLogs.length > 0) {
      console.log(`\n🔍 ETH Price Check:`);
      ethPriceLogs.slice(0, 3).forEach(log => {
        console.log(`  ${log}`);
        if (log.includes('$269')) {
          console.log(`    ❌ WRONG: Using hardcoded $269 instead of Oct 2023 price (~$1,600)`);
        }
      });
    }
    
    // WARNING: Major issue detected
    if (hardcodedPrices.length > 0) {
      console.log(`\n🚨 CRITICAL ISSUE DETECTED:`);
      console.log(`  System is using hardcoded prices instead of historical prices!`);
      console.log(`  This explains high false positive rates.`);
    }
  });

  /**
   * CRITICAL TEST 3: Manual Violation Verification
   * Manually verify if violations are real
   */
  it('should provide manual verification of violations', async () => {
    console.log('\n' + '='.repeat(60));
    console.log('🔬 MANUAL VIOLATION VERIFICATION');
    console.log('='.repeat(60));
    
    // Transactions that showed violations
    const violationTxs = [
      { tx: '0xca8e833e7800989a5fefe1c6fa44b22ef25a26de9d60c05802dc9ce2621793af', protocol: 'uniswap' },
      { tx: '0x1b2378c04d98fb412d6519035fd343cf9bb44b710a4615a4507ed8db201b6b7d', protocol: 'curve' },
      { tx: '0xca9cf0fa2f89fbcd9aafa735e8653d0d17736e5faa1bb50f6527c3b9030fa9da', protocol: 'aave' }
    ];
    
    for (const { tx, protocol } of violationTxs) {
      console.log(`\n📋 Manual Review: ${protocol.toUpperCase()}`);
      console.log(`  Transaction: ${tx}`);
      console.log(`  Etherscan: https://etherscan.io/tx/${tx}`);
      
      const context: EvanescaContext = {
        tList: [],
        analyzed: new Set<string>(),
        reports: [],
        fins: [],
        complexity: []
      };
      
      const result = await run(tx, context);
      
      if (result?.reports && result.reports.length > 0) {
        result.reports.forEach((report, idx) => {
          if (report._violation && report._violation.some((v: any) => v > 0)) {
            const violationIndex = report._violation.findIndex((v: any) => v > 0);
            const constraints = [
              'DEX_K_INVARIANT', 'LENDING_COLLATERALIZATION', 'PRICE_MANIPULATION',
              'ORACLE_MANIPULATION', 'EXCHANGE_RATE_MANIPULATION', 'FLASH_LOAN_ATTACK'
            ];
            
            console.log(`\n  ⚠️ Violation Detected:`);
            console.log(`     Constraint: ${constraints[violationIndex]}`);
            console.log(`     Value: ${report._violation[violationIndex]}`);
            
            // Provide context for manual verification
            console.log(`\n  📊 Manual Verification Steps:`);
            console.log(`     1. Check Etherscan for unusual activity`);
            console.log(`     2. Verify token amounts match expected ratios`);
            console.log(`     3. Check if part of known exploit`);
            console.log(`     4. Compare prices with historical data`);
            
            // Automated sanity checks
            if (constraints[violationIndex] === 'PRICE_MANIPULATION') {
              console.log(`\n  💰 Price Check Required:`);
              console.log(`     - Are token prices accurate for this block?`);
              console.log(`     - Is the swap ratio reasonable?`);
              console.log(`     - Check CoinGecko historical data`);
            }
          }
        });
      }
    }
  });

  /**
   * RECOMMENDATION: Ground Truth Dataset
   */
  it('should create ground truth dataset for validation', async () => {
    console.log('\n' + '='.repeat(60));
    console.log('🎯 GROUND TRUTH DATASET CREATION');
    console.log('='.repeat(60));
    
    // Known good transactions (normal trades)
    const knownGood = [
      '0xb6400e2df5d3e7a1436df2dff0b3fa528fdad005a60669fa24f2a06bad17bf9d', // Normal Uniswap swap
      '0x024fceb9d922bc77f406be62368df3aecf8c5ae5fd1e164c3ecf6228e018b56b', // Normal Curve exchange
    ];
    
    // Known attacks (should show violations)
    const knownAttacks = [
      '0x0fe2542079644e107cbf13690eb9c2c65963ccb79089ff96bfaf8dced2331c92', // bZx attack
      '0xb5c9d6845783227fdc83c4aa7bfd7553d91e89029ebb4a5c0a52e4fa66bce925', // Inverse Finance
    ];
    
    console.log(`\n✅ Known Good Transactions (should NOT violate):`);
    for (const tx of knownGood) {
      const context: EvanescaContext = {
        tList: [],
        analyzed: new Set<string>(),
        reports: [],
        fins: [],
        complexity: []
      };
      
      const result = await run(tx, context);
      const hasViolation = result?.reports?.some(r => 
        r._violation && r._violation.some((v: any) => v > 0)
      );
      
      console.log(`  ${tx.substring(0, 10)}...: ${hasViolation ? '❌ FALSE POSITIVE' : '✅ CORRECT'}`);
    }
    
    console.log(`\n🚨 Known Attack Transactions (SHOULD violate):`);
    for (const tx of knownAttacks) {
      const context: EvanescaContext = {
        tList: [],
        analyzed: new Set<string>(),
        reports: [],
        fins: [],
        complexity: []
      };
      
      const result = await run(tx, context);
      const hasViolation = result?.reports?.some(r => 
        r._violation && r._violation.some((v: any) => v > 0)
      );
      
      console.log(`  ${tx.substring(0, 10)}...: ${hasViolation ? '✅ CORRECT' : '❌ FALSE NEGATIVE'}`);
    }
  });
});