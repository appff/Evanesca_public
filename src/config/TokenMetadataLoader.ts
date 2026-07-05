import { TokenConfigManager, TokenRegistryConfig, TokenConfig } from './TokenConfig';
import { DebugLogger } from '../Utils/DebugLogger';
import * as fs from 'fs';
import * as path from 'path';

export interface TokenMetadataSource {
  name: string;
  priority: number; // Higher priority = more trusted
  loadTokenMetadata(symbol: string, address: string): Promise<Partial<TokenConfig> | null>;
}

// Load token metadata from JSON configuration files
export class JSONConfigSource implements TokenMetadataSource {
  name = 'JSON Config';
  priority = 100;
  private configPath: string;

  constructor(configPath: string) {
    this.configPath = configPath;
  }

  async loadTokenMetadata(symbol: string, address: string): Promise<Partial<TokenConfig> | null> {
    try {
      if (!fs.existsSync(this.configPath)) {
        DebugLogger.core(`⚠️ JSON config file not found: ${this.configPath}`);
        return null;
      }

      const configData: TokenRegistryConfig = JSON.parse(fs.readFileSync(this.configPath, 'utf8'));
      
      // Search in common tokens first
      for (const token of configData.commonTokens) {
        if (token.symbol.toLowerCase() === symbol.toLowerCase() || 
            token.address.toLowerCase() === address.toLowerCase()) {
          return token;
        }
      }

      // Search in attack pattern tokens
      for (const [, attackPattern] of Object.entries(configData.attackPatterns)) {
        for (const token of attackPattern.tokens) {
          if (token.symbol.toLowerCase() === symbol.toLowerCase() || 
              token.address.toLowerCase() === address.toLowerCase()) {
            return token;
          }
        }
      }

      return null;
    } catch (error) {
      DebugLogger.error(`Failed to load token metadata from JSON: ${error}`);
      return null;
    }
  }
}

// Load token metadata from on-chain sources (Web3)
export class Web3MetadataSource implements TokenMetadataSource {
  name = 'Web3 On-chain';
  priority = 80;

  async loadTokenMetadata(symbol: string, address: string): Promise<Partial<TokenConfig> | null> {
    try {
      // Check if it's a valid Ethereum address
      if (!this.isValidAddress(address)) {
        return null;
      }

      // For now, return basic metadata for known addresses
      // In a full implementation, this would make actual Web3 calls
      const knownTokens: { [key: string]: Partial<TokenConfig> } = {
        '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2': {
          symbol: 'WETH',
          decimals: 18,
          defaultPrice: 3000
        },
        '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599': {
          symbol: 'WBTC',
          decimals: 8,
          defaultPrice: 45000
        },
        '0xdac17f958d2ee523a2206206994597c13d831ec7': {
          symbol: 'USDT',
          decimals: 6,
          defaultPrice: 1
        },
        '0xa0b86a33e6ba6d5d82c4103a6d5d44a61c5b5b27': {
          symbol: 'USDC',
          decimals: 6,
          defaultPrice: 1
        }
      };

      const metadata = knownTokens[address.toLowerCase()];
      if (metadata) {
        DebugLogger.core(`📡 Web3 metadata found for ${address}: ${metadata.symbol}`);
        return {
          ...metadata,
          address: address,
          historicalPrices: []
        };
      }

      return null;
    } catch (error) {
      DebugLogger.error(`Failed to load Web3 metadata for ${address}: ${error}`);
      return null;
    }
  }

  private isValidAddress(address: string): boolean {
    return /^0x[a-fA-F0-9]{40}$/.test(address);
  }
}

// Load token metadata from external APIs (CoinGecko, etc.)
export class ExternalAPISource implements TokenMetadataSource {
  name = 'External API';
  priority = 60;

  async loadTokenMetadata(symbol: string, address: string): Promise<Partial<TokenConfig> | null> {
    try {
      // Mock external API response - in real implementation would call CoinGecko API
      const mockAPIResponse: { [key: string]: Partial<TokenConfig> } = {
        'eth': {
          symbol: 'ETH',
          decimals: 18,
          defaultPrice: 3000
        },
        'weth': {
          symbol: 'WETH',
          decimals: 18,
          defaultPrice: 3000
        },
        'btc': {
          symbol: 'WBTC',
          decimals: 8,
          defaultPrice: 45000
        },
        'usdt': {
          symbol: 'USDT',
          decimals: 6,
          defaultPrice: 1
        }
      };

      const metadata = mockAPIResponse[symbol.toLowerCase()];
      if (metadata) {
        DebugLogger.core(`🌐 External API metadata found for ${symbol}`);
        return {
          ...metadata,
          address: address,
          historicalPrices: []
        };
      }

      return null;
    } catch (error) {
      DebugLogger.error(`Failed to load external API metadata for ${symbol}: ${error}`);
      return null;
    }
  }
}

// Fallback source with reasonable defaults
export class FallbackMetadataSource implements TokenMetadataSource {
  name = 'Fallback';
  priority = 10;

  async loadTokenMetadata(symbol: string, address: string): Promise<Partial<TokenConfig> | null> {
    DebugLogger.core(`🔄 Using fallback metadata for ${symbol} (${address})`);
    
    return {
      symbol: symbol,
      address: address,
      decimals: 18, // Most ERC20 tokens use 18 decimals
      defaultPrice: 1, // Conservative default
      historicalPrices: [],
      priceLimits: {
        maxReasonableAmount: 1000000,
        maxUSDValue: 1000000,
        description: 'Fallback limits for unknown token'
      }
    };
  }
}

// Dynamic token metadata loader that aggregates multiple sources
export class DynamicTokenMetadataLoader {
  private sources: TokenMetadataSource[] = [];
  private cache: Map<string, TokenConfig> = new Map();
  private cacheExpiry: Map<string, number> = new Map();
  private cacheTimeoutMs: number = 5 * 60 * 1000; // 5 minutes

  constructor() {
    // Register default sources in priority order
    this.addSource(new FallbackMetadataSource());
    this.addSource(new ExternalAPISource());
    this.addSource(new Web3MetadataSource());
  }

  // Add a metadata source
  addSource(source: TokenMetadataSource): void {
    this.sources.push(source);
    // Sort by priority (highest first)
    this.sources.sort((a, b) => b.priority - a.priority);
    DebugLogger.core(`➕ Added metadata source: ${source.name} (priority: ${source.priority})`);
  }

  // Load JSON configuration as the highest priority source
  loadJSONConfig(configPath: string): void {
    const jsonSource = new JSONConfigSource(configPath);
    this.addSource(jsonSource);
    DebugLogger.core(`📁 Loaded JSON config from: ${configPath}`);
  }

  // Get token metadata with caching and fallback logic
  async getTokenMetadata(symbol: string, address: string): Promise<TokenConfig> {
    const cacheKey = `${symbol.toLowerCase()}_${address.toLowerCase()}`;
    
    // Check cache first
    if (this.cache.has(cacheKey)) {
      const expiry = this.cacheExpiry.get(cacheKey) || 0;
      if (Date.now() < expiry) {
        DebugLogger.core(`💾 Cache hit for ${symbol} (${address})`);
        return this.cache.get(cacheKey)!;
      } else {
        // Cache expired, remove it
        this.cache.delete(cacheKey);
        this.cacheExpiry.delete(cacheKey);
      }
    }

    // Try each source in priority order
    let tokenConfig: TokenConfig | null = null;
    
    for (const source of this.sources) {
      try {
        DebugLogger.core(`🔍 Trying metadata source: ${source.name} for ${symbol}`);
        const metadata = await source.loadTokenMetadata(symbol, address);
        
        if (metadata) {
          // Create complete token config by merging with defaults
          tokenConfig = this.mergeWithDefaults(metadata, symbol, address);
          DebugLogger.core(`✅ Token metadata loaded from ${source.name}: ${symbol}`);
          break;
        }
      } catch (error) {
        DebugLogger.error(`❌ Source ${source.name} failed for ${symbol}: ${error}`);
        continue;
      }
    }

    // This should never happen due to fallback source, but just in case
    if (!tokenConfig) {
      tokenConfig = this.createMinimalConfig(symbol, address);
    }

    // Cache the result
    this.cache.set(cacheKey, tokenConfig);
    this.cacheExpiry.set(cacheKey, Date.now() + this.cacheTimeoutMs);

    return tokenConfig;
  }

  // Merge partial metadata with sensible defaults
  private mergeWithDefaults(metadata: Partial<TokenConfig>, symbol: string, address: string): TokenConfig {
    return {
      symbol: metadata.symbol || symbol,
      address: metadata.address || address,
      decimals: metadata.decimals || 18,
      defaultPrice: metadata.defaultPrice || 1,
      historicalPrices: metadata.historicalPrices || [],
      priceLimits: metadata.priceLimits,
      aliases: metadata.aliases
    };
  }

  // Create minimal configuration as last resort
  private createMinimalConfig(symbol: string, address: string): TokenConfig {
    return {
      symbol: symbol,
      address: address,
      decimals: 18,
      defaultPrice: 1,
      historicalPrices: [],
      priceLimits: {
        maxReasonableAmount: 1000000,
        maxUSDValue: 1000000,
        description: 'Minimal default limits'
      }
    };
  }

  // Clear cache
  clearCache(): void {
    this.cache.clear();
    this.cacheExpiry.clear();
    DebugLogger.core(`🗑️ Token metadata cache cleared`);
  }

  // Get cache statistics
  getCacheStats(): { size: number; hitRate: string } {
    const size = this.cache.size;
    // This is a simplified hit rate calculation
    return {
      size,
      hitRate: size > 0 ? 'Available' : 'Empty'
    };
  }

  // Create TokenConfigManager with dynamic loading
  createTokenConfigManager(): TokenConfigManager {
    const configManager = new TokenConfigManager();
    
    // Note: Dynamic loading will be handled separately in ConfigurableToUSD
    // since we can't override sync methods with async ones
    
    return configManager;
  }
}

// Global instance for easy access
let globalMetadataLoader: DynamicTokenMetadataLoader | undefined;

export function getGlobalMetadataLoader(): DynamicTokenMetadataLoader {
  if (!globalMetadataLoader) {
    globalMetadataLoader = new DynamicTokenMetadataLoader();
  }
  return globalMetadataLoader;
}

export function setGlobalMetadataLoader(loader: DynamicTokenMetadataLoader): void {
  globalMetadataLoader = loader;
}

// Initialize with default configuration
export async function initializeTokenMetadata(configPath?: string): Promise<DynamicTokenMetadataLoader> {
  const loader = new DynamicTokenMetadataLoader();
  
  if (configPath && fs.existsSync(configPath)) {
    loader.loadJSONConfig(configPath);
  } else {
    // Try to find default config files
    const defaultPaths = [
      path.join(__dirname, 'tokens.json'),
      path.join(process.cwd(), 'src/config/tokens.json'),
      path.join(process.cwd(), 'config/tokens.json')
    ];
    
    for (const defaultPath of defaultPaths) {
      if (fs.existsSync(defaultPath)) {
        loader.loadJSONConfig(defaultPath);
        DebugLogger.core(`📁 Auto-loaded config from: ${defaultPath}`);
        break;
      }
    }
  }
  
  return loader;
}