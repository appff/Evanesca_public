/**
 * Performance-optimized Web3 calls for batch processing
 */

import { providerManager } from "../PreTasks";
import { globalTxCache } from "./TransactionReceiptCache";
import { TransactionReceipt } from "web3-core";

export class FastWeb3Call {
  private static readonly FAST_TIMEOUT = 3000; // 3 seconds for aggressive batch processing
  private static readonly BATCH_TIMEOUT = 2000; // 2 seconds for concurrent requests

  /**
   * Get transaction receipt with performance optimizations for batch processing
   */
  static async getTransactionReceiptFast(
    txHash: string,
    chainId: number = 1,
  ): Promise<TransactionReceipt | null> {
    // Check cache first
    const cached = globalTxCache.get(txHash);
    if (cached) {
      return cached;
    }

    try {
      // Use shorter timeout for batch operations
      const receipt = await Promise.race([
        providerManager.executeWithFailover(async (web3Instance: any) => {
          return await web3Instance.eth.getTransactionReceipt(txHash);
        }, "getTransactionReceipt", { chainId }),
        new Promise<null>((_, reject) =>
          setTimeout(
            () =>
              reject(
                new Error(
                  `Fast timeout (${this.FAST_TIMEOUT}ms) exceeded for ${txHash}`,
                ),
              ),
            this.FAST_TIMEOUT,
          ),
        ),
      ]);

      // Cache successful result
      if (receipt) {
        globalTxCache.set(txHash, receipt);
        if (process.env.EVANESCA_QUIET !== "true") {
          console.log(
            `⚡ [FastWeb3Call] Cached receipt for ${txHash.slice(0, 10)}...`,
          );
        }
      }

      return receipt;
    } catch (error) {
      console.warn(
        `⚠️ [FastWeb3Call] Fast API call failed for ${txHash.slice(0, 10)}...: ${(error as Error).message}`,
      );
      return null;
    }
  }

  /**
   * Batch get multiple transaction receipts with concurrent processing
   */
  static async batchGetTransactionReceipts(
    txHashes: string[],
    chainId: number = 1,
  ): Promise<Map<string, TransactionReceipt | null>> {
    const results = new Map<string, TransactionReceipt | null>();

    // Check cache for all transactions first
    const uncachedHashes: string[] = [];
    for (const hash of txHashes) {
      const cached = globalTxCache.get(hash);
      if (cached) {
        results.set(hash, cached);
        if (process.env.EVANESCA_QUIET !== "true") {
          console.log(
            `🎯 [FastWeb3Call] Batch cache HIT for ${hash.slice(0, 10)}...`,
          );
        }
      } else {
        uncachedHashes.push(hash);
      }
    }

    if (uncachedHashes.length === 0) {
      if (process.env.EVANESCA_QUIET !== "true") {
        console.log(
          `⚡ [FastWeb3Call] All ${txHashes.length} receipts found in cache`,
        );
      }
      return results;
    }

    if (process.env.EVANESCA_QUIET !== "true") {
      console.log(
        `🚀 [FastWeb3Call] Fetching ${uncachedHashes.length}/${txHashes.length} receipts from API`,
      );
    }

    // Process uncached transactions with limited concurrency
    const CONCURRENT_LIMIT = 5; // Limit concurrent API calls
    const chunks: string[][] = [];

    for (let i = 0; i < uncachedHashes.length; i += CONCURRENT_LIMIT) {
      chunks.push(uncachedHashes.slice(i, i + CONCURRENT_LIMIT));
    }

    for (const chunk of chunks) {
      const chunkPromises = chunk.map(async (hash) => {
        try {
          const receipt = await this.getTransactionReceiptFast(hash, chainId);
          return { hash, receipt };
        } catch (error) {
          console.warn(
            `⚠️ [FastWeb3Call] Chunk processing failed for ${hash.slice(0, 10)}...`,
          );
          return { hash, receipt: null };
        }
      });

      const chunkResults = await Promise.allSettled(chunkPromises);

      for (const result of chunkResults) {
        if (result.status === "fulfilled") {
          results.set(result.value.hash, result.value.receipt);
        }
      }
    }

    return results;
  }

  /**
   * Get cache statistics
   */
  static getCacheStats(): { size: number } {
    return globalTxCache.getStats();
  }

  /**
   * Clear cache
   */
  static clearCache(): void {
    globalTxCache.clear();
  }
}
