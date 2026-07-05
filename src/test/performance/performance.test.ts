/// <reference types="mocha" />

import { expect } from 'chai';
import { TransactionAnalyzer } from '../../Utils/TransactionAnalyzer';
import { EvanescaContext } from '../../Interfaces/EvanescaContext';
import { Cache, PriceCache, TransactionCache } from '../../Utils/Cache';
import { RetryManager } from '../../Utils/RetryManager';
import { BatchProcessor } from '../../Utils/BatchProcessor';

describe('Performance Tests', () => {
  let context: EvanescaContext;

  beforeEach(() => {
    context = {
      tList: [],
      fins: [],
      reports: [],
      analyzed: new Set(),
      complexity: []
    };
  });

  describe('Cache Performance', () => {
    it('should cache and retrieve data efficiently', () => {
      const cache = new Cache<number>(1000); // 1 second TTL
      
      // Test cache set/get
      const startTime = Date.now();
      cache.set('test-key', 123);
      const value = cache.get('test-key');
      const endTime = Date.now();
      
      expect(value).to.equal(123);
      expect(endTime - startTime).to.be.lessThan(10); // Should be very fast
    });

    it('should handle cache expiration correctly', async () => {
      const cache = new Cache<number>(100); // 100ms TTL
      
      cache.set('expire-test', 456);
      expect(cache.get('expire-test')).to.equal(456);
      
      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 150));
      expect(cache.get('expire-test')).to.be.null;
    });

    it('should provide cache statistics', () => {
      const cache = new Cache<number>();
      
      cache.set('key1', 1);
      cache.set('key2', 2);
      
      const stats = cache.getStats();
      expect(stats.size).to.equal(2);
      expect(stats.memoryUsage).to.be.greaterThan(0);
    });
  });

  describe('Retry Manager Performance', () => {
    it('should retry with exponential backoff', async () => {
      let attemptCount = 0;
      const failingFunction = async () => {
        attemptCount++;
        if (attemptCount < 3) {
          throw new Error('Simulated failure');
        }
        return 'success';
      };

      const retryManager = RetryManager.create({
        maxAttempts: 3,
        baseDelay: 10, // Short delay for testing
        maxDelay: 100
      });

      const startTime = Date.now();
      const result = await retryManager.execute(failingFunction, 'test');
      const endTime = Date.now();

      expect(result).to.equal('success');
      expect(attemptCount).to.equal(3);
      expect(endTime - startTime).to.be.greaterThan(20); // Should have delays
    });

    it('should fail after max attempts', async () => {
      const alwaysFailingFunction = async () => {
        throw new Error('Always fails');
      };

      const retryManager = RetryManager.create({
        maxAttempts: 2,
        baseDelay: 10
      });

      try {
        await retryManager.execute(alwaysFailingFunction, 'test');
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect((error as Error).message).to.include('Failed after 2 attempts');
      }
    });
  });

  describe('Batch Processor Performance', () => {
    it('should process items in batches with concurrency control', async () => {
      const processedItems: number[] = [];
      const processor = async (item: number) => {
        await new Promise(resolve => setTimeout(resolve, 10)); // Simulate work
        processedItems.push(item);
        return item * 2;
      };

      const batchProcessor = new BatchProcessor(processor, {
        batchSize: 5,
        maxConcurrency: 2
      });

      const items = Array.from({ length: 10 }, (_, i) => i);
      const startTime = Date.now();
      const results = await batchProcessor.processBatch(items);
      const endTime = Date.now();

      expect(results.length).to.equal(10);
      expect(results.every(r => r.success)).to.be.true;
      expect(processedItems).to.have.length(10);
      
      // Should be faster than sequential processing (10 * 10ms = 100ms)
      // but slower than full parallel (10ms)
      expect(endTime - startTime).to.be.lessThan(100);
      expect(endTime - startTime).to.be.greaterThan(10);
    });

    it('should handle memory limits', async () => {
      const processor = async (item: number) => {
        // Simulate memory usage
        const largeArray = new Array(1000).fill(item);
        return largeArray.length;
      };

      const batchProcessor = new BatchProcessor(processor, {
        batchSize: 10,
        memoryLimit: 1 // 1MB limit
      });

      const items = Array.from({ length: 50 }, (_, i) => i);
      const results = await batchProcessor.processBatch(items);

      expect(results.length).to.equal(50);
      expect(results.every(r => r.success)).to.be.true;
    });

    it('should support streaming for large datasets', async () => {
      const processor = async (item: number) => {
        await new Promise(resolve => setTimeout(resolve, 5));
        return item * 2;
      };

      const batchProcessor = new BatchProcessor(processor, {
        batchSize: 3,
        maxConcurrency: 2
      });

      const items = Array.from({ length: 10 }, (_, i) => i);
      const streamedResults: number[] = [];

      for await (const result of batchProcessor.processStream(items)) {
        streamedResults.push(result.data);
      }

      expect(streamedResults).to.have.length(10);
      expect(streamedResults).to.deep.equal(items.map(i => i * 2));
    });
  });

  describe('Transaction Analyzer Performance', () => {
    it('should provide comprehensive statistics', () => {
      const analyzer = new TransactionAnalyzer(context, {
        debug: false,
        enableCaching: true,
        enableStreaming: true
      });

      const stats = analyzer.getStatistics();
      
      expect(stats).to.have.property('totalTransactions');
      expect(stats).to.have.property('successfulAnalyses');
      expect(stats).to.have.property('failedAnalyses');
      expect(stats).to.have.property('averageProcessingTime');
      expect(stats).to.have.property('cacheStats');
      expect(stats).to.have.property('batchStats');
      
      expect(stats.cacheStats).to.have.property('transactionCache');
      expect(stats.cacheStats).to.have.property('priceCache');
      expect(stats.cacheStats).to.have.property('semanticModelCache');
      
      expect(stats.batchStats).to.have.property('totalJobs');
      expect(stats.batchStats).to.have.property('completedJobs');
      expect(stats.batchStats).to.have.property('activeJobs');
      expect(stats.batchStats).to.have.property('progress');
      expect(stats.batchStats).to.have.property('memoryUsage');
    });
  });

  describe('Memory Management', () => {
    it('should monitor memory usage', () => {
      const initialMemory = process.memoryUsage().heapUsed;
      
      // Create some objects to use memory
      const largeArray = new Array(10000).fill('test');
      
      const currentMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = currentMemory - initialMemory;
      
      expect(memoryIncrease).to.be.greaterThan(0);
      expect(currentMemory).to.be.greaterThan(initialMemory);
    });
  });
}); 