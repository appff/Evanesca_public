/**
 * StateTracker - Protocol State Management for Invariant Verification
 * Tracks and manages protocol states (AMM reserves, lending rates, etc.)
 * before and after transactions for mathematical verification
 */

import { BigNumber } from '../DSL/MathematicalExtensions';
import { DebugLogger } from '../Utils/DebugLogger';

/**
 * AMM State - Tracks automated market maker pool state
 */
export interface AMMState {
  poolAddress: string;
  protocol: string; // 'uniswapv2', 'curve', 'balancer', etc.
  blockNumber: number;
  
  // Reserve amounts (in raw token units)
  reserveA: BigNumber;
  reserveB: BigNumber;
  tokenA: {
    address: string;
    symbol: string;
    decimals: number;
  };
  tokenB: {
    address: string;
    symbol: string;
    decimals: number;
  };
  
  // Computed values
  k: BigNumber; // Constant product (reserveA * reserveB)
  totalSupply: BigNumber; // Total LP token supply
  
  // Additional metadata
  feeRate: number; // Trading fee (e.g., 0.003 for 0.3%)
  amplificationCoefficient?: number; // For stable swap pools like Curve
}

/**
 * Lending Protocol State - Tracks lending market state
 */
export interface LendingState {
  marketAddress: string;
  protocol: string; // 'compound', 'aave', 'makerdao', etc.
  blockNumber: number;
  asset: {
    address: string;
    symbol: string;
    decimals: number;
  };
  
  // Market state
  totalSupply: BigNumber;
  totalBorrows: BigNumber;
  totalReserves: BigNumber;
  cash: BigNumber; // Available liquidity
  
  // Interest rates (as decimals, e.g., 0.05 = 5%)
  supplyRate: number;
  borrowRate: number;
  utilizationRate: number;
  
  // Exchange rate for interest-bearing tokens
  exchangeRate: BigNumber; // cToken/underlying exchange rate
  
  // Risk parameters
  collateralFactor?: number; // Max borrowing power (e.g., 0.75 = 75%)
  liquidationThreshold?: number;
  reserveFactor?: number;
}

/**
 * Oracle State - Tracks price oracle data
 */
export interface OracleState {
  oracleAddress: string;
  protocol: string; // 'chainlink', 'uniswapv2twap', 'compound', etc.
  blockNumber: number;
  
  // Price data
  token: string;
  price: BigNumber; // Price in USD or reference currency
  decimals: number;
  
  // Time-weighted average price (TWAP)
  twapPrice?: BigNumber;
  twapPeriod?: number; // Period in seconds
  
  // Price history for manipulation detection
  priceHistory: Array<{
    price: BigNumber;
    timestamp: number;
    blockNumber: number;
  }>;
  
  // Metadata
  lastUpdated: number;
  updateFrequency?: number;
}

/**
 * Protocol State Container - Holds all protocol states
 */
export interface ProtocolState {
  amm: Map<string, AMMState>; // Pool address -> AMM state
  lending: Map<string, LendingState>; // Market address -> Lending state
  oracle: Map<string, OracleState>; // Oracle address -> Oracle state
  
  // State transitions
  transitions: Array<StateTransition>;
}

/**
 * State Transition - Records state changes
 */
export interface StateTransition {
  type: 'amm' | 'lending' | 'oracle';
  address: string;
  blockNumber: number;
  transactionHash: string;
  
  stateBefore: AMMState | LendingState | OracleState;
  stateAfter: AMMState | LendingState | OracleState;
  
  // Computed changes
  changes: {
    [key: string]: {
      before: any;
      after: any;
      delta: any;
      percentageChange?: number;
    };
  };
}

/**
 * StateTracker Class - Main state tracking implementation
 */
export class StateTracker {
  private state: ProtocolState;
  private stateCache: Map<string, { state: any; timestamp: number }>;
  private readonly CACHE_TTL = 300000; // 5 minutes cache TTL
  
  constructor() {
    this.state = {
      amm: new Map(),
      lending: new Map(),
      oracle: new Map(),
      transitions: []
    };
    this.stateCache = new Map();
  }
  
  /**
   * Extract AMM state from transaction/event data
   */
  async extractAMMState(
    poolAddress: string,
    protocol: string,
    reserves: { reserveA: string; reserveB: string },
    tokens: { tokenA: any; tokenB: any },
    blockNumber: number,
    totalSupply?: string
  ): Promise<AMMState> {
    // Check cache first
    const cacheKey = `amm:${poolAddress}:${blockNumber}`;
    const cached = this.getCachedState(cacheKey);
    if (cached) return cached as AMMState;
    
    const reserveA = new BigNumber(reserves.reserveA);
    const reserveB = new BigNumber(reserves.reserveB);
    
    const state: AMMState = {
      poolAddress,
      protocol,
      blockNumber,
      reserveA,
      reserveB,
      tokenA: tokens.tokenA,
      tokenB: tokens.tokenB,
      k: reserveA.multipliedBy(reserveB),
      totalSupply: totalSupply ? new BigNumber(totalSupply) : new BigNumber(0),
      feeRate: this.getProtocolFeeRate(protocol)
    };
    
    // Cache the state
    this.setCachedState(cacheKey, state);
    
    // Store in protocol state
    this.state.amm.set(poolAddress, state);
    
    DebugLogger.core(`AMM State extracted for ${poolAddress}: k=${state.k.toString()}`);
    
    return state;
  }
  
  /**
   * Extract lending protocol state
   */
  async extractLendingState(
    marketAddress: string,
    protocol: string,
    marketData: {
      totalSupply: string;
      totalBorrows: string;
      totalReserves: string;
      cash: string;
      supplyRate: string;
      borrowRate: string;
      exchangeRate?: string;
    },
    asset: any,
    blockNumber: number
  ): Promise<LendingState> {
    // Check cache
    const cacheKey = `lending:${marketAddress}:${blockNumber}`;
    const cached = this.getCachedState(cacheKey);
    if (cached) return cached as LendingState;
    
    const totalSupply = new BigNumber(marketData.totalSupply);
    const totalBorrows = new BigNumber(marketData.totalBorrows);
    const totalReserves = new BigNumber(marketData.totalReserves);
    const cash = new BigNumber(marketData.cash);
    
    // Calculate utilization rate
    const totalAssets = cash.plus(totalBorrows).minus(totalReserves);
    const utilizationRate = totalAssets.isZero() 
      ? 0 
      : totalBorrows.div(totalAssets).toNumber();
    
    const state: LendingState = {
      marketAddress,
      protocol,
      blockNumber,
      asset,
      totalSupply,
      totalBorrows,
      totalReserves,
      cash,
      supplyRate: parseFloat(marketData.supplyRate),
      borrowRate: parseFloat(marketData.borrowRate),
      utilizationRate,
      exchangeRate: marketData.exchangeRate 
        ? new BigNumber(marketData.exchangeRate)
        : new BigNumber(1)
    };
    
    // Cache and store
    this.setCachedState(cacheKey, state);
    this.state.lending.set(marketAddress, state);
    
    DebugLogger.core(`Lending State extracted for ${marketAddress}: utilization=${utilizationRate}`);
    
    return state;
  }
  
  /**
   * Extract oracle state
   */
  async extractOracleState(
    oracleAddress: string,
    protocol: string,
    token: string,
    price: string,
    blockNumber: number,
    decimals: number = 8
  ): Promise<OracleState> {
    // Get existing state to maintain price history
    const existingState = this.state.oracle.get(oracleAddress);
    const priceHistory = existingState?.priceHistory || [];
    
    // Add new price to history
    priceHistory.push({
      price: new BigNumber(price),
      timestamp: Date.now(),
      blockNumber
    });
    
    // Keep only last 100 entries
    if (priceHistory.length > 100) {
      priceHistory.shift();
    }
    
    // Calculate TWAP (simple average of last 10 prices)
    const recentPrices = priceHistory.slice(-10);
    const twapPrice = recentPrices.length > 0
      ? recentPrices.reduce((sum, p) => sum.plus(p.price), new BigNumber(0))
          .div(recentPrices.length)
      : new BigNumber(price);
    
    const state: OracleState = {
      oracleAddress,
      protocol,
      blockNumber,
      token,
      price: new BigNumber(price),
      decimals,
      twapPrice,
      twapPeriod: 600, // 10 minutes default
      priceHistory,
      lastUpdated: Date.now()
    };
    
    this.state.oracle.set(oracleAddress, state);
    
    return state;
  }
  
  /**
   * Calculate state transition between two states
   */
  calculateStateTransition(
    type: 'amm' | 'lending' | 'oracle',
    address: string,
    stateBefore: any,
    stateAfter: any,
    transactionHash: string
  ): StateTransition {
    const changes: any = {};
    
    if (type === 'amm') {
      const before = stateBefore as AMMState;
      const after = stateAfter as AMMState;
      
      changes.reserveA = {
        before: before.reserveA,
        after: after.reserveA,
        delta: after.reserveA.minus(before.reserveA),
        percentageChange: this.calculatePercentageChange(before.reserveA, after.reserveA)
      };
      
      changes.reserveB = {
        before: before.reserveB,
        after: after.reserveB,
        delta: after.reserveB.minus(before.reserveB),
        percentageChange: this.calculatePercentageChange(before.reserveB, after.reserveB)
      };
      
      changes.k = {
        before: before.k,
        after: after.k,
        delta: after.k.minus(before.k),
        percentageChange: this.calculatePercentageChange(before.k, after.k)
      };
    } else if (type === 'lending') {
      const before = stateBefore as LendingState;
      const after = stateAfter as LendingState;
      
      changes.totalBorrows = {
        before: before.totalBorrows,
        after: after.totalBorrows,
        delta: after.totalBorrows.minus(before.totalBorrows),
        percentageChange: this.calculatePercentageChange(before.totalBorrows, after.totalBorrows)
      };
      
      changes.utilizationRate = {
        before: before.utilizationRate,
        after: after.utilizationRate,
        delta: after.utilizationRate - before.utilizationRate
      };
    }
    
    const transition: StateTransition = {
      type,
      address,
      blockNumber: stateAfter.blockNumber,
      transactionHash,
      stateBefore,
      stateAfter,
      changes
    };
    
    this.state.transitions.push(transition);
    
    return transition;
  }
  
  /**
   * Get AMM state by pool address
   */
  getAMMState(poolAddress: string): AMMState | undefined {
    return this.state.amm.get(poolAddress);
  }
  
  /**
   * Get lending state by market address
   */
  getLendingState(marketAddress: string): LendingState | undefined {
    return this.state.lending.get(marketAddress);
  }
  
  /**
   * Get oracle state by oracle address
   */
  getOracleState(oracleAddress: string): OracleState | undefined {
    return this.state.oracle.get(oracleAddress);
  }
  
  /**
   * Get all state transitions
   */
  getTransitions(): StateTransition[] {
    return this.state.transitions;
  }
  
  /**
   * Clear all states
   */
  clearStates(): void {
    this.state.amm.clear();
    this.state.lending.clear();
    this.state.oracle.clear();
    this.state.transitions = [];
    this.stateCache.clear();
  }
  
  /**
   * Helper: Get protocol fee rate
   */
  private getProtocolFeeRate(protocol: string): number {
    const feeRates: { [key: string]: number } = {
      'uniswapv2': 0.003,
      'uniswapv3': 0.003, // Can vary by pool
      'sushiswap': 0.003,
      'curve': 0.0004,
      'balancer': 0.003,
      'pancakeswap': 0.0025
    };
    
    return feeRates[protocol.toLowerCase()] || 0.003;
  }
  
  /**
   * Helper: Calculate percentage change
   */
  private calculatePercentageChange(before: BigNumber, after: BigNumber): number {
    if (before.isZero()) {
      return after.isZero() ? 0 : 100;
    }
    return after.minus(before).div(before).multipliedBy(100).toNumber();
  }
  
  /**
   * Cache helpers
   */
  private getCachedState(key: string): any | null {
    const cached = this.stateCache.get(key);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.state;
    }
    return null;
  }
  
  private setCachedState(key: string, state: any): void {
    this.stateCache.set(key, {
      state,
      timestamp: Date.now()
    });
  }
  
  /**
   * Export state for analysis
   */
  exportState(): ProtocolState {
    return {
      amm: new Map(this.state.amm),
      lending: new Map(this.state.lending),
      oracle: new Map(this.state.oracle),
      transitions: [...this.state.transitions]
    };
  }
  
  /**
   * Extract protocol states from a semantic financial graph
   * @param graph The graphlib graph object
   * @param edges The array of edge data (edgeSeq from SemanticFinancialGraphBuilder)
   * @param blockNumber The block number
   * @param transactionHash The transaction hash
   */
  async extractStatesFromGraph(
    graph: any,
    edges: any[],
    blockNumber: number,
    transactionHash: string
  ): Promise<Map<string, AMMState | LendingState | OracleState>> {
    const protocolStates = new Map<string, AMMState | LendingState | OracleState>();
    
    // Iterate through edge data to extract protocol information
    for (const edge of edges || []) {
      if (edge.Type === 'DEX' && edge.AmountIn && edge.AmountOut) {
        // Extract AMM state from DEX edges
        const ammState = await this.extractAMMState(
          edge.AddressOrigin || edge.Address,
          edge.Service || 'unknown',
          {
            reserveA: edge.Reserve0 || edge.ReserveA || '0',
            reserveB: edge.Reserve1 || edge.ReserveB || '0'
          },
          {
            tokenA: edge.Token0,
            tokenB: edge.Token1
          },
          blockNumber
        );
        protocolStates.set(edge.AddressOrigin || edge.Address, ammState);
      } else if (edge.Type === 'Lending' && edge.Action) {
        // Extract lending state from lending edges
        const lendingState = await this.extractLendingState(
          edge.AddressOrigin || edge.Address,
          edge.Service || 'unknown',
          {
            totalSupply: edge.TotalSupply || '0',
            totalBorrows: edge.TotalBorrows || '0',
            totalReserves: edge.TotalReserves || '0',
            cash: edge.Cash || '0',
            supplyRate: edge.SupplyRate || '0',
            borrowRate: edge.BorrowRate || '0',
            exchangeRate: edge.ExchangeRate
          },
          edge.Token,
          blockNumber
        );
        protocolStates.set(edge.AddressOrigin || edge.Address, lendingState);
      }
      // Add oracle state extraction if needed
    }
    
    console.log(`[StateTracker] Extracted ${protocolStates.size} protocol states from graph`);
    return protocolStates;
  }
}