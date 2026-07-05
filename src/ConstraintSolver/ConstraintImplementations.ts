/**
 * Constraint Implementations
 * Protocol-aware constraint implementations using infrastructure
 */

import BigNumber from 'bignumber.js';
import { DebugLogger } from '../Utils/DebugLogger';
import { ProtocolStateTracker } from '../SemanticFinancialGraph/ProtocolStateTracker';
import { FlashLoanIntegration, FlashLoanContext } from './FlashLoanIntegration';
import { OracleIntegrationManager, ManipulationAlert } from '../Oracle/OracleIntegrationManager';
import { ProtocolInvariantHelpers } from '../Utils/ProtocolInvariantHelpers';

export interface ConstraintResult {
  name: string;
  violated: boolean;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  message: string;
  evidence: any;
  confidence: number; // 0-1 scale
}

export interface ConstraintContext {
  transaction_hash: string;
  block_number: number;
  graph_state: any;
  edges: any[];
  current_edge?: any;
}

/**
 * Protocol Constraint System
 */
export class ConstraintImplementations {
  private stateTracker: ProtocolStateTracker;
  private flashLoanIntegration: FlashLoanIntegration;
  private oracleManager: OracleIntegrationManager;

  constructor(web3?: any) {
    this.stateTracker = new ProtocolStateTracker();
    this.flashLoanIntegration = new FlashLoanIntegration();
    this.oracleManager = new OracleIntegrationManager(web3);
    
    DebugLogger.core('🔧 [ConstraintImplementations] Initialized constraint system');
  }

  /**
   * Process transaction and extract constraint context
   */
  processTransaction(txHash: string, blockNumber: number, edges: any[]): ConstraintContext {
    this.stateTracker.initializeTransaction(txHash, blockNumber);
    this.flashLoanIntegration.processTransaction(txHash, blockNumber, edges);
    
    return {
      transaction_hash: txHash,
      block_number: blockNumber,
      graph_state: this.stateTracker.getState(),
      edges: edges
    };
  }

  /**
   * Uniswap V2 Constant Product Invariant
   * Enhanced with state tracking and precision handling
   */
  async checkUniswapV2Invariant(context: ConstraintContext, edge: any): Promise<ConstraintResult> {
    try {
      if (!this.isUniswapV2Swap(edge)) {
        return this.createResult('UNISWAP_V2_INVARIANT', false, 'LOW', 'Not a Uniswap V2 swap', {}, 1.0);
      }

      const poolAddress = edge.PoolAddr || edge.Pool || edge.To;
      if (!poolAddress) {
        return this.createResult('UNISWAP_V2_INVARIANT', false, 'LOW', 'No pool address found', {}, 0.5);
      }

      // Get pool state from tracker
      const poolState = this.stateTracker.getPoolState(poolAddress);
      if (!poolState) {
        return this.createResult('UNISWAP_V2_INVARIANT', false, 'LOW', 'Pool state not tracked', {}, 0.3);
      }

      // Calculate K before and after
      const kBefore = poolState.k_before || ProtocolInvariantHelpers.calculateK(poolState.reserveA, poolState.reserveB);
      const kAfter = poolState.k_after || kBefore;

      // Account for 0.3% fee (K should increase slightly)
      const feeMultiplier = new BigNumber(1.003);
      const expectedK = kBefore.multipliedBy(feeMultiplier);

      // Calculate deviation
      const deviation = kAfter.minus(expectedK).abs().dividedBy(expectedK);
      const violationThreshold = new BigNumber(0.0001); // 0.01% tolerance

      const violated = deviation.gt(violationThreshold);

      const evidence = {
        pool_address: poolAddress,
        k_before: kBefore.toString(),
        k_after: kAfter.toString(),
        expected_k: expectedK.toString(),
        deviation: deviation.toString(),
        threshold: violationThreshold.toString()
      };

      return this.createResult(
        'UNISWAP_V2_INVARIANT',
        violated,
        violated ? 'HIGH' : 'LOW',
        violated ? `Constant product invariant violated (${deviation.multipliedBy(100).toFixed(4)}% deviation)` : 'Invariant maintained',
        evidence,
        0.9
      );

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      DebugLogger.error(`🔧 [EnhancedConstraintImplementations] Error in Uniswap V2 invariant check: ${errorMessage}`);
      return this.createResult('UNISWAP_V2_INVARIANT', false, 'LOW', 'Error in constraint evaluation', { error: errorMessage }, 0.1);
    }
  }

  /**
   * Flash Loan Repayment Constraint
   * Enhanced with comprehensive lifecycle tracking
   */
  async checkFlashLoanRepayment(context: ConstraintContext): Promise<ConstraintResult> {
    try {
      const flashLoanContext = this.flashLoanIntegration.getFlashLoanContext(context.transaction_hash);
      
      if (!flashLoanContext.has_flash_loans) {
        return this.createResult('FLASH_LOAN_REPAYMENT', false, 'LOW', 'No flash loans detected', {}, 1.0);
      }

      const validationResults = this.flashLoanIntegration.validateTransaction(context.transaction_hash);
      const hasViolations = validationResults.some(result => !result.is_valid);
      
      if (hasViolations) {
        const violations = validationResults.filter(r => !r.is_valid);
        const totalDeficit = violations.reduce((sum, v) => sum.plus(v.repayment_deficit), new BigNumber(0));

        const evidence = {
          total_loans: validationResults.length,
          violated_loans: violations.length,
          total_deficit: totalDeficit.toString(),
          violations: violations.map(v => ({
            loan_id: v.loan_id,
            deficit: v.repayment_deficit.toString(),
            errors: v.validation_errors
          }))
        };

        return this.createResult(
          'FLASH_LOAN_REPAYMENT',
          true,
          'CRITICAL',
          `Flash loan not fully repaid: ${violations.length}/${validationResults.length} loans violated`,
          evidence,
          0.95
        );
      }

      return this.createResult(
        'FLASH_LOAN_REPAYMENT',
        false,
        'LOW',
        'All flash loans properly repaid',
        {
          total_loans: validationResults.length,
          all_repaid: true,
          manipulation_risk: flashLoanContext.manipulation_risk_score
        },
        0.9
      );

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      DebugLogger.error(`🔧 [EnhancedConstraintImplementations] Error in flash loan repayment check: ${errorMessage}`);
      return this.createResult('FLASH_LOAN_REPAYMENT', false, 'LOW', 'Error in constraint evaluation', { error: errorMessage }, 0.1);
    }
  }

  /**
   * Oracle Price Manipulation Detection
   * Enhanced with multi-source price validation
   */
  async checkOraclePriceManipulation(context: ConstraintContext, edge: any): Promise<ConstraintResult> {
    try {
      if (!this.isPriceUpdateOrLargeSwap(edge)) {
        return this.createResult('ORACLE_PRICE_MANIPULATION', false, 'LOW', 'Not a price-affecting operation', {}, 1.0);
      }

      const token = edge.Token || edge.TokenSymbol || edge.Asset;
      if (!token) {
        return this.createResult('ORACLE_PRICE_MANIPULATION', false, 'LOW', 'No token identified for price check', {}, 0.5);
      }

      // Get current price from oracle
      const currentPriceData = await this.oracleManager.getPrice(token, context.block_number);
      if (!currentPriceData) {
        return this.createResult('ORACLE_PRICE_MANIPULATION', false, 'LOW', `No price data available for ${token}`, {}, 0.3);
      }

      // Detect manipulation using oracle manager
      const manipulationAlert = await this.oracleManager.detectPriceManipulation(token, currentPriceData.price);
      
      if (manipulationAlert.is_manipulation) {
        const evidence = {
          token: token,
          current_price: manipulationAlert.current_price.toString(),
          reference_prices: Object.fromEntries(
            Object.entries(manipulationAlert.reference_prices).map(([k, v]) => [k, v.toString()])
          ),
          deviations: Object.fromEntries(
            Object.entries(manipulationAlert.deviations).map(([k, v]) => [k, v.toString()])
          ),
          confidence: manipulationAlert.confidence
        };

        return this.createResult(
          'ORACLE_PRICE_MANIPULATION',
          true,
          'HIGH',
          'Potential oracle price manipulation detected',
          evidence,
          manipulationAlert.confidence
        );
      }

      return this.createResult(
        'ORACLE_PRICE_MANIPULATION',
        false,
        'LOW',
        'No price manipulation detected',
        {
          token: token,
          current_price: manipulationAlert.current_price.toString(),
          data_sources: Object.keys(manipulationAlert.reference_prices).length
        },
        manipulationAlert.confidence
      );

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      DebugLogger.error(`🔧 [EnhancedConstraintImplementations] Error in oracle manipulation check: ${errorMessage}`);
      return this.createResult('ORACLE_PRICE_MANIPULATION', false, 'LOW', 'Error in constraint evaluation', { error: errorMessage }, 0.1);
    }
  }

  /**
   * Aave Health Factor Constraint
   * Enhanced with protocol state integration
   */
  async checkAaveHealthFactor(context: ConstraintContext, edge: any): Promise<ConstraintResult> {
    try {
      if (!this.isAaveBorrow(edge)) {
        return this.createResult('AAVE_HEALTH_FACTOR', false, 'LOW', 'Not an Aave borrow operation', {}, 1.0);
      }

      const collateralAmount = this.extractAmount(edge.CollateralAmount);
      const debtAmount = this.extractAmount(edge.Amount);

      if (!collateralAmount || !debtAmount) {
        return this.createResult('AAVE_HEALTH_FACTOR', false, 'MEDIUM', 'Missing collateral or debt amount', {}, 0.6);
      }

      // Get token prices for USD conversion
      const collateralToken = edge.CollateralToken || edge.CollateralTokenSymbol;
      const debtToken = edge.Token || edge.TokenSymbol;

      const collateralPrice = await this.oracleManager.getPrice(collateralToken, context.block_number);
      const debtPrice = await this.oracleManager.getPrice(debtToken, context.block_number);

      if (!collateralPrice || !debtPrice) {
        return this.createResult('AAVE_HEALTH_FACTOR', false, 'LOW', 'Price data unavailable', {}, 0.4);
      }

      // Calculate USD values
      const collateralValueUSD = collateralAmount.multipliedBy(collateralPrice.price);
      const debtValueUSD = debtAmount.multipliedBy(debtPrice.price);

      // Calculate health factor (80% liquidation threshold for most assets)
      const liquidationThreshold = 0.8;
      const healthFactor = ProtocolInvariantHelpers.healthFactor(collateralValueUSD, debtValueUSD, liquidationThreshold);

      const violated = healthFactor.lt(1.0);

      const evidence = {
        collateral_amount: collateralAmount.toString(),
        debt_amount: debtAmount.toString(),
        collateral_value_usd: collateralValueUSD.toString(),
        debt_value_usd: debtValueUSD.toString(),
        health_factor: healthFactor.toString(),
        liquidation_threshold: liquidationThreshold
      };

      return this.createResult(
        'AAVE_HEALTH_FACTOR',
        violated,
        violated ? 'CRITICAL' : 'LOW',
        violated ? `Health factor below 1.0 (${healthFactor.toFixed(4)})` : 'Healthy position',
        evidence,
        0.85
      );

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      DebugLogger.error(`🔧 [EnhancedConstraintImplementations] Error in Aave health factor check: ${errorMessage}`);
      return this.createResult('AAVE_HEALTH_FACTOR', false, 'LOW', 'Error in constraint evaluation', { error: errorMessage }, 0.1);
    }
  }

  /**
   * MakerDAO Collateralization Ratio
   * Enhanced with precise ratio calculation
   */
  async checkMakerDAOCollateralRatio(context: ConstraintContext, edge: any): Promise<ConstraintResult> {
    try {
      if (!this.isMakerDAOBorrow(edge)) {
        return this.createResult('MAKERDAO_COLLATERAL_RATIO', false, 'LOW', 'Not a MakerDAO borrow operation', {}, 1.0);
      }

      const collateralAmount = this.extractAmount(edge.CollateralAmount);
      const daiAmount = this.extractAmount(edge.Amount);

      if (!collateralAmount || !daiAmount) {
        return this.createResult('MAKERDAO_COLLATERAL_RATIO', false, 'MEDIUM', 'Missing collateral or DAI amount', {}, 0.6);
      }

      // Get collateral price (DAI is assumed to be $1)
      const collateralToken = edge.CollateralToken || edge.CollateralTokenSymbol;
      const collateralPrice = await this.oracleManager.getPrice(collateralToken, context.block_number);

      if (!collateralPrice) {
        return this.createResult('MAKERDAO_COLLATERAL_RATIO', false, 'LOW', 'Collateral price unavailable', {}, 0.4);
      }

      // Calculate values
      const collateralValueUSD = collateralAmount.multipliedBy(collateralPrice.price);
      const daiValueUSD = daiAmount; // 1 DAI = 1 USD

      const cRatio = ProtocolInvariantHelpers.collateralizationRatio(collateralValueUSD, daiValueUSD);
      const minRatio = new BigNumber(1.5); // 150% minimum for most collateral types

      const violated = cRatio.lt(minRatio) && edge.Action === 'Borrow';

      const evidence = {
        collateral_amount: collateralAmount.toString(),
        dai_amount: daiAmount.toString(),
        collateral_value_usd: collateralValueUSD.toString(),
        collateralization_ratio: cRatio.toString(),
        minimum_ratio: minRatio.toString()
      };

      return this.createResult(
        'MAKERDAO_COLLATERAL_RATIO',
        violated,
        violated ? 'HIGH' : 'LOW',
        violated ? `Insufficient collateralization (${cRatio.toFixed(2)}% < 150%)` : 'Adequate collateralization',
        evidence,
        0.8
      );

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      DebugLogger.error(`🔧 [EnhancedConstraintImplementations] Error in MakerDAO collateral ratio check: ${errorMessage}`);
      return this.createResult('MAKERDAO_COLLATERAL_RATIO', false, 'LOW', 'Error in constraint evaluation', { error: errorMessage }, 0.1);
    }
  }

  // Helper Methods

  private isUniswapV2Swap(edge: any): boolean {
    return edge.Type === 'DEX' && 
           (edge.Service === 'uniswapv2' || edge.Service === 'sushiswap') && 
           edge.Action === 'Swap';
  }

  private isPriceUpdateOrLargeSwap(edge: any): boolean {
    if (edge.Type === 'PriceUpdate') return true;
    if (edge.Type === 'DEX' && edge.priceImpact && parseFloat(edge.priceImpact) > 0.05) return true;
    return false;
  }

  private isAaveBorrow(edge: any): boolean {
    return edge.Type === 'Lending' && 
           (edge.Service === 'aave' || edge.Service === 'AAVE') && 
           edge.Action === 'Borrow';
  }

  private isMakerDAOBorrow(edge: any): boolean {
    return edge.Type === 'Lending' && 
           edge.Service === 'makerdao' && 
           edge.Action === 'Borrow';
  }

  private extractAmount(value: any): BigNumber | null {
    if (!value) return null;
    try {
      return new BigNumber(value);
    } catch {
      return null;
    }
  }

  private createResult(
    name: string, 
    violated: boolean, 
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL', 
    message: string, 
    evidence: any, 
    confidence: number
  ): ConstraintResult {
    return {
      name,
      violated,
      severity,
      message,
      evidence,
      confidence
    };
  }

  /**
   * Get all constraint checkers
   */
  getAllConstraintCheckers(): { [key: string]: Function } {
    return {
      'UNISWAP_V2_INVARIANT': this.checkUniswapV2Invariant.bind(this),
      'FLASH_LOAN_REPAYMENT': this.checkFlashLoanRepayment.bind(this),
      'ORACLE_PRICE_MANIPULATION': this.checkOraclePriceManipulation.bind(this),
      'AAVE_HEALTH_FACTOR': this.checkAaveHealthFactor.bind(this),
      'MAKERDAO_COLLATERAL_RATIO': this.checkMakerDAOCollateralRatio.bind(this)
    };
  }

  /**
   * Clear all state
   */
  clearState(): void {
    this.stateTracker.clearState();
    this.flashLoanIntegration.clearState();
    this.oracleManager.clearCache();
  }
}