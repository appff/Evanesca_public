import { EventEmitter } from 'events';
import { Logger } from './Logger';

export interface BatchProcessorOptions {
  batchSize: number;
  maxConcurrency: number;
  memoryLimit?: number; // MB
  enableStreaming?: boolean;
  onProgress?: (progress: number) => void;
}

export interface BatchResult<T> {
  data: T;
  success: boolean;
  error?: Error;
  processingTime: number;
}

export class BatchProcessor<T, R> extends EventEmitter {
  private options: BatchProcessorOptions;
  private logger: Logger;
  private activeJobs = 0;
  private completedJobs = 0;
  private totalJobs = 0;

  constructor(
    private processor: (item: T) => Promise<R>,
    options: Partial<BatchProcessorOptions> = {}
  ) {
    super();
    this.options = {
      batchSize: 100,
      maxConcurrency: 10,
      memoryLimit: 512, // 512MB default
      enableStreaming: true,
      ...options
    };
    this.logger = new Logger();
  }

  /**
   * Process items in batches with memory optimization
   */
  async processBatch(items: T[]): Promise<BatchResult<R>[]> {
    this.totalJobs = items.length;
    this.completedJobs = 0;
    this.activeJobs = 0;
    
    const results: BatchResult<R>[] = [];
    
    this.logger.info(`Starting batch processing of ${items.length} items`);
    
    // Process in chunks to manage memory
    for (let i = 0; i < items.length; i += this.options.batchSize) {
      const chunk = items.slice(i, i + this.options.batchSize);
      
      // Check memory usage before processing chunk
      if (this.shouldGarbageCollect()) {
        this.forceGarbageCollection();
      }
      
      const chunkResults = await this.processChunk(chunk);
      results.push(...chunkResults);
      
      // Emit progress event
      this.emit('progress', {
        completed: this.completedJobs,
        total: this.totalJobs,
        percentage: (this.completedJobs / this.totalJobs) * 100
      });
      
      if (this.options.onProgress) {
        this.options.onProgress((this.completedJobs / this.totalJobs) * 100);
      }
    }
    
    this.logger.info(`Batch processing completed. Processed ${results.length} items`);
    return results;
  }

  /**
   * Process a chunk of items with concurrency control
   */
  private async processChunk(items: T[]): Promise<BatchResult<R>[]> {
    const results: BatchResult<R>[] = [];
    const semaphore = new Semaphore(this.options.maxConcurrency);
    
    const promises = items.map(async (item) => {
      await semaphore.acquire();
      this.activeJobs++;
      
      const startTime = Date.now();
      let success = false;
      let data: R | undefined;
      let error: Error | undefined;
      
      try {
        data = await this.processor(item);
        success = true;
      } catch (err) {
        error = err as Error;
        this.logger.error(`Error processing item:`, error);
      } finally {
        const processingTime = Date.now() - startTime;
        this.activeJobs--;
        this.completedJobs++;
        semaphore.release();
        
        results.push({
          data: data!,
          success,
          error,
          processingTime
        });
      }
    });
    
    await Promise.all(promises);
    return results;
  }

  /**
   * Stream processing for large datasets
   */
  async *processStream(items: T[]): AsyncGenerator<BatchResult<R>, void, unknown> {
    for (let i = 0; i < items.length; i += this.options.batchSize) {
      const chunk = items.slice(i, i + this.options.batchSize);
      const chunkResults = await this.processChunk(chunk);
      
      for (const result of chunkResults) {
        yield result;
      }
      
      // Memory management
      if (this.shouldGarbageCollect()) {
        this.forceGarbageCollection();
      }
    }
  }

  /**
   * Check if garbage collection should be triggered
   */
  private shouldGarbageCollect(): boolean {
    if (!this.options.memoryLimit) return false;
    
    const memoryUsage = process.memoryUsage();
    const memoryUsageMB = memoryUsage.heapUsed / 1024 / 1024;
    
    return memoryUsageMB > this.options.memoryLimit * 0.8; // 80% of limit
  }

  /**
   * Force garbage collection if available
   */
  private forceGarbageCollection(): void {
    if (global.gc) {
      global.gc();
      this.logger.debug('Garbage collection triggered');
    }
  }

  /**
   * Get current processing statistics
   */
  getStats(): {
    totalJobs: number;
    completedJobs: number;
    activeJobs: number;
    progress: number;
    memoryUsage: NodeJS.MemoryUsage;
  } {
    return {
      totalJobs: this.totalJobs,
      completedJobs: this.completedJobs,
      activeJobs: this.activeJobs,
      progress: this.totalJobs > 0 ? (this.completedJobs / this.totalJobs) * 100 : 0,
      memoryUsage: process.memoryUsage()
    };
  }
}

/**
 * Semaphore for concurrency control
 */
class Semaphore {
  private permits: number;
  private waitQueue: Array<() => void> = [];

  constructor(permits: number) {
    this.permits = permits;
  }

  async acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits--;
      return Promise.resolve();
    }
    
    return new Promise<void>((resolve) => {
      this.waitQueue.push(resolve);
    });
  }

  release(): void {
    if (this.waitQueue.length > 0) {
      const resolve = this.waitQueue.shift()!;
      resolve();
    } else {
      this.permits++;
    }
  }
} 