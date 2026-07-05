/**
 * Simple cache for transaction receipts to avoid duplicate API calls
 */

import { LRUCache } from "lru-cache";
import { TransactionReceipt } from "web3-core";

export class TransactionReceiptCache {
  private cache: LRUCache<string, TransactionReceipt>;
  private enabled: boolean;
  private quiet: boolean;

  constructor(maxSize: number = 1000, ttlMs: number = 1000 * 60 * 60) {
    // 1 hour TTL
    this.cache = new LRUCache<string, TransactionReceipt>({
      max: maxSize,
      ttl: ttlMs,
      updateAgeOnGet: true,
      updateAgeOnHas: true,
    });

    this.enabled = process.env.DISABLE_TX_CACHE !== "true";
    this.quiet = process.env.EVANESCA_QUIET === "true";

    if (this.enabled) {
      if (!this.quiet) {
        console.log(
          `📦 [TransactionReceiptCache] Initialized with max ${maxSize} entries, TTL ${ttlMs}ms`,
        );
      }
    }
  }

  get(txHash: string): TransactionReceipt | null {
    if (!this.enabled) return null;

    const cached = this.cache.get(txHash.toLowerCase());
    if (cached) {
      if (!this.quiet) {
        console.log(
          `🎯 [TransactionReceiptCache] Cache HIT for ${txHash.slice(0, 10)}...`,
        );
      }
      return cached;
    }
    return null;
  }

  set(txHash: string, receipt: TransactionReceipt): void {
    if (!this.enabled) return;

    this.cache.set(txHash.toLowerCase(), receipt);
    if (!this.quiet) {
      console.log(
        `💾 [TransactionReceiptCache] Cached receipt for ${txHash.slice(0, 10)}...`,
      );
    }
  }

  has(txHash: string): boolean {
    if (!this.enabled) return false;
    return this.cache.has(txHash.toLowerCase());
  }

  clear(): void {
    this.cache.clear();
    if (!this.quiet) {
      console.log(`🧹 [TransactionReceiptCache] Cache cleared`);
    }
  }

  getStats(): { size: number; hitRate?: number } {
    return {
      size: this.cache.size,
    };
  }
}

// Global cache instance
export const globalTxCache = new TransactionReceiptCache();
