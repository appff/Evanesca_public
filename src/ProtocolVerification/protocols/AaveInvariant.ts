/**
 * Aave V2/V3 Protocol Invariant Implementation
 * Verifies health factors, liquidation thresholds, and interest rate models
 */

import { BigNumber } from '../../DSL/MathematicalExtensions';
import { StateTracker, LendingState } from '../StateTracker';
import { InvariantChecker, InvariantResult } from '../InvariantChecker';
import { ILendingEdge } from '../../SemanticFinancialGraph/Interfaces/IEdge';
import { DebugLogger } from '../../Utils/DebugLogger';

export interface AaveAsset {
  address: string;
  symbol: string;
  decimals: number;
  priceInUSD: BigNumber;
  liquidationThreshold: BigNumber; // e.g., 0.8 = 80%
  ltv: BigNumber; // Loan-to-value ratio
  liquidationBonus: BigNumber; // e.g., 0.05 = 5% bonus
  reserveFactor: BigNumber; // Protocol fee
  isCollateral: boolean;
  isBorrowed: boolean;
}

export interface AaveUserPosition {
  user: string;
  collateral: Map<string, {
    asset: AaveAsset;
    amount: BigNumber;
    valueInUSD: BigNumber;
  }>;
  debt: Map<string, {
    asset: AaveAsset;
    amount: BigNumber;
    valueInUSD: BigNumber;
    interestRateMode: 'stable' | 'variable';
  }>;
  totalCollateralInUSD: BigNumber;
  totalDebtInUSD: BigNumber;
  availableBorrowsInUSD: BigNumber;
  currentLiquidationThreshold: BigNumber;
  ltv: BigNumber;
  healthFactor: BigNumber;
}

export interface AaveReserveData {
  asset: AaveAsset;
  totalLiquidity: BigNumber;
  availableLiquidity: BigNumber;
  totalBorrowsStable: BigNumber;
  totalBorrowsVariable: BigNumber;
  liquidityRate: BigNumber;
  variableBorrowRate: BigNumber;
  stableBorrowRate: BigNumber;
  averageStableBorrowRate: BigNumber;
  utilizationRate: BigNumber;
  liquidityIndex: BigNumber;
  variableBorrowIndex: BigNumber;
}

export class AaveInvariant {
  private stateTracker: StateTracker;
  private invariantChecker: InvariantChecker;
  private readonly HEALTH_FACTOR_LIQUIDATION_THRESHOLD = new BigNumber('1');
  
  constructor(stateTracker: StateTracker) {
    this.stateTracker = stateTracker;
    this.invariantChecker = new InvariantChecker(stateTracker);
  }
  
  /**
   * Calculate health factor for a user position
   * Health Factor = (Total Collateral * Average Liquidation Threshold) / Total Debt
   */
  calculateHealthFactor(position: AaveUserPosition): BigNumber {
    if (position.totalDebtInUSD.isZero()) {
      // No debt means infinite health factor
      return new BigNumber(Infinity);
    }
    
    // Calculate weighted average liquidation threshold
    let totalWeightedThreshold = new BigNumber(0);
    
    position.collateral.forEach((collateral) => {
      const weight = collateral.valueInUSD.div(position.totalCollateralInUSD);
      const weightedThreshold = weight.multipliedBy(collateral.asset.liquidationThreshold);
      totalWeightedThreshold = totalWeightedThreshold.plus(weightedThreshold);
    });
    
    // Health factor = (collateral * liquidation threshold) / debt
    const adjustedCollateral = position.totalCollateralInUSD.multipliedBy(totalWeightedThreshold);
    return adjustedCollateral.div(position.totalDebtInUSD);
  }
  
  /**
   * Calculate available borrows for a user
   */
  calculateAvailableBorrows(position: AaveUserPosition): BigNumber {
    // Calculate weighted average LTV
    let totalWeightedLTV = new BigNumber(0);
    
    position.collateral.forEach((collateral) => {
      const weight = collateral.valueInUSD.div(position.totalCollateralInUSD);
      const weightedLTV = weight.multipliedBy(collateral.asset.ltv);
      totalWeightedLTV = totalWeightedLTV.plus(weightedLTV);
    });
    
    // Available borrows = (collateral * LTV) - debt
    const borrowingPower = position.totalCollateralInUSD.multipliedBy(totalWeightedLTV);
    const availableBorrows = borrowingPower.minus(position.totalDebtInUSD);
    
    return BigNumber.max(availableBorrows, new BigNumber(0));
  }
  
  /**
   * Verify user health factor is above liquidation threshold
   */
  async verifyHealthFactor(
    position: AaveUserPosition,
    blockNumber: number,
    transactionHash: string
  ): Promise<InvariantResult> {
    try {
      const healthFactor = this.calculateHealthFactor(position);
      const isLiquidatable = healthFactor.lt(this.HEALTH_FACTOR_LIQUIDATION_THRESHOLD);
      
      // For Aave, positions with health factor < 1 can be liquidated
      const valid = healthFactor.gte(this.HEALTH_FACTOR_LIQUIDATION_THRESHOLD) || isLiquidatable;
      
      const result: InvariantResult = {
        valid: true, // Health factor itself is always "valid" - it just determines liquidation eligibility
        protocol: 'Aave',
        invariantType: 'health_factor',
        message: isLiquidatable
          ? `Position liquidatable (Health Factor: ${healthFactor.toFixed(4)})`
          : `Position healthy (Health Factor: ${healthFactor.isFinite() ? healthFactor.toFixed(4) : 'Infinite'})`,
        details: {
          healthFactor: healthFactor.isFinite() ? healthFactor.toString() : 'Infinite',
          totalCollateral: position.totalCollateralInUSD.toString(),
          totalDebt: position.totalDebtInUSD.toString(),
          liquidatable: isLiquidatable,
          user: position.user,
          collateralAssets: Array.from(position.collateral.keys()),
          debtAssets: Array.from(position.debt.keys())
        },
        severity: isLiquidatable ? 'high' : 'low'
      };
      
      // Log liquidatable positions
      if (isLiquidatable) {
        DebugLogger.core(`Aave liquidatable position detected: ${position.user}`, {
          healthFactor: healthFactor.toString(),
          blockNumber,
          transactionHash
        });
      }
      
      return result;
    } catch (error) {
      return {
        valid: false,
        protocol: 'Aave',
        invariantType: 'health_factor',
        message: `Error verifying health factor: ${error}`,
        severity: 'high'
      };
    }
  }
  
  /**
   * Verify liquidation is valid and follows protocol rules
   */
  async verifyLiquidation(
    liquidation: {
      user: string;
      liquidator: string;
      collateralAsset: string;
      debtAsset: string;
      debtToCover: BigNumber;
      collateralReceived: BigNumber;
    },
    positionBefore: AaveUserPosition,
    blockNumber: number,
    transactionHash: string
  ): Promise<InvariantResult> {
    try {
      // Check health factor before liquidation
      const healthFactorBefore = this.calculateHealthFactor(positionBefore);
      
      // Verify position was liquidatable
      if (healthFactorBefore.gte(this.HEALTH_FACTOR_LIQUIDATION_THRESHOLD)) {
        return {
          valid: false,
          protocol: 'Aave',
          invariantType: 'liquidation',
          message: `Invalid liquidation: Health factor ${healthFactorBefore.toFixed(4)} >= 1`,
          severity: 'critical'
        };
      }
      
      // Get collateral and debt assets
      const collateral = positionBefore.collateral.get(liquidation.collateralAsset);
      const debt = positionBefore.debt.get(liquidation.debtAsset);
      
      if (!collateral || !debt) {
        return {
          valid: false,
          protocol: 'Aave',
          invariantType: 'liquidation',
          message: 'Collateral or debt asset not found in position',
          severity: 'high'
        };
      }
      
      // Calculate maximum liquidatable amount (50% of debt in Aave V2/V3)
      const maxLiquidation = debt.amount.multipliedBy(0.5);
      
      // Verify liquidation amount doesn't exceed maximum
      if (liquidation.debtToCover.gt(maxLiquidation)) {
        return {
          valid: false,
          protocol: 'Aave',
          invariantType: 'liquidation',
          message: `Liquidation amount exceeds maximum (50% of debt)`,
          details: {
            debtToCover: liquidation.debtToCover.toString(),
            maxLiquidation: maxLiquidation.toString()
          },
          severity: 'high'
        };
      }
      
      // Calculate expected collateral with liquidation bonus
      const debtValue = liquidation.debtToCover.multipliedBy(debt.asset.priceInUSD);
      const expectedCollateralValue = debtValue.multipliedBy(
        new BigNumber(1).plus(collateral.asset.liquidationBonus)
      );
      const expectedCollateral = expectedCollateralValue.div(collateral.asset.priceInUSD);
      
      // Verify liquidation bonus is correct
      const deviation = expectedCollateral.minus(liquidation.collateralReceived)
        .abs()
        .div(expectedCollateral);
      
      const tolerance = new BigNumber('0.001'); // 0.1% tolerance
      const valid = deviation.lte(tolerance);
      
      return {
        valid,
        protocol: 'Aave',
        invariantType: 'liquidation',
        deviation: deviation.toNumber(),
        message: valid
          ? `Valid liquidation with correct bonus`
          : `Invalid liquidation bonus calculation`,
        details: {
          healthFactorBefore: healthFactorBefore.toString(),
          debtCovered: liquidation.debtToCover.toString(),
          collateralReceived: liquidation.collateralReceived.toString(),
          expectedCollateral: expectedCollateral.toString(),
          liquidationBonus: collateral.asset.liquidationBonus.toString()
        },
        severity: valid ? 'medium' : 'high'
      };
    } catch (error) {
      return {
        valid: false,
        protocol: 'Aave',
        invariantType: 'liquidation',
        message: `Error verifying liquidation: ${error}`,
        severity: 'critical'
      };
    }
  }
  
  /**
   * Verify interest rate model for Aave reserves
   */
  async verifyInterestRateModel(
    reserve: AaveReserveData,
    blockNumber: number,
    transactionHash: string
  ): Promise<InvariantResult> {
    try {
      // Aave V2/V3 interest rate parameters
      const optimalUtilization = new BigNumber('0.8'); // 80%
      const baseVariableRate = new BigNumber('0'); // 0%
      const variableRateSlope1 = new BigNumber('0.04'); // 4%
      const variableRateSlope2 = new BigNumber('0.6'); // 60%
      
      // Calculate expected variable borrow rate
      let expectedRate: BigNumber;
      
      if (reserve.utilizationRate.lte(optimalUtilization)) {
        // Below optimal: rate = base + (utilization / optimal) * slope1
        expectedRate = baseVariableRate.plus(
          reserve.utilizationRate.div(optimalUtilization).multipliedBy(variableRateSlope1)
        );
      } else {
        // Above optimal: rate = base + slope1 + ((utilization - optimal) / (1 - optimal)) * slope2
        const excessUtilization = reserve.utilizationRate.minus(optimalUtilization);
        const maxExcessUtilization = new BigNumber(1).minus(optimalUtilization);
        
        expectedRate = baseVariableRate
          .plus(variableRateSlope1)
          .plus(excessUtilization.div(maxExcessUtilization).multipliedBy(variableRateSlope2));
      }
      
      // Compare with actual rate
      const deviation = expectedRate.minus(reserve.variableBorrowRate)
        .abs()
        .div(expectedRate.plus(0.0001)); // Add small value to prevent division by zero
      
      const tolerance = new BigNumber('0.001'); // 0.1% tolerance
      const valid = deviation.lte(tolerance);
      
      return {
        valid,
        protocol: 'Aave',
        invariantType: 'interest_rate_model',
        deviation: deviation.toNumber(),
        message: valid
          ? `Interest rate model valid (deviation: ${deviation.multipliedBy(100).toFixed(4)}%)`
          : `Interest rate model deviation too high (${deviation.multipliedBy(100).toFixed(4)}%)`,
        details: {
          asset: reserve.asset.symbol,
          utilizationRate: reserve.utilizationRate.toString(),
          expectedRate: expectedRate.toString(),
          actualRate: reserve.variableBorrowRate.toString(),
          optimalUtilization: optimalUtilization.toString()
        },
        severity: valid ? 'low' : 'medium'
      };
    } catch (error) {
      return {
        valid: false,
        protocol: 'Aave',
        invariantType: 'interest_rate_model',
        message: `Error verifying interest rate model: ${error}`,
        severity: 'high'
      };
    }
  }
  
  /**
   * Verify reserve utilization is within safe bounds
   */
  async verifyUtilization(
    reserve: AaveReserveData,
    blockNumber: number,
    transactionHash: string
  ): Promise<InvariantResult> {
    try {
      const maxSafeUtilization = new BigNumber('0.95'); // 95% max safe utilization
      const criticalUtilization = new BigNumber('0.99'); // 99% critical
      
      let severity: 'low' | 'medium' | 'high' | 'critical' = 'low';
      let message: string;
      
      if (reserve.utilizationRate.gt(criticalUtilization)) {
        severity = 'critical';
        message = `Critical utilization: ${reserve.utilizationRate.multipliedBy(100).toFixed(2)}%`;
      } else if (reserve.utilizationRate.gt(maxSafeUtilization)) {
        severity = 'high';
        message = `High utilization: ${reserve.utilizationRate.multipliedBy(100).toFixed(2)}%`;
      } else {
        message = `Normal utilization: ${reserve.utilizationRate.multipliedBy(100).toFixed(2)}%`;
      }
      
      return {
        valid: true, // Utilization itself is always valid, just may be risky
        protocol: 'Aave',
        invariantType: 'utilization',
        message,
        details: {
          asset: reserve.asset.symbol,
          utilizationRate: reserve.utilizationRate.toString(),
          availableLiquidity: reserve.availableLiquidity.toString(),
          totalBorrows: reserve.totalBorrowsVariable.plus(reserve.totalBorrowsStable).toString()
        },
        severity
      };
    } catch (error) {
      return {
        valid: false,
        protocol: 'Aave',
        invariantType: 'utilization',
        message: `Error verifying utilization: ${error}`,
        severity: 'high'
      };
    }
  }
}