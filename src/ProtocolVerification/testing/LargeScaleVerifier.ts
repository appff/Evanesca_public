/**
 * LargeScaleVerifier - Batch processing infrastructure for protocol verification
 * Handles verification of thousands of transactions with performance optimization
 */

import { run } from '../../Driver';
import { EvanescaContext } from '../../Interfaces/EvanescaContext';
import { AnalysisResult } from '../../ConstraintSolver/Interfaces/AnalysisResult';
import { InvariantChecker } from '../InvariantChecker';
import { StateTracker } from '../StateTracker';
import { UniswapV2Invariant } from '../protocols/UniswapV2Invariant';
import { UniswapV3Invariant } from '../protocols/UniswapV3Invariant';
import { DebugLogger } from '../../Utils/DebugLogger';

export interface VerificationResult {
  transactionHash: string;
  protocol: string;
  violated: boolean;
  violationType?: string;
  violationDetails?: any;
  processingTime: number;
  blockNumber?: number;
  error?: string;
}

export interface VerificationSummary {
  protocol: string;
  totalTransactions: number;
  violationCount: number;
  violationRate: number;
  averageProcessingTime: number;
  violations: VerificationResult[];
  errors: VerificationResult[];
}

export interface BatchConfig {
  batchSize: number;
  maxConcurrent: number;
  requestsPerSecond: number;
  cacheEnabled: boolean;
  retryOnError: boolean;
  maxRetries: number;
}

export class TransactionCache {
  private cache: Map<string, any>;
  private maxSize: number;

  constructor(maxSize: number = 10000) {
    this.cache = new Map();
    this.maxSize = maxSize;
  }

  get(key: string): any {
    return this.cache.get(key);
  }

  set(key: string, value: any): void {
    // Simple LRU: remove oldest if at capacity
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    this.cache.set(key, value);
  }

  has(key: string): boolean {
    return this.cache.has(key);
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }
}

export class LargeScaleVerifier {
  private stateTracker: StateTracker;
  private invariantChecker: InvariantChecker;
  private cache: TransactionCache;
  private batchConfig: BatchConfig;
  private processingStats: Map<string, number[]>;

  constructor(batchConfig?: Partial<BatchConfig>) {
    this.stateTracker = new StateTracker();
    this.invariantChecker = new InvariantChecker(this.stateTracker);
    this.cache = new TransactionCache();
    this.processingStats = new Map();
    
    this.batchConfig = {
      batchSize: 100,
      maxConcurrent: 10,
      requestsPerSecond: 50,
      cacheEnabled: true,
      retryOnError: true,
      maxRetries: 3,
      ...batchConfig
    };
  }

  /**
   * Verify a batch of protocol transactions
   */
  async verifyProtocolBatch(
    protocol: string,
    transactionHashes: string[],
    batchSize?: number
  ): Promise<VerificationSummary> {
    const actualBatchSize = batchSize || this.batchConfig.batchSize;
    const results: VerificationResult[] = [];
    const errors: VerificationResult[] = [];
    
    console.log(`🔍 Starting verification of ${transactionHashes.length} ${protocol} transactions`);
    console.log(`📦 Batch size: ${actualBatchSize}, Max concurrent: ${this.batchConfig.maxConcurrent}`);

    // Process in batches
    for (let i = 0; i < transactionHashes.length; i += actualBatchSize) {
      const batch = transactionHashes.slice(i, i + actualBatchSize);
      console.log(`📊 Processing batch ${Math.floor(i / actualBatchSize) + 1}/${Math.ceil(transactionHashes.length / actualBatchSize)}`);
      
      const batchResults = await this.processBatch(protocol, batch);
      
      // Separate results and errors
      batchResults.forEach(result => {
        if (result.error) {
          errors.push(result);
        } else {
          results.push(result);
        }
      });
      
      // Progress update
      const processed = Math.min(i + actualBatchSize, transactionHashes.length);
      const violations = results.filter(r => r.violated).length;
      console.log(`✅ Processed ${processed}/${transactionHashes.length} transactions (${violations} violations found)`);
      
      // Rate limiting
      if (i + actualBatchSize < transactionHashes.length) {
        await this.delay(1000 / this.batchConfig.requestsPerSecond * actualBatchSize);
      }
    }

    // Calculate summary statistics
    const summary = this.generateSummary(protocol, results, errors);
    
    // Log summary
    console.log(`\n📊 ${protocol} Verification Summary:`);
    console.log(`   Total: ${summary.totalTransactions}`);
    console.log(`   Violations: ${summary.violationCount} (${summary.violationRate.toFixed(2)}%)`);
    console.log(`   Errors: ${errors.length}`);
    console.log(`   Avg Processing Time: ${summary.averageProcessingTime.toFixed(0)}ms`);
    
    return summary;
  }

  /**
   * Process a batch of transactions with parallel execution
   */
  private async processBatch(
    protocol: string,
    transactionHashes: string[]
  ): Promise<VerificationResult[]> {
    // Use parallel processing with concurrency limit
    const results: VerificationResult[] = [];
    const executing: Promise<VerificationResult>[] = [];
    
    for (const hash of transactionHashes) {
      const promise = this.verifyTransaction(protocol, hash);
      executing.push(promise);
      
      // Limit concurrent executions
      if (executing.length >= this.batchConfig.maxConcurrent) {
        const result = await Promise.race(executing);
        results.push(result);
        const index = executing.findIndex(p => p === promise);
        executing.splice(index, 1);
      }
    }
    
    // Wait for remaining promises
    const remaining = await Promise.all(executing);
    results.push(...remaining);
    
    return results;
  }

  /**
   * Verify a single transaction
   */
  private async verifyTransaction(
    protocol: string,
    transactionHash: string
  ): Promise<VerificationResult> {
    const startTime = Date.now();
    
    try {
      // Check cache first
      if (this.batchConfig.cacheEnabled && this.cache.has(transactionHash)) {
        const cached = this.cache.get(transactionHash);
        return {
          ...cached,
          processingTime: Date.now() - startTime
        };
      }
      
      // Create analysis context
      const context: EvanescaContext = {
        tList: [],
        analyzed: new Set<string>(),
        reports: [],
        fins: [],
        complexity: []
      };
      
      // Run analysis
      const result = await run(transactionHash, context);
      
      // Check for violations
      let violated = false;
      let violationType: string | undefined;
      let violationDetails: any;
      
      if (result && result.reports && result.reports.length > 0) {
        const report = result.reports[0];
        
        // Check if any violation is true in the violation array
        if (Array.isArray(report._violation)) {
          violated = report._violation.some(v => v === true);
          
          if (violated) {
            // Identify which violations occurred
            const violationIndices = report._violation
              .map((v, i) => v === true ? i : -1)
              .filter(i => i >= 0);
            
            // Map violation indices to types based on protocol
            if (protocol === 'uniswap') {
              if (violationIndices.includes(0)) violationType = 'K_INVARIANT_VIOLATION';
              else if (violationIndices.includes(2)) violationType = 'PRICE_MANIPULATION';
              else if (violationIndices.includes(5)) violationType = 'FLASH_LOAN_ATTACK';
              else violationType = `VIOLATION_AT_INDICES_${violationIndices.join('_')}`;
            } else if (protocol === 'curve') {
              if (violationIndices.includes(7)) violationType = 'STABLE_SWAP_VIOLATION';
              else violationType = `VIOLATION_AT_INDICES_${violationIndices.join('_')}`;
            } else if (protocol === 'balancer') {
              violationType = 'WEIGHTED_POOL_VIOLATION';
            } else if (protocol === 'aave') {
              if (violationIndices.includes(1)) violationType = 'HEALTH_FACTOR_VIOLATION';
              else violationType = `VIOLATION_AT_INDICES_${violationIndices.join('_')}`;
            }
            
            violationDetails = {
              violationIndices,
              comment: report._comment
            };
          }
        }
      }
      
      const verificationResult: VerificationResult = {
        transactionHash,
        protocol,
        violated,
        violationType,
        violationDetails,
        processingTime: Date.now() - startTime,
        blockNumber: result?.reports?.[0]?._index
      };
      
      // Cache result
      if (this.batchConfig.cacheEnabled) {
        this.cache.set(transactionHash, verificationResult);
      }
      
      // Track processing time
      this.trackProcessingTime(protocol, verificationResult.processingTime);
      
      return verificationResult;
      
    } catch (error: any) {
      DebugLogger.core(`❌ Error verifying ${transactionHash}: ${error.message}`);
      
      // Retry logic
      if (this.batchConfig.retryOnError && error.retryCount < this.batchConfig.maxRetries) {
        error.retryCount = (error.retryCount || 0) + 1;
        await this.delay(1000 * error.retryCount); // Exponential backoff
        return this.verifyTransaction(protocol, transactionHash);
      }
      
      return {
        transactionHash,
        protocol,
        violated: false,
        processingTime: Date.now() - startTime,
        error: error.message
      };
    }
  }

  /**
   * Generate verification summary
   */
  private generateSummary(
    protocol: string,
    results: VerificationResult[],
    errors: VerificationResult[]
  ): VerificationSummary {
    const violations = results.filter(r => r.violated);
    const processingTimes = results.map(r => r.processingTime);
    
    return {
      protocol,
      totalTransactions: results.length + errors.length,
      violationCount: violations.length,
      violationRate: (violations.length / results.length) * 100,
      averageProcessingTime: processingTimes.reduce((a, b) => a + b, 0) / processingTimes.length || 0,
      violations,
      errors
    };
  }

  /**
   * Process with rate limiting
   */
  async processWithRateLimit(
    txHashes: string[],
    protocol: string,
    maxConcurrent: number = 10,
    requestsPerSecond: number = 50
  ): Promise<VerificationResult[]> {
    const results: VerificationResult[] = [];
    const batchSize = Math.min(maxConcurrent, requestsPerSecond);
    
    for (let i = 0; i < txHashes.length; i += batchSize) {
      const batch = txHashes.slice(i, i + batchSize);
      const batchPromises = batch.map(hash => this.verifyTransaction(protocol, hash));
      
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
      
      // Rate limiting delay
      if (i + batchSize < txHashes.length) {
        await this.delay(1000 / requestsPerSecond * batchSize);
      }
    }
    
    return results;
  }

  /**
   * Track processing time statistics
   */
  private trackProcessingTime(protocol: string, time: number): void {
    if (!this.processingStats.has(protocol)) {
      this.processingStats.set(protocol, []);
    }
    this.processingStats.get(protocol)!.push(time);
  }

  /**
   * Get processing statistics
   */
  getProcessingStats(protocol: string): {
    count: number;
    average: number;
    min: number;
    max: number;
    median: number;
  } {
    const times = this.processingStats.get(protocol) || [];
    if (times.length === 0) {
      return { count: 0, average: 0, min: 0, max: 0, median: 0 };
    }
    
    const sorted = [...times].sort((a, b) => a - b);
    return {
      count: times.length,
      average: times.reduce((a, b) => a + b, 0) / times.length,
      min: sorted[0],
      max: sorted[sorted.length - 1],
      median: sorted[Math.floor(sorted.length / 2)]
    };
  }

  /**
   * Utility delay function
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Clear all caches
   */
  clearCache(): void {
    this.cache.clear();
    this.stateTracker.clearStates();
    this.processingStats.clear();
    DebugLogger.core('🔄 All caches cleared');
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): {
    size: number;
    hitRate: number;
  } {
    // This would need tracking of hits/misses for accurate hit rate
    return {
      size: this.cache.size,
      hitRate: 0 // Would need to implement hit tracking
    };
  }
}