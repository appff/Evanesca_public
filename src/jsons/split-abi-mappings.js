#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Read the original mapping files
const ethMappings = JSON.parse(fs.readFileSync('./ABImap.json', 'utf-8'));
const bscMappings = JSON.parse(fs.readFileSync('./BSCABImap.json', 'utf-8'));

// Service type categorization
const categories = {
  tokens: ['ERC20', 'WETH', 'USDC', 'USDT', 'wstETH-Arbitrum', 'ArbitrumUSDC', 'ArbitrumWETH', 'BUSD-BSC', 'USDT-BSC'],
  dex: ['Uniswap', 'UniswapV3', 'UniswapV3Pool', 'UniswapV3Router', 'UniswapV3-Arbitrum', 'Sushiswap', 
        'CurveFi', 'CurveV2Pool', 'PancakeSwap', 'PancakeSwapLP', 'SolarSwapRouter', 'SolarSwapLP', 
        'KyberSwap', 'KyberElastic', 'Balancer', 'WombatExchange', 'Wombat'],
  lending: ['Compound', 'AaveLendingPool', 'AaveV3Pool', 'CreamFinance', 'RariFinance', 'Euler', 
            'dForce', 'HundredFinance', 'RadiantLendingPoolCore', 'RadiantLockZap', 'RadiantHelper'],
  bridges: ['Allbridge', 'QubitBridge', 'MeterBridge', 'PassportMeterBNB', 'MultiChainETH'],
  specialized: ['PlatypusPool', 'MasterPlatypus', 'PlatypusTreasure', 'PlatypusAsset', 'Platypus',
                'WooFi', 'WooPPV2', 'WooRouter', 'ConcentricFinance', 'Concentric', 'ConcentricLending',
                'GammaHypervisor', 'FortressLoans', 'Crosswise', 'CrosswiseMasterchef', 
                'RikkeiFinance', 'EGDFinance'],
  other: ['UNKNOWN_ABI']
};

// Helper function to determine category
function getCategory(serviceName) {
  for (const [category, services] of Object.entries(categories)) {
    if (services.includes(serviceName)) {
      return category;
    }
  }
  // Check for BSC-specific patterns
  if (serviceName.startsWith('BSC_Contract_')) {
    return 'other';
  }
  return 'other';
}

// Split Ethereum mappings
const ethSplits = {
  tokens: {},
  dex: {},
  lending: {},
  bridges: {},
  specialized: {},
  other: {}
};

for (const [address, service] of Object.entries(ethMappings)) {
  const category = getCategory(service);
  ethSplits[category][address] = service;
}

// Split BSC mappings
const bscSplits = {
  tokens: {},
  dex: {},
  other: {}
};

for (const [address, service] of Object.entries(bscMappings)) {
  if (service.includes('BSC') || service.includes('BUSD') || service.includes('USDT')) {
    if (service.includes('BUSD') || service.includes('USDT')) {
      bscSplits.tokens[address] = service;
    } else if (service.includes('Pancake') || service.includes('Wombat')) {
      bscSplits.dex[address] = service;
    } else {
      bscSplits.other[address] = service;
    }
  } else {
    const category = getCategory(service);
    if (category === 'tokens' || category === 'dex') {
      bscSplits[category][address] = service;
    } else {
      bscSplits.other[address] = service;
    }
  }
}

// Create directory structure
const baseDir = './abi-mappings';
fs.mkdirSync(path.join(baseDir, 'ethereum'), { recursive: true });
fs.mkdirSync(path.join(baseDir, 'bsc'), { recursive: true });

// Write Ethereum split files
for (const [category, mappings] of Object.entries(ethSplits)) {
  if (Object.keys(mappings).length > 0) {
    fs.writeFileSync(
      path.join(baseDir, 'ethereum', `${category}.json`),
      JSON.stringify(mappings, null, 2)
    );
    console.log(`✅ Created ethereum/${category}.json with ${Object.keys(mappings).length} entries`);
  }
}

// Write BSC split files
for (const [category, mappings] of Object.entries(bscSplits)) {
  if (Object.keys(mappings).length > 0) {
    fs.writeFileSync(
      path.join(baseDir, 'bsc', `${category}.json`),
      JSON.stringify(mappings, null, 2)
    );
    console.log(`✅ Created bsc/${category}.json with ${Object.keys(mappings).length} entries`);
  }
}

// Create summary statistics
const stats = {
  ethereum: {
    total: Object.keys(ethMappings).length,
    tokens: Object.keys(ethSplits.tokens).length,
    dex: Object.keys(ethSplits.dex).length,
    lending: Object.keys(ethSplits.lending).length,
    bridges: Object.keys(ethSplits.bridges).length,
    specialized: Object.keys(ethSplits.specialized).length,
    other: Object.keys(ethSplits.other).length
  },
  bsc: {
    total: Object.keys(bscMappings).length,
    tokens: Object.keys(bscSplits.tokens).length,
    dex: Object.keys(bscSplits.dex).length,
    other: Object.keys(bscSplits.other).length
  }
};

fs.writeFileSync(
  path.join(baseDir, 'statistics.json'),
  JSON.stringify(stats, null, 2)
);

console.log('\n📊 Summary:');
console.log('Ethereum:', stats.ethereum);
console.log('BSC:', stats.bsc);
console.log('\n✅ Successfully split ABI mappings into smaller category-based files');