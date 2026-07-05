/**
 * Protocol Invariant Helper Functions
 * Mathematical and utility functions required for DSL constraint evaluation
 */

import BigNumber from 'bignumber.js';
import { DebugLogger } from './DebugLogger';

export class ProtocolInvariantHelpers {
  
  /**
   * Uniswap V2 K-invariant calculation
   * K = reserveA * reserveB (constant product formula)
   */
  static calculateK(reserveA: BigNumber | number | string, reserveB: BigNumber | number | string): BigNumber {
    try {
      const a = new BigNumber(reserveA);
      const b = new BigNumber(reserveB);
      
      if (a.isNaN() || b.isNaN() || a.lt(0) || b.lt(0)) {
        DebugLogger.error(`[ProtocolInvariantHelpers] Invalid reserves for K calculation: ${a.toString()}, ${b.toString()}`);
        return new BigNumber(0);
      }
      
      return a.multipliedBy(b);
    } catch (error) {
      DebugLogger.error(`[ProtocolInvariantHelpers] Error calculating K: ${error}`);
      return new BigNumber(0);
    }
  }

  /**
   * MakerDAO collateralization ratio calculation
   * Ratio = collateralValueUSD / debtValueUSD
   */
  static collateralizationRatio(collateralUSD: BigNumber | number | string, debtUSD: BigNumber | number | string): BigNumber {
    try {
      const collateral = new BigNumber(collateralUSD);
      const debt = new BigNumber(debtUSD);
      
      if (collateral.isNaN() || debt.isNaN() || collateral.lt(0) || debt.lt(0)) {
        DebugLogger.error(`[ProtocolInvariantHelpers] Invalid values for collateralization ratio: ${collateral.toString()}, ${debt.toString()}`);
        return new BigNumber(0);
      }
      
      if (debt.isZero()) {
        return new BigNumber(Number.MAX_SAFE_INTEGER); // Infinite ratio when no debt
      }
      
      return collateral.dividedBy(debt);
    } catch (error) {
      DebugLogger.error(`[ProtocolInvariantHelpers] Error calculating collateralization ratio: ${error}`);
      return new BigNumber(0);
    }
  }

  /**
   * Aave/Compound utilization rate calculation
   * UtilizationRate = totalBorrows / (totalBorrows + totalCash)
   */
  static utilizationRate(totalBorrows: BigNumber | number | string, totalCash: BigNumber | number | string): BigNumber {
    try {
      const borrows = new BigNumber(totalBorrows);
      const cash = new BigNumber(totalCash);
      
      if (borrows.isNaN() || cash.isNaN() || borrows.lt(0) || cash.lt(0)) {
        DebugLogger.error(`[ProtocolInvariantHelpers] Invalid values for utilization rate: ${borrows.toString()}, ${cash.toString()}`);
        return new BigNumber(0);
      }
      
      const totalSupply = borrows.plus(cash);
      if (totalSupply.isZero()) {
        return new BigNumber(0); // No utilization when no supply
      }
      
      return borrows.dividedBy(totalSupply);
    } catch (error) {
      DebugLogger.error(`[ProtocolInvariantHelpers] Error calculating utilization rate: ${error}`);
      return new BigNumber(0);
    }
  }

  /**
   * Aave health factor calculation
   * HealthFactor = (collateralValueUSD * liquidationThreshold) / totalDebtUSD
   */
  static healthFactor(
    collateralUSD: BigNumber | number | string, 
    debtUSD: BigNumber | number | string, 
    liquidationThreshold: number = 0.8
  ): BigNumber {
    try {
      const collateral = new BigNumber(collateralUSD);
      const debt = new BigNumber(debtUSD);
      const threshold = new BigNumber(liquidationThreshold);
      
      if (collateral.isNaN() || debt.isNaN() || threshold.isNaN()) {
        DebugLogger.error(`[ProtocolInvariantHelpers] Invalid values for health factor calculation`);
        return new BigNumber(0);
      }
      
      if (debt.isZero()) {
        return new BigNumber(Number.MAX_SAFE_INTEGER); // Infinite health when no debt
      }
      
      const adjustedCollateral = collateral.multipliedBy(threshold);
      return adjustedCollateral.dividedBy(debt);
    } catch (error) {
      DebugLogger.error(`[ProtocolInvariantHelpers] Error calculating health factor: ${error}`);
      return new BigNumber(0);
    }
  }

  /**
   * Curve stable swap invariant calculation (simplified for 2-asset pools)
   * D^n*n^n = sum(x_i)*D^(n-1) + product(x_i)*n^n
   * Simplified: D = sum(reserves) + (product(reserves) * 4 / amplificationCoeff)
   */
  static curveStableInvariant(
    reserves: (BigNumber | number | string)[], 
    amplificationCoeff: BigNumber | number | string = 100
  ): BigNumber {
    try {
      const reservesBN = reserves.map(r => new BigNumber(r));
      const A = new BigNumber(amplificationCoeff);
      
      if (reservesBN.some(r => r.isNaN() || r.lt(0)) || A.isNaN() || A.lte(0)) {
        DebugLogger.error(`[ProtocolInvariantHelpers] Invalid values for Curve invariant calculation`);
        return new BigNumber(0);
      }
      
      // Calculate sum of reserves
      const sum = reservesBN.reduce((acc, reserve) => acc.plus(reserve), new BigNumber(0));
      
      // Calculate product of reserves
      const product = reservesBN.reduce((acc, reserve) => acc.multipliedBy(reserve), new BigNumber(1));
      
      // Simplified invariant: D = sum + (product * 4 / A)
      const invariantTerm = product.multipliedBy(4).dividedBy(A);
      return sum.plus(invariantTerm);
      
    } catch (error) {
      DebugLogger.error(`[ProtocolInvariantHelpers] Error calculating Curve invariant: ${error}`);
      return new BigNumber(0);
    }
  }

  /**
   * Price deviation calculation
   * Returns the percentage deviation between two prices
   */
  static priceDeviation(price1: BigNumber | number | string, price2: BigNumber | number | string): BigNumber {
    try {
      const p1 = new BigNumber(price1);
      const p2 = new BigNumber(price2);
      
      if (p1.isNaN() || p2.isNaN() || p1.lte(0) || p2.lte(0)) {
        DebugLogger.error(`[ProtocolInvariantHelpers] Invalid prices for deviation calculation: ${p1.toString()}, ${p2.toString()}`);
        return new BigNumber(0);
      }
      
      return p1.minus(p2).abs().dividedBy(p2);
    } catch (error) {
      DebugLogger.error(`[ProtocolInvariantHelpers] Error calculating price deviation: ${error}`);
      return new BigNumber(0);
    }
  }

  /**
   * Time-weighted average price (TWAP) calculation
   * Calculates TWAP from an array of price points with timestamps
   */
  static calculateTWAP(pricePoints: Array<{ price: BigNumber | number | string, timestamp: number }>): BigNumber {
    try {
      if (pricePoints.length < 2) {
        DebugLogger.error(`[ProtocolInvariantHelpers] Not enough price points for TWAP calculation`);
        return new BigNumber(0);
      }

      // Sort by timestamp
      const sortedPoints = pricePoints
        .map(p => ({ price: new BigNumber(p.price), timestamp: p.timestamp }))
        .sort((a, b) => a.timestamp - b.timestamp);

      let weightedSum = new BigNumber(0);
      let totalTime = new BigNumber(0);

      for (let i = 1; i < sortedPoints.length; i++) {
        const timeDelta = new BigNumber(sortedPoints[i].timestamp - sortedPoints[i - 1].timestamp);
        const priceWeight = sortedPoints[i - 1].price.multipliedBy(timeDelta);
        
        weightedSum = weightedSum.plus(priceWeight);
        totalTime = totalTime.plus(timeDelta);
      }

      if (totalTime.isZero()) {
        return sortedPoints[0].price;
      }

      return weightedSum.dividedBy(totalTime);
    } catch (error) {
      DebugLogger.error(`[ProtocolInvariantHelpers] Error calculating TWAP: ${error}`);
      return new BigNumber(0);
    }
  }

  /**
   * Interest rate calculation for lending protocols
   * Simple linear interest rate model
   */
  static calculateInterestRate(
    utilizationRate: BigNumber | number | string,
    baseRate: number = 0.02,
    multiplier: number = 0.20
  ): BigNumber {
    try {
      const utilization = new BigNumber(utilizationRate);
      const base = new BigNumber(baseRate);
      const mult = new BigNumber(multiplier);
      
      if (utilization.isNaN() || utilization.lt(0) || utilization.gt(1)) {
        DebugLogger.error(`[ProtocolInvariantHelpers] Invalid utilization rate: ${utilization.toString()}`);
        return new BigNumber(0);
      }
      
      return base.plus(utilization.multipliedBy(mult));
    } catch (error) {
      DebugLogger.error(`[ProtocolInvariantHelpers] Error calculating interest rate: ${error}`);
      return new BigNumber(0);
    }
  }

  /**
   * Absolute value calculation
   */
  static abs(value: BigNumber | number | string): BigNumber {
    try {
      const bn = new BigNumber(value);
      return bn.abs();
    } catch (error) {
      DebugLogger.error(`[ProtocolInvariantHelpers] Error calculating absolute value: ${error}`);
      return new BigNumber(0);
    }
  }

  /**
   * Safe division with zero check
   */
  static safeDivide(
    numerator: BigNumber | number | string, 
    denominator: BigNumber | number | string,
    defaultValue: BigNumber | number | string = 0
  ): BigNumber {
    try {
      const num = new BigNumber(numerator);
      const den = new BigNumber(denominator);
      const def = new BigNumber(defaultValue);
      
      if (den.isZero()) {
        return def;
      }
      
      return num.dividedBy(den);
    } catch (error) {
      DebugLogger.error(`[ProtocolInvariantHelpers] Error in safe division: ${error}`);
      return new BigNumber(defaultValue);
    }
  }

  /**
   * Percentage calculation
   */
  static percentage(value: BigNumber | number | string, total: BigNumber | number | string): BigNumber {
    try {
      const val = new BigNumber(value);
      const tot = new BigNumber(total);
      
      if (tot.isZero()) {
        return new BigNumber(0);
      }
      
      return val.dividedBy(tot).multipliedBy(100);
    } catch (error) {
      DebugLogger.error(`[ProtocolInvariantHelpers] Error calculating percentage: ${error}`);
      return new BigNumber(0);
    }
  }

  /**
   * Flash loan fee calculation
   */
  static calculateFlashLoanFee(amount: BigNumber | number | string, protocol: string): BigNumber {
    try {
      const loanAmount = new BigNumber(amount);
      
      const feeRates = {
        'aave': 0.0009,      // 0.09%
        'dydx': 0,           // 0%
        'balancer': 0,       // 0%
        'compound': 0,       // 0%
        'maker': 0           // 0%
      };
      
      const feeRate = feeRates[protocol.toLowerCase() as keyof typeof feeRates] || 0;
      return loanAmount.multipliedBy(new BigNumber(feeRate));
    } catch (error) {
      DebugLogger.error(`[ProtocolInvariantHelpers] Error calculating flash loan fee: ${error}`);
      return new BigNumber(0);
    }
  }

  /**
   * Utility function to validate and convert numbers
   */
  static toBigNumber(value: any): BigNumber {
    try {
      const bn = new BigNumber(value);
      if (bn.isNaN()) {
        DebugLogger.error(`[ProtocolInvariantHelpers] Invalid number conversion: ${value}`);
        return new BigNumber(0);
      }
      return bn;
    } catch (error) {
      DebugLogger.error(`[ProtocolInvariantHelpers] Error converting to BigNumber: ${error}`);
      return new BigNumber(0);
    }
  }

  /**
   * Format numbers for display
   */
  static formatNumber(value: BigNumber | number | string, decimals: number = 6): string {
    try {
      const bn = new BigNumber(value);
      return bn.toFixed(decimals);
    } catch (error) {
      DebugLogger.error(`[ProtocolInvariantHelpers] Error formatting number: ${error}`);
      return '0';
    }
  }

  /**
   * Check if a value is within tolerance
   */
  static withinTolerance(
    actual: BigNumber | number | string,
    expected: BigNumber | number | string,
    tolerance: number = 0.01
  ): boolean {
    try {
      const actualBN = new BigNumber(actual);
      const expectedBN = new BigNumber(expected);
      const toleranceBN = new BigNumber(tolerance);
      
      if (expectedBN.isZero()) {
        return actualBN.isZero();
      }
      
      const deviation = actualBN.minus(expectedBN).abs().dividedBy(expectedBN);
      return deviation.lte(toleranceBN);
    } catch (error) {
      DebugLogger.error(`[ProtocolInvariantHelpers] Error checking tolerance: ${error}`);
      return false;
    }
  }

  /**
   * Get all available helper functions for DSL integration
   */
  static getHelperFunctions(): { [key: string]: Function } {
    return {
      calculateK: this.calculateK,
      collateralizationRatio: this.collateralizationRatio,
      utilizationRate: this.utilizationRate,
      healthFactor: this.healthFactor,
      curveStableInvariant: this.curveStableInvariant,
      priceDeviation: this.priceDeviation,
      calculateTWAP: this.calculateTWAP,
      calculateInterestRate: this.calculateInterestRate,
      abs: this.abs,
      safeDivide: this.safeDivide,
      percentage: this.percentage,
      calculateFlashLoanFee: this.calculateFlashLoanFee,
      toBigNumber: this.toBigNumber,
      withinTolerance: this.withinTolerance
    };
  }
}

// Export individual functions for direct usage
export const {
  calculateK,
  collateralizationRatio,
  utilizationRate,
  healthFactor,
  curveStableInvariant,
  priceDeviation,
  calculateTWAP,
  calculateInterestRate,
  abs,
  safeDivide,
  percentage,
  calculateFlashLoanFee,
  toBigNumber,
  withinTolerance
} = ProtocolInvariantHelpers;