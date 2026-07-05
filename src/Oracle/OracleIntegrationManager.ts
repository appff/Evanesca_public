/**
 * Oracle Integration Manager
 * Multi-source price feed system with manipulation detection
 */

import BigNumber from 'bignumber.js';
import { DebugLogger } from '../Utils/DebugLogger';
import { PricePoint } from '../SemanticFinancialGraph/ProtocolStateTracker';

// Interface definitions
export interface PriceFeedData {
  price: BigNumber;
  timestamp: number;
  block_number: number;
  source: OracleSource;
  confidence: number; // 0-1 confidence score
}

export enum OracleSource {
  CHAINLINK = 'chainlink',
  UNISWAP_V3 = 'uniswap_v3',
  CURVE = 'curve',
  BALANCER = 'balancer',
  COINGECKO = 'coingecko',
  BINANCE = 'binance',
  COINBASE = 'coinbase'
}

export interface ManipulationAlert {
  token: string;
  current_price: BigNumber;
  reference_prices: { [key: string]: BigNumber };
  deviations: { [key: string]: BigNumber };
  is_manipulation: boolean;
  confidence: number;
  timestamp: number;
}

export interface TWAPResult {
  token: string;
  twap_price: BigNumber;
  period_seconds: number;
  data_points: number;
  start_timestamp: number;
  end_timestamp: number;
  confidence: number;
}

/**
 * Price Feed Provider Interface
 */
export abstract class PriceFeedProvider {
  abstract source: OracleSource;
  abstract isAvailable(): Promise<boolean>;
  abstract getPrice(token: string, blockNumber?: number): Promise<PriceFeedData | null>;
  abstract getPriceHistory(token: string, startTime: number, endTime: number): Promise<PricePoint[]>;
}

/**
 * Chainlink Price Feed Provider
 */
export class ChainlinkPriceFeedProvider extends PriceFeedProvider {
  source = OracleSource.CHAINLINK;
  private web3: any;
  private feedAddresses: Map<string, string>;

  constructor(web3: any) {
    super();
    this.web3 = web3;
    this.feedAddresses = this.initializeFeedAddresses();
  }

  private initializeFeedAddresses(): Map<string, string> {
    // Chainlink price feed addresses on Ethereum mainnet
    return new Map([
      ['ETH', '0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419'], // ETH/USD
      ['BTC', '0xF4030086522a5bEEa4988F8cA5B36dbC97BeE88c'], // BTC/USD
      ['DAI', '0xAed0c38402a5d19df6E4c03F4E2DceD6e29c1ee9'], // DAI/USD
      ['USDC', '0x8fFfFfd4AfB6115b954Bd326cbe7B4BA576818f6'], // USDC/USD
      ['USDT', '0x3E7d1eAB13ad0104d2750B8863b489D65364e32D'], // USDT/USD
      ['LINK', '0x2c1d072e956AFFC0D435Cb7AC38EF18d24d9127c'], // LINK/USD
      ['UNI', '0x553303d460EE0afB37EdFf9bE42922D8FF63220e'], // UNI/USD
    ]);
  }

  async isAvailable(): Promise<boolean> {
    try {
      return this.web3 && this.web3.eth;
    } catch (error) {
      return false;
    }
  }

  async getPrice(token: string, blockNumber?: number): Promise<PriceFeedData | null> {
    try {
      const feedAddress = this.feedAddresses.get(token.toUpperCase());
      if (!feedAddress) {
        return null;
      }

      // Chainlink AggregatorV3Interface ABI (simplified)
      const aggregatorABI = [
        {
          inputs: [],
          name: "latestRoundData",
          outputs: [
            { name: "roundId", type: "uint80" },
            { name: "answer", type: "int256" },
            { name: "startedAt", type: "uint256" },
            { name: "updatedAt", type: "uint256" },
            { name: "answeredInRound", type: "uint80" }
          ],
          stateMutability: "view",
          type: "function"
        }
      ];

      const contract = new this.web3.eth.Contract(aggregatorABI, feedAddress);
      const result = await contract.methods.latestRoundData().call(undefined, blockNumber);

      const price = new BigNumber(result.answer).dividedBy(new BigNumber(10).pow(8)); // Chainlink uses 8 decimals
      const timestamp = parseInt(result.updatedAt) * 1000; // Convert to milliseconds

      return {
        price,
        timestamp,
        block_number: blockNumber || 0,
        source: this.source,
        confidence: 0.95 // High confidence for Chainlink
      };

    } catch (error) {
      DebugLogger.error(`[ChainlinkPriceFeed] Error getting price for ${token}: ${error}`);
      return null;
    }
  }

  async getPriceHistory(token: string, startTime: number, endTime: number): Promise<PricePoint[]> {
    // Chainlink historical data would require event parsing or external API
    // For now, return empty array - can be implemented with The Graph or similar
    DebugLogger.core(`[ChainlinkPriceFeed] Historical data not implemented for ${token}`);
    return [];
  }
}

/**
 * Uniswap V3 TWAP Price Provider
 */
export class UniswapV3TWAPProvider extends PriceFeedProvider {
  source = OracleSource.UNISWAP_V3;
  private web3: any;
  private poolAddresses: Map<string, string>;

  constructor(web3: any) {
    super();
    this.web3 = web3;
    this.poolAddresses = this.initializePoolAddresses();
  }

  private initializePoolAddresses(): Map<string, string> {
    // Major Uniswap V3 pool addresses
    return new Map([
      ['ETH-USDC', '0x8ad599c3A0ff1De082011EFDDc58f1908eb6e6D8'], // ETH/USDC 0.3%
      ['ETH-USDT', '0x4e68Ccd3E89f51C3074ca5072bbAC773960dFa36'], // ETH/USDT 0.3%
      ['ETH-DAI', '0xC2e9F25Be6257c210d7Adf0D4Cd6E3E881ba25f8'],  // ETH/DAI 0.3%
    ]);
  }

  async isAvailable(): Promise<boolean> {
    return this.web3 && this.web3.eth;
  }

  async getPrice(token: string, blockNumber?: number): Promise<PriceFeedData | null> {
    try {
      // Simplified implementation - would need full Uniswap V3 pool integration
      const poolAddress = this.poolAddresses.get(`${token.toUpperCase()}-USDC`);
      if (!poolAddress) {
        return null;
      }

      // This would require Uniswap V3 pool contract calls and TWAP calculation
      // For now, return null to indicate not implemented
      return null;

    } catch (error) {
      DebugLogger.error(`[UniswapV3TWAP] Error getting price for ${token}: ${error}`);
      return null;
    }
  }

  async getPriceHistory(token: string, startTime: number, endTime: number): Promise<PricePoint[]> {
    // Would require event log parsing or The Graph integration
    return [];
  }
}

/**
 * TWAP Calculator for historical price analysis
 */
export class TWAPCalculator {
  private priceHistory: Map<string, PricePoint[]>;
  private calculationCache: Map<string, TWAPResult>;

  constructor() {
    this.priceHistory = new Map();
    this.calculationCache = new Map();
  }

  addPricePoint(token: string, pricePoint: PricePoint): void {
    const history = this.priceHistory.get(token) || [];
    history.push(pricePoint);
    
    // Keep only last 1000 points
    if (history.length > 1000) {
      history.splice(0, history.length - 1000);
    }
    
    // Sort by timestamp
    history.sort((a, b) => a.timestamp - b.timestamp);
    this.priceHistory.set(token, history);
  }

  async calculateTWAP(token: string, periodSeconds: number): Promise<TWAPResult | null> {
    try {
      const cacheKey = `${token}-${periodSeconds}`;
      const cached = this.calculationCache.get(cacheKey);
      
      // Return cached result if less than 60 seconds old
      if (cached && (Date.now() / 1000 - cached.end_timestamp) < 60) {
        return cached;
      }

      const history = this.priceHistory.get(token);
      if (!history || history.length < 2) {
        return null;
      }

      const endTime = Date.now() / 1000;
      const startTime = endTime - periodSeconds;

      // Filter price points within the time period
      const relevantPoints = history.filter(point => 
        point.timestamp >= startTime && point.timestamp <= endTime
      );

      if (relevantPoints.length < 2) {
        return null;
      }

      let weightedSum = new BigNumber(0);
      let totalTime = new BigNumber(0);

      for (let i = 1; i < relevantPoints.length; i++) {
        const timeDelta = new BigNumber(relevantPoints[i].timestamp - relevantPoints[i - 1].timestamp);
        const priceWeight = relevantPoints[i - 1].price.multipliedBy(timeDelta);
        
        weightedSum = weightedSum.plus(priceWeight);
        totalTime = totalTime.plus(timeDelta);
      }

      const twapPrice = totalTime.isZero() ? 
        relevantPoints[0].price : 
        weightedSum.dividedBy(totalTime);

      const result: TWAPResult = {
        token,
        twap_price: twapPrice,
        period_seconds: periodSeconds,
        data_points: relevantPoints.length,
        start_timestamp: startTime,
        end_timestamp: endTime,
        confidence: Math.min(0.9, relevantPoints.length / 10) // Higher confidence with more data points
      };

      this.calculationCache.set(cacheKey, result);
      return result;

    } catch (error) {
      DebugLogger.error(`[TWAPCalculator] Error calculating TWAP for ${token}: ${error}`);
      return null;
    }
  }

  getPriceHistory(token: string): PricePoint[] {
    return this.priceHistory.get(token) || [];
  }

  clearHistory(token?: string): void {
    if (token) {
      this.priceHistory.delete(token);
    } else {
      this.priceHistory.clear();
    }
    this.calculationCache.clear();
  }
}

/**
 * Main Oracle Integration Manager
 */
export class OracleIntegrationManager {
  private priceFeedProviders: Map<OracleSource, PriceFeedProvider>;
  private twapCalculator: TWAPCalculator;
  private priceCache: Map<string, PriceFeedData>;
  private cacheTimeout: number = 300000; // 5 minutes

  constructor(web3?: any) {
    this.priceFeedProviders = new Map();
    this.twapCalculator = new TWAPCalculator();
    this.priceCache = new Map();

    // Initialize providers
    if (web3) {
      this.priceFeedProviders.set(OracleSource.CHAINLINK, new ChainlinkPriceFeedProvider(web3));
      this.priceFeedProviders.set(OracleSource.UNISWAP_V3, new UniswapV3TWAPProvider(web3));
    }

    DebugLogger.core('🔮 [OracleIntegrationManager] Initialized with price feed providers');
  }

  async getPrice(token: string, blockNumber?: number, preferredSource?: OracleSource): Promise<PriceFeedData | null> {
    try {
      const cacheKey = `${token}-${blockNumber || 'latest'}-${preferredSource || 'any'}`;
      const cached = this.priceCache.get(cacheKey);
      
      if (cached && (Date.now() - cached.timestamp) < this.cacheTimeout) {
        return cached;
      }

      // Try preferred source first
      if (preferredSource && this.priceFeedProviders.has(preferredSource)) {
        const provider = this.priceFeedProviders.get(preferredSource)!;
        const price = await provider.getPrice(token, blockNumber);
        if (price) {
          this.priceCache.set(cacheKey, price);
          this.twapCalculator.addPricePoint(token, {
            price: price.price,
            timestamp: price.timestamp / 1000,
            block_number: price.block_number,
            source: price.source
          });
          return price;
        }
      }

      // Try all available providers
      for (const [source, provider] of this.priceFeedProviders) {
        try {
          if (await provider.isAvailable()) {
            const price = await provider.getPrice(token, blockNumber);
            if (price) {
              this.priceCache.set(cacheKey, price);
              this.twapCalculator.addPricePoint(token, {
                price: price.price,
                timestamp: price.timestamp / 1000,
                block_number: price.block_number,
                source: price.source
              });
              return price;
            }
          }
        } catch (error) {
          DebugLogger.error(`[OracleIntegrationManager] Provider ${source} failed: ${error}`);
          continue;
        }
      }

      return null;
    } catch (error) {
      DebugLogger.error(`[OracleIntegrationManager] Error getting price for ${token}: ${error}`);
      return null;
    }
  }

  async getTWAPPrice(token: string, periodSeconds: number = 3600): Promise<BigNumber | null> {
    const twapResult = await this.twapCalculator.calculateTWAP(token, periodSeconds);
    return twapResult?.twap_price || null;
  }

  async detectPriceManipulation(token: string, currentPrice?: BigNumber): Promise<ManipulationAlert> {
    try {
      // Get current price if not provided
      let current = currentPrice;
      if (!current) {
        const priceData = await this.getPrice(token);
        current = priceData?.price || new BigNumber(0);
      }

      // Get reference prices
      const twapPrice = await this.getTWAPPrice(token, 3600); // 1 hour TWAP
      const chainlinkPrice = await this.getPrice(token, undefined, OracleSource.CHAINLINK);

      const referencePrices: { [key: string]: BigNumber } = {};
      const deviations: { [key: string]: BigNumber } = {};

      if (twapPrice) {
        referencePrices['twap_1h'] = twapPrice;
        deviations['twap_1h'] = current.minus(twapPrice).abs().dividedBy(twapPrice);
      }

      if (chainlinkPrice) {
        referencePrices['chainlink'] = chainlinkPrice.price;
        deviations['chainlink'] = current.minus(chainlinkPrice.price).abs().dividedBy(chainlinkPrice.price);
      }

      // Determine if manipulation is detected
      const maxTwapDeviation = 0.05; // 5%
      const maxChainlinkDeviation = 0.03; // 3%

      const isManipulation = 
        (deviations['twap_1h']?.gt(maxTwapDeviation) || false) ||
        (deviations['chainlink']?.gt(maxChainlinkDeviation) || false);

      // Calculate confidence based on available data
      const dataSourceCount = Object.keys(referencePrices).length;
      const confidence = Math.min(0.95, dataSourceCount * 0.3 + 0.4);

      return {
        token,
        current_price: current,
        reference_prices: referencePrices,
        deviations,
        is_manipulation: isManipulation,
        confidence,
        timestamp: Date.now()
      };

    } catch (error) {
      DebugLogger.error(`[OracleIntegrationManager] Error detecting manipulation for ${token}: ${error}`);
      
      return {
        token,
        current_price: currentPrice || new BigNumber(0),
        reference_prices: {},
        deviations: {},
        is_manipulation: false,
        confidence: 0,
        timestamp: Date.now()
      };
    }
  }

  getAvailableProviders(): OracleSource[] {
    return Array.from(this.priceFeedProviders.keys());
  }

  addProvider(source: OracleSource, provider: PriceFeedProvider): void {
    this.priceFeedProviders.set(source, provider);
    DebugLogger.core(`🔮 [OracleIntegrationManager] Added provider: ${source}`);
  }

  removeProvider(source: OracleSource): void {
    this.priceFeedProviders.delete(source);
    DebugLogger.core(`🔮 [OracleIntegrationManager] Removed provider: ${source}`);
  }

  clearCache(): void {
    this.priceCache.clear();
    this.twapCalculator.clearHistory();
    DebugLogger.core('🔮 [OracleIntegrationManager] Cleared all caches');
  }

  getStatistics(): any {
    return {
      providers_count: this.priceFeedProviders.size,
      cache_size: this.priceCache.size,
      available_sources: this.getAvailableProviders(),
      cache_timeout_ms: this.cacheTimeout
    };
  }
}