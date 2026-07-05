import { DebugLogger } from '../Utils/DebugLogger';

export interface PriceCacheEntry {
  price: number;
  timestamp: number;
  source: 'historical' | 'api' | 'config' | 'fallback';
  blockNumber?: number;
}

export interface PriceCacheKey {
  tokenSymbol: string;
  tokenAddress: string;
  blockNumber: number;
  attackPattern?: string;
}

export interface PriceCacheStats {
  totalRequests: number;
  cacheHits: number;
  cacheMisses: number;
  hitRate: number;
  averageComputeTime: number;
  cacheSize: number;
  totalComputeTime: number;
}

/**
 * High-performance price cache for toUSD operations
 * Reduces expensive price lookups and API calls
 */
export class PriceCache {
  private cache: Map<string, PriceCacheEntry> = new Map();
  private maxSize: number;
  private ttlMs: number;
  private stats: PriceCacheStats = {
    totalRequests: 0,
    cacheHits: 0,
    cacheMisses: 0,
    hitRate: 0,
    averageComputeTime: 0,
    cacheSize: 0,
    totalComputeTime: 0
  };

  constructor(maxSize: number = 1000, ttlMs: number = 5 * 60 * 1000) { // 5 minutes default TTL
    this.maxSize = maxSize;
    this.ttlMs = ttlMs;
    
    // Start proactive cleanup timer
    this.startProactiveCleanup();
  }

  /**
   * Start periodic cleanup to prevent memory leaks
   */
  private startProactiveCleanup(): void {
    // Cleanup every 5 minutes
    setInterval(() => {
      const cleaned = this.forceCleanup();
      if (cleaned > 0) {
        DebugLogger.core(`🧹 [PriceCache] Proactive cleanup removed ${cleaned} expired entries`);
      }
      
      // Check memory pressure
      this.checkMemoryPressure();
    }, 5 * 60 * 1000);
  }

  /**
   * Generate cache key from price request parameters
   */
  private generateCacheKey(params: PriceCacheKey): string {
    const { tokenSymbol, tokenAddress, blockNumber, attackPattern } = params;
    const normalizedSymbol = tokenSymbol.toLowerCase();
    const normalizedAddress = tokenAddress.toLowerCase();
    const pattern = attackPattern || 'default';
    
    return `${normalizedSymbol}:${normalizedAddress}:${blockNumber}:${pattern}`;
  }

  /**
   * Check if cache entry is still valid
   */
  private isEntryValid(entry: PriceCacheEntry): boolean {
    const now = Date.now();
    return (now - entry.timestamp) < this.ttlMs;
  }

  /**
   * Cleanup expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (!this.isEntryValid(entry)) {
        this.cache.delete(key);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      DebugLogger.core(`🧹 [PriceCache] Cleaned up ${cleanedCount} expired entries`);
    }

    this.updateCacheSize();
  }

  /**
   * Evict least recently used entries if cache is full
   */
  private evictLRU(): void {
    if (this.cache.size < this.maxSize) return;

    // Find oldest entry by timestamp
    let oldestKey: string | undefined;
    let oldestTimestamp = Date.now();

    for (const [key, entry] of this.cache.entries()) {
      if (entry.timestamp < oldestTimestamp) {
        oldestTimestamp = entry.timestamp;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
      DebugLogger.core(`🗑️ [PriceCache] Evicted LRU entry: ${oldestKey}`);
    }

    this.updateCacheSize();
  }

  /**
   * Update cache size in stats
   */
  private updateCacheSize(): void {
    this.stats.cacheSize = this.cache.size;
  }

  /**
   * Update statistics
   */
  private updateStats(): void {
    this.stats.hitRate = this.stats.totalRequests > 0 
      ? (this.stats.cacheHits / this.stats.totalRequests) * 100 
      : 0;
    
    this.stats.averageComputeTime = this.stats.cacheMisses > 0
      ? this.stats.totalComputeTime / this.stats.cacheMisses
      : 0;
  }

  /**
   * Get cached price or return undefined if not found/expired
   */
  get(params: PriceCacheKey): number | undefined {
    this.stats.totalRequests++;
    
    const cacheKey = this.generateCacheKey(params);
    const entry = this.cache.get(cacheKey);

    if (entry && this.isEntryValid(entry)) {
      // Cache hit - update timestamp for LRU
      entry.timestamp = Date.now();
      this.stats.cacheHits++;
      this.updateStats();
      
      DebugLogger.core(`💾 [PriceCache] Cache HIT: ${params.tokenSymbol} @ block ${params.blockNumber} = $${entry.price}`);
      return entry.price;
    }

    // Cache miss
    this.stats.cacheMisses++;
    this.updateStats();
    
    if (entry) {
      // Entry existed but expired
      this.cache.delete(cacheKey);
      DebugLogger.core(`⏰ [PriceCache] Cache EXPIRED: ${cacheKey}`);
    } else {
      DebugLogger.core(`❌ [PriceCache] Cache MISS: ${cacheKey}`);
    }

    return undefined;
  }

  /**
   * Store price in cache
   */
  set(params: PriceCacheKey, price: number, source: PriceCacheEntry['source'], computeTimeMs: number): void {
    const cacheKey = this.generateCacheKey(params);
    
    // Cleanup expired entries first
    this.cleanup();
    
    // Evict LRU if necessary
    this.evictLRU();

    const entry: PriceCacheEntry = {
      price,
      timestamp: Date.now(),
      source,
      blockNumber: params.blockNumber
    };

    this.cache.set(cacheKey, entry);
    this.stats.totalComputeTime += computeTimeMs;
    this.updateCacheSize();
    
    // Check for memory pressure after adding entry
    this.checkMemoryPressure();
    
    DebugLogger.core(`💾 [PriceCache] Cached: ${params.tokenSymbol} @ ${params.blockNumber} = $${price} (${source}, ${computeTimeMs.toFixed(2)}ms)`);
  }

  /**
   * Batch get multiple prices
   */
  getBatch(paramsList: PriceCacheKey[]): Map<string, number> {
    const results = new Map<string, number>();
    
    for (const params of paramsList) {
      const price = this.get(params);
      if (price !== undefined) {
        const key = this.generateCacheKey(params);
        results.set(key, price);
      }
    }
    
    return results;
  }

  /**
   * Batch set multiple prices
   */
  setBatch(entries: Array<{ params: PriceCacheKey, price: number, source: PriceCacheEntry['source'], computeTime: number }>): void {
    for (const entry of entries) {
      this.set(entry.params, entry.price, entry.source, entry.computeTime);
    }
  }

  /**
   * Pre-warm cache with known historical prices
   */
  preWarm(entries: Array<{ params: PriceCacheKey, price: number, source: PriceCacheEntry['source'] }>): void {
    DebugLogger.core(`🔥 [PriceCache] Pre-warming cache with ${entries.length} entries...`);
    
    for (const entry of entries) {
      this.set(entry.params, entry.price, entry.source, 0); // 0ms compute time for pre-warmed
    }
    
    DebugLogger.core(`✅ [PriceCache] Pre-warmed cache: ${this.cache.size} total entries`);
  }

  /**
   * Get cache statistics
   */
  getStats(): PriceCacheStats {
    this.updateStats();
    return { ...this.stats };
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    const prevSize = this.cache.size;
    this.cache.clear();
    this.updateCacheSize();
    DebugLogger.core(`🗑️ [PriceCache] Cleared ${prevSize} entries`);
  }

  /**
   * Force cleanup of expired entries
   */
  forceCleanup(): number {
    const sizeBefore = this.cache.size;
    this.cleanup();
    return sizeBefore - this.cache.size;
  }

  /**
   * Get entries by token for analysis
   */
  getEntriesByToken(tokenSymbol: string): PriceCacheEntry[] {
    const entries: PriceCacheEntry[] = [];
    const normalizedSymbol = tokenSymbol.toLowerCase();
    
    for (const [key, entry] of this.cache.entries()) {
      if (key.startsWith(`${normalizedSymbol}:`)) {
        entries.push(entry);
      }
    }
    
    return entries.sort((a, b) => (a.blockNumber || 0) - (b.blockNumber || 0));
  }

  /**
   * Get memory usage estimation
   */
  getMemoryUsage(): { entryCount: number; estimatedBytes: number; estimatedMB: number } {
    let bytes = 0;
    for (const [key, entry] of this.cache.entries()) {
      // Key size (UTF-16 chars)
      bytes += key.length * 2;
      // Entry size (price, timestamp, source, blockNumber)
      bytes += 64; // Rough estimate for each entry
    }
    
    return {
      entryCount: this.cache.size,
      estimatedBytes: bytes,
      estimatedMB: bytes / (1024 * 1024)
    };
  }

  /**
   * Check if cache is approaching memory limits
   */
  private checkMemoryPressure(): void {
    const memUsage = this.getMemoryUsage();
    const MAX_MEMORY_MB = 10; // 10MB limit for price cache
    
    if (memUsage.estimatedMB > MAX_MEMORY_MB) {
      const entriesToRemove = Math.floor(this.cache.size * 0.3); // Remove 30%
      DebugLogger.core(`⚠️ [PriceCache] Memory pressure detected (${memUsage.estimatedMB.toFixed(2)}MB), removing ${entriesToRemove} entries`);
      
      // Remove oldest entries
      const entries = Array.from(this.cache.entries());
      entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
      
      for (let i = 0; i < entriesToRemove && i < entries.length; i++) {
        this.cache.delete(entries[i][0]);
      }
      
      this.updateCacheSize();
    }
  }

  /**
   * Get human-readable cache summary
   */
  getSummary(): string {
    const stats = this.getStats();
    const memUsage = this.getMemoryUsage();
    return `Price Cache Summary:
- Cache Size: ${stats.cacheSize}/${this.maxSize} entries
- Memory Usage: ${memUsage.estimatedMB.toFixed(2)} MB
- Hit Rate: ${stats.hitRate.toFixed(1)}% (${stats.cacheHits}/${stats.totalRequests})
- Avg Compute Time: ${stats.averageComputeTime.toFixed(2)}ms
- Total Requests: ${stats.totalRequests}
- TTL: ${this.ttlMs / 1000}s`;
  }

  /**
   * Export cache data for persistence (if needed)
   */
  exportCache(): { [key: string]: PriceCacheEntry } {
    const exported: { [key: string]: PriceCacheEntry } = {};
    for (const [key, entry] of this.cache.entries()) {
      if (this.isEntryValid(entry)) {
        exported[key] = entry;
      }
    }
    return exported;
  }

  /**
   * Import cache data from persistence (if needed)
   */
  importCache(data: { [key: string]: PriceCacheEntry }): void {
    let importCount = 0;
    for (const [key, entry] of Object.entries(data)) {
      if (this.isEntryValid(entry)) {
        this.cache.set(key, entry);
        importCount++;
      }
    }
    this.updateCacheSize();
    DebugLogger.core(`📥 [PriceCache] Imported ${importCount} valid entries`);
  }
}

// Global cache instance
let globalPriceCache: PriceCache | undefined;

/**
 * Get global price cache instance
 */
export function getGlobalPriceCache(): PriceCache {
  if (!globalPriceCache) {
    globalPriceCache = new PriceCache();
  }
  return globalPriceCache;
}

/**
 * Set global price cache instance (for testing or custom configuration)
 */
export function setGlobalPriceCache(cache: PriceCache): void {
  globalPriceCache = cache;
}

/**
 * Initialize price cache with custom settings
 */
export function initializePriceCache(maxSize?: number, ttlMs?: number): PriceCache {
  globalPriceCache = new PriceCache(maxSize, ttlMs);
  DebugLogger.core(`🚀 [PriceCache] Initialized with maxSize=${maxSize || 1000}, TTL=${(ttlMs || 5*60*1000)/1000}s`);
  return globalPriceCache;
}