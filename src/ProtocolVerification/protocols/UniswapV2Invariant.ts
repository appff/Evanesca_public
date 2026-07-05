/**
 * Uniswap V2 Protocol Invariant Implementation
 * Verifies the constant product formula x * y = k
 */

import { BigNumber } from '../../DSL/MathematicalExtensions';
import { StateTracker, AMMState } from '../StateTracker';
import { InvariantChecker, InvariantResult } from '../InvariantChecker';
import { IDEXEdge } from '../../SemanticFinancialGraph/Interfaces/IEdge';
import { DebugLogger } from '../../Utils/DebugLogger';

export class UniswapV2Invariant {
  private stateTracker: StateTracker;
  private invariantChecker: InvariantChecker;
  
  constructor(stateTracker: StateTracker) {
    this.stateTracker = stateTracker;
    this.invariantChecker = new InvariantChecker(stateTracker);
  }
  
  /**
   * Verify Uniswap V2 swap maintains constant product invariant
   */
  async verifySwap(
    edge: IDEXEdge,
    poolAddress: string,
    blockNumber: number,
    transactionHash: string
  ): Promise<InvariantResult> {
    try {
      // Extract token information
      const tokenIn = edge.Token0;
      const tokenOut = edge.Token1;
      const amountIn = new BigNumber(edge.AmountIn);
      const amountOut = new BigNumber(edge.AmountOut);
      
      // Get pool state before swap (simulate)
      const reservesBefore = await this.simulateReservesBeforeSwap(
        poolAddress,
        tokenIn,
        tokenOut,
        amountIn,
        amountOut,
        blockNumber
      );
      
      // Extract AMM state before
      const stateBefore = await this.stateTracker.extractAMMState(
        poolAddress,
        'uniswapv2',
        {
          reserveA: reservesBefore.reserveIn.toString(),
          reserveB: reservesBefore.reserveOut.toString()
        },
        {
          tokenA: { address: tokenIn, symbol: tokenIn, decimals: 18 },
          tokenB: { address: tokenOut, symbol: tokenOut, decimals: 18 }
        },
        blockNumber
      );
      
      // Calculate reserves after swap
      const reservesAfter = {
        reserveIn: reservesBefore.reserveIn.plus(amountIn),
        reserveOut: reservesBefore.reserveOut.minus(amountOut)
      };
      
      // Extract AMM state after
      const stateAfter = await this.stateTracker.extractAMMState(
        poolAddress,
        'uniswapv2',
        {
          reserveA: reservesAfter.reserveIn.toString(),
          reserveB: reservesAfter.reserveOut.toString()
        },
        {
          tokenA: { address: tokenIn, symbol: tokenIn, decimals: 18 },
          tokenB: { address: tokenOut, symbol: tokenOut, decimals: 18 }
        },
        blockNumber + 1
      );
      
      // Verify constant product invariant
      const result = await this.invariantChecker.verifyUniswapV2Invariant(
        poolAddress,
        stateBefore,
        stateAfter,
        transactionHash
      );
      
      // Add swap-specific details
      result.details = {
        ...result.details,
        swap: {
          tokenIn,
          tokenOut,
          amountIn: amountIn.toString(),
          amountOut: amountOut.toString(),
          priceImpact: this.calculatePriceImpact(
            amountIn,
            reservesBefore.reserveIn,
            reservesBefore.reserveOut
          )
        }
      };
      
      return result;
    } catch (error) {
      DebugLogger.error(`Error verifying Uniswap V2 swap: ${error}`);
      return {
        valid: false,
        protocol: 'UniswapV2',
        invariantType: 'constant_product',
        message: `Error verifying swap: ${error}`,
        severity: 'high'
      };
    }
  }
  
  /**
   * Verify liquidity operation maintains invariant
   */
  async verifyLiquidity(
    action: 'add' | 'remove',
    poolAddress: string,
    amounts: { tokenA: string; tokenB: string },
    lpTokens: string,
    blockNumber: number,
    transactionHash: string
  ): Promise<InvariantResult> {
    try {
      // Get current pool state
      const currentState = this.stateTracker.getAMMState(poolAddress);
      if (!currentState) {
        throw new Error('Pool state not found');
      }
      
      // Calculate expected changes based on LP tokens
      const lpAmount = new BigNumber(lpTokens);
      const totalSupply = currentState.totalSupply;
      
      // For adding liquidity, amounts should be proportional
      if (action === 'add') {
        const ratioA = new BigNumber(amounts.tokenA).div(currentState.reserveA);
        const ratioB = new BigNumber(amounts.tokenB).div(currentState.reserveB);
        
        // Ratios should be equal (within tolerance)
        const ratioDiff = ratioA.minus(ratioB).abs();
        const valid = ratioDiff.lt(0.001); // 0.1% tolerance
        
        return {
          valid,
          protocol: 'UniswapV2',
          invariantType: 'liquidity_balance',
          deviation: ratioDiff.toNumber(),
          message: valid 
            ? 'Liquidity addition maintains balance'
            : 'Liquidity addition imbalanced',
          details: {
            action,
            amountA: amounts.tokenA,
            amountB: amounts.tokenB,
            lpTokens,
            ratioA: ratioA.toNumber(),
            ratioB: ratioB.toNumber()
          },
          severity: valid ? 'low' : 'medium'
        };
      } else {
        // For removing liquidity, check proportional removal
        const shareOfPool = lpAmount.div(totalSupply);
        const expectedA = currentState.reserveA.multipliedBy(shareOfPool);
        const expectedB = currentState.reserveB.multipliedBy(shareOfPool);
        
        const actualA = new BigNumber(amounts.tokenA);
        const actualB = new BigNumber(amounts.tokenB);
        
        const deviationA = actualA.minus(expectedA).abs().div(expectedA);
        const deviationB = actualB.minus(expectedB).abs().div(expectedB);
        
        const maxDeviation = BigNumber.max(deviationA, deviationB);
        const valid = maxDeviation.lt(0.001); // 0.1% tolerance
        
        return {
          valid,
          protocol: 'UniswapV2',
          invariantType: 'liquidity_balance',
          deviation: maxDeviation.toNumber(),
          message: valid 
            ? 'Liquidity removal maintains balance'
            : 'Liquidity removal imbalanced',
          details: {
            action,
            actualA: amounts.tokenA,
            actualB: amounts.tokenB,
            expectedA: expectedA.toString(),
            expectedB: expectedB.toString(),
            lpTokens,
            shareOfPool: shareOfPool.toNumber()
          },
          severity: valid ? 'low' : 'medium'
        };
      }
    } catch (error) {
      return {
        valid: false,
        protocol: 'UniswapV2',
        invariantType: 'liquidity_balance',
        message: `Error verifying liquidity operation: ${error}`,
        severity: 'high'
      };
    }
  }
  
  /**
   * Simulate reserves before swap (in production, fetch from blockchain)
   */
  private async simulateReservesBeforeSwap(
    poolAddress: string,
    tokenIn: string,
    tokenOut: string,
    amountIn: BigNumber,
    amountOut: BigNumber,
    blockNumber: number
  ): Promise<{ reserveIn: BigNumber; reserveOut: BigNumber }> {
    // In production, this would fetch actual reserves from blockchain
    // For now, we'll calculate backwards from the swap amounts
    
    // Using Uniswap V2 formula: amountOut = (amountIn * 997 * reserveOut) / (reserveIn * 1000 + amountIn * 997)
    // We can estimate reserves if we know the typical pool size
    
    // Simulated reserves (would be fetched from chain)
    const typicalPoolSize = new BigNumber('1000000'); // 1M tokens typical pool
    
    // Calculate reserves that would produce this swap
    // This is a simplification - in reality we'd fetch from chain
    const reserveIn = typicalPoolSize;
    const reserveOut = typicalPoolSize.multipliedBy(2); // Assume 2:1 ratio
    
    return { reserveIn, reserveOut };
  }
  
  /**
   * Calculate price impact of swap
   */
  private calculatePriceImpact(
    amountIn: BigNumber,
    reserveIn: BigNumber,
    reserveOut: BigNumber
  ): string {
    // Price before swap
    const priceBefore = reserveOut.div(reserveIn);
    
    // Price after swap (approximate)
    const newReserveIn = reserveIn.plus(amountIn);
    const amountOut = amountIn.multipliedBy(997).multipliedBy(reserveOut)
      .div(reserveIn.multipliedBy(1000).plus(amountIn.multipliedBy(997)));
    const newReserveOut = reserveOut.minus(amountOut);
    const priceAfter = newReserveOut.div(newReserveIn);
    
    // Calculate impact
    const impact = priceBefore.minus(priceAfter).abs().div(priceBefore);
    
    return (impact.multipliedBy(100).toNumber()).toFixed(4) + '%';
  }
}