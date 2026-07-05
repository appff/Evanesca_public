/**
 * Mathematical Extensions for Protocol Verification
 * Provides high-precision mathematical operations using BigNumber.js
 * for verifying DeFi protocol invariants
 */

import BigNumber from 'bignumber.js';

// Configure BigNumber for maximum precision
BigNumber.config({
  DECIMAL_PLACES: 40,
  ROUNDING_MODE: BigNumber.ROUND_DOWN,
  EXPONENTIAL_AT: [-40, 40]
});

export class MathematicalExtensions {
  /**
   * Core Mathematical Functions
   */

  // Power function: base^exponent
  static pow(base: BigNumber | number | string, exponent: BigNumber | number | string): BigNumber {
    return new BigNumber(base).pow(new BigNumber(exponent));
  }

  // Square root
  static sqrt(value: BigNumber | number | string): BigNumber {
    return new BigNumber(value).sqrt();
  }

  // Natural logarithm (ln)
  static ln(value: BigNumber | number | string): BigNumber {
    const bn = new BigNumber(value);
    if (bn.lte(0)) {
      throw new Error('Cannot calculate ln of non-positive number');
    }
    // For reasonable values, use JavaScript Math.log
    if (bn.gt(0.001) && bn.lt(1e10)) {
      return new BigNumber(Math.log(bn.toNumber()));
    }
    // For extreme values, use Taylor series approximation
    return MathematicalExtensions.naturalLog(bn);
  }

  // Base 10 logarithm
  static log10(value: BigNumber | number | string): BigNumber {
    const bn = new BigNumber(value);
    if (bn.lte(0)) {
      throw new Error('Cannot calculate log10 of non-positive number');
    }
    // log10(x) = ln(x) / ln(10)
    const lnValue = MathematicalExtensions.ln(bn);
    const ln10 = MathematicalExtensions.ln(new BigNumber(10));
    return lnValue.div(ln10);
  }

  // Cube root
  static cbrt(value: BigNumber | number | string): BigNumber {
    return new BigNumber(value).pow(new BigNumber(1).div(3));
  }

  // Exponential function (e^x)
  static exp(value: BigNumber | number | string): BigNumber {
    const bn = new BigNumber(value);
    // Use built-in exponential or Taylor series
    // For now, use JavaScript Math.exp for reasonable values
    if (bn.abs().lt(100)) {
      return new BigNumber(Math.exp(bn.toNumber()));
    }
    // For large values, use approximation
    return new BigNumber(Math.E).pow(bn);
  }

  // Absolute value
  static abs(value: BigNumber | number | string): BigNumber {
    return new BigNumber(value).abs();
  }

  // Maximum value
  static max(...values: (BigNumber | number | string)[]): BigNumber {
    if (values.length === 0) {
      throw new Error('max requires at least one argument');
    }
    return BigNumber.max(...values.map(v => new BigNumber(v)));
  }

  // Minimum value
  static min(...values: (BigNumber | number | string)[]): BigNumber {
    if (values.length === 0) {
      throw new Error('min requires at least one argument');
    }
    return BigNumber.min(...values.map(v => new BigNumber(v)));
  }

  // Floor function
  static floor(value: BigNumber | number | string): BigNumber {
    return new BigNumber(value).integerValue(BigNumber.ROUND_DOWN);
  }

  // Ceiling function
  static ceil(value: BigNumber | number | string): BigNumber {
    return new BigNumber(value).integerValue(BigNumber.ROUND_UP);
  }

  /**
   * DeFi-Specific Calculations
   */

  // Calculate AMM invariant k = x * y
  static calculateK(reserveA: BigNumber | number | string, reserveB: BigNumber | number | string): BigNumber {
    return new BigNumber(reserveA).multipliedBy(new BigNumber(reserveB));
  }

  // Calculate price impact for AMM swap
  static priceImpact(
    amountIn: BigNumber | number | string,
    reserveIn: BigNumber | number | string,
    reserveOut: BigNumber | number | string
  ): BigNumber {
    const bnAmountIn = new BigNumber(amountIn);
    const bnReserveIn = new BigNumber(reserveIn);
    const bnReserveOut = new BigNumber(reserveOut);

    // Calculate output amount
    const amountOut = MathematicalExtensions.getAmountOut(bnAmountIn, bnReserveIn, bnReserveOut);
    
    // Calculate spot price (before swap)
    const spotPrice = bnReserveOut.div(bnReserveIn);
    
    // Calculate execution price (after swap)
    const executionPrice = amountOut.div(bnAmountIn);
    
    // Price impact = (spotPrice - executionPrice) / spotPrice
    const impact = spotPrice.minus(executionPrice).div(spotPrice).abs();
    
    return impact;
  }

  // Calculate AMM swap output (Uniswap V2 formula)
  static getAmountOut(
    amountIn: BigNumber | number | string,
    reserveIn: BigNumber | number | string,
    reserveOut: BigNumber | number | string,
    fee: number = 0.003 // 0.3% default fee
  ): BigNumber {
    const bnAmountIn = new BigNumber(amountIn);
    const bnReserveIn = new BigNumber(reserveIn);
    const bnReserveOut = new BigNumber(reserveOut);
    
    // Apply fee: amountInWithFee = amountIn * (1 - fee)
    const feeMultiplier = new BigNumber(1).minus(fee);
    const amountInWithFee = bnAmountIn.multipliedBy(feeMultiplier);
    
    // Calculate output: amountOut = (amountInWithFee * reserveOut) / (reserveIn + amountInWithFee)
    const numerator = amountInWithFee.multipliedBy(bnReserveOut);
    const denominator = bnReserveIn.plus(amountInWithFee);
    
    return numerator.div(denominator);
  }

  // Calculate utilization rate for lending protocols
  static utilizationRate(
    totalBorrows: BigNumber | number | string,
    totalSupply: BigNumber | number | string
  ): BigNumber {
    const bnBorrows = new BigNumber(totalBorrows);
    const bnSupply = new BigNumber(totalSupply);
    
    if (bnSupply.isZero()) {
      return new BigNumber(0);
    }
    
    // Utilization = totalBorrows / totalSupply
    return bnBorrows.div(bnSupply);
  }

  // Calculate interest rate based on utilization (Compound model)
  static calculateInterestRate(
    utilization: BigNumber | number | string,
    baseRate: BigNumber | number | string = 0.02, // 2% base rate
    multiplier: BigNumber | number | string = 0.18, // 18% multiplier
    kink: BigNumber | number | string = 0.8, // 80% kink
    jumpMultiplier: BigNumber | number | string = 5 // 500% jump multiplier
  ): BigNumber {
    const bnUtilization = new BigNumber(utilization);
    const bnBaseRate = new BigNumber(baseRate);
    const bnMultiplier = new BigNumber(multiplier);
    const bnKink = new BigNumber(kink);
    const bnJumpMultiplier = new BigNumber(jumpMultiplier);
    
    if (bnUtilization.lte(bnKink)) {
      // Below kink: rate = baseRate + utilization * multiplier
      return bnBaseRate.plus(bnUtilization.multipliedBy(bnMultiplier));
    } else {
      // Above kink: rate = baseRate + kink * multiplier + (utilization - kink) * jumpMultiplier
      const belowKinkRate = bnBaseRate.plus(bnKink.multipliedBy(bnMultiplier));
      const aboveKinkRate = bnUtilization.minus(bnKink).multipliedBy(bnJumpMultiplier);
      return belowKinkRate.plus(aboveKinkRate);
    }
  }

  // Calculate collateralization ratio
  static collateralizationRatio(
    collateralValue: BigNumber | number | string,
    debtValue: BigNumber | number | string
  ): BigNumber {
    const bnCollateral = new BigNumber(collateralValue);
    const bnDebt = new BigNumber(debtValue);
    
    if (bnDebt.isZero()) {
      return new BigNumber(Infinity);
    }
    
    // C-Ratio = collateralValue / debtValue
    return bnCollateral.div(bnDebt);
  }

  // Verify AMM constant product invariant (x * y = k)
  static verifyConstantProduct(
    reserveXBefore: BigNumber | number | string,
    reserveYBefore: BigNumber | number | string,
    reserveXAfter: BigNumber | number | string,
    reserveYAfter: BigNumber | number | string,
    fee: number = 0.003, // 0.3% fee
    tolerance: number = 0.0001 // 0.01% tolerance
  ): { valid: boolean; deviation: BigNumber; message: string } {
    const kBefore = MathematicalExtensions.calculateK(reserveXBefore, reserveYBefore);
    const kAfter = MathematicalExtensions.calculateK(reserveXAfter, reserveYAfter);
    
    // For Uniswap V2, k should remain constant or slightly decrease due to fees
    // We don't expect k to increase
    const kExpected = kBefore;
    
    // Calculate deviation
    const deviation = kAfter.minus(kExpected).abs().div(kExpected);
    
    const valid = deviation.lte(tolerance);
    const message = valid 
      ? `Invariant maintained (deviation: ${deviation.multipliedBy(100).toFixed(4)}%)`
      : `Invariant violated (deviation: ${deviation.multipliedBy(100).toFixed(4)}%)`;
    
    return { valid, deviation, message };
  }

  /**
   * Statistical Functions
   */

  // Calculate average
  static avg(values: (BigNumber | number | string)[]): BigNumber {
    if (values.length === 0) {
      return new BigNumber(0);
    }
    const bnValues = values.map(v => new BigNumber(v));
    const sum = bnValues.reduce((acc, val) => acc.plus(val), new BigNumber(0));
    return sum.div(values.length);
  }

  // Calculate standard deviation
  static std(values: (BigNumber | number | string)[]): BigNumber {
    if (values.length <= 1) {
      return new BigNumber(0);
    }
    
    const bnValues = values.map(v => new BigNumber(v));
    const mean = MathematicalExtensions.avg(bnValues);
    
    const squaredDiffs = bnValues.map(val => val.minus(mean).pow(2));
    const variance = squaredDiffs.reduce((acc, val) => acc.plus(val), new BigNumber(0)).div(values.length);
    
    return variance.sqrt();
  }

  // Calculate percentile
  static percentile(values: (BigNumber | number | string)[], percentile: number): BigNumber {
    if (values.length === 0) {
      throw new Error('Cannot calculate percentile of empty array');
    }
    if (percentile < 0 || percentile > 100) {
      throw new Error('Percentile must be between 0 and 100');
    }
    
    const sorted = values.map(v => new BigNumber(v)).sort((a, b) => {
      const comparison = a.comparedTo(b);
      return comparison === null ? 0 : comparison;
    });
    const index = (percentile / 100) * (sorted.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    
    if (lower === upper) {
      return sorted[lower];
    }
    
    // Interpolate between values
    const weight = index - lower;
    return sorted[lower].multipliedBy(1 - weight).plus(sorted[upper].multipliedBy(weight));
  }

  /**
   * Helper Functions
   */

  // Natural logarithm implementation using Taylor series
  private static naturalLog(x: BigNumber): BigNumber {
    if (x.lte(0)) {
      throw new Error('Natural log is only defined for positive numbers');
    }
    
    // For better convergence, use: ln(x) = ln(x/e^n) + n
    // where n is chosen so that x/e^n is close to 1
    let n = 0;
    let adjustedX = new BigNumber(x);
    const e = new BigNumber(Math.E);
    
    // Adjust x to be close to 1 for better convergence
    while (adjustedX.gt(e)) {
      adjustedX = adjustedX.div(e);
      n++;
    }
    while (adjustedX.lt(1)) {
      adjustedX = adjustedX.multipliedBy(e);
      n--;
    }
    
    // Now use Taylor series for ln(1 + y) where y = adjustedX - 1
    const y = adjustedX.minus(1);
    let result = new BigNumber(0);
    let term = new BigNumber(y);
    
    // Calculate Taylor series: ln(1+y) = y - y^2/2 + y^3/3 - y^4/4 + ...
    for (let i = 1; i <= 100; i++) {
      if (i > 1) {
        term = term.multipliedBy(y).negated();
      }
      result = result.plus(term.div(i));
      
      // Check for convergence
      if (term.div(i).abs().lt(new BigNumber(1e-40))) {
        break;
      }
    }
    
    // Add back the adjustment
    return result.plus(n);
  }

  // Convert regular number to BigNumber
  static toBigNumber(value: BigNumber | number | string): BigNumber {
    return new BigNumber(value);
  }

  // Convert BigNumber to regular number (with potential precision loss)
  static toNumber(value: BigNumber): number {
    return value.toNumber();
  }
}

// Export BigNumber type for external use
export { BigNumber };