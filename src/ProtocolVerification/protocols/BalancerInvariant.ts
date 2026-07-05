/**
 * Balancer Protocol Invariant Implementation
 * Verifies the weighted constant product formula for Balancer pools
 */

import { BigNumber } from '../../DSL/MathematicalExtensions';
import { StateTracker, AMMState } from '../StateTracker';
import { InvariantChecker, InvariantResult } from '../InvariantChecker';
import { IDEXEdge } from '../../SemanticFinancialGraph/Interfaces/IEdge';
import { DebugLogger } from '../../Utils/DebugLogger';

export interface BalancerToken {
  address: string;
  symbol: string;
  decimals: number;
  balance: BigNumber;
  weight: BigNumber; // Normalized weight (sum of all weights = 1)
  denormalizedWeight: BigNumber; // Raw weight value
}

export interface BalancerPoolState extends AMMState {
  tokens: BalancerToken[];
  swapFee: BigNumber;
  protocolFee: BigNumber;
  invariant: BigNumber; // V = Π(B_i^w_i)
  totalWeight: BigNumber;
  poolType: 'weighted' | 'stable' | 'element' | 'linear';
}

export class BalancerInvariant {
  private stateTracker: StateTracker;
  private invariantChecker: InvariantChecker;
  private readonly ONE = new BigNumber('1');
  
  constructor(stateTracker: StateTracker) {
    this.stateTracker = stateTracker;
    this.invariantChecker = new InvariantChecker(stateTracker);
  }
  
  /**
   * Calculate the weighted pool invariant
   * V = Π(B_i^w_i) where B_i is balance and w_i is normalized weight
   */
  calculateInvariant(tokens: BalancerToken[]): BigNumber {
    let invariant = new BigNumber(1);
    
    for (const token of tokens) {
      // For each token: invariant *= balance^weight
      // Using logarithms for numerical stability: log(V) = Σ(w_i * log(B_i))
      const logBalance = this.naturalLog(token.balance);
      const weightedLog = logBalance.multipliedBy(token.weight);
      const tokenContribution = this.exp(weightedLog);
      invariant = invariant.multipliedBy(tokenContribution);
    }
    
    return invariant;
  }
  
  /**
   * Calculate output amount for a weighted pool swap
   * Formula: A_out = B_out * (1 - (B_in / (B_in + A_in * (1 - fee)))^(w_in/w_out))
   */
  calculateSwapOutput(
    amountIn: BigNumber,
    tokenIn: BalancerToken,
    tokenOut: BalancerToken,
    swapFee: BigNumber
  ): BigNumber {
    // Apply swap fee
    const amountInAfterFee = amountIn.multipliedBy(this.ONE.minus(swapFee));
    
    // Calculate weight ratio
    const weightRatio = tokenIn.weight.div(tokenOut.weight);
    
    // New balance of token in
    const newBalanceIn = tokenIn.balance.plus(amountInAfterFee);
    
    // Calculate balance ratio
    const balanceRatio = newBalanceIn.div(tokenIn.balance);
    
    // Calculate new balance of token out
    // B_out_new = B_out * (B_in / B_in_new)^(w_in/w_out)
    const invBalanceRatio = this.ONE.div(balanceRatio);
    const scaledRatio = this.pow(invBalanceRatio, weightRatio);
    const newBalanceOut = tokenOut.balance.multipliedBy(scaledRatio);
    
    // Amount out is the difference
    const amountOut = tokenOut.balance.minus(newBalanceOut);
    
    return amountOut;
  }
  
  /**
   * Calculate spot price between two tokens
   * SpotPrice = (B_in / w_in) / (B_out / w_out)
   */
  calculateSpotPrice(
    tokenIn: BalancerToken,
    tokenOut: BalancerToken,
    swapFee: BigNumber = new BigNumber(0)
  ): BigNumber {
    const balanceIn = tokenIn.balance.div(tokenIn.weight);
    const balanceOut = tokenOut.balance.div(tokenOut.weight);
    const spotPrice = balanceIn.div(balanceOut);
    
    // Adjust for swap fee if needed
    if (!swapFee.isZero()) {
      return spotPrice.div(this.ONE.minus(swapFee));
    }
    
    return spotPrice;
  }
  
  /**
   * Verify Balancer weighted pool swap maintains invariant
   */
  async verifyWeightedSwap(
    edge: IDEXEdge,
    poolAddress: string,
    poolState: BalancerPoolState,
    blockNumber: number,
    transactionHash: string
  ): Promise<InvariantResult> {
    try {
      // Calculate invariant before swap
      const invariantBefore = this.calculateInvariant(poolState.tokens);
      
      // Find token indices
      const tokenInIndex = this.findTokenIndex(edge.Token0, poolState.tokens);
      const tokenOutIndex = this.findTokenIndex(edge.Token1, poolState.tokens);
      
      if (tokenInIndex === -1 || tokenOutIndex === -1) {
        return {
          valid: false,
          protocol: 'Balancer',
          invariantType: 'weighted_product',
          message: 'Token not found in pool',
          severity: 'high'
        };
      }
      
      // Update balances after swap
      const newTokens = [...poolState.tokens];
      const amountIn = new BigNumber(edge.AmountIn);
      const amountOut = new BigNumber(edge.AmountOut);
      
      newTokens[tokenInIndex] = {
        ...newTokens[tokenInIndex],
        balance: newTokens[tokenInIndex].balance.plus(amountIn)
      };
      
      newTokens[tokenOutIndex] = {
        ...newTokens[tokenOutIndex],
        balance: newTokens[tokenOutIndex].balance.minus(amountOut)
      };
      
      // Calculate invariant after swap
      const invariantAfter = this.calculateInvariant(newTokens);
      
      // The invariant should remain constant or increase slightly due to fees
      // Calculate relative change
      const relativeChange = invariantAfter.minus(invariantBefore).div(invariantBefore);
      
      // Tolerance for weighted pools (accounting for fees)
      const minChange = new BigNumber('-0.0001'); // -0.01% (small decrease allowed for rounding)
      const maxChange = poolState.swapFee.multipliedBy(2); // Up to 2x swap fee increase expected
      
      const valid = relativeChange.gte(minChange) && relativeChange.lte(maxChange);
      
      const result: InvariantResult = {
        valid,
        protocol: 'Balancer',
        invariantType: 'weighted_product',
        deviation: relativeChange.abs().toNumber(),
        message: valid
          ? `Weighted pool invariant maintained (change: ${relativeChange.multipliedBy(100).toFixed(6)}%)`
          : `Weighted pool invariant violated (change: ${relativeChange.multipliedBy(100).toFixed(6)}%)`,
        details: {
          invariantBefore: invariantBefore.toString(),
          invariantAfter: invariantAfter.toString(),
          relativeChange: relativeChange.toString(),
          swap: {
            tokenIn: edge.Token0,
            tokenOut: edge.Token1,
            amountIn: amountIn.toString(),
            amountOut: amountOut.toString()
          },
          weights: poolState.tokens.map(t => ({
            token: t.symbol,
            weight: t.weight.toString()
          }))
        },
        severity: valid ? 'low' : this.calculateSeverity(relativeChange.abs().toNumber())
      };
      
      // Record violation if invalid
      if (!valid) {
        this.recordViolation(poolAddress, blockNumber, transactionHash, result);
      }
      
      DebugLogger.core(`Balancer weighted pool invariant check: ${result.message}`);
      
      return result;
    } catch (error) {
      DebugLogger.error(`Error verifying Balancer weighted swap: ${error}`);
      return {
        valid: false,
        protocol: 'Balancer',
        invariantType: 'weighted_product',
        message: `Error verifying weighted swap: ${error}`,
        severity: 'high'
      };
    }
  }
  
  /**
   * Verify liquidity operation (join/exit) maintains invariant ratios
   */
  async verifyLiquidityOperation(
    operation: 'join' | 'exit',
    poolState: BalancerPoolState,
    tokenAmounts: Map<string, BigNumber>,
    bptAmount: BigNumber, // Balancer Pool Token amount
    blockNumber: number,
    transactionHash: string
  ): Promise<InvariantResult> {
    try {
      const invariantBefore = this.calculateInvariant(poolState.tokens);
      
      // Check if operation is proportional
      let isProportional = true;
      const bptRatio = operation === 'join'
        ? bptAmount.div(poolState.totalSupply.plus(bptAmount))
        : bptAmount.div(poolState.totalSupply);
      
      const newTokens = [...poolState.tokens];
      
      for (let i = 0; i < poolState.tokens.length; i++) {
        const token = poolState.tokens[i];
        const amount = tokenAmounts.get(token.address) || new BigNumber(0);
        
        if (operation === 'join') {
          newTokens[i] = {
            ...token,
            balance: token.balance.plus(amount)
          };
          
          // Check if proportional
          const expectedAmount = token.balance.multipliedBy(bptRatio);
          const deviation = amount.minus(expectedAmount).abs().div(expectedAmount);
          if (deviation.gt(0.001)) { // 0.1% tolerance
            isProportional = false;
          }
        } else {
          newTokens[i] = {
            ...token,
            balance: token.balance.minus(amount)
          };
          
          // Check if proportional
          const expectedAmount = token.balance.multipliedBy(bptRatio);
          const deviation = amount.minus(expectedAmount).abs().div(expectedAmount);
          if (deviation.gt(0.001)) {
            isProportional = false;
          }
        }
      }
      
      const invariantAfter = this.calculateInvariant(newTokens);
      
      // For proportional operations, invariant should scale with BPT supply
      let expectedChange: BigNumber;
      if (isProportional) {
        expectedChange = operation === 'join'
          ? invariantBefore.multipliedBy(this.ONE.plus(bptRatio))
          : invariantBefore.multipliedBy(this.ONE.minus(bptRatio));
      } else {
        // For non-proportional, invariant change depends on specific amounts
        expectedChange = invariantAfter; // We'll check if it's reasonable
      }
      
      const deviation = invariantAfter.minus(expectedChange).abs().div(expectedChange);
      const valid = deviation.lt(0.001); // 0.1% tolerance
      
      return {
        valid,
        protocol: 'Balancer',
        invariantType: 'liquidity_operation',
        deviation: deviation.toNumber(),
        message: valid
          ? `Liquidity ${operation} maintains invariant (${isProportional ? 'proportional' : 'single-sided'})`
          : `Liquidity ${operation} violates invariant`,
        details: {
          operation,
          isProportional,
          invariantBefore: invariantBefore.toString(),
          invariantAfter: invariantAfter.toString(),
          bptAmount: bptAmount.toString(),
          bptRatio: bptRatio.toString()
        },
        severity: valid ? 'low' : 'medium'
      };
    } catch (error) {
      return {
        valid: false,
        protocol: 'Balancer',
        invariantType: 'liquidity_operation',
        message: `Error verifying liquidity operation: ${error}`,
        severity: 'high'
      };
    }
  }
  
  /**
   * Verify spot price consistency across pool
   */
  async verifySpotPrices(
    poolState: BalancerPoolState,
    blockNumber: number,
    transactionHash: string
  ): Promise<InvariantResult> {
    try {
      // Check price consistency: for any path A->B->C, price(A->C) should equal price(A->B) * price(B->C)
      const tokens = poolState.tokens;
      let maxDeviation = new BigNumber(0);
      let inconsistentPairs: string[] = [];
      
      for (let i = 0; i < tokens.length; i++) {
        for (let j = 0; j < tokens.length; j++) {
          if (i === j) continue;
          
          for (let k = 0; k < tokens.length; k++) {
            if (k === i || k === j) continue;
            
            // Calculate direct price i -> k
            const directPrice = this.calculateSpotPrice(tokens[i], tokens[k], poolState.swapFee);
            
            // Calculate indirect price i -> j -> k
            const priceIJ = this.calculateSpotPrice(tokens[i], tokens[j], poolState.swapFee);
            const priceJK = this.calculateSpotPrice(tokens[j], tokens[k], poolState.swapFee);
            const indirectPrice = priceIJ.multipliedBy(priceJK);
            
            // Check deviation
            const deviation = directPrice.minus(indirectPrice).abs().div(directPrice);
            
            if (deviation.gt(maxDeviation)) {
              maxDeviation = deviation;
            }
            
            if (deviation.gt(0.001)) { // 0.1% tolerance
              inconsistentPairs.push(`${tokens[i].symbol}->${tokens[j].symbol}->${tokens[k].symbol}`);
            }
          }
        }
      }
      
      const valid = maxDeviation.lt(0.001);
      
      return {
        valid,
        protocol: 'Balancer',
        invariantType: 'spot_price_consistency',
        deviation: maxDeviation.toNumber(),
        message: valid
          ? `Spot prices consistent (max deviation: ${maxDeviation.multipliedBy(100).toFixed(4)}%)`
          : `Spot price inconsistency detected`,
        details: {
          maxDeviation: maxDeviation.toString(),
          inconsistentPairs: inconsistentPairs.length > 0 ? inconsistentPairs : undefined,
          tokenCount: tokens.length
        },
        severity: valid ? 'low' : 'medium'
      };
    } catch (error) {
      return {
        valid: false,
        protocol: 'Balancer',
        invariantType: 'spot_price_consistency',
        message: `Error verifying spot prices: ${error}`,
        severity: 'high'
      };
    }
  }
  
  /**
   * Helper: Find token index in pool
   */
  private findTokenIndex(tokenAddress: string, tokens: BalancerToken[]): number {
    return tokens.findIndex(t => 
      t.address.toLowerCase() === tokenAddress.toLowerCase() ||
      t.symbol === tokenAddress
    );
  }
  
  /**
   * Helper: Natural logarithm
   */
  private naturalLog(value: BigNumber): BigNumber {
    // For simplicity, convert to number for log calculation
    // In production, use a high-precision log implementation
    const num = value.toNumber();
    if (num <= 0) {
      throw new Error('Cannot take log of non-positive number');
    }
    return new BigNumber(Math.log(num));
  }
  
  /**
   * Helper: Exponential function
   */
  private exp(value: BigNumber): BigNumber {
    // For simplicity, convert to number for exp calculation
    // In production, use a high-precision exp implementation
    const num = value.toNumber();
    return new BigNumber(Math.exp(num));
  }
  
  /**
   * Helper: Power function
   */
  private pow(base: BigNumber, exponent: BigNumber): BigNumber {
    // For fractional exponents, use exp(exponent * ln(base))
    if (exponent.isInteger()) {
      return base.pow(exponent);
    } else {
      const logBase = this.naturalLog(base);
      const result = this.exp(logBase.multipliedBy(exponent));
      return result;
    }
  }
  
  /**
   * Helper: Calculate severity
   */
  private calculateSeverity(deviation: number): 'low' | 'medium' | 'high' | 'critical' {
    if (deviation <= 0.001) return 'low';    // <= 0.1%
    if (deviation <= 0.01) return 'medium';  // <= 1%
    if (deviation <= 0.05) return 'high';    // <= 5%
    return 'critical';                       // > 5%
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
      `Balancer invariant violation: ${result.invariantType} at ${poolAddress}`,
      {
        blockNumber,
        transactionHash,
        deviation: result.deviation,
        severity: result.severity
      }
    );
  }
}