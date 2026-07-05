#!/usr/bin/env npx ts-node

// Test script for the new configurable token system
import * as path from 'path';
import { TokenConfigManager } from './TokenConfig';
import { ConfigurableToUSD, createConfigurableToUSD } from './ConfigurableToUSD';
import { DynamicTokenMetadataLoader, initializeTokenMetadata } from './TokenMetadataLoader';
import { DebugLogger } from '../Utils/DebugLogger';

async function testTokenConfigSystem() {
  console.log('🧪 Testing Token Configuration System\n');

  try {
    // Test 1: Load configuration from JSON
    console.log('=== Test 1: JSON Configuration Loading ===');
    const configPath = path.join(__dirname, 'tokens.json');
    const tokenManager = new TokenConfigManager();
    
    try {
      const fs = await import('fs');
      const configData = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      tokenManager.loadConfig(configData);
      
      const validation = tokenManager.validateConfig();
      console.log(`✅ Config validation: ${validation.isValid ? 'PASSED' : 'FAILED'}`);
      if (!validation.isValid) {
        console.log(`   Errors: ${validation.errors.join(', ')}`);
      }
      
      console.log(`📊 ${tokenManager.getConfigSummary()}\n`);
    } catch (error) {
      console.log(`❌ Failed to load config: ${error}\n`);
    }

    // Test 2: Dynamic metadata loading
    console.log('=== Test 2: Dynamic Metadata Loading ===');
    const metadataLoader = await initializeTokenMetadata(configPath);
    
    // Test loading known token
    const ethToken = await metadataLoader.getTokenMetadata('ETH', '0x0000000000000000000000000000000000000000');
    console.log(`✅ ETH token loaded: ${ethToken.symbol}, decimals: ${ethToken.decimals}, price: $${ethToken.defaultPrice}`);
    
    // Test loading unknown token (should use fallback)
    const unknownToken = await metadataLoader.getTokenMetadata('UNKNOWN', '0x1234567890123456789012345678901234567890');
    console.log(`✅ Unknown token fallback: ${unknownToken.symbol}, decimals: ${unknownToken.decimals}, price: $${unknownToken.defaultPrice}`);
    
    console.log(`📊 Cache stats: ${JSON.stringify(metadataLoader.getCacheStats())}\n`);

    // Test 3: Configurable toUSD function
    console.log('=== Test 3: Configurable toUSD Function ===');
    const configurableToUSD = await createConfigurableToUSD(configPath);
    
    // Test with bZx attack configuration
    const testCases = [
      {
        name: 'ETH conversion (bZx attack period)',
        rawAmount: '1000000000000000000', // 1 ETH in wei
        symbol: 'ETH',
        address: '0x0000000000000000000000000000000000000000',
        blockNo: 9506114, // bZx attack block
        expected: 269 // 2020 ETH price
      },
      {
        name: 'WBTC conversion (bZx attack period)',
        rawAmount: '100000000', // 1 WBTC (8 decimals)
        symbol: 'WBTC',
        address: '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599',
        blockNo: 9506114,
        expected: 10200 // 2020 WBTC price
      },
      {
        name: 'ETH conversion (current period)',
        rawAmount: '1000000000000000000', // 1 ETH in wei
        symbol: 'ETH',
        address: '0x0000000000000000000000000000000000000000',
        blockNo: 20000000, // Recent block
        expected: 3000 // Current fallback price
      },
      {
        name: 'Burn address test',
        rawAmount: '1000000000000000000',
        symbol: 'ETH',
        address: '0x0',
        blockNo: 9506114,
        expected: 0 // Should return 0 for burn addresses
      }
    ];

    for (const testCase of testCases) {
      try {
        const result = await configurableToUSD.convertToUSD(
          testCase.rawAmount,
          testCase.symbol,
          testCase.address,
          testCase.blockNo
        );
        
        const passed = Math.abs(result - testCase.expected) < 0.01;
        console.log(`${passed ? '✅' : '❌'} ${testCase.name}: $${result.toFixed(2)} (expected: $${testCase.expected})`);
      } catch (error) {
        console.log(`❌ ${testCase.name}: ERROR - ${error}`);
      }
    }

    // Test 4: Price capping functionality
    console.log('\n=== Test 4: Price Capping ===');
    try {
      // Test extreme value capping
      const extremeResult = await configurableToUSD.convertToUSD(
        '1000000000000000000000000', // 1M ETH
        'ETH',
        '0x0000000000000000000000000000000000000000',
        9506114
      );
      console.log(`✅ Extreme value capping test: $${extremeResult.toFixed(2)} (should be capped)`);
    } catch (error) {
      console.log(`❌ Price capping test failed: ${error}`);
    }

    console.log('\n🎉 Token configuration system tests completed!');
    
  } catch (error) {
    console.error('❌ Test suite failed:', error);
    process.exit(1);
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  testTokenConfigSystem().catch(console.error);
}

export { testTokenConfigSystem };