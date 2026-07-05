import { web3 } from "../../PreTasks";
import { PersistentPriceCache } from "./PersistentPriceCache";
import { DebugLogger } from "../DebugLogger";

// ─── Rate Limiter ──────────────────────────────────────────────────────────────

export class RateLimiter {
  private tokens: number;
  private lastRefill: number;
  private readonly maxTokens: number;
  private readonly refillRate: number;

  constructor(rps: number) {
    this.maxTokens = rps;
    this.tokens = rps;
    this.refillRate = 1000 / rps;
    this.lastRefill = Date.now();
  }

  async acquire(): Promise<void> {
    this.refillTokens();
    if (this.tokens < 1) {
      const waitTime = this.refillRate;
      await new Promise(r => setTimeout(r, waitTime));
      this.refillTokens();
    }
    this.tokens -= 1;
  }

  private refillTokens(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    const tokensToAdd = elapsed / this.refillRate;
    this.tokens = Math.min(this.maxTokens, this.tokens + tokensToAdd);
    this.lastRefill = now;
  }
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

const WETH  = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
const USDC  = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const USDT  = "0xdAC17F958D2ee523a2206206994597C13D831ec7";
const DAI   = "0x6B175474E89094C44Da98b954EedeAC495271d0F";

// Uniswap V2 Factory (Ethereum mainnet)
const UNISWAP_V2_FACTORY = "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f";
const UNISWAP_V3_FACTORY = "0x1F98431c8aD98523631AE4a59f267346ea31F984";

const V2_PAIR_TOKENS = [WETH, USDC, USDT, DAI];
const V3_PAIR_TOKENS = [WETH, USDC, USDT];
const V3_FEE_TIERS   = [3000, 500, 10000];

// ─── ABI fragments (used for encoding / decoding) ─────────────────────────────

const ABI_GET_PAIR = {
  name: "getPair",
  type: "function" as const,
  inputs: [
    { type: "address", name: "tokenA" },
    { type: "address", name: "tokenB" },
  ],
};

const ABI_GET_POOL = {
  name: "getPool",
  type: "function" as const,
  inputs: [
    { type: "address", name: "" },
    { type: "address", name: "" },
    { type: "uint24",  name: "" },
  ],
};

const ABI_GET_RESERVES = {
  name: "getReserves",
  type: "function" as const,
  inputs: [] as { type: string; name: string }[],
};

const ABI_TOKEN0 = {
  name: "token0",
  type: "function" as const,
  inputs: [] as { type: string; name: string }[],
};

const ABI_SLOT0 = {
  name: "slot0",
  type: "function" as const,
  inputs: [] as { type: string; name: string }[],
};

const ABI_DECIMALS = {
  name: "decimals",
  type: "function" as const,
  inputs: [] as { type: string; name: string }[],
};

// ─── OnChainPriceResolver ──────────────────────────────────────────────────────

export class OnChainPriceResolver {
  private poolCache: PersistentPriceCache;
  private rateLimiter?: RateLimiter;
  private decimalsCache: Map<string, number> = new Map();

  constructor(poolCache: PersistentPriceCache, rateLimiter?: RateLimiter) {
    this.poolCache = poolCache;
    this.rateLimiter = rateLimiter;

    // Pre-populate well-known decimals
    this.decimalsCache.set(WETH.toLowerCase(), 18);
    this.decimalsCache.set(USDC.toLowerCase(), 6);
    this.decimalsCache.set(USDT.toLowerCase(), 6);
    this.decimalsCache.set(DAI.toLowerCase(), 18);
  }

  // ─── Public entry point ────────────────────────────────────────────────────

  async getPrice(tokenAddr: string, symbol: string, blockNo: number): Promise<number> {
    if (!tokenAddr || tokenAddr === ZERO_ADDRESS) {
      return 0;
    }

    const normalized = tokenAddr.toLowerCase();

    // Stablecoins shortcut
    if (normalized === USDC.toLowerCase() || normalized === USDT.toLowerCase() || normalized === DAI.toLowerCase()) {
      return 1.0;
    }

    try {
      // Try Uniswap V2 first
      const v2Price = await this.getV2Price(tokenAddr, blockNo);
      if (v2Price > 0) {
        DebugLogger.price(`[OnChain] V2 price for ${symbol} (${tokenAddr}) at block ${blockNo}: $${v2Price}`);
        return v2Price;
      }
    } catch (err) {
      DebugLogger.error(`[OnChain] V2 engine error for ${symbol}: ${(err as Error).message}`);
    }

    try {
      // Try Uniswap V3
      const v3Price = await this.getV3Price(tokenAddr, blockNo);
      if (v3Price > 0) {
        DebugLogger.price(`[OnChain] V3 price for ${symbol} (${tokenAddr}) at block ${blockNo}: $${v3Price}`);
        return v3Price;
      }
    } catch (err) {
      DebugLogger.error(`[OnChain] V3 engine error for ${symbol}: ${(err as Error).message}`);
    }

    // Derivative-token resolver: Cream cTokens (crX) and Yearn V1 vaults (yX)
    // Both wrap an underlying stablecoin and expose an exchange rate.
    try {
      const derivPrice = await this.getDerivativeTokenPrice(tokenAddr, symbol, blockNo);
      if (derivPrice > 0) {
        DebugLogger.price(`[OnChain] Derivative price for ${symbol} (${tokenAddr}) at block ${blockNo}: $${derivPrice}`);
        return derivPrice;
      }
    } catch (err) {
      DebugLogger.error(`[OnChain] Derivative resolver error for ${symbol}: ${(err as Error).message}`);
    }

    DebugLogger.price(`[OnChain] No on-chain price found for ${symbol} (${tokenAddr}) at block ${blockNo}`);
    return 0;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  Derivative token resolver (Cream cTokens + Yearn V1 vaults)
  //  Strategy: query exchange rate on-chain, multiply by underlying USD price.
  //  Underlying inferred from token symbol suffix.
  // ═══════════════════════════════════════════════════════════════════════════

  private static readonly STABLE_USD_PRICE: Record<string, number> = {
    USDT: 1.0, USDC: 1.0, DAI: 1.0, BUSD: 1.0, TUSD: 1.0, FRAX: 1.0,
    SUSD: 1.0, sUSD: 1.0, GUSD: 1.0, USDP: 1.0, MIM: 1.0, UST: 1.0,
  };

  private inferUnderlyingFromSymbol(symbol: string): string | null {
    if (!symbol) return null;
    const s = symbol.toUpperCase();
    // Cream pattern: crXXX
    if (s.startsWith("CR") && s.length > 2) {
      const inner = s.slice(2);
      if (OnChainPriceResolver.STABLE_USD_PRICE[inner] !== undefined) return inner;
    }
    // Yearn V1 pattern: yXXX (single y prefix); avoid yyXXX
    if (s.startsWith("Y") && !s.startsWith("YY") && s.length > 1) {
      const inner = s.slice(1);
      if (OnChainPriceResolver.STABLE_USD_PRICE[inner] !== undefined) return inner;
    }
    // Yearn-Curve double-y pattern: yyXXX
    if (s.startsWith("YY") && s.length > 2) {
      const inner = s.slice(2);
      if (OnChainPriceResolver.STABLE_USD_PRICE[inner] !== undefined) return inner;
    }
    // Yearn V2 pattern: yvXXX
    if (s.startsWith("YV") && s.length > 2) {
      const inner = s.slice(2);
      if (OnChainPriceResolver.STABLE_USD_PRICE[inner] !== undefined) return inner;
    }
    return null;
  }

  private async getDerivativeTokenPrice(tokenAddr: string, symbol: string, blockNo: number): Promise<number> {
    const underlying = this.inferUnderlyingFromSymbol(symbol);
    if (!underlying) return 0;
    const underlyingPrice = OnChainPriceResolver.STABLE_USD_PRICE[underlying] || 0;
    if (underlyingPrice <= 0) return 0;

    if (this.rateLimiter) await this.rateLimiter.acquire();

    // Try Cream cToken interface: exchangeRateStored() returns rate * 10^18
    // The result is "(underlying / cToken) * 10^18", so price = rate / 10^18 * underlyingPrice
    // (cToken decimals are 8 typically, but exchange rate is normalized regardless)
    try {
      const result = await web3.eth.call(
        { to: tokenAddr, data: "0x182df0f5" }, // exchangeRateStored()
        blockNo,
      );
      if (result && result !== "0x" && result.length >= 66) {
        const rateRaw = BigInt(result);
        if (rateRaw > 0n) {
          // For cToken: rate is scaled by 10^(18 + underlyingDecimals - cTokenDecimals)
          // Most cTokens use 8 decimals, underlying USDT/USDC use 6, DAI 18
          const underlyingDec = (underlying === "USDT" || underlying === "USDC") ? 6 : 18;
          const cTokenDec = 8;
          const scale = 10 ** (18 + underlyingDec - cTokenDec);
          const px = (Number(rateRaw) / scale) * underlyingPrice;
          if (px > 0 && px < 1e6) {
            DebugLogger.price(`[OnChain-deriv] cToken ${symbol}: rate=${rateRaw}, underlying=${underlying}, px=$${px}`);
            return px;
          }
        }
      }
    } catch (e) {
      // not a cToken or call failed — try Yearn next
    }

    // Try Yearn V1 vault: getPricePerFullShare() returns share-price * 10^18
    try {
      const result = await web3.eth.call(
        { to: tokenAddr, data: "0x77c7b8fc" }, // getPricePerFullShare()
        blockNo,
      );
      if (result && result !== "0x" && result.length >= 66) {
        const ppsRaw = BigInt(result);
        if (ppsRaw > 0n) {
          const px = (Number(ppsRaw) / 1e18) * underlyingPrice;
          if (px > 0 && px < 1e6) {
            DebugLogger.price(`[OnChain-deriv] Yearn V1 ${symbol}: pps=${ppsRaw}, underlying=${underlying}, px=$${px}`);
            return px;
          }
        }
      }
    } catch (e) {
      // not a Yearn V1 vault either
    }

    // Try Yearn V2: pricePerShare()
    try {
      const result = await web3.eth.call(
        { to: tokenAddr, data: "0x99530b06" }, // pricePerShare()
        blockNo,
      );
      if (result && result !== "0x" && result.length >= 66) {
        const ppsRaw = BigInt(result);
        if (ppsRaw > 0n) {
          // V2 pricePerShare is scaled to underlying decimals
          const underlyingDec = (underlying === "USDT" || underlying === "USDC") ? 6 : 18;
          const px = (Number(ppsRaw) / Math.pow(10, underlyingDec)) * underlyingPrice;
          if (px > 0 && px < 1e6) {
            DebugLogger.price(`[OnChain-deriv] Yearn V2 ${symbol}: pps=${ppsRaw}, underlying=${underlying}, px=$${px}`);
            return px;
          }
        }
      }
    } catch (e) {
      // give up
    }

    return 0;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  Uniswap V2 Engine
  // ═══════════════════════════════════════════════════════════════════════════

  private async getV2Pool(tokenAddr: string, pairToken: string): Promise<string | null> {
    try {
      // Check cache first
      const cached = await this.poolCache.getPool(tokenAddr, pairToken, "uniswap_v2");
      if (cached) {
        return cached;
      }

      await this.rateLimiter?.acquire();

      const data = web3.eth.abi.encodeFunctionCall(ABI_GET_PAIR, [tokenAddr, pairToken]);
      const result = await web3.eth.call({ to: UNISWAP_V2_FACTORY, data }, "latest");
      const poolAddress = String(web3.eth.abi.decodeParameter("address", result));

      if (!poolAddress || poolAddress === ZERO_ADDRESS) {
        return null;
      }

      await this.poolCache.setPool(tokenAddr, pairToken, "uniswap_v2", poolAddress);
      DebugLogger.price(`[OnChain] V2 pool discovered: ${tokenAddr}/${pairToken} -> ${poolAddress}`);
      return poolAddress;
    } catch (err) {
      DebugLogger.error(`[OnChain] V2 pool discovery error: ${(err as Error).message}`);
      return null;
    }
  }

  private async getV2Price(tokenAddr: string, blockNo: number): Promise<number> {
    for (const pairToken of V2_PAIR_TOKENS) {
      // Skip if trying to price the pair token against itself
      if (tokenAddr.toLowerCase() === pairToken.toLowerCase()) {
        continue;
      }

      const poolAddress = await this.getV2Pool(tokenAddr, pairToken);
      if (!poolAddress) {
        continue;
      }

      try {
        const priceInPairToken = await this.getV2PriceFromPool(
          poolAddress,
          tokenAddr,
          pairToken,
          blockNo,
        );

        if (priceInPairToken <= 0) {
          continue;
        }

        // Convert to USD
        const usdPrice = await this.convertToUsd(priceInPairToken, pairToken, blockNo);
        if (usdPrice > 0) {
          return usdPrice;
        }
      } catch (err) {
        DebugLogger.error(`[OnChain] V2 price from pool error (${pairToken}): ${(err as Error).message}`);
      }
    }

    return 0;
  }

  private async getV2PriceFromPool(
    poolAddress: string,
    tokenAddr: string,
    pairToken: string,
    blockNo: number,
  ): Promise<number> {
    // Get token0
    await this.rateLimiter?.acquire();
    const token0Data = web3.eth.abi.encodeFunctionCall(ABI_TOKEN0, []);
    const token0Result = await web3.eth.call({ to: poolAddress, data: token0Data }, "latest");
    const token0 = String(web3.eth.abi.decodeParameter("address", token0Result)).toLowerCase();

    // Get reserves at target block
    await this.rateLimiter?.acquire();
    const reservesData = web3.eth.abi.encodeFunctionCall(ABI_GET_RESERVES, []);
    const blockHex = web3.utils.numberToHex(blockNo);
    const reservesResult = await web3.eth.call({ to: poolAddress, data: reservesData }, blockHex);
    const decoded = web3.eth.abi.decodeParameters(
      ["uint112", "uint112", "uint32"],
      reservesResult,
    );

    const reserve0 = BigInt(String(decoded[0]));
    const reserve1 = BigInt(String(decoded[1]));

    if (reserve0 === BigInt(0) || reserve1 === BigInt(0)) {
      return 0;
    }

    // Get decimals for both tokens
    const tokenDecimals = await this.getDecimals(tokenAddr);
    const pairDecimals = await this.getDecimals(pairToken);

    const isToken0 = tokenAddr.toLowerCase() === token0;

    let price: number;
    if (isToken0) {
      // token is token0, pair is token1
      // price = (reserve1 / 10^pairDecimals) / (reserve0 / 10^tokenDecimals)
      price = this.computeReservePrice(reserve1, pairDecimals, reserve0, tokenDecimals);
    } else {
      // token is token1, pair is token0
      // price = (reserve0 / 10^pairDecimals) / (reserve1 / 10^tokenDecimals)
      price = this.computeReservePrice(reserve0, pairDecimals, reserve1, tokenDecimals);
    }

    return price;
  }

  /**
   * Computes price = (numeratorReserve / 10^numDecimals) / (denominatorReserve / 10^denomDecimals)
   * i.e. how many units of the numerator token per one unit of the denominator token.
   */
  private computeReservePrice(
    numeratorReserve: bigint,
    numDecimals: number,
    denominatorReserve: bigint,
    denomDecimals: number,
  ): number {
    // Shift to maintain precision: multiply numerator by 10^denomDecimals, denominator by 10^numDecimals
    const shifted = numeratorReserve * BigInt(10 ** denomDecimals);
    const denom   = denominatorReserve * BigInt(10 ** numDecimals);

    if (denom === BigInt(0)) {
      return 0;
    }

    // Use a high-precision integer division then convert
    const PRECISION = BigInt(10 ** 18);
    const result = (shifted * PRECISION) / denom;
    return Number(result) / 1e18;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  Uniswap V3 Engine
  // ═══════════════════════════════════════════════════════════════════════════

  private async getV3Pool(
    tokenAddr: string,
    pairToken: string,
    feeTier: number,
  ): Promise<string | null> {
    try {
      const cached = await this.poolCache.getPool(tokenAddr, pairToken, "uniswap_v3", feeTier);
      if (cached) {
        return cached;
      }

      await this.rateLimiter?.acquire();

      const data = web3.eth.abi.encodeFunctionCall(ABI_GET_POOL, [
        tokenAddr,
        pairToken,
        feeTier.toString(),
      ]);
      const result = await web3.eth.call({ to: UNISWAP_V3_FACTORY, data }, "latest");
      const poolAddress = String(web3.eth.abi.decodeParameter("address", result));

      if (!poolAddress || poolAddress === ZERO_ADDRESS) {
        return null;
      }

      await this.poolCache.setPool(tokenAddr, pairToken, "uniswap_v3", poolAddress, feeTier);
      DebugLogger.price(
        `[OnChain] V3 pool discovered: ${tokenAddr}/${pairToken} fee=${feeTier} -> ${poolAddress}`,
      );
      return poolAddress;
    } catch (err) {
      DebugLogger.error(`[OnChain] V3 pool discovery error: ${(err as Error).message}`);
      return null;
    }
  }

  private async getV3Price(tokenAddr: string, blockNo: number): Promise<number> {
    for (const pairToken of V3_PAIR_TOKENS) {
      if (tokenAddr.toLowerCase() === pairToken.toLowerCase()) {
        continue;
      }

      for (const feeTier of V3_FEE_TIERS) {
        const poolAddress = await this.getV3Pool(tokenAddr, pairToken, feeTier);
        if (!poolAddress) {
          continue;
        }

        try {
          const priceInPairToken = await this.getV3PriceFromPool(
            poolAddress,
            tokenAddr,
            pairToken,
            blockNo,
          );

          if (priceInPairToken <= 0) {
            continue;
          }

          const usdPrice = await this.convertToUsd(priceInPairToken, pairToken, blockNo);
          if (usdPrice > 0) {
            return usdPrice;
          }
        } catch (err) {
          DebugLogger.error(
            `[OnChain] V3 price from pool error (${pairToken} fee=${feeTier}): ${(err as Error).message}`,
          );
        }
      }
    }

    return 0;
  }

  private async getV3PriceFromPool(
    poolAddress: string,
    tokenAddr: string,
    pairToken: string,
    blockNo: number,
  ): Promise<number> {
    // Get token0
    await this.rateLimiter?.acquire();
    const token0Data = web3.eth.abi.encodeFunctionCall(ABI_TOKEN0, []);
    const token0Result = await web3.eth.call({ to: poolAddress, data: token0Data }, "latest");
    const token0 = String(web3.eth.abi.decodeParameter("address", token0Result)).toLowerCase();

    // Read slot0 at target block
    await this.rateLimiter?.acquire();
    const slot0Data = web3.eth.abi.encodeFunctionCall(ABI_SLOT0, []);
    const blockHex = web3.utils.numberToHex(blockNo);
    const slot0Result = await web3.eth.call({ to: poolAddress, data: slot0Data }, blockHex);

    // slot0 returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, ...)
    // We only need sqrtPriceX96 (first 32 bytes after the 0x prefix)
    const sqrtPriceX96Raw = slot0Result.slice(0, 66); // 0x + 64 hex chars
    const sqrtPriceX96 = BigInt(sqrtPriceX96Raw);

    if (sqrtPriceX96 === BigInt(0)) {
      return 0;
    }

    // Get decimals for both tokens
    const tokenDecimals = await this.getDecimals(tokenAddr);
    const pairDecimals = await this.getDecimals(pairToken);

    const isToken0 = tokenAddr.toLowerCase() === token0;

    // sqrtPriceX96 encodes sqrt(token1/token0) * 2^96
    // price(token1/token0) = (sqrtPriceX96 / 2^96)^2
    const Q96 = BigInt(2) ** BigInt(96);
    const num = sqrtPriceX96 * sqrtPriceX96;
    const denom = Q96 * Q96;

    // This gives price of token1 in terms of token0 (raw units)
    // i.e. how many raw token1 per raw token0

    let token0Decimals: number;
    let token1Decimals: number;

    if (isToken0) {
      token0Decimals = tokenDecimals;
      token1Decimals = pairDecimals;
    } else {
      token0Decimals = pairDecimals;
      token1Decimals = tokenDecimals;
    }

    // price(token1/token0) in human-readable = (num / denom) * (10^token0Decimals / 10^token1Decimals)
    // To avoid floating point issues, compute with large precision
    const PRECISION = BigInt(10 ** 18);
    const decimalAdjust = BigInt(10 ** token0Decimals);
    const decimalAdjust2 = BigInt(10 ** token1Decimals);

    // priceToken1PerToken0 = (num * decimalAdjust * PRECISION) / (denom * decimalAdjust2)
    const priceScaled = (num * decimalAdjust * PRECISION) / (denom * decimalAdjust2);
    const priceToken1PerToken0 = Number(priceScaled) / 1e18;

    let price: number;
    if (isToken0) {
      // tokenAddr is token0, pairToken is token1
      // priceToken1PerToken0 = how many pairTokens per 1 token
      price = priceToken1PerToken0;
    } else {
      // tokenAddr is token1, pairToken is token0
      // priceToken1PerToken0 = how many tokenAddrs per 1 pairToken
      // We want: how many pairTokens per 1 tokenAddr = 1 / priceToken1PerToken0
      if (priceToken1PerToken0 === 0) {
        return 0;
      }
      price = 1 / priceToken1PerToken0;
    }

    return price;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  Shared Helpers
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Converts a price denominated in `pairToken` to USD.
   * If pairToken is already a stablecoin (USDC, USDT, DAI), return as-is.
   * If pairToken is WETH, resolve WETH/USD via V2 USDC pool.
   */
  private async convertToUsd(
    priceInPairToken: number,
    pairToken: string,
    blockNo: number,
  ): Promise<number> {
    const pt = pairToken.toLowerCase();

    // Stablecoins are ~$1
    if (pt === USDC.toLowerCase() || pt === USDT.toLowerCase() || pt === DAI.toLowerCase()) {
      return priceInPairToken;
    }

    // WETH -> get WETH price in USD via USDC V2 pool
    if (pt === WETH.toLowerCase()) {
      const wethUsd = await this.getWethUsdPrice(blockNo);
      if (wethUsd > 0) {
        return priceInPairToken * wethUsd;
      }
    }

    return 0;
  }

  /**
   * Gets WETH/USD price by querying WETH/USDC V2 pool directly.
   * This avoids infinite recursion since it does not go through getV2Price.
   */
  private async getWethUsdPrice(blockNo: number): Promise<number> {
    const poolAddress = await this.getV2Pool(WETH, USDC);
    if (!poolAddress) {
      // Fallback: try V3 pool WETH/USDC 500 fee tier
      return this.getWethUsdPriceV3(blockNo);
    }

    try {
      const price = await this.getV2PriceFromPool(poolAddress, WETH, USDC, blockNo);
      if (price > 0) {
        DebugLogger.price(`[OnChain] WETH/USD via V2: $${price} at block ${blockNo}`);
        return price;
      }
    } catch (err) {
      DebugLogger.error(`[OnChain] WETH/USD V2 error: ${(err as Error).message}`);
    }

    return this.getWethUsdPriceV3(blockNo);
  }

  /**
   * Fallback WETH/USD via V3 pool (500 fee tier, WETH/USDC).
   */
  private async getWethUsdPriceV3(blockNo: number): Promise<number> {
    const poolAddress = await this.getV3Pool(WETH, USDC, 500);
    if (!poolAddress) {
      return 0;
    }

    try {
      const price = await this.getV3PriceFromPool(poolAddress, WETH, USDC, blockNo);
      if (price > 0) {
        DebugLogger.price(`[OnChain] WETH/USD via V3: $${price} at block ${blockNo}`);
        return price;
      }
    } catch (err) {
      DebugLogger.error(`[OnChain] WETH/USD V3 error: ${(err as Error).message}`);
    }

    return 0;
  }

  /**
   * Gets the number of decimals for an ERC-20 token. Caches results.
   */
  private async getDecimals(tokenAddr: string): Promise<number> {
    const key = tokenAddr.toLowerCase();
    const cached = this.decimalsCache.get(key);
    if (cached !== undefined) {
      return cached;
    }

    try {
      await this.rateLimiter?.acquire();
      const data = web3.eth.abi.encodeFunctionCall(ABI_DECIMALS, []);
      const result = await web3.eth.call({ to: tokenAddr, data }, "latest");
      const decimals = Number(web3.eth.abi.decodeParameter("uint8", result));
      this.decimalsCache.set(key, decimals);
      return decimals;
    } catch (err) {
      DebugLogger.error(`[OnChain] Failed to get decimals for ${tokenAddr}: ${(err as Error).message}`);
      // Default to 18 if decimals() call fails
      this.decimalsCache.set(key, 18);
      return 18;
    }
  }
}
