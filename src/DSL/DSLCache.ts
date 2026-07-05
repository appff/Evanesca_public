import { ConstraintDef } from './DSLParser';
import { DebugLogger } from '../Utils/DebugLogger';
import * as crypto from 'crypto';

export interface CacheEntry {
  constraints: ConstraintDef[];
  timestamp: number;
  hash: string;
  parseTime: number;
}

export interface CacheStats {
  totalRequests: number;
  cacheHits: number;
  cacheMisses: number;
  hitRate: number;
  totalParseTime: number;
  averageParseTime: number;
  cacheSize: number;
}

/**
 * High-performance AST cache for DSL parsing
 * Avoids re-parsing identical DSL rules and provides performance metrics
 */
export class DSLASTCache {
  private cache: Map<string, CacheEntry> = new Map();
  private maxSize: number;
  private ttlMs: number;
  private stats: CacheStats = {
    totalRequests: 0,
    cacheHits: 0,
    cacheMisses: 0,
    hitRate: 0,
    totalParseTime: 0,
    averageParseTime: 0,
    cacheSize: 0
  };

  constructor(maxSize: number = 100, ttlMs: number = 30 * 60 * 1000) { // 30 minutes default TTL
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
        DebugLogger.core(`🧹 [DSLCache] Proactive cleanup removed ${cleaned} expired entries`);
      }
    }, 5 * 60 * 1000);
  }

  /**
   * Generate cache key from DSL rules content
   */
  private generateCacheKey(dslRules: string): string {
    // Create hash of normalized DSL content (remove whitespace variations)
    const normalized = dslRules.replace(/\s+/g, ' ').trim();
    return crypto.createHash('sha256').update(normalized).digest('hex');
  }

  /**
   * Check if cache entry is still valid
   */
  private isEntryValid(entry: CacheEntry): boolean {
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
      DebugLogger.core(`🧹 [DSLCache] Cleaned up ${cleanedCount} expired entries`);
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
      DebugLogger.core(`🗑️ [DSLCache] Evicted LRU entry: ${oldestKey.substring(0, 8)}...`);
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
   * Update hit rate statistics
   */
  private updateStats(): void {
    this.stats.hitRate = this.stats.totalRequests > 0 
      ? (this.stats.cacheHits / this.stats.totalRequests) * 100 
      : 0;
    
    this.stats.averageParseTime = this.stats.cacheMisses > 0
      ? this.stats.totalParseTime / this.stats.cacheMisses
      : 0;
  }

  /**
   * Get cached constraints or return null if not found/expired
   */
  get(dslRules: string): ConstraintDef[] | null {
    this.stats.totalRequests++;
    
    const cacheKey = this.generateCacheKey(dslRules);
    const entry = this.cache.get(cacheKey);

    if (entry && this.isEntryValid(entry)) {
      // Cache hit - update timestamp for LRU
      entry.timestamp = Date.now();
      this.stats.cacheHits++;
      this.updateStats();
      
      DebugLogger.core(`💾 [DSLCache] Cache HIT: ${cacheKey.substring(0, 8)}... (${entry.constraints.length} constraints)`);
      return entry.constraints;
    }

    // Cache miss
    this.stats.cacheMisses++;
    this.updateStats();
    
    if (entry) {
      // Entry existed but expired
      this.cache.delete(cacheKey);
      DebugLogger.core(`⏰ [DSLCache] Cache EXPIRED: ${cacheKey.substring(0, 8)}...`);
    } else {
      DebugLogger.core(`❌ [DSLCache] Cache MISS: ${cacheKey.substring(0, 8)}...`);
    }

    return null;
  }

  /**
   * Store parsed constraints in cache
   */
  set(dslRules: string, constraints: ConstraintDef[], parseTimeMs: number): void {
    const cacheKey = this.generateCacheKey(dslRules);
    
    // Cleanup expired entries first
    this.cleanup();
    
    // Evict LRU if necessary
    this.evictLRU();

    const entry: CacheEntry = {
      constraints: [...constraints], // Deep copy to avoid mutation
      timestamp: Date.now(),
      hash: cacheKey,
      parseTime: parseTimeMs
    };

    this.cache.set(cacheKey, entry);
    this.stats.totalParseTime += parseTimeMs;
    this.updateCacheSize();
    
    // Check for memory pressure after adding entry
    this.checkMemoryPressure();
    
    DebugLogger.core(`💾 [DSLCache] Cached: ${cacheKey.substring(0, 8)}... (${constraints.length} constraints, ${parseTimeMs.toFixed(2)}ms)`);
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
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
    DebugLogger.core(`🗑️ [DSLCache] Cleared ${prevSize} entries`);
  }

  /**
   * Get cache entry details for debugging
   */
  getEntryDetails(dslRules: string): CacheEntry | null {
    const cacheKey = this.generateCacheKey(dslRules);
    return this.cache.get(cacheKey) || null;
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
   * Get memory usage estimation
   */
  getMemoryUsage(): { entryCount: number; estimatedBytes: number; estimatedMB: number } {
    let bytes = 0;
    for (const [key, entry] of this.cache.entries()) {
      // Key size (UTF-16 chars)
      bytes += key.length * 2;
      // Entry constraints size (rough estimation)
      bytes += JSON.stringify(entry.constraints).length * 2;
      // Entry metadata size
      bytes += 64; // timestamp, hash, parseTime
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
    const MAX_MEMORY_MB = 5; // 5MB limit for DSL cache
    
    if (memUsage.estimatedMB > MAX_MEMORY_MB) {
      const entriesToRemove = Math.floor(this.cache.size * 0.3); // Remove 30%
      DebugLogger.core(`⚠️ [DSLCache] Memory pressure detected (${memUsage.estimatedMB.toFixed(2)}MB), removing ${entriesToRemove} entries`);
      
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
    return `DSL Cache Summary:
- Cache Size: ${stats.cacheSize}/${this.maxSize} entries
- Memory Usage: ${memUsage.estimatedMB.toFixed(2)} MB
- Hit Rate: ${stats.hitRate.toFixed(1)}% (${stats.cacheHits}/${stats.totalRequests})
- Avg Parse Time: ${stats.averageParseTime.toFixed(2)}ms
- Total Requests: ${stats.totalRequests}
- Cache Efficiency: ${stats.cacheHits > 0 ? 'Good' : 'Building'}`;
  }
}

// Global cache instance
let globalDSLCache: DSLASTCache | undefined;

/**
 * Get global DSL cache instance
 */
export function getGlobalDSLCache(): DSLASTCache {
  if (!globalDSLCache) {
    globalDSLCache = new DSLASTCache();
  }
  return globalDSLCache;
}

/**
 * Set global DSL cache instance (for testing or custom configuration)
 */
export function setGlobalDSLCache(cache: DSLASTCache): void {
  globalDSLCache = cache;
}

/**
 * Initialize DSL cache with custom settings
 */
export function initializeDSLCache(maxSize?: number, ttlMs?: number): DSLASTCache {
  globalDSLCache = new DSLASTCache(maxSize, ttlMs);
  DebugLogger.core(`🚀 [DSLCache] Initialized with maxSize=${maxSize || 100}, TTL=${(ttlMs || 30*60*1000)/1000}s`);
  return globalDSLCache;
}