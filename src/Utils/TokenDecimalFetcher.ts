// Token Decimal Fetcher - 컨트랙트에서 실제 decimals 값을 동적으로 가져오기
import { DebugLogger } from "./DebugLogger";
import { providerManager, web3 } from "../PreTasks";

export class TokenDecimalFetcher {
  private static decimalCache = new Map<string, number>();
  
  // ERC20 표준 decimals() 함수를 통해 실제 decimal 값 가져오기
  static async getTokenDecimals(tokenAddress: string, tokenSymbol: string, blockNumber: number): Promise<number> {
    // Decimals are a property of the token contract (address), not the symbol.
    // Cache by address to avoid repeated calls when symbol strings vary (e.g., UNKNOWN_*).
    const cacheKey = tokenAddress.toLowerCase();
    if (this.decimalCache.has(cacheKey)) {
      return this.decimalCache.get(cacheKey)!;
    }
    
    // ETH address 0x0 (burn) 특별 처리
    if (tokenAddress === '0x0' || tokenAddress === '0x0000000000000000000000000000000000000000') {
      DebugLogger.price(`🔥 [Decimals] ETH address 0x0 detected - treating as burn (18 decimals)`);
      const decimals = 18;
      this.decimalCache.set(cacheKey, decimals);
      return decimals;
    }
    
    // 알려진 토큰들의 decimals (fallback)
    const knownDecimals = this.getKnownTokenDecimals(tokenSymbol, tokenAddress);
    if (knownDecimals !== null) {
      DebugLogger.price(`📚 [Decimals] Known token ${tokenSymbol}: ${knownDecimals} decimals`);
      this.decimalCache.set(cacheKey, knownDecimals);
      return knownDecimals;
    }
    
    // TODO: Implement actual contract call to fetch decimals()
    // Currently using ERC20 standard decimals as fallback
    try {
      const decimals = await this.fetchDecimalsFromContract(tokenAddress, blockNumber);
      DebugLogger.core(`🔗 [Decimals] Contract ${tokenAddress} (${tokenSymbol}): ${decimals} decimals`);
      this.decimalCache.set(cacheKey, decimals);
      return decimals;
    } catch (error) {
      DebugLogger.price(`⚠️ [Decimals] Failed to fetch from contract ${tokenAddress}, using default`);
      const defaultDecimals = this.getDefaultDecimals(tokenSymbol);
      this.decimalCache.set(cacheKey, defaultDecimals);
      return defaultDecimals;
    }
  }
  
  // Known token decimals (exact values) - public for external access
  public static getKnownTokenDecimals(tokenSymbol: string, tokenAddress: string): number | null {
    const knownTokens: { [key: string]: { address: string; decimals: number; }[] } = {
      'WETH': [
        { address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', decimals: 18 }
      ],
      'WBTC': [
        { address: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599', decimals: 8 }
      ],
      'USDC': [
        { address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', decimals: 6 },
        { address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', decimals: 6 },
        { address: '0xA0b86a33E6411D5471ff1B2a79C4B02cE24eEa15', decimals: 6 },
        { address: '0xa0b86a33e6411d5471ff1b2a79c4b02ce24eea15', decimals: 6 }
      ],
      'USDT': [
        { address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', decimals: 6 }
      ],
      'DAI': [
        { address: '0x6B175474E89094C44Da98b954EedeAC495271d0F', decimals: 18 }
      ]
    };
    
    if (knownTokens[tokenSymbol]) {
      for (const token of knownTokens[tokenSymbol]) {
        if (token.address.toLowerCase() === tokenAddress.toLowerCase()) {
          return token.decimals;
        }
      }
    }
    
    return null;
  }
  
  // Fetch actual decimals() from contract (to be implemented with web3 connection)
  private static async fetchDecimalsFromContract(tokenAddress: string, blockNumber: number): Promise<number> {
    const ABI_DECIMALS = {
      name: "decimals",
      type: "function" as const,
      inputs: [] as { type: string; name: string }[],
    };

    const data = web3.eth.abi.encodeFunctionCall(ABI_DECIMALS as any, []);
    const blockTag = web3.utils.numberToHex(blockNumber);

    const raw = await providerManager.executeWithFailover(
      (w3) => w3.eth.call({ to: tokenAddress, data }, blockTag),
      "decimals()",
    );

    const decoded = web3.eth.abi.decodeParameter("uint8", raw);
    const n = Number(decoded);
    if (!Number.isFinite(n) || n < 0 || n > 255) {
      throw new Error(`Invalid decimals(): ${decoded}`);
    }
    return n;
  }
  
  // 기본값 (ERC20 표준)
  private static getDefaultDecimals(tokenSymbol: string): number {
    const defaults: { [key: string]: number } = {
      'ETH': 18,
      'WETH': 18,
      'WBTC': 8,
      'USDC': 6,
      'USDT': 6,
      'DAI': 18,
      'BTC': 8
    };
    
    return defaults[tokenSymbol] || 18; // ERC20 기본값
  }
  
  /**
   * Generic decimal validation and normalization
   * Replaces case-specific bZx logic with universal approach
   */
  static validateAndNormalizeAmount(rawAmount: string | number, tokenSymbol: string, tokenAddress: string): {
    normalizedAmount: number;
    decimals: number;
    isValid: boolean;
    explanation: string;
  } {
    const numericAmount = typeof rawAmount === 'string' ? parseFloat(rawAmount) : rawAmount;
    
    // Get proper decimals for this token
    const decimals = this.getKnownTokenDecimals(tokenSymbol, tokenAddress) || this.getDefaultDecimals(tokenSymbol);
    
    // Validate amount is reasonable for the given decimals
    const maxReasonableAmount = Math.pow(10, decimals + 10); // 10 orders of magnitude above normal
    const minReasonableAmount = 1; // Minimum 1 wei/unit
    
    const isValid = numericAmount >= minReasonableAmount && numericAmount <= maxReasonableAmount;
    
    if (!isValid) {
      DebugLogger.price(`⚠️ [TokenDecimal] Suspicious amount detected: ${numericAmount} for ${tokenSymbol} (decimals: ${decimals})`);
    }
    
    // Normalize to human-readable amount
    const normalizedAmount = numericAmount / Math.pow(10, decimals);
    
    return {
      normalizedAmount,
      decimals,
      isValid,
      explanation: `Normalized ${numericAmount} ${tokenSymbol} to ${normalizedAmount.toFixed(6)} using ${decimals} decimals`
    };
  }
  
  /**
   * @deprecated Use validateAndNormalizeAmount instead
   * Kept for backward compatibility, will be removed in future versions
   */
  static detectAndFixBZxDecimalIssues(rawAmount: string | number, tokenSymbol: string, tokenAddress: string): {
    correctedAmount: string | number;
    isFixed: boolean;
    explanation: string;
  } {
    // Delegate to generic validation system
    const result = this.validateAndNormalizeAmount(rawAmount, tokenSymbol, tokenAddress);
    
    return {
      correctedAmount: rawAmount, // Keep original for backward compatibility
      isFixed: !result.isValid,
      explanation: result.explanation
    };
  }
  
  // 캐시 초기화 (테스트용)
  static clearCache(): void {
    this.decimalCache.clear();
  }
} 
