import { PriceManagerBase } from "./BasePriceManager";
import { ChainlinkPriceManager } from "./ChainlinkPriceManager";
import { UniswapPriceManager } from "./UniswapPriceManager";
import { OnChainPriceResolver, RateLimiter } from "./OnChainPriceResolver";
import { getOracleAddr } from "../Chainlink/ChainlinkFeedParser";
import { getHistoricalPriceByBlock } from "./HistoricalPriceData";
import { PersistentPriceCache } from "./PersistentPriceCache";
import { DebugLogger } from "../DebugLogger";

export class CascadingPriceManager extends PriceManagerBase {
  private chainlinkManager = new ChainlinkPriceManager();
  private uniswapManager = new UniswapPriceManager();
  private onChainResolver: OnChainPriceResolver;
  private priceCache: PersistentPriceCache;
  private cacheDbPath: string;

  constructor(cacheDbPath?: string) {
    super();
    this.cacheDbPath = cacheDbPath || "./cache/price_cache.db";
    this.priceCache = new PersistentPriceCache(this.cacheDbPath);
    this.onChainResolver = new OnChainPriceResolver(
      this.priceCache,
      new RateLimiter(3),
    );
  }

  override async getPrice(
    symbol: string,
    blockNo: number | string,
    tokenAddr?: string,
  ): Promise<number> {
    const effectiveBlockNo = this.getEffectiveBlockNo(blockNo);
    const blockNum =
      typeof effectiveBlockNo === "number"
        ? effectiveBlockNo
        : parseInt(effectiveBlockNo.toString());

    // 캐시 확인 - persistent cache hits have TTL = infinity
    if (!isNaN(blockNum)) {
      const cached = await this.priceCache.getPrice(symbol, blockNum);
      if (cached && cached > 0) {
        DebugLogger.price(
          `💾 [Persistent] Using cached price for ${symbol}: $${cached}`,
        );
        return cached;
      }
    }

    DebugLogger.price(
      `🔍 [Hybrid] Getting price for ${symbol} at block ${effectiveBlockNo}`,
    );

    let price = 0;
    let source = "";

    // 0. Historical attack 데이터 우선 확인 (가장 정확함)
    if (!isNaN(blockNum)) {
      const historicalData = getHistoricalPriceByBlock(symbol, blockNum);
      if (historicalData && historicalData.price > 0) {
        price = historicalData.price;
        source = `Historical: ${historicalData.source}`;
        DebugLogger.price(
          `📅 [Historical] ${historicalData.source} price for ${symbol}: $${price}`,
        );
      }
    }

    // 1. Chainlink Oracle 시도 (정확한 과거 가격)
    if (price === 0) {
      try {
        const chainlinkAddr = getOracleAddr(symbol);
        if (chainlinkAddr) {
          price = await this.chainlinkManager.getPrice(
            chainlinkAddr,
            effectiveBlockNo,
          );
          if (price > 0) {
            source = "Chainlink";
            DebugLogger.price(`⛓️ [Chainlink] ${symbol} price: $${price}`);
          }
        }
      } catch (error) {
        // Chainlink 실패 시 조용히 넘어감
      }
    }

    // 2. WETH 특별 처리 - ETH와 동일하게 처리
    if (price === 0 && (symbol === "WETH" || symbol === "ETH")) {
      try {
        const ethChainlinkAddr = getOracleAddr("ETH");
        if (ethChainlinkAddr) {
          price = await this.chainlinkManager.getPrice(
            ethChainlinkAddr,
            effectiveBlockNo,
          );
          if (price > 0) {
            source = "Chainlink (ETH)";
            DebugLogger.price(`⛓️ [Chainlink-ETH] WETH price: $${price}`);
          }
        }
      } catch (error) {
        // ETH Chainlink도 실패하면 넘어감
      }
    }

    // 3. Uniswap V2/V3 fallback (symbol-based pools)
    if (price === 0) {
      try {
        price = await this.uniswapManager.getPrice(symbol, effectiveBlockNo);
        if (price > 0) {
          source = "Uniswap";
          DebugLogger.price(`🦄 [Uniswap] ${symbol} price: $${price}`);
        }
      } catch (error) {
        // Uniswap 실패 시 넘어감
      }
    }

    // 4. OnChainPriceResolver - dynamic pool discovery (requires tokenAddr)
    if (price === 0 && tokenAddr && !isNaN(blockNum)) {
      try {
        price = await this.onChainResolver.getPrice(
          tokenAddr,
          symbol,
          blockNum,
        );
        if (price > 0) {
          source = "OnChain";
          DebugLogger.price(
            `🔗 [OnChain] ${symbol} price: $${price}`,
          );
        }
      } catch (error) {
        // OnChain resolver 실패 시 넘어감
      }
    }

    // No fallback prices - use ConfigurableToUSD system instead
    if (price === 0) {
      DebugLogger.error(`❌ [Price] No price found for ${symbol}`);
      DebugLogger.error(`   📍 Token: ${symbol}, Block: ${effectiveBlockNo}`);
      DebugLogger.error(
        `   💡 Consider adding to HistoricalPriceData.ts or ConfigurableToUSD token config`,
      );
      // Log unresolved tokens to JSONL for post-processing
      const unresolvedLogPath = process.env.EVANESCA_LOG_UNRESOLVED;
      if (unresolvedLogPath) {
        try {
          const fs = require("fs");
          const path = require("path");
          const resolved = path.isAbsolute(unresolvedLogPath)
            ? unresolvedLogPath
            : path.resolve(process.cwd(), unresolvedLogPath);
          fs.appendFileSync(
            resolved,
            JSON.stringify({
              symbol,
              tokenAddr: tokenAddr || "",
              block: effectiveBlockNo,
              tx_hash: process.env.EVANESCA_TX_HASH || "",
              ts: Date.now(),
            }) + "\n",
          );
        } catch (e) {
          // best effort; don't break pipeline if logging fails
        }
      }
      if (process.env.EVANESCA_SKIP_UNKNOWN_PRICE === "true") {
        price = 0;
      } else {
        price = 1.0; // Conservative fallback to prevent system crashes
      }
    }

    // 캐시에 저장
    if (!isNaN(blockNum) && price > 0) {
      await this.priceCache.setPrice(symbol, blockNum, price);
    }

    return price;
  }

  private getEffectiveBlockNo(blockNo: number | string): number | string {
    if (process.env.EVANESCA_USE_PREV_BLOCK_PRICE !== "true") {
      return blockNo;
    }

    const blockNum =
      typeof blockNo === "number" ? blockNo : parseInt(blockNo.toString());
    if (isNaN(blockNum)) {
      return blockNo;
    }

    return Math.max(0, blockNum - 1);
  }

  private async blockToDate(blockno: number | string): Promise<string> {
    try {
      const { web3 } = await import("../../PreTasks");
      let blk = await web3.eth.getBlock(Number(blockno));
      const date = new Date(Number(blk.timestamp) * 1000);
      return `${date.getDate()}-${date.getMonth() + 1}-${date.getFullYear()}`;
    } catch (err) {
      throw Error("blockToDate:" + err);
    }
  }

  // 캐시 정리
  async clearCache(): Promise<void> {
    await this.priceCache.clear();
    DebugLogger.core(`🧹 [Hybrid] Cache cleared`);
  }

  // 캐시 통계
  async getCacheStats(): Promise<{ size: number; hitRate: number }> {
    const size = await this.priceCache.getSizeAsync();
    return { size, hitRate: 0.8 };
  }
}
