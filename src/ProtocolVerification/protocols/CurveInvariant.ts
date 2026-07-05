/**
 * Curve Finance Protocol Invariant Implementation
 * Verifies the stable swap invariant for Curve pools
 */

import { BigNumber } from '../../DSL/MathematicalExtensions';
import { StateTracker, AMMState } from '../StateTracker';
import { InvariantChecker, InvariantResult } from '../InvariantChecker';
import { IDEXEdge } from '../../SemanticFinancialGraph/Interfaces/IEdge';
import { DebugLogger } from '../../Utils/DebugLogger';

export interface CurvePoolState extends AMMState {
  amplificationCoefficient: number; // A parameter for stable swap
  balances: BigNumber[]; // Array of token balances
  virtualPrice?: BigNumber; // Virtual price for LP tokens
  adminFee?: BigNumber; // Admin fee percentage
}

export class CurveInvariant {
  private stateTracker: StateTracker;
  private invariantChecker: InvariantChecker;
  private readonly PRECISION = new BigNumber('1000000000000000000'); // 10^18
  
  constructor(stateTracker: StateTracker) {
    this.stateTracker = stateTracker;
    this.invariantChecker = new InvariantChecker(stateTracker);
  }
  
  /**
   * Calculate the stable swap invariant D
   * Formula: An^n * sum(x_i) + D = A*D*n^n + (D^(n+1))/(n^n * prod(x_i))
   */
  calculateInvariantD(
    balances: BigNumber[],
    amplificationCoefficient: number
  ): BigNumber {
    const n = balances.length;
    const Ann = new BigNumber(amplificationCoefficient).multipliedBy(Math.pow(n, n));
    
    // Calculate sum of balances
    const sum = balances.reduce((acc, balance) => acc.plus(balance), new BigNumber(0));
    
    if (sum.isZero()) {
      return new BigNumber(0);
    }
    
    // Newton's method to find D
    let D = sum;
    let prevD = new BigNumber(0);
    
    // Iterate until convergence
    for (let i = 0; i < 255; i++) {
      // Calculate D_P = D^(n+1) / (n^n * prod(x_i))
      let D_P = D;
      for (const balance of balances) {
        if (balance.isZero()) {
          return new BigNumber(0);
        }
        D_P = D_P.multipliedBy(D).div(balance.multipliedBy(n));
      }
      
      prevD = D;
      
      // Calculate new D using Newton's method
      const numerator = Ann.multipliedBy(sum).plus(D_P.multipliedBy(n)).multipliedBy(D);
      const denominator = Ann.minus(1).multipliedBy(D).plus(new BigNumber(n + 1).multipliedBy(D_P));
      
      D = numerator.div(denominator);
      
      // Check convergence
      if (D.minus(prevD).abs().lte(1)) {
        break;
      }
    }
    
    return D;
  }
  
  /**
   * Calculate the output amount for a Curve stable swap
   */
  calculateSwapOutput(
    inputAmount: BigNumber,
    inputIndex: number,
    outputIndex: number,
    balances: BigNumber[],
    amplificationCoefficient: number,
    fee: BigNumber = new BigNumber('0.0004') // 0.04% default fee
  ): BigNumber {
    const n = balances.length;
    const D = this.calculateInvariantD(balances, amplificationCoefficient);
    
    // Calculate new balance for input token
    const newBalances = [...balances];
    newBalances[inputIndex] = newBalances[inputIndex].plus(inputAmount);
    
    // Calculate y (output balance after swap)
    const Ann = new BigNumber(amplificationCoefficient).multipliedBy(Math.pow(n, n));
    
    // Sum of all balances except output
    let c = D;
    let s = new BigNumber(0);
    for (let i = 0; i < n; i++) {
      if (i === outputIndex) continue;
      s = s.plus(newBalances[i]);
      c = c.multipliedBy(D).div(newBalances[i].multipliedBy(n));
    }
    
    c = c.multipliedBy(D).div(Ann.multipliedBy(Math.pow(n, n)));
    const b = s.plus(D.div(Ann));
    
    // Solve for y using Newton's method
    let y = D;
    let prevY = new BigNumber(0);
    
    for (let i = 0; i < 255; i++) {
      prevY = y;
      y = y.multipliedBy(y).plus(c).div(y.multipliedBy(2).plus(b).minus(D));
      
      if (y.minus(prevY).abs().lte(1)) {
        break;
      }
    }
    
    // Calculate output amount (with fee)
    const dy = balances[outputIndex].minus(y);
    const feeAmount = dy.multipliedBy(fee);
    
    return dy.minus(feeAmount);
  }
  
  /**
   * Verify Curve stable swap maintains invariant
   */
  async verifyStableSwap(
    edge: IDEXEdge,
    poolAddress: string,
    poolState: CurvePoolState,
    blockNumber: number,
    transactionHash: string
  ): Promise<InvariantResult> {
    try {
      // Calculate D before swap
      const DBefore = this.calculateInvariantD(
        poolState.balances,
        poolState.amplificationCoefficient
      );
      
      // Simulate swap to get new balances
      const tokenInIndex = this.getTokenIndex(edge.Token0, poolState);
      const tokenOutIndex = this.getTokenIndex(edge.Token1, poolState);
      const amountIn = new BigNumber(edge.AmountIn);
      const amountOut = new BigNumber(edge.AmountOut);
      
      // Update balances after swap
      const newBalances = [...poolState.balances];
      newBalances[tokenInIndex] = newBalances[tokenInIndex].plus(amountIn);
      newBalances[tokenOutIndex] = newBalances[tokenOutIndex].minus(amountOut);
      
      // Calculate D after swap
      const DAfter = this.calculateInvariantD(
        newBalances,
        poolState.amplificationCoefficient
      );
      
      // Calculate deviation
      const deviation = DBefore.minus(DAfter).abs().div(DBefore).toNumber();
      
      // Tolerance for stable swap (much tighter than regular AMM)
      const tolerance = 0.00001; // 0.001%
      const valid = deviation <= tolerance;
      
      const result: InvariantResult = {
        valid,
        protocol: 'Curve',
        invariantType: 'stable_swap',
        deviation,
        message: valid
          ? `Stable swap invariant maintained (deviation: ${(deviation * 100).toFixed(6)}%)`
          : `Stable swap invariant violated (deviation: ${(deviation * 100).toFixed(6)}%, tolerance: ${(tolerance * 100).toFixed(4)}%)`,
        details: {
          DBefore: DBefore.toString(),
          DAfter: DAfter.toString(),
          amplificationCoefficient: poolState.amplificationCoefficient,
          balancesBefore: poolState.balances.map(b => b.toString()),
          balancesAfter: newBalances.map(b => b.toString()),
          swap: {
            tokenIn: edge.Token0,
            tokenOut: edge.Token1,
            amountIn: amountIn.toString(),
            amountOut: amountOut.toString()
          }
        },
        severity: valid ? 'low' : this.calculateSeverity(deviation, tolerance)
      };
      
      // Record violation if invalid
      if (!valid) {
        this.recordViolation(poolAddress, blockNumber, transactionHash, result);
      }
      
      DebugLogger.core(`Curve stable swap invariant check: ${result.message}`);
      
      return result;
    } catch (error) {
      DebugLogger.error(`Error verifying Curve stable swap: ${error}`);
      return {
        valid: false,
        protocol: 'Curve',
        invariantType: 'stable_swap',
        message: `Error verifying stable swap: ${error}`,
        severity: 'high'
      };
    }
  }
  
  /**
   * Verify Curve pool virtual price consistency
   */
  async verifyVirtualPrice(
    poolState: CurvePoolState,
    blockNumber: number,
    transactionHash: string
  ): Promise<InvariantResult> {
    try {
      const D = this.calculateInvariantD(
        poolState.balances,
        poolState.amplificationCoefficient
      );
      
      // Virtual price = D / total LP supply
      const calculatedVirtualPrice = D.div(poolState.totalSupply);
      
      if (!poolState.virtualPrice) {
        return {
          valid: true,
          protocol: 'Curve',
          invariantType: 'virtual_price',
          message: 'Virtual price not available for comparison',
          details: {
            calculatedVirtualPrice: calculatedVirtualPrice.toString()
          }
        };
      }
      
      const deviation = calculatedVirtualPrice.minus(poolState.virtualPrice)
        .abs()
        .div(poolState.virtualPrice)
        .toNumber();
      
      const tolerance = 0.001; // 0.1% tolerance
      const valid = deviation <= tolerance;
      
      return {
        valid,
        protocol: 'Curve',
        invariantType: 'virtual_price',
        deviation,
        message: valid
          ? `Virtual price consistent (deviation: ${(deviation * 100).toFixed(4)}%)`
          : `Virtual price inconsistent (deviation: ${(deviation * 100).toFixed(4)}%)`,
        details: {
          calculatedVirtualPrice: calculatedVirtualPrice.toString(),
          reportedVirtualPrice: poolState.virtualPrice.toString(),
          D: D.toString()
        },
        severity: valid ? 'low' : 'medium'
      };
    } catch (error) {
      return {
        valid: false,
        protocol: 'Curve',
        invariantType: 'virtual_price',
        message: `Error verifying virtual price: ${error}`,
        severity: 'high'
      };
    }
  }
  
  /**
   * Helper: Get token index in pool
   */
  private getTokenIndex(tokenAddress: string, poolState: CurvePoolState): number {
    // In a real implementation, this would map token addresses to pool indices
    // For now, we'll use a simple mapping based on token symbols
    const tokenMap: { [key: string]: number } = {
      'DAI': 0,
      'USDC': 1,
      'USDT': 2,
      'TUSD': 3
    };
    
    return tokenMap[tokenAddress] || 0;
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
      `Curve invariant violation: ${result.invariantType} at ${poolAddress}`,
      {
        blockNumber,
        transactionHash,
        deviation: result.deviation,
        severity: result.severity
      }
    );
  }
}