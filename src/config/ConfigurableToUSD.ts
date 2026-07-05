import { TokenConfigManager, TokenConfig, PriceCapSettings } from './TokenConfig';
import { DebugLogger } from '../Utils/DebugLogger';
import { TokenDecimalFetcher } from '../Utils/TokenDecimalFetcher';
import { DynamicTokenMetadataLoader, initializeTokenMetadata } from './TokenMetadataLoader';
import { getGlobalPriceCache, PriceCache, PriceCacheKey } from './PriceCache';

export class ConfigurableToUSD {
  private tokenConfigManager: TokenConfigManager;
  private metadataLoader: DynamicTokenMetadataLoader | undefined;
  private priceCache: PriceCache;

  constructor(tokenConfigManager: TokenConfigManager, metadataLoader?: DynamicTokenMetadataLoader) {
    this.tokenConfigManager = tokenConfigManager;
    this.metadataLoader = metadataLoader;
    this.priceCache = getGlobalPriceCache();
    
    // Pre-warm cache with known historical prices from config
    this.preWarmPriceCache();
  }

  /**
   * Pre-warm price cache with historical prices from token configuration
   */
  private preWarmPriceCache(): void {
    const preWarmEntries: Array<{ params: PriceCacheKey, price: number, source: 'config' }> = [];
    
    // Get all configured tokens
    const tokenSymbols = this.tokenConfigManager.getAllTokenSymbols();
    
    for (const symbol of tokenSymbols) {
      const token = this.tokenConfigManager.getTokenBySymbol(symbol);
      if (!token) continue;
      
      // Add default price
      preWarmEntries.push({
        params: {
          tokenSymbol: symbol,
          tokenAddress: token.address,
          blockNumber: 0, // Default block for fallback prices
          attackPattern: 'default'
        },
        price: token.defaultPrice,
        source: 'config'
      });
      
      // Add historical prices
      if (token.historicalPrices && Array.isArray(token.historicalPrices)) {
        for (const historicalPrice of token.historicalPrices) {
          preWarmEntries.push({
            params: {
              tokenSymbol: symbol,
              tokenAddress: token.address,
              blockNumber: historicalPrice.blockNumber,
              attackPattern: historicalPrice.attackPattern || 'default'
            },
            price: historicalPrice.price,
            source: 'config'
          });
        }
      }
    }
    
    if (preWarmEntries.length > 0) {
      this.priceCache.preWarm(preWarmEntries);
      DebugLogger.core(`🔥 [ConfigurableToUSD] Pre-warmed price cache with ${preWarmEntries.length} entries`);
    }
  }

  /**
   * Batch convert multiple token amounts to USD for better performance
   * Reduces API calls and improves cache efficiency
   */
  async convertBatchToUSD(
    requests: Array<{
      rawAmount: string | number;
      tokenSymbol: string;
      tokenAddr: string;
      blockNo: number;
      attackPattern?: string;
    }>
  ): Promise<number[]> {
    if (requests.length === 0) return [];
    
    DebugLogger.solver(`🔍 Batch converting ${requests.length} token amounts to USD`);
    
    // Check cache for all requests first
    const cacheResults = new Map<number, number>();
    const uncachedRequests: Array<{ index: number; request: typeof requests[0] }> = [];
    
    for (let i = 0; i < requests.length; i++) {
      const request = requests[i];
      const cacheKey: PriceCacheKey = {
        tokenSymbol: request.tokenSymbol,
        tokenAddress: request.tokenAddr,
        blockNumber: request.blockNo,
        attackPattern: request.attackPattern
      };
      
      const cachedPrice = this.priceCache.get(cacheKey);
      if (cachedPrice !== undefined) {
        // Use cached price to calculate USD value
        const tokenConfig = this.getTokenConfig(request.tokenSymbol, request.tokenAddr);
        const decimals = this.getTokenDecimals(request.tokenSymbol, request.tokenAddr, tokenConfig);
        const normalizedAmount = parseFloat(request.rawAmount.toString()) / Math.pow(10, decimals);
        const result = normalizedAmount * cachedPrice;
        const cappedResult = this.applyPriceCapping(result, normalizedAmount, request.tokenSymbol, tokenConfig, request.attackPattern);
        cacheResults.set(i, cappedResult);
        
        DebugLogger.core(`💾 [BatchToUSD] Using cached price for ${request.tokenSymbol}: $${cappedResult.toFixed(2)}`);
      } else {
        uncachedRequests.push({ index: i, request });
      }
    }
    
    // Process uncached requests individually but track for batch cache operations
    const newPriceEntries: Array<{ 
      params: PriceCacheKey; 
      price: number; 
      source: 'historical' | 'config' | 'api'; 
      computeTime: number 
    }> = [];
    
    const results = new Array<number>(requests.length);
    
    // Fill cached results
    for (const [index, result] of cacheResults.entries()) {
      results[index] = result;
    }
    
    // Process uncached requests
    for (const { index, request } of uncachedRequests) {
      const startTime = performance.now();
      const result = await this.convertToUSD(
        request.rawAmount,
        request.tokenSymbol,
        request.tokenAddr,
        request.blockNo,
        request.attackPattern
      );
      const computeTime = performance.now() - startTime;
      
      results[index] = result;
      
      // Note: Individual convertToUSD already handles caching
      DebugLogger.core(`🔍 [BatchToUSD] Computed ${request.tokenSymbol}: $${result.toFixed(2)} (${computeTime.toFixed(2)}ms)`);
    }
    
    DebugLogger.solver(`✅ Batch conversion completed: ${cacheResults.size} cached, ${uncachedRequests.length} computed`);
    
    return results;
  }

  /**
   * Convert token amount to USD using configurable prices and limits
   * Replaces the hard-coded toUSD function in Interpreter.ts
   */
  async convertToUSD(
    rawAmount: string | number,
    tokenSymbol: string,
    tokenAddr: string,
    blockNo: number,
    attackPattern?: string
  ): Promise<number> {
    DebugLogger.solver(`🔍 ConfigurableToUSD called with: ${rawAmount} ${tokenSymbol} at block ${blockNo}`);

    // Handle burn address (0x0) - always returns $0
    if (tokenAddr === '0x0' || tokenAddr === '0x0000000000000000000000000000000000000000') {
      DebugLogger.core(`🔥 [toUSD] ETH burn address 0x0 detected - value = $0`);
      return 0;
    }

    // Generic decimal validation and normalization
    const validationResult = TokenDecimalFetcher.validateAndNormalizeAmount(rawAmount, tokenSymbol, tokenAddr);
    if (!validationResult.isValid) {
      DebugLogger.price(`⚠️ [Decimal-Validation] ${validationResult.explanation}`);
    }
    
    // Use raw amount for calculation but have validation info available
    const correctedRawAmount = rawAmount;

    // Get token configuration with dynamic loading
    let tokenConfig = this.tokenConfigManager.getTokenBySymbol(tokenSymbol);
    if (!tokenConfig) {
      tokenConfig = this.tokenConfigManager.getTokenByAddress(tokenAddr);
    }

    // If no token config found, try dynamic metadata loading
    if (!tokenConfig && this.metadataLoader) {
      try {
        DebugLogger.core(`🔍 [toUSD] Attempting dynamic metadata loading for ${tokenSymbol} (${tokenAddr})`);
        tokenConfig = await this.metadataLoader.getTokenMetadata(tokenSymbol, tokenAddr);
        // Add to config manager for future use
        this.tokenConfigManager.addToken(tokenConfig);
      } catch (error) {
        DebugLogger.error(`Failed to load dynamic metadata for ${tokenSymbol}: ${error}`);
      }
    }

    // If still no token config found, create a minimal one with defaults
    if (!tokenConfig) {
      DebugLogger.core(`⚠️ [toUSD] No config found for ${tokenSymbol} (${tokenAddr}), using fallback`);
      tokenConfig = this.createFallbackTokenConfig(tokenSymbol, tokenAddr);
    }

    // Check price cache first
    const cacheKey: PriceCacheKey = {
      tokenSymbol,
      tokenAddress: tokenAddr,
      blockNumber: blockNo,
      attackPattern
    };
    
    let price = this.priceCache.get(cacheKey);
    let priceSource: 'cached' | 'historical' | 'default' = 'cached';
    const computeStartTime = performance.now();
    
    if (price === undefined) {
      // Cache miss - compute price
      price = this.tokenConfigManager.getHistoricalPrice(tokenSymbol, blockNo);
      if (price === undefined) {
        price = tokenConfig.defaultPrice;
        priceSource = 'default';
        DebugLogger.core(`📊 [toUSD] Using default price for ${tokenSymbol}: $${price}`);
      } else {
        priceSource = 'historical';
        DebugLogger.core(`📊 [toUSD] Using historical price for ${tokenSymbol} at block ${blockNo}: $${price}`);
      }
      
      // Store in cache
      const computeTime = performance.now() - computeStartTime;
      this.priceCache.set(cacheKey, price, priceSource === 'historical' ? 'historical' : 'config', computeTime);
    } else {
      DebugLogger.core(`💾 [toUSD] Using cached price for ${tokenSymbol} at block ${blockNo}: $${price}`);
    }

    // Get decimals (prefer config, fallback to dynamic fetching)
    let decimals = tokenConfig.decimals;
    try {
      const actualDecimals = TokenDecimalFetcher.getKnownTokenDecimals(tokenSymbol, tokenAddr);
      if (actualDecimals !== null) {
        decimals = actualDecimals;
        DebugLogger.core(`📚 [toUSD] Using known decimals for ${tokenSymbol}: ${decimals}`);
      }
    } catch (error) {
      DebugLogger.core(`⚠️ [toUSD] Failed to get known decimals for ${tokenSymbol}, using config: ${decimals}`);
    }

    // Convert to normalized amount
    const normalizedAmount = parseFloat(correctedRawAmount.toString()) / Math.pow(10, decimals);
    const result = normalizedAmount * price;

    DebugLogger.core(`💵 USD CALCULATION: ${normalizedAmount.toFixed(6)} ${tokenSymbol} * $${price} = $${result.toFixed(2)} USD`);
    DebugLogger.core(`   📊 Raw: ${rawAmount}, Decimals: ${decimals}, Price: $${price}`);

    // Apply price capping based on configuration
    const cappedResult = this.applyPriceCapping(result, normalizedAmount, tokenSymbol, tokenConfig, attackPattern);
    
    return cappedResult;
  }

  /**
   * Apply configurable price capping to prevent extreme values
   */
  private applyPriceCapping(
    result: number,
    normalizedAmount: number,
    tokenSymbol: string,
    tokenConfig: TokenConfig,
    attackPattern?: string
  ): number {
    // Get price cap settings (attack-specific or default)
    const priceCapSettings = this.tokenConfigManager.getPriceCapSettings(attackPattern);
    
    if (!priceCapSettings.enableCapping) {
      return result;
    }

    // Check if result exceeds extreme value threshold
    if (result > priceCapSettings.extremeValueThreshold) {
      DebugLogger.core(`⚠️ [PriceCap] Extreme value detected: $${result.toFixed(0)} for ${normalizedAmount.toFixed(6)} ${tokenSymbol}`);

      // Apply token-specific limits if available
      const priceLimits = tokenConfig.priceLimits;
      if (priceLimits) {
        // Check if normalized amount exceeds reasonable amount
        if (normalizedAmount > priceLimits.maxReasonableAmount) {
          const cappedAmount = priceLimits.maxReasonableAmount;
          const cappedResult = cappedAmount * (result / normalizedAmount); // Maintain price ratio
          DebugLogger.core(`   🔧 [PriceCap] ${tokenSymbol} amount capped: ${normalizedAmount.toFixed(6)} -> ${cappedAmount.toFixed(6)} = $${cappedResult.toFixed(2)}`);
          DebugLogger.core(`   📋 Reason: ${priceLimits.description}`);
          return cappedResult;
        }

        // Check if USD value exceeds token-specific limit
        if (result > priceLimits.maxUSDValue) {
          DebugLogger.core(`   🔧 [PriceCap] ${tokenSymbol} USD capped: $${result.toFixed(2)} -> $${priceLimits.maxUSDValue.toFixed(2)}`);
          DebugLogger.core(`   📋 Reason: ${priceLimits.description}`);
          return priceLimits.maxUSDValue;
        }
      }

      // Apply generic cap if no token-specific limits
      DebugLogger.core(`   🔧 [PriceCap] Generic cap applied: $${result.toFixed(2)} -> $${priceCapSettings.maxGenericUSD.toFixed(2)}`);
      DebugLogger.core(`   📋 Reason: ${priceCapSettings.description}`);
      return priceCapSettings.maxGenericUSD;
    }

    return result;
  }

  /**
   * Get token configuration with fallback
   */
  private getTokenConfig(tokenSymbol: string, tokenAddr: string): TokenConfig {
    let tokenConfig = this.tokenConfigManager.getTokenBySymbol(tokenSymbol);
    if (!tokenConfig) {
      tokenConfig = this.tokenConfigManager.getTokenByAddress(tokenAddr);
    }
    
    if (!tokenConfig) {
      tokenConfig = this.createFallbackTokenConfig(tokenSymbol, tokenAddr);
    }
    
    return tokenConfig;
  }

  /**
   * Get token decimals with fallback logic
   */
  private getTokenDecimals(tokenSymbol: string, tokenAddr: string, tokenConfig: TokenConfig): number {
    let decimals = tokenConfig.decimals;
    try {
      const actualDecimals = TokenDecimalFetcher.getKnownTokenDecimals(tokenSymbol, tokenAddr);
      if (actualDecimals !== null) {
        decimals = actualDecimals;
      }
    } catch (error) {
      // Use config decimals as fallback
    }
    return decimals;
  }

  /**
   * Create fallback token configuration when none exists
   */
  private createFallbackTokenConfig(tokenSymbol: string, tokenAddr: string): TokenConfig {
    const fallbackDecimals = this.tokenConfigManager.getPriceCapSettings().enableCapping ? 18 : 18;
    
    return {
      symbol: tokenSymbol,
      address: tokenAddr,
      decimals: fallbackDecimals,
      defaultPrice: 1, // Conservative fallback
      historicalPrices: [],
      priceLimits: {
        maxReasonableAmount: 1000000, // 1M tokens
        maxUSDValue: 1000000, // $1M
        description: "Fallback limits for unknown token"
      }
    };
  }

  /**
   * Load token configuration from JSON file with dynamic metadata loading
   */
  static async loadFromConfig(configPath: string): Promise<ConfigurableToUSD> {
    try {
      const fs = await import('fs');
      const configData = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      const tokenManager = new TokenConfigManager();
      tokenManager.loadConfig(configData);
      
      const validation = tokenManager.validateConfig();
      if (!validation.isValid) {
        // Temporarily suppress token validation errors during development
        // DebugLogger.error(`Token config validation failed: ${validation.errors.join(', ')}`);
      }
      
      // Initialize dynamic metadata loader
      const metadataLoader = await initializeTokenMetadata(configPath);
      
      DebugLogger.core(`✅ Loaded token configuration: ${tokenManager.getConfigSummary()}`);
      DebugLogger.core(`✅ Initialized dynamic metadata loader with ${metadataLoader.getCacheStats().size} cached entries`);
      
      return new ConfigurableToUSD(tokenManager, metadataLoader);
    } catch (error) {
      DebugLogger.error(`Failed to load token config from ${configPath}: ${error}`);
      // Return with default configuration and basic metadata loader
      const metadataLoader = await initializeTokenMetadata();
      return new ConfigurableToUSD(new TokenConfigManager(), metadataLoader);
    }
  }

  /**
   * Get summary of current configuration
   */
  getConfigSummary(): string {
    return this.tokenConfigManager.getConfigSummary();
  }
}

// Utility function to maintain backward compatibility
export async function createConfigurableToUSD(configPath?: string): Promise<ConfigurableToUSD> {
  if (configPath) {
    return ConfigurableToUSD.loadFromConfig(configPath);
  } else {
    // Use default config with common tokens and dynamic metadata loading
    const tokenManager = new TokenConfigManager();
    const metadataLoader = await initializeTokenMetadata();
    return new ConfigurableToUSD(tokenManager, metadataLoader);
  }
}

// Global instance for batch operations
let globalConfigurableToUSD: ConfigurableToUSD | undefined;

/**
 * Initialize global ConfigurableToUSD instance
 */
export async function initializeGlobalConfigurableToUSD(configPath?: string): Promise<ConfigurableToUSD> {
  globalConfigurableToUSD = await createConfigurableToUSD(configPath);
  return globalConfigurableToUSD;
}

/**
 * Get global ConfigurableToUSD instance
 */
export function getGlobalConfigurableToUSD(): ConfigurableToUSD | undefined {
  return globalConfigurableToUSD;
}

/**
 * Batch convert multiple tokens to USD using global instance
 * Utility function for components that need batch processing
 */
export async function batchToUSD(
  requests: Array<{
    rawAmount: any;
    tokenSymbol: string;
    tokenAddr: string;
    blockNo: number;
    attackPattern?: string;
  }>
): Promise<number[]> {
  if (!globalConfigurableToUSD) {
    // Initialize with default config if not set
    await initializeGlobalConfigurableToUSD();
  }
  
  return globalConfigurableToUSD!.convertBatchToUSD(requests);
}