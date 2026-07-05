/**
 * Unit tests for MathematicalExtensions module
 * Tests high-precision mathematical operations for protocol verification
 */

import { expect } from 'chai';
import { MathematicalExtensions, BigNumber } from '../../DSL/MathematicalExtensions';

describe('MathematicalExtensions', () => {
  
  describe('Core Mathematical Functions', () => {
    
    it('should calculate power correctly', () => {
      const result = MathematicalExtensions.pow(2, 10);
      expect(result.toNumber()).to.equal(1024);
      
      // Test with decimals
      const decimal = MathematicalExtensions.pow(1.5, 2);
      expect(decimal.toNumber()).to.be.closeTo(2.25, 0.0001);
    });
    
    it('should calculate square root correctly', () => {
      const result = MathematicalExtensions.sqrt(16);
      expect(result.toNumber()).to.equal(4);
      
      // Test with non-perfect square
      const nonPerfect = MathematicalExtensions.sqrt(2);
      expect(nonPerfect.toNumber()).to.be.closeTo(1.4142135, 0.0000001);
    });
    
    it('should calculate natural logarithm correctly', () => {
      const result = MathematicalExtensions.ln(Math.E);
      expect(result.toNumber()).to.be.closeTo(1, 0.0001);
      
      const ln10 = MathematicalExtensions.ln(10);
      expect(ln10.toNumber()).to.be.closeTo(2.302585, 0.00001);
    });
    
    it('should calculate log10 correctly', () => {
      const result = MathematicalExtensions.log10(100);
      expect(result.toNumber()).to.be.closeTo(2, 0.0001);
      
      const log10_1000 = MathematicalExtensions.log10(1000);
      expect(log10_1000.toNumber()).to.be.closeTo(3, 0.0001);
    });
    
    it('should handle absolute value correctly', () => {
      expect(MathematicalExtensions.abs(-5).toNumber()).to.equal(5);
      expect(MathematicalExtensions.abs(5).toNumber()).to.equal(5);
      expect(MathematicalExtensions.abs(0).toNumber()).to.equal(0);
    });
    
    it('should find max and min correctly', () => {
      const max = MathematicalExtensions.max(1, 5, 3, 9, 2);
      expect(max.toNumber()).to.equal(9);
      
      const min = MathematicalExtensions.min(1, 5, 3, 9, 2);
      expect(min.toNumber()).to.equal(1);
    });
  });
  
  describe('DeFi-Specific Calculations', () => {
    
    it('should calculate AMM invariant k correctly', () => {
      // Uniswap example: 1000 ETH * 2000000 USDC = k
      const reserveETH = '1000000000000000000000'; // 1000 ETH in wei
      const reserveUSDC = '2000000000000'; // 2M USDC (6 decimals)
      
      const k = MathematicalExtensions.calculateK(reserveETH, reserveUSDC);
      expect(k.toString()).to.equal('2000000000000000000000000000000000');
    });
    
    it('should calculate price impact correctly', () => {
      // Swap 10 ETH in pool with 1000 ETH / 2M USDC
      const amountIn = 10;
      const reserveIn = 1000;
      const reserveOut = 2000000;
      
      const impact = MathematicalExtensions.priceImpact(amountIn, reserveIn, reserveOut);
      expect(impact.toNumber()).to.be.greaterThan(0);
      expect(impact.toNumber()).to.be.lessThan(0.02); // Less than 2% for reasonable swap
    });
    
    it('should calculate swap output amount correctly', () => {
      // Uniswap V2 formula test
      const amountIn = 10;
      const reserveIn = 1000;
      const reserveOut = 2000000;
      
      const amountOut = MathematicalExtensions.getAmountOut(amountIn, reserveIn, reserveOut);
      
      // Manual calculation: (10 * 0.997 * 2000000) / (1000 + 10 * 0.997)
      const expectedOut = (10 * 0.997 * 2000000) / (1000 + 10 * 0.997);
      expect(amountOut.toNumber()).to.be.closeTo(expectedOut, 0.1);
    });
    
    it('should calculate utilization rate correctly', () => {
      const totalBorrows = 800000;
      const totalSupply = 1000000;
      
      const utilization = MathematicalExtensions.utilizationRate(totalBorrows, totalSupply);
      expect(utilization.toNumber()).to.equal(0.8); // 80% utilization
    });
    
    it('should calculate interest rate with kink model', () => {
      // Test below kink
      const lowUtilization = 0.5; // 50%
      const rateBelowKink = MathematicalExtensions.calculateInterestRate(lowUtilization);
      expect(rateBelowKink.toNumber()).to.be.closeTo(0.02 + 0.5 * 0.18, 0.001); // 2% + 50% * 18%
      
      // Test above kink
      const highUtilization = 0.9; // 90%
      const rateAboveKink = MathematicalExtensions.calculateInterestRate(highUtilization);
      expect(rateAboveKink.toNumber()).to.be.greaterThan(0.5); // Jump multiplier kicks in
    });
    
    it('should calculate collateralization ratio correctly', () => {
      const collateralValue = 15000; // $15,000 collateral
      const debtValue = 10000; // $10,000 debt
      
      const cRatio = MathematicalExtensions.collateralizationRatio(collateralValue, debtValue);
      expect(cRatio.toNumber()).to.equal(1.5); // 150% collateralized
    });
    
    it('should verify constant product invariant', () => {
      // Test valid swap
      const validResult = MathematicalExtensions.verifyConstantProduct(
        1000, 2000000, // Before: 1000 ETH, 2M USDC
        1010, 1980198,  // After: Added 10 ETH, removed ~19.8K USDC (with fee)
        0.003,          // 0.3% fee
        0.001           // 0.1% tolerance
      );
      expect(validResult.valid).to.be.true;
      
      // Test invalid swap (too much deviation)
      const invalidResult = MathematicalExtensions.verifyConstantProduct(
        1000, 2000000,
        1010, 1970000,  // Too much USDC removed
        0.003,
        0.001
      );
      expect(invalidResult.valid).to.be.false;
    });
  });
  
  describe('Statistical Functions', () => {
    
    it('should calculate average correctly', () => {
      const values = [10, 20, 30, 40, 50];
      const avg = MathematicalExtensions.avg(values);
      expect(avg.toNumber()).to.equal(30);
    });
    
    it('should calculate standard deviation correctly', () => {
      const values = [2, 4, 4, 4, 5, 5, 7, 9];
      const std = MathematicalExtensions.std(values);
      expect(std.toNumber()).to.be.closeTo(2, 0.1);
    });
    
    it('should calculate percentile correctly', () => {
      const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      
      const median = MathematicalExtensions.percentile(values, 50);
      expect(median.toNumber()).to.equal(5.5);
      
      const p90 = MathematicalExtensions.percentile(values, 90);
      expect(p90.toNumber()).to.equal(9.1);
    });
  });
  
  describe('Precision Handling', () => {
    
    it('should handle very large numbers with precision', () => {
      // Test with 18 decimal places (ETH wei)
      const largeNum1 = '123456789012345678901234567890';
      const largeNum2 = '987654321098765432109876543210';
      
      const sum = new BigNumber(largeNum1).plus(new BigNumber(largeNum2));
      expect(sum.toString()).to.equal('1111111110111111111011111111100');
    });
    
    it('should maintain precision in division', () => {
      const numerator = '1000000000000000000'; // 1 ETH
      const denominator = '2';
      
      const result = new BigNumber(numerator).div(new BigNumber(denominator));
      // Should maintain precision without rounding errors
      expect(result.multipliedBy(2).toString()).to.equal(numerator);
    });
    
    it('should handle very small decimals', () => {
      const small = '0.000000000000000001'; // 1 wei in ETH
      const multiplied = new BigNumber(small).multipliedBy('1000000000000000000');
      expect(multiplied.toString()).to.equal('1');
    });
  });
  
  describe('Edge Cases and Error Handling', () => {
    
    it('should throw error for ln of negative number', () => {
      expect(() => MathematicalExtensions.ln(-1)).to.throw('Cannot calculate ln of non-positive number');
    });
    
    it('should throw error for log10 of zero', () => {
      expect(() => MathematicalExtensions.log10(0)).to.throw('Cannot calculate log10 of non-positive number');
    });
    
    it('should handle division by zero in collateralization ratio', () => {
      const result = MathematicalExtensions.collateralizationRatio(1000, 0);
      expect(result.toNumber()).to.equal(Infinity);
    });
    
    it('should handle zero utilization rate', () => {
      const result = MathematicalExtensions.utilizationRate(0, 1000000);
      expect(result.toNumber()).to.equal(0);
    });
    
    it('should handle empty array for statistical functions', () => {
      const avg = MathematicalExtensions.avg([]);
      expect(avg.toNumber()).to.equal(0);
      
      const std = MathematicalExtensions.std([]);
      expect(std.toNumber()).to.equal(0);
      
      expect(() => MathematicalExtensions.percentile([], 50)).to.throw('Cannot calculate percentile of empty array');
    });
  });
});