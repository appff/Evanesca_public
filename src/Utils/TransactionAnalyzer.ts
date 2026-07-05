import { EvanescaContext } from "../Interfaces/EvanescaContext";
import { SemanticFinancialGraphBuilder } from "../SemanticFinancialGraph/SemanticFinancialGraphBuilder";
import { DecodedLog } from "../SemanticFinancialGraph/SemanticFinancialGraphUtils";
import { AnalysisResult } from "../ConstraintSolver/Interfaces/AnalysisResult";
import { makeLogs } from "../ABIDecoder/LogDecoder";
import { CONFIG } from "../config/constants";
import { Logger } from "../Utils/Logger";
import { Cache, TransactionCache, PriceCache, SemanticModelCache } from "../Utils/Cache";
import { RetryManager } from "../Utils/RetryManager";
import { BatchProcessor, BatchResult } from "../Utils/BatchProcessor";

export interface AnalysisOptions {
  debug?: boolean;
  saveState?: boolean;
  batchSize?: number;
  maxRetries?: number;
  maxConcurrency?: number;
  memoryLimit?: number; // MB
  enableCaching?: boolean;
  enableStreaming?: boolean;
}

export class TransactionAnalyzer {
  private context: EvanescaContext;
  private logger: Logger;
  private options: AnalysisOptions;
  
  // Caching systems
  private transactionCache: TransactionCache;
  private priceCache: PriceCache;
  private semanticModelCache: SemanticModelCache;
  
  // Performance optimization
  private retryManager: RetryManager;
  private batchProcessor: BatchProcessor<string, AnalysisResult | null>;

  constructor(context: EvanescaContext, options: AnalysisOptions = {}) {
    this.context = context;
    this.options = {
      debug: false,
      saveState: true,
      batchSize: CONFIG.PERFORMANCE.BATCH_SIZE,
      maxRetries: CONFIG.PERFORMANCE.RETRY_ATTEMPTS,
      maxConcurrency: CONFIG.PERFORMANCE.MAX_CONCURRENT_REQUESTS,
      memoryLimit: 512, // 512MB default
      enableCaching: true,
      enableStreaming: true,
      ...options
    };
    
    this.logger = new Logger(this.options.debug);
    
    // Initialize caching systems
    this.transactionCache = new TransactionCache();
    this.priceCache = new PriceCache();
    this.semanticModelCache = new SemanticModelCache();
    
    // Initialize retry manager with exponential backoff
    this.retryManager = RetryManager.create(RetryManager.CONFIGURATIONS.STANDARD);
    
    // Initialize batch processor with memory optimization
    this.batchProcessor = new BatchProcessor(
      async (hash: string) => this.analyzeTransactionInternal(hash),
      {
        batchSize: this.options.batchSize,
        maxConcurrency: this.options.maxConcurrency,
        memoryLimit: this.options.memoryLimit,
        enableStreaming: this.options.enableStreaming,
        onProgress: (progress) => {
          this.logger.info(`Processing progress: ${progress.toFixed(1)}%`);
        }
      }
    );
  }

  /**
   * Analyze a single transaction (public interface)
   */
  async analyzeTransaction(hash: string): Promise<AnalysisResult | null> {
    // Check cache first if caching is enabled
    if (this.options.enableCaching) {
      const cached = this.transactionCache.get(hash);
      if (cached) {
        this.logger.debug(`Cache hit for transaction: ${hash}`);
        return cached;
      }
    }
    
    const result = await this.analyzeTransactionInternal(hash);
    
    // Cache the result if caching is enabled
    if (this.options.enableCaching && result) {
      this.transactionCache.set(hash, result);
    }
    
    return result;
  }

  /**
   * Internal transaction analysis method
   */
  private async analyzeTransactionInternal(hash: string): Promise<AnalysisResult | null> {
    try {
      this.logger.info(`Analyzing transaction: ${hash}`);
      
      const receipt = await this.getTransactionReceiptWithRetry(hash);
      if (!receipt) {
        this.logger.warn(`No receipt found for transaction: ${hash}`);
        return null;
      }

      const decodedLogs = makeLogs(receipt);
      const bGraph = new SemanticFinancialGraphBuilder(receipt.blockNumber, receipt.from);
      
      await bGraph.build(decodedLogs);
      const result = await this.solveConstraints(bGraph);
      
      this.logger.info(`Analysis completed for ${hash}`);
      return result;
      
    } catch (error) {
      this.logger.error(`Error analyzing transaction ${hash}:`, error);
      throw error;
    }
  }

  /**
   * Analyze multiple transactions in batch with memory optimization
   */
  async analyzeBatch(transactionHashes: string[]): Promise<AnalysisResult[]> {
    this.logger.info(`Starting optimized batch analysis of ${transactionHashes.length} transactions`);
    
    // Use the optimized batch processor
    const batchResults = await this.batchProcessor.processBatch(transactionHashes);
    
    // Filter successful results
    const results = batchResults
      .filter(result => result.success && result.data !== null)
      .map(result => result.data as AnalysisResult);
    
    this.logger.info(`Batch analysis completed. Successfully analyzed ${results.length}/${transactionHashes.length} transactions`);
    return results;
  }

  /**
   * Stream processing for large datasets
   */
  async *analyzeStream(transactionHashes: string[]): AsyncGenerator<AnalysisResult, void, unknown> {
    this.logger.info(`Starting stream analysis of ${transactionHashes.length} transactions`);
    
    for await (const result of this.batchProcessor.processStream(transactionHashes)) {
      if (result.success && result.data !== null) {
        yield result.data;
      }
    }
  }

  /**
   * Analyze transactions from a file
   */
  async analyzeFromFile(filePath: string): Promise<AnalysisResult[]> {
    const fs = require('fs');
    
    if (!fs.existsSync(filePath)) {
      throw new Error(`Transaction file not found: ${filePath}`);
    }
    
    const content = fs.readFileSync(filePath, 'utf8');
    const transactionHashes = content.split(',').map((hash: string) => hash.trim()).filter(Boolean);
    
    this.logger.info(`Loaded ${transactionHashes.length} transactions from ${filePath}`);
    return this.analyzeBatch(transactionHashes);
  }

  /**
   * Get transaction receipt with retry logic
   */
  private async getTransactionReceipt(hash: string, retryCount = 0): Promise<any> {
    try {
      const { getEventLogs } = require("../Utils/Driver/DriverUtils");
      return await getEventLogs(hash);
    } catch (error) {
      if (retryCount < this.options.maxRetries!) {
        this.logger.warn(`Retrying transaction receipt fetch for ${hash} (attempt ${retryCount + 1})`);
        await this.delay(CONFIG.PERFORMANCE.RETRY_DELAY);
        return this.getTransactionReceipt(hash, retryCount + 1);
      }
      throw error;
    }
  }

  /**
   * Get transaction receipt with exponential backoff retry
   */
  private async getTransactionReceiptWithRetry(hash: string): Promise<any> {
    return this.retryManager.execute(
      async () => {
        const { getEventLogs } = require("../Utils/Driver/DriverUtils");
        return await getEventLogs(hash);
      },
      `transaction receipt fetch for ${hash}`
    );
  }

  /**
   * Solve constraints using the appropriate solver
   */
  private async solveConstraints(bGraph: SemanticFinancialGraphBuilder): Promise<AnalysisResult> {
    const { solve } = require("../Utils/Driver/DriverUtils");
    return await solve(bGraph);
  }

  /**
   * Utility method for delays
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get analysis statistics
   */
  getStatistics(): {
    totalTransactions: number;
    successfulAnalyses: number;
    failedAnalyses: number;
    averageProcessingTime: number;
    cacheStats: {
      transactionCache: { size: number; hitRate: number; memoryUsage: number };
      priceCache: { size: number; hitRate: number; memoryUsage: number };
      semanticModelCache: { size: number; hitRate: number; memoryUsage: number };
    };
    batchStats: {
      totalJobs: number;
      completedJobs: number;
      activeJobs: number;
      progress: number;
      memoryUsage: NodeJS.MemoryUsage;
    };
  } {
    const reports = this.context.reports;
    const total = reports.length;
    const successful = reports.filter(r => r._elapsed > 0).length;
    const failed = total - successful;
    const avgTime = reports.reduce((sum, r) => sum + (r._elapsed || 0), 0) / successful || 0;
    
    return {
      totalTransactions: total,
      successfulAnalyses: successful,
      failedAnalyses: failed,
      averageProcessingTime: avgTime,
      cacheStats: {
        transactionCache: this.transactionCache.getStats(),
        priceCache: this.priceCache.getStats(),
        semanticModelCache: this.semanticModelCache.getStats()
      },
      batchStats: this.batchProcessor.getStats()
    };
  }
} 