/**
 * Uniswap V3 Protocol Invariant Implementation
 * Verifies concentrated liquidity invariants for Uniswap V3 pools
 */

import { BigNumber } from '../../DSL/MathematicalExtensions';
import { StateTracker, AMMState } from '../StateTracker';
import { InvariantChecker, InvariantResult } from '../InvariantChecker';
import { IDEXEdge } from '../../SemanticFinancialGraph/Interfaces/IEdge';
import { DebugLogger } from '../../Utils/DebugLogger';

export interface UniswapV3Tick {
  index: number;
  liquidityGross: BigNumber;
  liquidityNet: BigNumber;
  feeGrowthOutside0X128: BigNumber;
  feeGrowthOutside1X128: BigNumber;
  tickCumulativeOutside: BigNumber;
  secondsPerLiquidityOutsideX128: BigNumber;
  secondsOutside: number;
}

export interface UniswapV3Position {
  owner: string;
  tickLower: number;
  tickUpper: number;
  liquidity: BigNumber;
  feeGrowthInside0LastX128: BigNumber;
  feeGrowthInside1LastX128: BigNumber;
  tokensOwed0: BigNumber;
  tokensOwed1: BigNumber;
}

export interface UniswapV3PoolState extends AMMState {
  sqrtPriceX96: BigNumber; // Square root of current price * 2^96
  liquidity: BigNumber; // Current in-range liquidity
  tick: number; // Current tick
  observationIndex: number;
  observationCardinality: number;
  observationCardinalityNext: number;
  feeProtocol: number; // Protocol fee percentage
  unlocked: boolean;
  fee: number; // Pool fee tier (100, 500, 3000, 10000 = 0.01%, 0.05%, 0.3%, 1%)
  tickSpacing: number; // Tick spacing for the pool
  maxLiquidityPerTick: BigNumber;
  ticks: Map<number, UniswapV3Tick>;
  positions: Map<string, UniswapV3Position>;
}

export class UniswapV3Invariant {
  private stateTracker: StateTracker;
  private invariantChecker: InvariantChecker;
  private readonly Q96 = new BigNumber(2).pow(96);
  private readonly Q128 = new BigNumber(2).pow(128);
  private readonly MIN_TICK = -887272;
  private readonly MAX_TICK = 887272;
  
  constructor(stateTracker: StateTracker) {
    this.stateTracker = stateTracker;
    this.invariantChecker = new InvariantChecker(stateTracker);
  }
  
  /**
   * Convert tick to price
   * price = 1.0001^tick
   */
  tickToPrice(tick: number): BigNumber {
    const base = new BigNumber('1.0001');
    return base.pow(tick);
  }
  
  /**
   * Convert price to tick
   * tick = floor(log(price) / log(1.0001))
   */
  priceToTick(price: BigNumber): number {
    const logPrice = price.ln();
    const log1_0001 = new BigNumber('1.0001').ln();
    return Math.floor(logPrice.div(log1_0001).toNumber());
  }
  
  /**
   * Calculate sqrtPrice from tick
   * sqrtPrice = sqrt(1.0001^tick) * 2^96
   */
  tickToSqrtPriceX96(tick: number): BigNumber {
    const price = this.tickToPrice(tick);
    const sqrtPrice = price.sqrt();
    return sqrtPrice.multipliedBy(this.Q96);
  }
  
  /**
   * Calculate tick from sqrtPriceX96
   */
  sqrtPriceX96ToTick(sqrtPriceX96: BigNumber): number {
    const sqrtPrice = sqrtPriceX96.div(this.Q96);
    const price = sqrtPrice.pow(2);
    return this.priceToTick(price);
  }
  
  /**
   * Calculate virtual reserves for current tick range
   * This is the key to understanding Uniswap V3's concentrated liquidity
   */
  calculateVirtualReserves(
    liquidity: BigNumber,
    sqrtPriceX96: BigNumber,
    tickLower: number,
    tickUpper: number
  ): { reserve0: BigNumber; reserve1: BigNumber } {
    const sqrtRatioA = this.tickToSqrtPriceX96(tickLower);
    const sqrtRatioB = this.tickToSqrtPriceX96(tickUpper);
    const currentSqrtRatio = sqrtPriceX96;
    
    // Calculate amount0 and amount1 for the position
    let amount0: BigNumber;
    let amount1: BigNumber;
    
    if (currentSqrtRatio.lte(sqrtRatioA)) {
      // Current price is below the range
      amount0 = liquidity.multipliedBy(sqrtRatioB.minus(sqrtRatioA))
        .div(sqrtRatioA.multipliedBy(sqrtRatioB));
      amount1 = new BigNumber(0);
    } else if (currentSqrtRatio.lt(sqrtRatioB)) {
      // Current price is within the range
      amount0 = liquidity.multipliedBy(sqrtRatioB.minus(currentSqrtRatio))
        .div(currentSqrtRatio.multipliedBy(sqrtRatioB));
      amount1 = liquidity.multipliedBy(currentSqrtRatio.minus(sqrtRatioA));
    } else {
      // Current price is above the range
      amount0 = new BigNumber(0);
      amount1 = liquidity.multipliedBy(sqrtRatioB.minus(sqrtRatioA));
    }
    
    return {
      reserve0: amount0.div(this.Q96),
      reserve1: amount1.div(this.Q96)
    };
  }
  
  /**
   * Verify Uniswap V3 concentrated liquidity invariant
   * The invariant is more complex than V2: L^2 = k (within active tick range)
   */
  async verifyConcentratedLiquidity(
    edge: IDEXEdge,
    poolAddress: string,
    poolState: UniswapV3PoolState,
    blockNumber: number,
    transactionHash: string
  ): Promise<InvariantResult> {
    try {
      const currentTick = poolState.tick;
      const currentLiquidity = poolState.liquidity;
      const sqrtPriceX96 = poolState.sqrtPriceX96;
      
      // Find active tick range
      const tickSpacing = poolState.tickSpacing;
      const tickLower = Math.floor(currentTick / tickSpacing) * tickSpacing;
      const tickUpper = tickLower + tickSpacing;
      
      // Calculate virtual reserves for current tick range
      const { reserve0: reserveBefore0, reserve1: reserveBefore1 } = 
        this.calculateVirtualReserves(currentLiquidity, sqrtPriceX96, tickLower, tickUpper);
      
      // Calculate k = L^2 for concentrated liquidity
      const kBefore = currentLiquidity.pow(2);
      
      // Simulate swap
      const amountIn = new BigNumber(edge.AmountIn);
      const amountOut = new BigNumber(edge.AmountOut);
      const isToken0In = edge.Token0 === poolState.token0;
      
      // Calculate new reserves after swap
      let newReserve0: BigNumber;
      let newReserve1: BigNumber;
      
      if (isToken0In) {
        newReserve0 = reserveBefore0.plus(amountIn);
        newReserve1 = reserveBefore1.minus(amountOut);
      } else {
        newReserve0 = reserveBefore0.minus(amountOut);
        newReserve1 = reserveBefore1.plus(amountIn);
      }
      
      // Calculate new sqrt price
      const newSqrtPrice = newReserve1.div(newReserve0).sqrt();
      const newSqrtPriceX96 = newSqrtPrice.multipliedBy(this.Q96);
      
      // Check if price moved outside current tick range
      const newTick = this.sqrtPriceX96ToTick(newSqrtPriceX96);
      const tickCrossed = newTick < tickLower || newTick >= tickUpper;
      
      // Calculate new liquidity (may change if tick is crossed)
      let newLiquidity = currentLiquidity;
      if (tickCrossed) {
        // When crossing tick, liquidity changes based on positions
        const tickData = poolState.ticks.get(newTick);
        if (tickData) {
          newLiquidity = currentLiquidity.plus(tickData.liquidityNet);
        }
      }
      
      // Calculate k after swap
      const kAfter = newLiquidity.pow(2);
      
      // Account for fees (affects k)
      const fee = new BigNumber(poolState.fee).div(1000000); // Convert basis points to decimal
      const feeMultiplier = new BigNumber(1).minus(fee);
      const kExpected = kBefore.multipliedBy(feeMultiplier);
      
      // Calculate deviation
      const deviation = kAfter.minus(kExpected).abs().div(kExpected).toNumber();
      
      // Tolerance is tighter for V3 due to concentrated liquidity
      const tolerance = tickCrossed ? 0.001 : 0.0001; // Higher tolerance when crossing ticks
      const valid = deviation <= tolerance;
      
      const result: InvariantResult = {
        valid,
        protocol: 'UniswapV3',
        invariantType: 'concentrated_liquidity',
        deviation,
        message: valid
          ? `Concentrated liquidity invariant maintained (deviation: ${(deviation * 100).toFixed(6)}%)`
          : `Concentrated liquidity invariant violated (deviation: ${(deviation * 100).toFixed(6)}%, tolerance: ${(tolerance * 100).toFixed(4)}%)`,
        details: {
          kBefore: kBefore.toString(),
          kAfter: kAfter.toString(),
          liquidityBefore: currentLiquidity.toString(),
          liquidityAfter: newLiquidity.toString(),
          sqrtPriceX96Before: sqrtPriceX96.toString(),
          sqrtPriceX96After: newSqrtPriceX96.toString(),
          tickBefore: currentTick,
          tickAfter: newTick,
          tickCrossed,
          virtualReserves: {
            before: {
              reserve0: reserveBefore0.toString(),
              reserve1: reserveBefore1.toString()
            },
            after: {
              reserve0: newReserve0.toString(),
              reserve1: newReserve1.toString()
            }
          },
          swap: {
            tokenIn: isToken0In ? edge.Token0 : edge.Token1,
            tokenOut: isToken0In ? edge.Token1 : edge.Token0,
            amountIn: amountIn.toString(),
            amountOut: amountOut.toString(),
            fee: poolState.fee
          }
        },
        severity: valid ? 'low' : this.calculateSeverity(deviation, tolerance)
      };
      
      // Record violation if invalid
      if (!valid) {
        this.recordViolation(poolAddress, blockNumber, transactionHash, result);
      }
      
      DebugLogger.core(`UniswapV3 concentrated liquidity invariant check: ${result.message}`);
      
      return result;
    } catch (error) {
      DebugLogger.error(`Error verifying UniswapV3 concentrated liquidity: ${error}`);
      return {
        valid: false,
        protocol: 'UniswapV3',
        invariantType: 'concentrated_liquidity',
        message: `Error verifying concentrated liquidity: ${error}`,
        severity: 'high'
      };
    }
  }
  
  /**
   * Verify tick range liquidity consistency
   */
  async verifyTickRangeLiquidity(
    poolState: UniswapV3PoolState,
    blockNumber: number,
    transactionHash: string
  ): Promise<InvariantResult> {
    try {
      // Sum up all liquidity from positions in current tick range
      let calculatedLiquidity = new BigNumber(0);
      
      poolState.positions.forEach((position) => {
        // Check if position is active (current tick is within range)
        if (poolState.tick >= position.tickLower && poolState.tick < position.tickUpper) {
          calculatedLiquidity = calculatedLiquidity.plus(position.liquidity);
        }
      });
      
      // Compare with pool's reported liquidity
      const reportedLiquidity = poolState.liquidity;
      const deviation = calculatedLiquidity.minus(reportedLiquidity)
        .abs()
        .div(reportedLiquidity)
        .toNumber();
      
      const tolerance = 0.00001; // Very tight tolerance for liquidity consistency
      const valid = deviation <= tolerance;
      
      return {
        valid,
        protocol: 'UniswapV3',
        invariantType: 'tick_range_liquidity',
        deviation,
        message: valid
          ? `Tick range liquidity consistent (deviation: ${(deviation * 100).toFixed(8)}%)`
          : `Tick range liquidity inconsistent (deviation: ${(deviation * 100).toFixed(8)}%)`,
        details: {
          calculatedLiquidity: calculatedLiquidity.toString(),
          reportedLiquidity: reportedLiquidity.toString(),
          currentTick: poolState.tick,
          activePositions: Array.from(poolState.positions.values())
            .filter(p => poolState.tick >= p.tickLower && poolState.tick < p.tickUpper)
            .length
        },
        severity: valid ? 'low' : 'high'
      };
    } catch (error) {
      return {
        valid: false,
        protocol: 'UniswapV3',
        invariantType: 'tick_range_liquidity',
        message: `Error verifying tick range liquidity: ${error}`,
        severity: 'high'
      };
    }
  }
  
  /**
   * Verify price bounds (ticks must be within valid range)
   */
  async verifyPriceBounds(
    poolState: UniswapV3PoolState,
    blockNumber: number,
    transactionHash: string
  ): Promise<InvariantResult> {
    try {
      const currentTick = poolState.tick;
      const valid = currentTick >= this.MIN_TICK && currentTick <= this.MAX_TICK;
      
      return {
        valid,
        protocol: 'UniswapV3',
        invariantType: 'price_bounds',
        message: valid
          ? `Price within valid tick range (${currentTick})`
          : `Price outside valid tick range (${currentTick}, bounds: [${this.MIN_TICK}, ${this.MAX_TICK}])`,
        details: {
          currentTick,
          minTick: this.MIN_TICK,
          maxTick: this.MAX_TICK,
          currentPrice: this.tickToPrice(currentTick).toString()
        },
        severity: valid ? 'low' : 'critical'
      };
    } catch (error) {
      return {
        valid: false,
        protocol: 'UniswapV3',
        invariantType: 'price_bounds',
        message: `Error verifying price bounds: ${error}`,
        severity: 'high'
      };
    }
  }
  
  /**
   * Helper: Calculate severity based on deviation
   */
  private calculateSeverity(
    deviation: number,
    tolerance: number
  ): 'low' | 'medium' | 'high' | 'critical' {
    const ratio = deviation / tolerance;
    
    if (ratio <= 1.5) return 'low';
    if (ratio <= 3) return 'medium';
    if (ratio <= 10) return 'high';
    return 'critical';
  }
  
  /**
   * Helper: Record violation
   */
  private recordViolation(
    poolAddress: string,
    blockNumber: number,
    transactionHash: string,
    result: InvariantResult
  ): void {
    DebugLogger.error(
      `UniswapV3 invariant violation: ${result.invariantType} at ${poolAddress}`,
      {
        blockNumber,
        transactionHash,
        deviation: result.deviation,
        severity: result.severity
      }
    );
  }
}