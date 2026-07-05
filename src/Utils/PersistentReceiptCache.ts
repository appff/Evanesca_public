/**
 * Enhanced Persistent file-based receipt cache for comprehensive protocol verification
 * Stores transaction receipts to disk to avoid repeated API calls for sampled data
 * Optimized for 10K protocol verification dataset with batch operations and integrity checks
 */

import { promises as fs } from 'fs';
import { join, resolve } from 'path';
import { TransactionReceipt } from 'web3-core';

export class PersistentReceiptCache {
    private cacheDir: string;
    private memoryCache: Map<string, TransactionReceipt> = new Map();
    private quiet: boolean = false;

    constructor(cacheDir: string = './cache/receipts') {
        // Always resolve to absolute path from project root
        this.cacheDir = resolve(process.cwd(), cacheDir);
        this.quiet = process.env.EVANESCA_QUIET === 'true';
        this.ensureCacheDir();
    }

    private async ensureCacheDir(): Promise<void> {
        try {
            await fs.mkdir(this.cacheDir, { recursive: true });
        } catch (error) {
            console.warn(`⚠️ [PersistentReceiptCache] Failed to create cache dir: ${error}`);
        }
    }

    private getFilePath(txHash: string): string {
        const cleanHash = txHash.toLowerCase().replace('0x', '');
        return join(this.cacheDir, `${cleanHash}.json`);
    }

    /**
     * Get receipt from memory cache first, then file cache
     */
    async get(txHash: string): Promise<TransactionReceipt | null> {
        // Check memory cache first
        const memCached = this.memoryCache.get(txHash);
        if (memCached) {
            if (!this.quiet) {
                console.log(`⚡ [PersistentReceiptCache] Memory cache HIT for ${txHash.slice(0, 10)}...`);
            }
            return memCached;
        }

        // Check file cache
        try {
            const filePath = this.getFilePath(txHash);
            const data = await fs.readFile(filePath, 'utf8');
            const receipt = JSON.parse(data) as TransactionReceipt;
            
            // Store in memory cache for future use
            this.memoryCache.set(txHash, receipt);
            if (!this.quiet) {
                console.log(`📁 [PersistentReceiptCache] File cache HIT for ${txHash.slice(0, 10)}...`);
            }
            return receipt;
        } catch (error) {
            // Cache miss - file doesn't exist
            return null;
        }
    }

    /**
     * Store receipt in both memory and file cache
     */
    async set(txHash: string, receipt: TransactionReceipt): Promise<void> {
        try {
            // Store in memory cache
            this.memoryCache.set(txHash, receipt);

            // Store in file cache
            const filePath = this.getFilePath(txHash);
            await fs.writeFile(filePath, JSON.stringify(receipt, null, 2));
            
            if (!this.quiet) {
                console.log(`💾 [PersistentReceiptCache] Cached receipt to file for ${txHash.slice(0, 10)}...`);
            }
        } catch (error) {
            console.warn(`⚠️ [PersistentReceiptCache] Failed to cache receipt: ${error}`);
        }
    }

    /**
     * Check if receipt exists in cache (memory or file)
     */
    async has(txHash: string): Promise<boolean> {
        // Check memory cache first
        if (this.memoryCache.has(txHash)) {
            return true;
        }

        // Check file cache
        try {
            const filePath = this.getFilePath(txHash);
            await fs.access(filePath);
            return true;
        } catch (error) {
            return false;
        }
    }

    /**
     * Get cache statistics
     */
    async getStats(): Promise<{ memorySize: number, fileCount: number }> {
        const memorySize = this.memoryCache.size;
        
        try {
            const files = await fs.readdir(this.cacheDir);
            const fileCount = files.filter(f => f.endsWith('.json')).length;
            return { memorySize, fileCount };
        } catch (error) {
            return { memorySize, fileCount: 0 };
        }
    }

    /**
     * Clear memory cache
     */
    clearMemoryCache(): void {
        this.memoryCache.clear();
        if (!this.quiet) {
            console.log(`🧹 [PersistentReceiptCache] Memory cache cleared`);
        }
    }

    /**
     * Preload common transaction receipts into memory cache
     */
    async preloadCommonTransactions(txHashes: string[]): Promise<void> {
        if (!this.quiet) {
            console.log(`🚀 [PersistentReceiptCache] Preloading ${txHashes.length} common transactions...`);
        }
        
        let loaded = 0;
        for (const txHash of txHashes) {
            const receipt = await this.get(txHash);
            if (receipt) {
                loaded++;
            }
        }
        
        if (!this.quiet) {
            console.log(`✅ [PersistentReceiptCache] Preloaded ${loaded}/${txHashes.length} transactions into memory`);
        }
    }

    /**
     * Batch check for cache coverage of multiple transactions
     */
    async batchCheckCoverage(txHashes: string[]): Promise<{
        cached: string[];
        missing: string[];
        coverageRate: number;
    }> {
        const cached: string[] = [];
        const missing: string[] = [];
        
        if (!this.quiet) {
            console.log(`📊 [PersistentReceiptCache] Checking cache coverage for ${txHashes.length} transactions...`);
        }
        
        // Use Promise.allSettled for better performance
        const results = await Promise.allSettled(
            txHashes.map(async (txHash) => {
                const exists = await this.has(txHash);
                return { txHash, exists };
            })
        );
        
        results.forEach((result) => {
            if (result.status === 'fulfilled') {
                if (result.value.exists) {
                    cached.push(result.value.txHash);
                } else {
                    missing.push(result.value.txHash);
                }
            } else {
                // If check failed, consider it missing
                missing.push('unknown_tx_hash');
            }
        });
        
        const coverageRate = (cached.length / txHashes.length) * 100;
        
        if (!this.quiet) {
            console.log(`📈 [PersistentReceiptCache] Cache coverage: ${cached.length}/${txHashes.length} (${coverageRate.toFixed(1)}%)`);
        }
        
        return { cached, missing, coverageRate };
    }

    /**
     * Batch preload multiple transactions with progress reporting
     */
    async batchPreload(txHashes: string[], batchSize: number = 10): Promise<{
        loaded: number;
        failed: number;
        errors: string[];
    }> {
        if (!this.quiet) {
            console.log(`🔥 [PersistentReceiptCache] Batch preloading ${txHashes.length} transactions...`);
        }
        
        let loaded = 0;
        let failed = 0;
        const errors: string[] = [];
        
        // Process in batches to avoid overwhelming memory
        for (let i = 0; i < txHashes.length; i += batchSize) {
            const batch = txHashes.slice(i, i + batchSize);
            const batchNumber = Math.floor(i / batchSize) + 1;
            const totalBatches = Math.ceil(txHashes.length / batchSize);
            
            if (!this.quiet) {
                console.log(`📦 [PersistentReceiptCache] Processing batch ${batchNumber}/${totalBatches} (${batch.length} transactions)`);
            }
            
            const batchResults = await Promise.allSettled(
                batch.map(async (txHash) => {
                    try {
                        const receipt = await this.get(txHash);
                        if (receipt) {
                            return { success: true, txHash };
                        } else {
                            return { success: false, txHash, error: 'Receipt not found in cache' };
                        }
                    } catch (error) {
                        return { success: false, txHash, error: (error as Error).message };
                    }
                })
            );
            
            // Process batch results
            batchResults.forEach((result) => {
                if (result.status === 'fulfilled') {
                    if (result.value.success) {
                        loaded++;
                    } else {
                        failed++;
                        errors.push(`${result.value.txHash}: ${result.value.error}`);
                    }
                } else {
                    failed++;
                    errors.push(`Batch processing error: ${result.reason}`);
                }
            });
            
            // Progress update
            const processedSoFar = Math.min((batchNumber) * batchSize, txHashes.length);
            const progressPercent = (processedSoFar / txHashes.length) * 100;
            if (!this.quiet) {
                console.log(`   ✅ Batch ${batchNumber} complete: ${loaded} loaded, ${failed} failed (${progressPercent.toFixed(1)}% total progress)`);
            }
            
            // Small delay to prevent overwhelming the system
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        if (!this.quiet) {
            console.log(`🎯 [PersistentReceiptCache] Batch preload complete: ${loaded} loaded, ${failed} failed`);
        }
        
        return { loaded, failed, errors: errors.slice(0, 10) }; // Limit errors to first 10
    }

    /**
     * Cache integrity check - verify file exists and is valid JSON
     */
    async verifyCacheIntegrity(txHashes: string[]): Promise<{
        valid: string[];
        invalid: string[];
        missing: string[];
        corruptedFiles: string[];
    }> {
        if (!this.quiet) {
            console.log(`🔍 [PersistentReceiptCache] Verifying cache integrity for ${txHashes.length} transactions...`);
        }
        
        const valid: string[] = [];
        const invalid: string[] = [];
        const missing: string[] = [];
        const corruptedFiles: string[] = [];
        
        const results = await Promise.allSettled(
            txHashes.map(async (txHash) => {
                try {
                    const filePath = this.getFilePath(txHash);
                    
                    // Check if file exists
                    try {
                        await fs.access(filePath);
                    } catch {
                        return { txHash, status: 'missing' };
                    }
                    
                    // Try to read and parse the file
                    try {
                        const data = await fs.readFile(filePath, 'utf8');
                        const receipt = JSON.parse(data) as TransactionReceipt;
                        
                        // Basic validation
                        if (receipt && typeof receipt === 'object' && receipt.transactionHash) {
                            return { txHash, status: 'valid', receipt };
                        } else {
                            return { txHash, status: 'invalid', error: 'Invalid receipt structure' };
                        }
                    } catch (error) {
                        return { txHash, status: 'corrupted', error: (error as Error).message };
                    }
                } catch (error) {
                    return { txHash, status: 'error', error: (error as Error).message };
                }
            })
        );
        
        results.forEach((result) => {
            if (result.status === 'fulfilled') {
                const { txHash, status } = result.value;
                switch (status) {
                    case 'valid':
                        valid.push(txHash);
                        break;
                    case 'invalid':
                        invalid.push(txHash);
                        break;
                    case 'missing':
                        missing.push(txHash);
                        break;
                    case 'corrupted':
                        corruptedFiles.push(txHash);
                        break;
                    default:
                        invalid.push(txHash);
                }
            } else {
                invalid.push('unknown_tx_hash');
            }
        });
        
        if (!this.quiet) {
            console.log(`📋 [PersistentReceiptCache] Cache integrity results:`);
            console.log(`   ✅ Valid: ${valid.length}`);
            console.log(`   ❌ Invalid: ${invalid.length}`);
            console.log(`   📋 Missing: ${missing.length}`);
            console.log(`   🔥 Corrupted: ${corruptedFiles.length}`);
        }
        
        return { valid, invalid, missing, corruptedFiles };
    }

    /**
     * Get comprehensive cache statistics for monitoring
     */
    async getDetailedStats(): Promise<{
        memoryCache: {
            size: number;
            entries: string[];
        };
        fileCache: {
            totalFiles: number;
            totalSizeBytes: number;
            oldestFile?: { path: string; age: number };
            newestFile?: { path: string; age: number };
        };
        cacheDir: string;
    }> {
        const memorySize = this.memoryCache.size;
        const memoryEntries = Array.from(this.memoryCache.keys()).map(key => key.slice(0, 10) + '...');
        
        try {
            const files = await fs.readdir(this.cacheDir);
            const jsonFiles = files.filter(f => f.endsWith('.json'));
            
            let totalSizeBytes = 0;
            let oldestFile: { path: string; age: number } | undefined;
            let newestFile: { path: string; age: number } | undefined;
            
            for (const file of jsonFiles) {
                const filePath = join(this.cacheDir, file);
                const stats = await fs.stat(filePath);
                totalSizeBytes += stats.size;
                
                const age = Date.now() - stats.mtime.getTime();
                
                if (!oldestFile || age > oldestFile.age) {
                    oldestFile = { path: file, age };
                }
                
                if (!newestFile || age < newestFile.age) {
                    newestFile = { path: file, age };
                }
            }
            
            return {
                memoryCache: {
                    size: memorySize,
                    entries: memoryEntries
                },
                fileCache: {
                    totalFiles: jsonFiles.length,
                    totalSizeBytes,
                    oldestFile,
                    newestFile
                },
                cacheDir: this.cacheDir
            };
        } catch (error) {
            return {
                memoryCache: {
                    size: memorySize,
                    entries: memoryEntries
                },
                fileCache: {
                    totalFiles: 0,
                    totalSizeBytes: 0
                },
                cacheDir: this.cacheDir
            };
        }
    }
}

// Global instance for use throughout the application
export const globalPersistentCache = new PersistentReceiptCache();
