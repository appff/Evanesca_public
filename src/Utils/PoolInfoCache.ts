/**
 * Pool Information Cache
 * Caches DEX pool information (token addresses, metadata) to eliminate eth_calls during verification
 * Supports Uniswap V2/V3, Curve, Balancer, and other DEX protocols
 */

import { promises as fs } from 'fs';
import { join, resolve } from 'path';

export interface PoolInfo {
    address: string;
    protocol: 'uniswap-v2' | 'uniswap-v3' | 'curve' | 'balancer' | 'pancakeswap' | 'unknown';
    tokens: string[];  // Array of token addresses
    metadata?: {
        fee?: number;        // V3 fee tier (500, 3000, 10000 = 0.05%, 0.3%, 1%)
        weights?: number[];  // Balancer pool weights
        poolType?: string;   // Curve pool type (2pool, 3pool, etc.)
        decimals?: number[]; // Token decimals for each token
    };
    blockNumber?: number;
    timestamp?: number;
    lastUpdated: number;  // Timestamp of last cache update
}

export class PoolInfoCache {
    private cacheDir: string;
    private memoryCache: Map<string, PoolInfo> = new Map();
    private maxMemorySize: number = 1000; // Max items in memory cache

    constructor(cacheDir: string = './cache/pools') {
        // Always resolve to absolute path from project root
        this.cacheDir = resolve(process.cwd(), cacheDir);
        this.ensureCacheDir();
    }

    private async ensureCacheDir(): Promise<void> {
        try {
            await fs.mkdir(this.cacheDir, { recursive: true });
            console.log(`📁 [PoolInfoCache] Cache directory ready: ${this.cacheDir}`);
        } catch (error) {
            console.warn(`⚠️ [PoolInfoCache] Failed to create cache dir: ${error}`);
        }
    }

    private getFilePath(poolAddress: string): string {
        const cleanAddress = poolAddress.toLowerCase().replace('0x', '');
        return join(this.cacheDir, `${cleanAddress}.json`);
    }

    /**
     * Get pool info from cache (memory first, then disk)
     */
    async get(poolAddress: string): Promise<PoolInfo | null> {
        const normalizedAddress = poolAddress.toLowerCase();
        
        // Check memory cache first
        const memCached = this.memoryCache.get(normalizedAddress);
        if (memCached) {
            console.log(`⚡ [PoolInfoCache] Memory cache HIT for pool ${normalizedAddress.slice(0, 10)}...`);
            return memCached;
        }

        // Check file cache
        try {
            const filePath = this.getFilePath(normalizedAddress);
            const data = await fs.readFile(filePath, 'utf8');
            const poolInfo = JSON.parse(data) as PoolInfo;
            
            // Store in memory cache for future use
            if (this.memoryCache.size < this.maxMemorySize) {
                this.memoryCache.set(normalizedAddress, poolInfo);
            }
            
            console.log(`💾 [PoolInfoCache] File cache HIT for pool ${normalizedAddress.slice(0, 10)}...`);
            return poolInfo;
        } catch (error) {
            // Cache miss - this is normal for uncached pools
            return null;
        }
    }

    /**
     * Store pool info in both memory and disk cache
     */
    async set(poolAddress: string, poolInfo: PoolInfo): Promise<void> {
        const normalizedAddress = poolAddress.toLowerCase();
        
        // Ensure address is normalized in the pool info
        poolInfo.address = normalizedAddress;
        poolInfo.lastUpdated = Date.now();
        
        // Store in memory cache
        this.memoryCache.set(normalizedAddress, poolInfo);
        
        // Store in file cache
        try {
            const filePath = this.getFilePath(normalizedAddress);
            await fs.writeFile(filePath, JSON.stringify(poolInfo, null, 2), 'utf8');
            console.log(`✅ [PoolInfoCache] Cached pool info for ${normalizedAddress.slice(0, 10)}...`);
        } catch (error) {
            console.error(`❌ [PoolInfoCache] Failed to cache pool ${normalizedAddress}: ${error}`);
        }
    }

    /**
     * Check if pool info exists in cache
     */
    async has(poolAddress: string): Promise<boolean> {
        const normalizedAddress = poolAddress.toLowerCase();
        
        // Check memory cache
        if (this.memoryCache.has(normalizedAddress)) {
            return true;
        }
        
        // Check file cache
        try {
            const filePath = this.getFilePath(normalizedAddress);
            await fs.access(filePath);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Batch check cache coverage for multiple pools
     */
    async batchCheckCoverage(poolAddresses: string[]): Promise<{
        cached: string[];
        missing: string[];
        coverageRate: number;
    }> {
        const cached: string[] = [];
        const missing: string[] = [];
        
        for (const address of poolAddresses) {
            if (await this.has(address)) {
                cached.push(address);
            } else {
                missing.push(address);
            }
        }
        
        const coverageRate = poolAddresses.length > 0 
            ? (cached.length / poolAddresses.length) * 100 
            : 0;
        
        console.log(`📊 [PoolInfoCache] Coverage: ${cached.length}/${poolAddresses.length} pools (${coverageRate.toFixed(1)}%)`);
        
        return { cached, missing, coverageRate };
    }

    /**
     * Preload commonly used pools into memory
     */
    async preloadCommonPools(poolAddresses: string[]): Promise<void> {
        console.log(`🔄 [PoolInfoCache] Preloading ${poolAddresses.length} pools into memory...`);
        
        let loaded = 0;
        for (const address of poolAddresses) {
            const poolInfo = await this.get(address);
            if (poolInfo) {
                loaded++;
            }
        }
        
        console.log(`✅ [PoolInfoCache] Preloaded ${loaded} pools into memory cache`);
    }

    /**
     * Get cache statistics
     */
    async getStats(): Promise<{
        memorySize: number;
        fileCount: number;
        protocols: Map<string, number>;
    }> {
        const files = await fs.readdir(this.cacheDir);
        const protocols = new Map<string, number>();
        
        // Count protocols in memory cache
        for (const poolInfo of this.memoryCache.values()) {
            const count = protocols.get(poolInfo.protocol) || 0;
            protocols.set(poolInfo.protocol, count + 1);
        }
        
        return {
            memorySize: this.memoryCache.size,
            fileCount: files.filter(f => f.endsWith('.json')).length,
            protocols
        };
    }

    /**
     * Clear memory cache (keeps disk cache)
     */
    clearMemoryCache(): void {
        this.memoryCache.clear();
        console.log('🧹 [PoolInfoCache] Memory cache cleared');
    }

    /**
     * Delete all cached files (use with caution)
     */
    async clearDiskCache(): Promise<void> {
        try {
            const files = await fs.readdir(this.cacheDir);
            for (const file of files) {
                if (file.endsWith('.json')) {
                    await fs.unlink(join(this.cacheDir, file));
                }
            }
            console.log('🗑️ [PoolInfoCache] Disk cache cleared');
        } catch (error) {
            console.error(`❌ [PoolInfoCache] Failed to clear disk cache: ${error}`);
        }
    }
}

// Export singleton instance
export const globalPoolCache = new PoolInfoCache();