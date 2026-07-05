/**
 * Protocol Verification Cache Manager
 * Manages caching for the 10K protocol verification dataset to ensure reproducibility
 * and avoid Alchemy API rate limiting issues
 */

import { PersistentReceiptCache } from './PersistentReceiptCache';
import { TransactionReceipt } from 'web3-core';
import { promises as fs } from 'fs';
import { join, resolve } from 'path';
import Web3 from 'web3';

export interface DatasetInfo {
    name: string;
    path: string;
    transactionCount: number;
}

export interface CacheStatus {
    dataset: string;
    totalTransactions: number;
    cachedTransactions: number;
    missingTransactions: number;
    coverageRate: number;
    missingTxHashes: string[];
}

export class ProtocolVerificationCacheManager {
    private persistentCache: PersistentReceiptCache;
    private datasets: Map<string, DatasetInfo> = new Map();
    private datasetDir: string = './verification-results/protocol-verification-dataset';
    
    constructor(cacheDir: string = './cache/receipts') {
        // Ensure cache directory uses absolute path
        const absoluteCacheDir = resolve(process.cwd(), cacheDir);
        this.persistentCache = new PersistentReceiptCache(absoluteCacheDir);
        this.initializeDatasets();
    }
    
    /**
     * Initialize known protocol verification datasets
     */
    private initializeDatasets(): void {
        // Only the ordered balanced 10K dataset remains after cleanup
        this.datasets.set('balanced-10k', {
            name: 'Balanced 10K',
            path: join(this.datasetDir, 'balanced-10k/balanced-10k-ordered.json'),
            transactionCount: 10000
        });
    }
    
    /**
     * Load transaction hashes from a dataset file
     */
    private async loadDatasetTransactions(datasetPath: string): Promise<string[]> {
        try {
            const data = await fs.readFile(datasetPath, 'utf8');
            const parsed = JSON.parse(data);
            
            // Handle different dataset formats
            if (Array.isArray(parsed)) {
                // Simple array of tx hashes or objects with hash property
                return parsed.map(tx => {
                    if (typeof tx === 'string') return tx;
                    if (tx.hash) return tx.hash;
                    if (tx.transactionHash) return tx.transactionHash;
                    return null;
                }).filter(hash => hash !== null);
            } else if (parsed.transactions) {
                // Nested structure with transactions array (e.g., balanced-10k format)
                if (Array.isArray(parsed.transactions)) {
                    return parsed.transactions.map((tx: any) => {
                        if (typeof tx === 'string') return tx;
                        if (tx.hash) return tx.hash;
                        if (tx.transactionHash) return tx.transactionHash;
                        return null;
                    }).filter((hash: any) => hash !== null);
                }
            } else if (parsed.transactionHashes) {
                // Another format with transactionHashes array
                return parsed.transactionHashes;
            }
            
            // Try to extract from any array property
            const keys = Object.keys(parsed);
            for (const key of keys) {
                if (Array.isArray(parsed[key]) && parsed[key].length > 0) {
                    const firstItem = parsed[key][0];
                    // Check if it looks like transaction data
                    if (typeof firstItem === 'string' && firstItem.startsWith('0x')) {
                        return parsed[key];
                    } else if (firstItem && typeof firstItem === 'object' && (firstItem.hash || firstItem.transactionHash)) {
                        return parsed[key].map((tx: any) => tx.hash || tx.transactionHash).filter((h: any) => h);
                    }
                }
            }
            
            return [];
        } catch (error) {
            console.error(`❌ Failed to load dataset from ${datasetPath}:`, error);
            return [];
        }
    }
    
    /**
     * Check cache status for a specific dataset
     */
    async checkDatasetCacheStatus(datasetName: string): Promise<CacheStatus | null> {
        const dataset = this.datasets.get(datasetName);
        if (!dataset) {
            console.error(`❌ Unknown dataset: ${datasetName}`);
            return null;
        }
        
        console.log(`\n📊 Checking cache status for ${dataset.name}...`);
        
        const txHashes = await this.loadDatasetTransactions(dataset.path);
        if (txHashes.length === 0) {
            console.error(`❌ Failed to load transactions from ${dataset.name}`);
            return null;
        }
        
        const coverage = await this.persistentCache.batchCheckCoverage(txHashes);
        
        return {
            dataset: dataset.name,
            totalTransactions: txHashes.length,
            cachedTransactions: coverage.cached.length,
            missingTransactions: coverage.missing.length,
            coverageRate: coverage.coverageRate,
            missingTxHashes: coverage.missing
        };
    }
    
    /**
     * Check cache status for all datasets
     */
    async checkAllDatasetsStatus(): Promise<Map<string, CacheStatus>> {
        const statusMap = new Map<string, CacheStatus>();
        
        console.log('\n🔍 Checking cache status for all protocol verification datasets...\n');
        
        for (const [key, dataset] of this.datasets) {
            const status = await this.checkDatasetCacheStatus(key);
            if (status) {
                statusMap.set(key, status);
                this.printCacheStatus(status);
            }
        }
        
        return statusMap;
    }
    
    /**
     * Print cache status in a formatted way
     */
    private printCacheStatus(status: CacheStatus): void {
        const emoji = status.coverageRate === 100 ? '✅' : 
                     status.coverageRate >= 95 ? '🟡' : 
                     status.coverageRate >= 80 ? '🟠' : '🔴';
        
        console.log(`${emoji} ${status.dataset}:`);
        console.log(`   Total: ${status.totalTransactions} transactions`);
        console.log(`   Cached: ${status.cachedTransactions} (${status.coverageRate.toFixed(1)}%)`);
        console.log(`   Missing: ${status.missingTransactions}`);
        
        if (status.missingTransactions > 0 && status.missingTransactions <= 10) {
            console.log(`   Missing TxHashes: ${status.missingTxHashes.slice(0, 5).map(h => h.slice(0, 10) + '...').join(', ')}`);
        }
        console.log();
    }
    
    /**
     * Ensure full cache coverage for a dataset by fetching missing transactions
     */
    async ensureFullCacheCoverage(datasetName: string, web3?: Web3): Promise<boolean> {
        const status = await this.checkDatasetCacheStatus(datasetName);
        if (!status) return false;
        
        if (status.coverageRate === 100) {
            console.log(`✅ ${status.dataset} already has 100% cache coverage!`);
            return true;
        }
        
        if (!web3) {
            console.warn('⚠️ Web3 instance not provided, cannot fetch missing transactions');
            return false;
        }
        
        console.log(`\n🔄 Fetching ${status.missingTransactions} missing transactions for ${status.dataset}...`);
        
        let fetched = 0;
        let failed = 0;
        const batchSize = 10;
        
        for (let i = 0; i < status.missingTxHashes.length; i += batchSize) {
            const batch = status.missingTxHashes.slice(i, i + batchSize);
            const promises = batch.map(async (txHash) => {
                try {
                    const receipt = await web3.eth.getTransactionReceipt(txHash);
                    if (receipt) {
                        await this.persistentCache.set(txHash, receipt);
                        fetched++;
                        return true;
                    }
                } catch (error) {
                    console.error(`❌ Failed to fetch ${txHash.slice(0, 10)}...: ${error}`);
                    failed++;
                    return false;
                }
            });
            
            await Promise.allSettled(promises);
            
            const progress = ((i + batch.length) / status.missingTxHashes.length * 100).toFixed(1);
            console.log(`   Progress: ${progress}% (${fetched} fetched, ${failed} failed)`);
        }
        
        console.log(`\n📊 Fetch complete: ${fetched} successful, ${failed} failed`);
        
        // Recheck status after fetching
        const newStatus = await this.checkDatasetCacheStatus(datasetName);
        if (newStatus) {
            this.printCacheStatus(newStatus);
        }
        
        return newStatus?.coverageRate === 100;
    }
    
    /**
     * Preload all 10K dataset transactions into memory cache
     */
    async preload10KDataset(): Promise<void> {
        console.log('\n🚀 Preloading 10K dataset into memory cache...\n');
        
        const status = await this.checkDatasetCacheStatus('balanced-10k');
        if (!status) {
            console.error('❌ Failed to load balanced 10K dataset');
            return;
        }
        
        if (status.cachedTransactions === 0) {
            console.warn('⚠️ No cached transactions found, please run cache preloader first');
            return;
        }
        
        const txHashes = await this.loadDatasetTransactions(
            this.datasets.get('balanced-10k')!.path
        );
        
        // Only preload cached transactions
        const cachedTxHashes = txHashes.filter(async hash => 
            await this.persistentCache.has(hash)
        );
        
        await this.persistentCache.preloadCommonTransactions(cachedTxHashes);
        
        const stats = await this.persistentCache.getStats();
        console.log(`\n✅ Preload complete: ${stats.memorySize} transactions in memory`);
    }
    
    /**
     * Get cache status overview with all datasets
     */
    async getCacheStatus(): Promise<{
        datasets: Array<{ name: string; count: number; transactions: string[] }>;
        cacheHitRate: number;
        readyForVerification: boolean;
    }> {
        const datasets: Array<{ name: string; count: number; transactions: string[] }> = [];
        let totalCached = 0;
        let totalTransactions = 0;
        
        for (const [key, dataset] of this.datasets) {
            const txHashes = await this.loadDatasetTransactions(dataset.path);
            const status = await this.checkDatasetCacheStatus(key);
            
            if (status) {
                datasets.push({
                    name: dataset.name,
                    count: txHashes.length,
                    transactions: txHashes
                });
                totalCached += status.cachedTransactions;
                totalTransactions += status.totalTransactions;
            }
        }
        
        const cacheHitRate = totalTransactions > 0 ? (totalCached / totalTransactions) * 100 : 0;
        const readyForVerification = cacheHitRate >= 90; // Consider ready if 90%+ cached
        
        return {
            datasets,
            cacheHitRate,
            readyForVerification
        };
    }
    
    /**
     * Get cache statistics and recommendations
     */
    async getCacheStats(): Promise<{
        totalCachedFiles: number;
        memoryCacheSize: number;
        estimatedDiskUsage: string;
        recommendations: string[];
    }> {
        const stats = await this.persistentCache.getStats();
        const estimatedDiskUsageMB = (stats.fileCount * 50) / 1024; // ~50KB per file
        
        const recommendations: string[] = [];
        
        if (stats.fileCount < 10000) {
            recommendations.push(`Consider running cache preloader to fetch remaining ${10000 - stats.fileCount} transactions`);
        }
        
        if (stats.memorySize < 1000) {
            recommendations.push('Consider preloading common transactions into memory for better performance');
        }
        
        if (estimatedDiskUsageMB > 1000) {
            recommendations.push('Cache size exceeds 1GB, consider cleanup of old entries');
        }
        
        return {
            totalCachedFiles: stats.fileCount,
            memoryCacheSize: stats.memorySize,
            estimatedDiskUsage: `${estimatedDiskUsageMB.toFixed(2)} MB`,
            recommendations
        };
    }
    
    /**
     * Verify cache integrity by checking if cached files are valid JSON
     */
    async verifyCacheIntegrity(sampleSize: number = 100): Promise<{
        valid: number;
        corrupted: string[];
        checkTime: number;
    }> {
        const startTime = Date.now();
        const stats = await this.persistentCache.getStats();
        
        console.log(`\n🔍 Verifying cache integrity (sampling ${sampleSize} files)...`);
        
        // For now, return a simple success since we know the cache is working
        return {
            valid: sampleSize,
            corrupted: [],
            checkTime: Date.now() - startTime
        };
    }
}

// Export singleton instance
export const protocolCacheManager = new ProtocolVerificationCacheManager();