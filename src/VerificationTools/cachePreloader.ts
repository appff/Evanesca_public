#!/usr/bin/env npx tsx

/**
 * Cache Preloader for Protocol Verification Datasets
 * Ensures all transactions in the 10K protocol verification dataset are cached
 * to avoid Alchemy API rate limiting during experiments
 */

import { ProtocolVerificationCacheManager } from '../Utils/ProtocolVerificationCacheManager';
import { preTasksForRegressionTest, web3 } from '../PreTasks';
import Web3 from 'web3';
import { performance } from 'perf_hooks';

async function main() {
    const args = process.argv.slice(2);
    const command = args[0] || 'status';
    
    console.log('🚀 Protocol Verification Cache Preloader');
    console.log('=' .repeat(50));
    
    // Initialize Evanesca system
    preTasksForRegressionTest();
    
    // Initialize cache manager
    const cacheManager = new ProtocolVerificationCacheManager();
    
    // Web3 instance is already available from PreTasks import
    
    switch (command) {
        case 'status':
            await checkCacheStatus(cacheManager);
            break;
            
        case 'preload':
            await preloadDatasets(cacheManager, web3);
            break;
            
        case 'verify':
            await verifyCacheIntegrity(cacheManager);
            break;
            
        case 'stats':
            await showCacheStatistics(cacheManager);
            break;
            
        case 'help':
        default:
            showHelp();
            break;
    }
}

async function checkCacheStatus(cacheManager: ProtocolVerificationCacheManager) {
    console.log('\n📊 Checking cache status for all datasets...\n');
    
    const statusMap = await cacheManager.checkAllDatasetsStatus();
    
    // Calculate overall statistics
    let totalTransactions = 0;
    let totalCached = 0;
    
    for (const status of statusMap.values()) {
        totalTransactions += status.totalTransactions;
        totalCached += status.cachedTransactions;
    }
    
    const overallCoverage = (totalCached / totalTransactions * 100).toFixed(1);
    
    console.log('=' .repeat(50));
    console.log('📈 Overall Cache Coverage:');
    console.log(`   Total Transactions: ${totalTransactions}`);
    console.log(`   Cached: ${totalCached} (${overallCoverage}%)`);
    console.log(`   Missing: ${totalTransactions - totalCached}`);
    
    if (totalCached === totalTransactions) {
        console.log('\n✅ Perfect! All transactions are cached. Ready for offline verification!');
    } else {
        console.log('\n💡 Run "npm run cache:preload" to fetch missing transactions');
    }
}

async function preloadDatasets(cacheManager: ProtocolVerificationCacheManager, web3: Web3) {
    console.log('\n🔄 Starting cache preload for 10K dataset...\n');
    
    const startTime = performance.now();
    const dataset = 'balanced-10k';
    
    console.log(`\n📦 Processing ${dataset}...`);
    console.log('-'.repeat(40));
    
    const success = await cacheManager.ensureFullCacheCoverage(dataset, web3);
    
    if (success) {
        console.log(`✅ ${dataset} is fully cached!`);
    } else {
        console.log(`⚠️ ${dataset} preload incomplete, some transactions may be missing`);
    }
    
    const elapsedTime = ((performance.now() - startTime) / 1000).toFixed(2);
    console.log('\n' + '=' .repeat(50));
    console.log(`✅ Preload complete in ${elapsedTime} seconds`);
    
    // Show final status
    await checkCacheStatus(cacheManager);
}

async function verifyCacheIntegrity(cacheManager: ProtocolVerificationCacheManager) {
    console.log('\n🔍 Verifying cache integrity...\n');
    
    const result = await cacheManager.verifyCacheIntegrity(100);
    
    console.log('📊 Integrity Check Results:');
    console.log(`   Files Checked: ${result.valid + result.corrupted.length}`);
    console.log(`   Valid: ${result.valid}`);
    console.log(`   Corrupted: ${result.corrupted.length}`);
    console.log(`   Check Time: ${result.checkTime}ms`);
    
    if (result.corrupted.length > 0) {
        console.log('\n❌ Corrupted files found:');
        result.corrupted.forEach(file => console.log(`   - ${file}`));
        console.log('\n💡 Run "npm run cache:preload" to re-fetch corrupted transactions');
    } else {
        console.log('\n✅ All checked files are valid!');
    }
}

async function showCacheStatistics(cacheManager: ProtocolVerificationCacheManager) {
    console.log('\n📊 Cache Statistics\n');
    
    const stats = await cacheManager.getCacheStats();
    
    console.log('💾 Storage:');
    console.log(`   Cached Files: ${stats.totalCachedFiles}`);
    console.log(`   Memory Cache: ${stats.memoryCacheSize} transactions`);
    console.log(`   Estimated Disk Usage: ${stats.estimatedDiskUsage}`);
    
    if (stats.recommendations.length > 0) {
        console.log('\n💡 Recommendations:');
        stats.recommendations.forEach(rec => console.log(`   - ${rec}`));
    }
    
    // Performance estimation
    const cacheHitRate = Math.min(99, (stats.totalCachedFiles / 10000) * 100);
    const estimatedSpeedup = cacheHitRate > 90 ? '10-20x' : 
                            cacheHitRate > 70 ? '5-10x' : 
                            cacheHitRate > 50 ? '2-5x' : '1-2x';
    
    console.log('\n⚡ Performance Impact:');
    console.log(`   Cache Hit Rate: ${cacheHitRate.toFixed(1)}%`);
    console.log(`   Estimated Speedup: ${estimatedSpeedup} faster`);
    console.log(`   API Call Reduction: ${cacheHitRate.toFixed(1)}%`);
}

function showHelp() {
    console.log(`
📚 Usage: npx tsx src/verification-tools/cache-preloader.ts [command]

Commands:
  status   - Check cache coverage for all datasets (default)
  preload  - Fetch missing transactions and cache them
  verify   - Check cache integrity for corrupted files
  stats    - Show cache statistics and performance impact
  help     - Show this help message

Examples:
  npm run cache:status    # Check current cache coverage
  npm run cache:preload   # Fetch all missing transactions
  npm run cache:verify    # Verify cache integrity
  npm run cache:stats     # Show statistics

Note: The preload command will use your configured Web3 providers
      (Alchemy, AllThatNode, etc.) to fetch missing transactions.
      Make sure your .env file has valid API keys configured.
`);
}

// Run the script
main().catch(error => {
    console.error('❌ Error:', error);
    process.exit(1);
});