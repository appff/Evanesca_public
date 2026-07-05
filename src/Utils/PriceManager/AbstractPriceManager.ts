/**
 * Abstract base class for all price managers
 * Provides common functionality and enforces consistent interface
 */

import { AbiItem } from "web3-utils";
import { web3 } from "../../PreTasks";
import { ABIERC20 } from "../../ABIDecoder/defaultABIs";
import { IPriceManager } from "./Interfaces/IPriceManager";
import { ZERO_BN, BigNumber } from "../constants";

export interface PriceData {
  price: number;
  timestamp?: number;
  source?: string;
  confidence?: number; // 0-1 confidence score
}

export interface PriceCache {
  [key: string]: {
    price: number;
    timestamp: number;
    expiry: number;
  };
}

export abstract class AbstractPriceManager implements IPriceManager {
  protected cache: PriceCache = {};
  protected cacheExpiry: number = 60 * 1000; // 1 minute default cache
  protected maxRetries: number = 3;
  protected retryDelay: number = 1000; // 1 second
  protected source: string = 'unknown';

  constructor(config?: {
    cacheExpiry?: number;
    maxRetries?: number;
    retryDelay?: number;
    source?: string;
  }) {
    if (config?.cacheExpiry) this.cacheExpiry = config.cacheExpiry;
    if (config?.maxRetries) this.maxRetries = config.maxRetries;
    if (config?.retryDelay) this.retryDelay = config.retryDelay;
    if (config?.source) this.source = config.source;
  }

  /**
   * Apply token decimals to raw amount
   */
  async applyDecimals(amount: number, tokenAddr: string): Promise<number> {
    try {
      if (tokenAddr === "0x0" || tokenAddr === "0x0000000000000000000000000000000000000000") {
        return amount / (10 ** 18); // ETH decimals
      }
      
      const contract = new web3.eth.Contract(ABIERC20 as AbiItem[], tokenAddr);
      const decimals = await contract.methods.decimals().call();
      return amount / (10 ** Number(decimals));
    } catch (error) {
      console.error(`Failed to get decimals for ${tokenAddr}:`, error);
      return amount / (10 ** 18); // Default to 18 decimals
    }
  }

  /**
   * Get price with caching and retry logic
   */
  async getPrice(symbolOrAddress: string, blockNoOrDate: number | string): Promise<number> {
    const cacheKey = `${symbolOrAddress}_${blockNoOrDate}`;
    
    // Check cache first
    const cached = this.getFromCache(cacheKey);
    if (cached !== null) {
      return cached;
    }

    // Try to fetch with retries
    let lastError: Error | null = null;
    for (let retry = 0; retry < this.maxRetries; retry++) {
      try {
        const price = await this.fetchPrice(symbolOrAddress, blockNoOrDate);
        
        // Validate price
        if (this.isValidPrice(price)) {
          this.setCache(cacheKey, price);
          return price;
        } else {
          throw new Error(`Invalid price received: ${price}`);
        }
      } catch (error) {
        lastError = error as Error;
        console.warn(`Price fetch attempt ${retry + 1} failed:`, error);
        
        if (retry < this.maxRetries - 1) {
          await this.delay(this.retryDelay * (retry + 1)); // Exponential backoff
        }
      }
    }

    // If all retries failed, try fallback
    const fallbackPrice = await this.getFallbackPrice(symbolOrAddress, blockNoOrDate);
    if (fallbackPrice !== null && this.isValidPrice(fallbackPrice)) {
      this.setCache(cacheKey, fallbackPrice);
      return fallbackPrice;
    }

    throw lastError || new Error(`Failed to get price for ${symbolOrAddress} at ${blockNoOrDate}`);
  }

  /**
   * Abstract method to be implemented by subclasses
   */
  protected abstract fetchPrice(symbolOrAddress: string, blockNoOrDate: number | string): Promise<number>;

  /**
   * Optional fallback price source
   */
  protected async getFallbackPrice(symbolOrAddress: string, blockNoOrDate: number | string): Promise<number | null> {
    return null; // Override in subclasses if fallback is available
  }

  /**
   * Validate price is reasonable
   */
  protected isValidPrice(price: number): boolean {
    return price > 0 && price < Number.MAX_SAFE_INTEGER && !isNaN(price) && isFinite(price);
  }

  /**
   * Cache management
   */
  protected getFromCache(key: string): number | null {
    const cached = this.cache[key];
    if (cached && Date.now() < cached.expiry) {
      return cached.price;
    }
    return null;
  }

  protected setCache(key: string, price: number): void {
    this.cache[key] = {
      price,
      timestamp: Date.now(),
      expiry: Date.now() + this.cacheExpiry
    };
  }

  /**
   * Clear cache
   */
  public clearCache(): void {
    this.cache = {};
  }

  /**
   * Get cache statistics
   */
  public getCacheStats(): { size: number; hits: number; misses: number } {
    return {
      size: Object.keys(this.cache).length,
      hits: 0, // Would need to track this
      misses: 0 // Would need to track this
    };
  }

  /**
   * Utility method for delays
   */
  protected delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get source identifier
   */
  public getSource(): string {
    return this.source;
  }
}