/**
 * Batch Processor for Protocol Verification
 * 
 * Optimizes processing of large transaction sets (8K+) by:
 * 1. Grouping transactions by protocol for better cache utilization
 * 2. Batch processing with shared context
 * 3. Parallel execution within batches
 * 4. Memory-efficient streaming processing
 */

import { run } from '../Driver';
import { EvanescaContext } from '../Interfaces/EvanescaContext';
import { AnalysisResult } from '../ConstraintSolver/Interfaces/AnalysisResult';
import { performance } from 'perf_hooks';
import * as os from 'os';
import { LRUCache } from 'lru-cache';
import { globalPersistentCache } from '../Utils/PersistentReceiptCache';
import { EventClassifier } from './EventClassifier';

interface BatchOptions {
    batchSize: number;
    parallelWorkers: number;
    cacheEnabled: boolean;
    memoryLimit: number; // in MB
    progressCallback?: (progress: number) => void;
}

export interface BatchResult {
    txHash: string;
    protocol: string;
    success: boolean;
    edgeCreated: boolean;
    edgeCount: number;  // Add actual edge count
    violations: string[];
    processingTime: number;
    error?: string;
}

interface BatchStatistics {
    totalTransactions: number;
    successfulTransactions: number;
    failedTransactions: number;
    edgeCreationRate: number;
    correctedEdgeCreationRate: number;  // Edge creation rate for financial events only
    totalEvents: number;                // Total events processed
    financialEvents: number;             // Financial events that should create edges
    nonFinancialEvents: number;          // Non-financial events (Transfer, Approval, Sync)
    averageProcessingTime: number;
    totalProcessingTime: number;
    memoryUsage: number;
    cacheHitRate: number;
}

export class BatchProcessor {
    private options: BatchOptions;
    private transactionCache: LRUCache<string, BatchResult>;
    private eventCache: LRUCache<string, any>;
    private apiCache: LRUCache<string, any>;
    private cacheHits: number = 0;
    private cacheMisses: number = 0;
    private statistics: BatchStatistics;

    constructor(options: Partial<BatchOptions> = {}) {
        this.options = {
            batchSize: options.batchSize || 100,
            parallelWorkers: options.parallelWorkers || os.cpus().length,
            cacheEnabled: options.cacheEnabled !== false,
            memoryLimit: options.memoryLimit || 4096, // 4GB default
            progressCallback: options.progressCallback
        };
        
        // Initialize LRU caches with optimized settings
        this.transactionCache = new LRUCache<string, BatchResult>({
            max: 10000, // Maximum number of items
            ttl: 1000 * 60 * 60, // 1 hour TTL
            updateAgeOnGet: true,
            updateAgeOnHas: true
        });
        
        this.eventCache = new LRUCache<string, any>({
            max: 20000, // More events than transactions
            ttl: 1000 * 60 * 60, // 1 hour TTL
            updateAgeOnGet: true
        });
        
        this.apiCache = new LRUCache<string, any>({
            max: 5000, // API call results
            ttl: 1000 * 60 * 30, // 30 minutes TTL
            updateAgeOnGet: true
        });

        this.statistics = {
            totalTransactions: 0,
            successfulTransactions: 0,
            failedTransactions: 0,
            edgeCreationRate: 0,
            correctedEdgeCreationRate: 0,
            totalEvents: 0,
            financialEvents: 0,
            nonFinancialEvents: 0,
            averageProcessingTime: 0,
            totalProcessingTime: 0,
            memoryUsage: 0,
            cacheHitRate: 0
        };
    }

    /**
     * Pre-warm cache with similar transactions
     */
    private async preWarmCache(transactions: any[]): Promise<void> {
        if (!this.options.cacheEnabled) return;
        
        console.log('   🔥 Pre-warming cache for similar transactions...');
        
        // Check persistent cache for each transaction and preload into memory
        let persistentCacheHits = 0;
        const txHashes = transactions.map(tx => typeof tx === 'string' ? tx : tx.hash);
        
        for (const txHash of txHashes) {
            const cachedReceipt = await globalPersistentCache.get(txHash);
            if (cachedReceipt) {
                persistentCacheHits++;
            }
        }
        
        console.log(`   ⚡ Persistent cache analysis: ${persistentCacheHits}/${txHashes.length} transactions cached (${(persistentCacheHits/txHashes.length*100).toFixed(1)}%)`);
        
        // Preload common transactions into memory if available
        if (persistentCacheHits > 0) {
            await globalPersistentCache.preloadCommonTransactions(txHashes);
            console.log('   📁 Preloaded cached transactions into memory for batch processing');
        }
        
        // Group similar transactions by protocol and pattern (existing logic)
        const groups = new Map<string, any[]>();
        for (const tx of transactions) {
            const protocol = typeof tx === 'string' ? 'unknown' : tx.protocol || 'unknown';
            const action = typeof tx === 'string' ? 'default' : tx.action || 'default';
            const key = `${protocol}:${action}`;
            if (!groups.has(key)) {
                groups.set(key, []);
            }
            groups.get(key)!.push(tx);
        }
        
        // Cache patterns for each group
        for (const [pattern, txs] of groups.entries()) {
            if (txs.length > 1) {
                console.log(`      Caching pattern: ${pattern} (${txs.length} similar txs)`);
            }
        }
    }
    
    /**
     * Process transactions in optimized batches
     */
    async processBatch(transactions: any[], options?: Partial<BatchOptions>): Promise<BatchResult[]> {
        const opts = { ...this.options, ...options };
        const startTime = performance.now();
        
        console.log(`\n🚀 Starting batch processing of ${transactions.length} transactions`);
        console.log(`   Batch size: ${opts.batchSize}`);
        console.log(`   Parallel workers: ${opts.parallelWorkers}`);
        console.log(`   Cache enabled: ${opts.cacheEnabled}`);
        
        // Group transactions by protocol for better cache utilization
        const groupedTransactions = this.groupByProtocol(transactions);
        const allResults: BatchResult[] = [];
        
        let processedCount = 0;
        
        // Process each protocol group
        for (const [protocol, protocolTxs] of Object.entries(groupedTransactions)) {
            console.log(`\n📊 Processing ${protocolTxs.length} ${protocol} transactions...`);
            
            // Split into batches
            const batches = this.createBatches(protocolTxs, opts.batchSize);
            
            // Process batches
            for (const batch of batches) {
                // Check memory usage before processing batch
                if (!this.checkMemoryUsage(opts.memoryLimit)) {
                    console.warn('⚠️ Memory limit approaching, clearing cache...');
                    this.clearCache();
                }
                
                // Process batch with parallel execution
                const batchResults = await this.processParallelBatch(batch, protocol, opts.parallelWorkers);
                allResults.push(...batchResults);
                
                processedCount += batch.length;
                
                // Report progress
                if (opts.progressCallback) {
                    const progress = (processedCount / transactions.length) * 100;
                    opts.progressCallback(progress);
                }
                
                console.log(`   ✓ Batch complete: ${processedCount}/${transactions.length} (${((processedCount / transactions.length) * 100).toFixed(1)}%)`);
            }
        }
        
        // Calculate statistics
        this.calculateStatistics(allResults, performance.now() - startTime);
        
        return allResults;
    }

    /**
     * Process a batch of transactions in parallel
     */
    private async processParallelBatch(
        batch: any[], 
        protocol: string,
        maxWorkers: number
    ): Promise<BatchResult[]> {
        const workers = Math.min(maxWorkers, batch.length);
        const chunkSize = Math.ceil(batch.length / workers);
        const chunks: any[][] = [];
        
        // Split batch into chunks for parallel processing
        for (let i = 0; i < batch.length; i += chunkSize) {
            chunks.push(batch.slice(i, i + chunkSize));
        }
        
        // Process chunks in parallel
        const chunkPromises = chunks.map(chunk => this.processChunk(chunk, protocol));
        const chunkResults = await Promise.all(chunkPromises);
        
        // Flatten results
        return chunkResults.flat();
    }

    /**
     * Cache event data for reuse
     */
    private cacheEventData(txHash: string, events: any[]): void {
        if (this.options.cacheEnabled && events && events.length > 0) {
            const eventKey = `events:${txHash}`;
            this.eventCache.set(eventKey, events);
        }
    }
    
    /**
     * Get cached event data
     */
    private getCachedEventData(txHash: string): any[] | null {
        if (this.options.cacheEnabled) {
            const eventKey = `events:${txHash}`;
            return this.eventCache.get(eventKey) || null;
        }
        return null;
    }
    
    /**
     * Cache API response
     */
    private cacheApiResponse(key: string, data: any): void {
        if (this.options.cacheEnabled) {
            this.apiCache.set(key, data);
        }
    }
    
    /**
     * Get cached API response
     */
    private getCachedApiResponse(key: string): any | null {
        if (this.options.cacheEnabled) {
            return this.apiCache.get(key) || null;
        }
        return null;
    }
    
    /**
     * Process a chunk of transactions
     */
    private async processChunk(chunk: any[], protocol: string): Promise<BatchResult[]> {
        const results: BatchResult[] = [];
        
        for (const tx of chunk) {
            const startTime = performance.now();
            
            try {
                // Check transaction cache first
                const cacheKey = this.getCacheKey(tx.hash, protocol);
                if (this.options.cacheEnabled && this.transactionCache.has(cacheKey)) {
                    this.cacheHits++;
                    const cachedResult = this.transactionCache.get(cacheKey)!;
                    results.push({
                        ...cachedResult,
                        processingTime: 0 // Cached, no processing time
                    });
                    continue;
                }
                
                this.cacheMisses++;
                
                // Create context for this transaction
                const context: EvanescaContext = {
                    tList: [tx.hash],
                    fins: [],
                    reports: [],
                    analyzed: new Set<string>(),
                    complexity: []
                };
                
                // Run analysis
                await run(tx.hash, context);
                
                // Extract results
                const edgeCreated = context.edges && context.edges.length > 0;
                const edgeCount = context.edges ? context.edges.length : 0;
                const violations = this.extractViolations(context.reports);
                
                const result: BatchResult = {
                    txHash: tx.hash,
                    protocol: protocol,
                    success: true,
                    edgeCreated: edgeCreated || false,
                    edgeCount: edgeCount,
                    violations: violations,
                    processingTime: performance.now() - startTime
                };
                
                // Cache result in transaction cache
                if (this.options.cacheEnabled) {
                    this.transactionCache.set(cacheKey, result);
                }
                
                results.push(result);
                
            } catch (error: any) {
                results.push({
                    txHash: tx.hash,
                    protocol: protocol,
                    success: false,
                    edgeCreated: false,
                    edgeCount: 0,
                    violations: [],
                    processingTime: performance.now() - startTime,
                    error: error.message
                });
            }
        }
        
        return results;
    }

    /**
     * Group transactions by protocol
     */
    private groupByProtocol(transactions: any[]): { [protocol: string]: any[] } {
        const grouped: { [protocol: string]: any[] } = {};
        
        for (const tx of transactions) {
            const protocol = tx.protocol || 'Unknown';
            if (!grouped[protocol]) {
                grouped[protocol] = [];
            }
            grouped[protocol].push(tx);
        }
        
        return grouped;
    }

    /**
     * Create batches from transactions
     */
    private createBatches(transactions: any[], batchSize: number): any[][] {
        const batches: any[][] = [];
        
        for (let i = 0; i < transactions.length; i += batchSize) {
            batches.push(transactions.slice(i, i + batchSize));
        }
        
        return batches;
    }

    /**
     * Extract violations from reports
     */
    private extractViolations(reports: AnalysisResult[]): string[] {
        const violations: string[] = [];
        
        for (const report of reports) {
            if (report._violation && Array.isArray(report._violation)) {
                report._violation.forEach((violated: boolean, index: number) => {
                    if (violated) {
                        violations.push(`Constraint_${index}`);
                    }
                });
            }
        }
        
        return violations;
    }

    /**
     * Generate cache key
     */
    private getCacheKey(txHash: string, protocol: string): string {
        return `${protocol}:${txHash}`;
    }

    /**
     * Check memory usage
     */
    private checkMemoryUsage(limitMB: number): boolean {
        const used = process.memoryUsage();
        const usedMB = used.heapUsed / 1024 / 1024;
        
        this.statistics.memoryUsage = usedMB;
        
        return usedMB < limitMB;
    }

    /**
     * Clear all caches
     */
    private clearCache(): void {
        this.transactionCache.clear();
        this.eventCache.clear();
        this.apiCache.clear();
        if (global.gc) {
            global.gc();
        }
    }

    /**
     * Calculate statistics
     */
    private calculateStatistics(results: BatchResult[], totalTime: number): void {
        this.statistics.totalTransactions = results.length;
        this.statistics.successfulTransactions = results.filter(r => r.success).length;
        this.statistics.failedTransactions = results.filter(r => !r.success).length;
        
        const edgesCreated = results.filter(r => r.edgeCreated).length;
        this.statistics.edgeCreationRate = (edgesCreated / results.length) * 100;
        
        const totalProcessingTime = results.reduce((sum, r) => sum + r.processingTime, 0);
        this.statistics.averageProcessingTime = totalProcessingTime / results.length;
        this.statistics.totalProcessingTime = totalTime;
        
        if (this.options.cacheEnabled) {
            const totalRequests = this.cacheHits + this.cacheMisses;
            this.statistics.cacheHitRate = totalRequests > 0 ? (this.cacheHits / totalRequests) * 100 : 0;
        }
    }

    /**
     * Get processing statistics
     */
    getStatistics(): BatchStatistics {
        return { ...this.statistics };
    }

    /**
     * Print statistics report
     */
    printStatisticsReport(): void {
        console.log('\n' + '='.repeat(60));
        console.log('📊 BATCH PROCESSING STATISTICS');
        console.log('='.repeat(60));
        
        console.log(`\n📈 Performance Metrics:`);
        console.log(`   Total Transactions: ${this.statistics.totalTransactions}`);
        console.log(`   Successful: ${this.statistics.successfulTransactions} (${((this.statistics.successfulTransactions / this.statistics.totalTransactions) * 100).toFixed(2)}%)`);
        console.log(`   Failed: ${this.statistics.failedTransactions}`);
        console.log(`   Edge Creation Rate: ${this.statistics.edgeCreationRate.toFixed(2)}%`);
        
        console.log(`\n⏱️ Timing:`);
        console.log(`   Total Processing Time: ${(this.statistics.totalProcessingTime / 1000).toFixed(2)}s`);
        console.log(`   Average per Transaction: ${this.statistics.averageProcessingTime.toFixed(2)}ms`);
        console.log(`   Transactions per Second: ${(this.statistics.totalTransactions / (this.statistics.totalProcessingTime / 1000)).toFixed(2)} TPS`);
        
        if (this.options.cacheEnabled) {
            console.log(`\n💾 Cache Performance:`);
            console.log(`   Cache Hit Rate: ${this.statistics.cacheHitRate.toFixed(2)}%`);
            console.log(`   Cache Hits: ${this.cacheHits}`);
            console.log(`   Cache Misses: ${this.cacheMisses}`);
            console.log(`   Transaction Cache Size: ${this.transactionCache.size} entries`);
            console.log(`   Event Cache Size: ${this.eventCache.size} entries`);
            console.log(`   API Cache Size: ${this.apiCache.size} entries`);
        }
        
        console.log(`\n💻 Resource Usage:`);
        console.log(`   Memory Usage: ${this.statistics.memoryUsage.toFixed(2)} MB`);
        console.log(`   Parallel Workers: ${this.options.parallelWorkers}`);
        console.log(`   Batch Size: ${this.options.batchSize}`);
        
        console.log('\n' + '='.repeat(60));
    }
}

// Export convenience function for quick batch processing
export async function processBatchTransactions(
    transactions: any[],
    options?: Partial<BatchOptions>
): Promise<BatchResult[]> {
    const processor = new BatchProcessor(options);
    const results = await processor.processBatch(transactions);
    processor.printStatisticsReport();
    return results;
}