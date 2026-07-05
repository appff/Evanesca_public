// Token configuration interfaces and system
export interface TokenPriceLimits {
  maxReasonableAmount: number;
  maxUSDValue: number;
  description: string;
}

export interface HistoricalPrice {
  blockNumber: number;
  price: number;
  source: 'historical' | 'oracle' | 'manual';
  timestamp?: number;
  attackPattern?: string;
}

export interface TokenConfig {
  symbol: string;
  address: string;
  decimals: number;
  defaultPrice: number; // Fallback price when historical data unavailable
  historicalPrices: HistoricalPrice[];
  priceLimits?: TokenPriceLimits;
  aliases?: string[]; // Alternative symbols (e.g., ['WETH', 'ETH'])
}

export interface PriceCapSettings {
  maxGenericUSD: number;
  extremeValueThreshold: number;
  enableCapping: boolean;
  description: string;
}

export interface AttackPatternConfig {
  name: string;
  description: string;
  blockRange?: {
    start: number;
    end: number;
  };
  tokens: TokenConfig[];
  priceCapSettings: PriceCapSettings;
  protocolSpecificSettings?: { [key: string]: any };
}

export interface TokenRegistryConfig {
  version: string;
  lastUpdated: string;
  defaultSettings: {
    priceCapSettings: PriceCapSettings;
    fallbackDecimals: number;
  };
  attackPatterns: { [attackName: string]: AttackPatternConfig };
  commonTokens: TokenConfig[];
}

// Token configuration manager
export class TokenConfigManager {
  private config: TokenRegistryConfig;
  private tokenMap: Map<string, TokenConfig> = new Map();
  private addressMap: Map<string, TokenConfig> = new Map();

  constructor(config?: TokenRegistryConfig) {
    this.config = config || this.getDefaultConfig();
    this.buildMaps();
  }

  // Load configuration from JSON file or object
  loadConfig(config: TokenRegistryConfig): void {
    this.config = config;
    this.buildMaps();
  }

  // Get token configuration by symbol
  getTokenBySymbol(symbol: string): TokenConfig | undefined {
    // Check direct symbol match
    if (this.tokenMap.has(symbol.toLowerCase())) {
      return this.tokenMap.get(symbol.toLowerCase());
    }

    // Check aliases
    for (const [, tokenConfig] of this.tokenMap) {
      if (tokenConfig.aliases?.some(alias => alias.toLowerCase() === symbol.toLowerCase())) {
        return tokenConfig;
      }
    }

    return undefined;
  }

  // Get token configuration by address
  getTokenByAddress(address: string): TokenConfig | undefined {
    const normalizedAddress = address.toLowerCase();
    return this.addressMap.get(normalizedAddress);
  }

  // Get historical price for specific block
  getHistoricalPrice(symbol: string, blockNumber: number): number | undefined {
    const token = this.getTokenBySymbol(symbol);
    if (!token) return undefined;

    // Find exact block match first
    const exactMatch = token.historicalPrices.find(price => price.blockNumber === blockNumber);
    if (exactMatch) return exactMatch.price;

    // Find closest block (within reasonable range)
    const sortedPrices = token.historicalPrices
      .filter(price => Math.abs(price.blockNumber - blockNumber) <= 1000) // Within 1000 blocks
      .sort((a, b) => Math.abs(a.blockNumber - blockNumber) - Math.abs(b.blockNumber - blockNumber));

    if (sortedPrices.length > 0) {
      return sortedPrices[0].price;
    }

    // Fallback to default price
    return token.defaultPrice;
  }

  // Get price limits for token
  getPriceLimits(symbol: string): TokenPriceLimits | undefined {
    const token = this.getTokenBySymbol(symbol);
    return token?.priceLimits;
  }

  // Get attack pattern configuration
  getAttackPatternConfig(attackName: string): AttackPatternConfig | undefined {
    return this.config.attackPatterns[attackName.toLowerCase()];
  }

  // Get price cap settings (with fallback to default)
  getPriceCapSettings(attackName?: string): PriceCapSettings {
    if (attackName) {
      const attackConfig = this.getAttackPatternConfig(attackName);
      if (attackConfig) {
        return attackConfig.priceCapSettings;
      }
    }
    return this.config.defaultSettings.priceCapSettings;
  }

  // Add or update token configuration
  addToken(token: TokenConfig): void {
    this.config.commonTokens.push(token);
    this.buildMaps();
  }

  // Build internal maps for fast lookup
  private buildMaps(): void {
    this.tokenMap.clear();
    this.addressMap.clear();

    // Add common tokens
    for (const token of this.config.commonTokens) {
      this.tokenMap.set(token.symbol.toLowerCase(), token);
      this.addressMap.set(token.address.toLowerCase(), token);
    }

    // Add tokens from attack patterns
    for (const [, attackPattern] of Object.entries(this.config.attackPatterns)) {
      for (const token of attackPattern.tokens) {
        this.tokenMap.set(token.symbol.toLowerCase(), token);
        this.addressMap.set(token.address.toLowerCase(), token);
      }
    }
  }

  // Get default configuration
  private getDefaultConfig(): TokenRegistryConfig {
    return {
      version: "1.0.0",
      lastUpdated: new Date().toISOString(),
      defaultSettings: {
        priceCapSettings: {
          maxGenericUSD: 10000000, // $10M default cap
          extremeValueThreshold: 1000000000, // $1B threshold
          enableCapping: true,
          description: "Default price capping to prevent extreme values"
        },
        fallbackDecimals: 18
      },
      attackPatterns: {},
      commonTokens: []
    };
  }

  // Get all token symbols from configuration
  getAllTokenSymbols(): string[] {
    const symbols: string[] = [];
    
    // Add common tokens
    for (const token of this.config.commonTokens) {
      symbols.push(token.symbol);
    }
    
    // Add tokens from attack patterns
    for (const [, attackPattern] of Object.entries(this.config.attackPatterns)) {
      for (const token of attackPattern.tokens) {
        if (!symbols.includes(token.symbol)) {
          symbols.push(token.symbol);
        }
      }
    }
    
    return symbols;
  }

  // Validate configuration
  validateConfig(): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Collect all tokens from both commonTokens and attackPatterns
    const allTokens: (TokenConfig & { source: string })[] = [];
    
    // Add common tokens
    for (const token of this.config.commonTokens) {
      allTokens.push({ ...token, source: 'commonTokens' });
    }
    
    // Add tokens from attack patterns
    for (const [attackName, attackPattern] of Object.entries(this.config.attackPatterns)) {
      for (const token of attackPattern.tokens) {
        allTokens.push({ ...token, source: `attackPattern:${attackName}` });
      }
    }

    // Check for duplicate symbol+address combinations (same token defined multiple times)
    const tokenKeys = new Set<string>();
    for (const token of allTokens) {
      const key = `${token.symbol.toLowerCase()}:${token.address.toLowerCase()}`;
      if (tokenKeys.has(key)) {
        errors.push(`Duplicate token definition: ${token.symbol} at ${token.address}`);
      }
      tokenKeys.add(key);
    }

    // Check for duplicate addresses with different symbols (same contract, different symbol)
    const addresses = new Map<string, { symbol: string; source: string }>();
    for (const token of allTokens) {
      const addr = token.address.toLowerCase();
      if (addresses.has(addr)) {
        const existing = addresses.get(addr)!;
        if (existing.symbol !== token.symbol) {
          errors.push(`Address conflict: ${token.address} used for both ${existing.symbol} and ${token.symbol}`);
        }
      } else {
        addresses.set(addr, { symbol: token.symbol, source: token.source });
      }
    }

    // Validate decimals for all tokens
    for (const token of allTokens) {
      if (token.decimals < 0 || token.decimals > 18) {
        errors.push(`Invalid decimals for ${token.symbol}: ${token.decimals}`);
      }
    }

    // Validate prices for all tokens
    for (const token of allTokens) {
      if (token.defaultPrice <= 0) {
        errors.push(`Invalid default price for ${token.symbol}: ${token.defaultPrice}`);
      }
      if (token.historicalPrices && Array.isArray(token.historicalPrices)) {
        for (const price of token.historicalPrices) {
          if (price.price <= 0) {
            errors.push(`Invalid historical price for ${token.symbol} at block ${price.blockNumber}: ${price.price}`);
          }
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  // Export configuration to JSON
  exportConfig(): string {
    return JSON.stringify(this.config, null, 2);
  }

  // Get configuration summary
  getConfigSummary(): string {
    const tokenCount = this.config.commonTokens.length;
    const attackPatternCount = Object.keys(this.config.attackPatterns).length;
    const totalHistoricalPrices = this.config.commonTokens.reduce(
      (sum, token) => sum + (token.historicalPrices ? token.historicalPrices.length : 0), 0
    );

    return `TokenConfig Summary:
- Version: ${this.config.version}
- Last Updated: ${this.config.lastUpdated}
- Common Tokens: ${tokenCount}
- Attack Patterns: ${attackPatternCount}
- Historical Prices: ${totalHistoricalPrices}
- Default Price Cap: $${this.config.defaultSettings.priceCapSettings.maxGenericUSD.toLocaleString()}`;
  }
}

// Global instance (can be replaced with dependency injection)
let globalTokenConfig: TokenConfigManager | undefined;

export function getGlobalTokenConfig(): TokenConfigManager {
  if (!globalTokenConfig) {
    globalTokenConfig = new TokenConfigManager();
  }
  return globalTokenConfig;
}

export function setGlobalTokenConfig(config: TokenConfigManager): void {
  globalTokenConfig = config;
}