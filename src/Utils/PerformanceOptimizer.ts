/**
 * Performance Optimization Utilities for Evanesca
 * Provides caching, batching, and parallel processing capabilities
 */

import * as crypto from 'crypto';

export interface CacheConfig {
  maxSize: number;
  ttlMs: number;
  enableHashing: boolean;
}

export interface BatchConfig {
  batchSize: number;
  maxConcurrency: number;
  timeoutMs: number;
  retryAttempts: number;
}

export interface PerformanceMetrics {
  cacheHits: number;
  cacheMisses: number;
  totalOperations: number;
  avgResponseTime: number;
  throughput: number;
  errorRate: number;
}

/**
 * High-performance cache with LRU eviction and TTL support
 * Compatible with Node 18 and lru-cache v7
 */
export class OptimizedCache<T> {
  private cache: Map<string, { data: T; timestamp: number; hits: number; created: number }>;
  private accessOrder: string[];
  private metrics: PerformanceMetrics;
  private config: CacheConfig;

  constructor(config: CacheConfig) {
    this.config = config;
    this.cache = new Map();
    this.accessOrder = [];
    
    this.metrics = {
      cacheHits: 0,
      cacheMisses: 0,
      totalOperations: 0,
      avgResponseTime: 0,
      throughput: 0,
      errorRate: 0
    };
  }

  /**
   * Generate cache key with optional hashing
   */
  private generateKey(input: string): string {
    if (this.config.enableHashing) {
      return crypto.createHash('sha256').update(input).digest('hex');
    }
    return input;
  }

  /**
   * Get cached value with metrics tracking
   */
  get(key: string): T | null {
    const startTime = performance.now();
    const cacheKey = this.generateKey(key);
    const cached = this.cache.get(cacheKey);
    
    this.metrics.totalOperations++;
    
    if (cached) {
      // Check TTL
      const now = Date.now();
      if (now - cached.created > this.config.ttlMs) {
        this.cache.delete(cacheKey);
        this.removeFromAccessOrder(cacheKey);
        this.metrics.cacheMisses++;
        return null;
      }
      
      cached.hits++;
      cached.timestamp = now;
      this.metrics.cacheHits++;
      
      // Update access order for LRU
      this.updateAccessOrder(cacheKey);
      
      const responseTime = performance.now() - startTime;
      this.updateResponseTimeMetrics(responseTime);
      
      return cached.data;
    } else {
      this.metrics.cacheMisses++;
      return null;
    }
  }

  /**
   * Set cached value with metadata
   */
  set(key: string, value: T): void {
    const cacheKey = this.generateKey(key);
    const now = Date.now();
    
    // Check if we need to evict
    this.evictIfNeeded();
    
    this.cache.set(cacheKey, {
      data: value,
      timestamp: now,
      created: now,
      hits: 0
    });
    
    this.updateAccessOrder(cacheKey);
  }

  /**
   * Evict oldest items if cache is full
   */
  private evictIfNeeded(): void {
    while (this.cache.size >= this.config.maxSize && this.accessOrder.length > 0) {
      const oldestKey = this.accessOrder.shift();
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }
  }

  /**
   * Update access order for LRU behavior
   */
  private updateAccessOrder(key: string): void {
    // Remove from current position
    this.removeFromAccessOrder(key);
    // Add to end (most recently used)
    this.accessOrder.push(key);
  }

  /**
   * Remove key from access order
   */
  private removeFromAccessOrder(key: string): void {
    const index = this.accessOrder.indexOf(key);
    if (index > -1) {
      this.accessOrder.splice(index, 1);
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): PerformanceMetrics & { hitRate: number; size: number } {
    const hitRate = this.metrics.totalOperations > 0 
      ? (this.metrics.cacheHits / this.metrics.totalOperations) * 100 
      : 0;
    
    return {
      ...this.metrics,
      hitRate,
      size: this.cache.size
    };
  }

  /**
   * Clear cache and reset metrics
   */
  clear(): void {
    this.cache.clear();
    this.metrics = {
      cacheHits: 0,
      cacheMisses: 0,
      totalOperations: 0,
      avgResponseTime: 0,
      throughput: 0,
      errorRate: 0
    };
  }

  private updateResponseTimeMetrics(responseTime: number): void {
    // Update running average
    const totalTime = this.metrics.avgResponseTime * (this.metrics.totalOperations - 1) + responseTime;
    this.metrics.avgResponseTime = totalTime / this.metrics.totalOperations;
  }
}

/**
 * Parallel batch processor with intelligent scheduling
 */
export class ParallelBatchProcessor<T, R> {
  private config: BatchConfig;
  private activeOperations: Set<Promise<R[]>> = new Set();
  private metrics: PerformanceMetrics;

  constructor(config: BatchConfig) {
    this.config = config;
    this.metrics = {
      cacheHits: 0,
      cacheMisses: 0,
      totalOperations: 0,
      avgResponseTime: 0,
      throughput: 0,
      errorRate: 0
    };
  }

  /**
   * Process items in parallel batches with controlled concurrency
   */
  async processBatches<R>(
    items: T[],
    processor: (batch: T[]) => Promise<R[]>
  ): Promise<R[]> {
    const startTime = Date.now();
    const batches = this.createBatches(items);
    const results: R[] = [];
    
    console.log(`🔄 Processing ${items.length} items in ${batches.length} batches (max concurrency: ${this.config.maxConcurrency})`);
    
    // Process batches with controlled concurrency
    for (let i = 0; i < batches.length; i += this.config.maxConcurrency) {
      const batchGroup = batches.slice(i, i + this.config.maxConcurrency);
      
      const batchPromises = batchGroup.map(async (batch, index) => {
        return this.processSingleBatch(batch, processor, i + index);
      });
      
      const batchResults = await Promise.all(batchPromises);
      
      // Flatten results
      batchResults.forEach(batchResult => {
        results.push(...batchResult);
      });
      
      // Progress update
      const processed = Math.min(i + this.config.maxConcurrency, batches.length);
      const progress = ((processed / batches.length) * 100).toFixed(1);
      console.log(`   📊 Batch progress: ${processed}/${batches.length} (${progress}%)`);
    }
    
    // Update metrics
    const totalTime = Date.now() - startTime;
    this.metrics.totalOperations = items.length;
    this.metrics.avgResponseTime = totalTime / items.length;
    this.metrics.throughput = (items.length / totalTime) * 1000; // items per second
    
    console.log(`✅ Parallel processing complete: ${items.length} items in ${totalTime}ms (${this.metrics.throughput.toFixed(2)} items/sec)`);
    
    return results;
  }

  /**
   * Process single batch with retry logic
   */
  private async processSingleBatch<R>(
    batch: T[],
    processor: (batch: T[]) => Promise<R[]>,
    batchIndex: number
  ): Promise<R[]> {
    let attempts = 0;
    let lastError: Error = new Error('Unknown error');

    while (attempts < this.config.retryAttempts) {
      try {
        // Create timeout promise
        const timeoutPromise = new Promise<R[]>((_, reject) => {
          setTimeout(() => reject(new Error('Batch timeout')), this.config.timeoutMs);
        });

        // Race between processing and timeout
        const result = await Promise.race([
          processor(batch),
          timeoutPromise
        ]);

        return result;

      } catch (error: any) {
        lastError = error as Error;
        attempts++;
        this.metrics.errorRate = (attempts / this.metrics.totalOperations) * 100;
        
        if (attempts < this.config.retryAttempts) {
          console.log(`⚠️ Batch ${batchIndex} attempt ${attempts} failed, retrying: ${error.message}`);
          await new Promise(resolve => setTimeout(resolve, 1000 * attempts)); // Exponential backoff
        }
      }
    }

    console.error(`❌ Batch ${batchIndex} failed after ${this.config.retryAttempts} attempts: ${lastError.message}`);
    throw lastError;
  }

  /**
   * Create optimized batches from items
   */
  private createBatches(items: T[]): T[][] {
    const batches: T[][] = [];
    
    for (let i = 0; i < items.length; i += this.config.batchSize) {
      batches.push(items.slice(i, i + this.config.batchSize));
    }
    
    return batches;
  }

  /**
   * Get processing metrics
   */
  getMetrics(): PerformanceMetrics {
    return { ...this.metrics };
  }
}

/**
 * Transaction receipt cache with Web3 provider optimization
 */
export class TransactionReceiptCache {
  private receiptCache: OptimizedCache<any>;
  private providerCache: OptimizedCache<any>;
  
  constructor() {
    this.receiptCache = new OptimizedCache({
      maxSize: 10000,
      ttlMs: 5 * 60 * 1000, // 5 minutes
      enableHashing: true
    });
    
    this.providerCache = new OptimizedCache({
      maxSize: 1000,
      ttlMs: 30 * 1000, // 30 seconds
      enableHashing: false
    });
  }

  /**
   * Get transaction receipt with caching
   */
  async getReceipt(txHash: string, provider: any): Promise<any> {
    const cached = this.receiptCache.get(txHash);
    if (cached) {
      return cached;
    }

    try {
      const receipt = await provider.eth.getTransactionReceipt(txHash);
      if (receipt) {
        this.receiptCache.set(txHash, receipt);
      }
      return receipt;
    } catch (error: any) {
      console.error(`Failed to fetch receipt for ${txHash}: ${error.message}`);
      return null;
    }
  }

  /**
   * Batch fetch receipts with parallel processing
   */
  async batchGetReceipts(txHashes: string[], provider: any): Promise<Map<string, any>> {
    const processor = new ParallelBatchProcessor({
      batchSize: 20,
      maxConcurrency: 5,
      timeoutMs: 10000,
      retryAttempts: 2
    });

    const results = new Map<string, any>();
    
    const processBatch = async (hashBatch: string[]) => {
      const batchPromises = hashBatch.map(async (txHash: string) => {
        const receipt = await this.getReceipt(txHash, provider);
        return { txHash, receipt };
      });
      
      return await Promise.all(batchPromises);
    };

    const batchResults = await processor.processBatches(txHashes, processBatch as any);
    
    batchResults.forEach((result: any) => {
      if (result.receipt) {
        results.set(result.txHash, result.receipt);
      }
    });

    return results;
  }

  /**
   * Get cache statistics
   */
  getStats() {
    return {
      receipts: this.receiptCache.getStats(),
      providers: this.providerCache.getStats()
    };
  }

  /**
   * Clear all caches
   */
  clear(): void {
    this.receiptCache.clear();
    this.providerCache.clear();
  }
}

/**
 * Performance monitoring utility
 */
export class PerformanceMonitor {
  private startTime: number = 0;
  private checkpoints: Map<string, number> = new Map();
  private operations: Map<string, { count: number; totalTime: number }> = new Map();

  /**
   * Start performance monitoring
   */
  start(): void {
    this.startTime = performance.now();
    this.checkpoints.clear();
    this.operations.clear();
  }

  /**
   * Add checkpoint
   */
  checkpoint(name: string): void {
    this.checkpoints.set(name, performance.now());
  }

  /**
   * Time an operation
   */
  async timeOperation<T>(name: string, operation: () => Promise<T>): Promise<T> {
    const startTime = performance.now();
    try {
      const result = await operation();
      this.recordOperation(name, performance.now() - startTime);
      return result;
    } catch (error) {
      this.recordOperation(name, performance.now() - startTime);
      throw error;
    }
  }

  /**
   * Record operation metrics
   */
  private recordOperation(name: string, time: number): void {
    const existing = this.operations.get(name) || { count: 0, totalTime: 0 };
    this.operations.set(name, {
      count: existing.count + 1,
      totalTime: existing.totalTime + time
    });
  }

  /**
   * Get performance report
   */
  getReport(): any {
    const totalTime = performance.now() - this.startTime;
    
    const checkpointReport = Array.from(this.checkpoints.entries()).map(([name, time]) => ({
      name,
      timeFromStart: (time - this.startTime).toFixed(2) + 'ms'
    }));

    const operationReport = Array.from(this.operations.entries()).map(([name, data]) => ({
      name,
      count: data.count,
      totalTime: data.totalTime.toFixed(2) + 'ms',
      avgTime: (data.totalTime / data.count).toFixed(2) + 'ms',
      opsPerSecond: ((data.count / data.totalTime) * 1000).toFixed(2)
    }));

    return {
      totalExecutionTime: totalTime.toFixed(2) + 'ms',
      checkpoints: checkpointReport,
      operations: operationReport
    };
  }
}