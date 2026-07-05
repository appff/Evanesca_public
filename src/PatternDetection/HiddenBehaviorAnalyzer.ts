/**
 * Hidden Protocol Behavior Analyzer
 *
 * Detects undisclosed behaviors that harm users but are not attacks.
 * Focuses on operational inefficiencies, hidden costs, and unfair mechanisms
 * not documented in protocol whitepapers.
 */

import { Edge } from '../Types/GraphTypes';
import { ConstraintViolation } from '../ConstraintSolver/types';
import { DebugLogger } from '../Utils/DebugLogger';

export interface HiddenBehaviorPattern {
  type: 'GAS_BURDEN' | 'MISPRICING' | 'HIDDEN_FEE' | 'UNFAIR_DISTRIBUTION' | 'STATE_CHANGE' | 'EXCESSIVE_SLIPPAGE' | 'REWARD_MANIPULATION';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  affectedUsers: string[];
  estimatedLoss: number;
  confidence: number;
  evidence: string[];
}

export class HiddenBehaviorAnalyzer {
  private gasThresholds = {
    normal: 50000,
    elevated: 100000,
    excessive: 200000,
    multiplier: 5
  };

  private feeThresholds = {
    standard: 0.003,  // 0.3% standard fee
    acceptable: 0.01,  // 1% max acceptable
    hidden: 0.005     // 0.5% hidden fee threshold
  };

  private pricingThresholds = {
    deviation: 0.02,   // 2% price deviation
    volatility: 10,    // 10% daily volatility threshold
    minValue: 100     // Minimum USD value to consider
  };

  constructor() {
    DebugLogger.log('🔍 [HiddenBehaviorAnalyzer] Initialized');
  }

  /**
   * Main analysis function that detects all hidden behaviors
   */
  async analyzeHiddenBehaviors(edges: Edge[]): Promise<ConstraintViolation[]> {
    const violations: ConstraintViolation[] = [];

    try {
      // Analyze each type of hidden behavior
      violations.push(...this.detectHiddenGasBurdens(edges));
      violations.push(...this.detectDerivativeMispricing(edges));
      violations.push(...this.detectHiddenFees(edges));
      violations.push(...this.detectUnfairDistribution(edges));
      violations.push(...this.detectHiddenStateChanges(edges));
      violations.push(...this.detectExcessiveSlippage(edges));
      violations.push(...this.detectRewardManipulation(edges));

      // Log summary
      if (violations.length > 0) {
        const summary = this.summarizeViolations(violations);
        DebugLogger.log(`⚠️ [HiddenBehaviorAnalyzer] Found ${violations.length} hidden behaviors:`);
        DebugLogger.log(`   - Gas Burdens: ${summary.gasBurdens}`);
        DebugLogger.log(`   - Mispricing: ${summary.mispricing}`);
        DebugLogger.log(`   - Hidden Fees: ${summary.hiddenFees}`);
        DebugLogger.log(`   - Total Impact: $${summary.totalImpact.toFixed(2)}`);
      }

      return violations;
    } catch (error) {
      console.error('❌ [HiddenBehaviorAnalyzer] Error during analysis:', error);
      // Still return partial violations that were collected
      return violations;
    }
  }

  /**
   * Detect hidden gas burdens (e.g., charity tokens forcing users to pay for housekeeping)
   */
  private detectHiddenGasBurdens(edges: Edge[]): ConstraintViolation[] {
    const violations: ConstraintViolation[] = [];

    // Calculate average gas usage for normal transfers
    const normalTransfers = edges.filter(e =>
      e.gas_used && e.gas_used > 0 &&
      (e.Type === 'TRANSFER' || e.Type === 'SWAP') &&
      !e.Action?.includes('rebase') &&
      !e.Action?.includes('distribute')
    );

    const avgGas = normalTransfers.length > 0
      ? normalTransfers.reduce((sum, e) => sum + (e.gas_used || 0), 0) / normalTransfers.length
      : this.gasThresholds.normal;

    for (const edge of edges) {
      if (!edge.gas_used) continue;

      // Check if it's a simple transaction that shouldn't use much gas
      const isSimple = edge.Type === 'TRANSFER' || edge.Type === 'SWAP';

      // Check for maintenance operations
      const hasMaintenanceOps =
        edge.Action?.includes('rebase') ||
        edge.Action?.includes('distribute') ||
        edge.Action?.includes('maintenance') ||
        edge.Action?.includes('housekeeping');

      // Check for excessive gas usage
      const isExcessive = edge.gas_used > avgGas * this.gasThresholds.multiplier ||
                         edge.gas_used > this.gasThresholds.excessive;

      if (isSimple && isExcessive && (hasMaintenanceOps || edge.gas_used > avgGas * 8)) {
        violations.push({
          constraint: 'HIDDEN_GAS_BURDEN',
          severity: 'HIGH',
          message: `Hidden gas burden detected: ${edge.gas_used} gas (${(edge.gas_used / avgGas).toFixed(1)}x average)`,
          transaction: edge.transactionHash || '',
          details: {
            gasUsed: edge.gas_used,
            averageGas: avgGas,
            multiplier: edge.gas_used / avgGas,
            suspiciousAction: edge.Action || 'unknown',
            estimatedExtraCost: this.calculateGasCost(edge.gas_used - avgGas, edge.gas_price_gwei)
          }
        });
      }
    }

    return violations;
  }

  /**
   * Detect derivative token mispricing (e.g., yUSD/USD, stETH/ETH discrepancies)
   */
  private detectDerivativeMispricing(edges: Edge[]): ConstraintViolation[] {
    const violations: ConstraintViolation[] = [];

    const derivativeTokens = ['yUSD', 'stETH', 'cDAI', 'aUSDC', 'yDAI', 'yvUSDC'];

    for (const edge of edges) {
      // Check if it's a derivative token operation
      const isDerivative = derivativeTokens.some(token =>
        edge.token?.includes(token) || edge.token_type?.includes(token)
      );

      if (isDerivative && (edge.Type === 'DEPOSIT' || edge.Type === 'WITHDRAW' || edge.Type === 'WRAP' || edge.Type === 'UNWRAP')) {
        // Calculate price deviation
        const inputValue = edge.value_usd || 0;
        const outputValue = edge.value || 0;

        if (inputValue > this.pricingThresholds.minValue && outputValue > 0) {
          const expectedRatio = 1.0; // Should be 1:1 for most derivatives
          const actualRatio = outputValue / inputValue;
          const deviation = Math.abs(actualRatio - expectedRatio);

          if (deviation > this.pricingThresholds.deviation) {
            violations.push({
              constraint: 'DERIVATIVE_MISPRICING',
              severity: 'MEDIUM',
              message: `Derivative token mispricing: ${(deviation * 100).toFixed(2)}% deviation from expected`,
              transaction: edge.transactionHash || '',
              details: {
                token: edge.token || 'unknown',
                inputValue,
                outputValue,
                expectedRatio,
                actualRatio,
                deviation: deviation * 100,
                estimatedLoss: inputValue * deviation
              }
            });
          }
        }
      }
    }

    return violations;
  }

  /**
   * Detect hidden fees not disclosed in documentation
   */
  private detectHiddenFees(edges: Edge[]): ConstraintViolation[] {
    const violations: ConstraintViolation[] = [];

    for (const edge of edges) {
      if (edge.Type === 'SWAP' || edge.Type === 'TRADE' || edge.Type === 'TRANSFER') {
        const value = edge.value || 0;
        const valueUsd = edge.value_usd || 0;

        if (value > 0 && valueUsd > 0) {
          // Calculate expected fee (0.3% standard)
          const expectedFee = value * this.feeThresholds.standard;

          // Check for value loss
          const actualOutput = valueUsd;
          const expectedOutput = value * (1 - this.feeThresholds.standard);
          const actualFee = value - actualOutput;

          // Detect hidden fees
          if (actualFee > expectedFee * 2 && actualFee > value * this.feeThresholds.hidden) {
            const feePercentage = (actualFee / value) * 100;

            violations.push({
              constraint: 'HIDDEN_FEE_EXTRACTION',
              severity: 'HIGH',
              message: `Hidden fee detected: ${feePercentage.toFixed(2)}% (expected ${(this.feeThresholds.standard * 100).toFixed(1)}%)`,
              transaction: edge.transactionHash || '',
              details: {
                transactionValue: value,
                expectedFee,
                actualFee,
                feePercentage,
                hiddenFeeAmount: actualFee - expectedFee,
                recipient: edge.to || 'unknown'
              }
            });
          }
        }
      }
    }

    return violations;
  }

  /**
   * Detect unfair distribution patterns
   */
  private detectUnfairDistribution(edges: Edge[]): ConstraintViolation[] {
    const violations: ConstraintViolation[] = [];

    // Group reward/distribution edges by recipient
    const distributions = edges.filter(e =>
      e.Type === 'REWARD' ||
      e.Type === 'DISTRIBUTION' ||
      e.Type === 'AIRDROP' ||
      e.Action?.includes('claim')
    );

    if (distributions.length < 5) return violations; // Need enough data

    // Group by recipient
    const recipientMap = new Map<string, number>();
    let totalDistributed = 0;

    for (const edge of distributions) {
      const recipient = edge.to || 'unknown';
      const value = edge.value_usd || edge.value || 0;
      recipientMap.set(recipient, (recipientMap.get(recipient) || 0) + value);
      totalDistributed += value;
    }

    // Sort recipients by value received
    const sortedRecipients = Array.from(recipientMap.entries())
      .sort((a, b) => b[1] - a[1]);

    // Check for unfair concentration (Pareto principle violation)
    const top20PercentCount = Math.ceil(sortedRecipients.length * 0.2);
    const top20Recipients = sortedRecipients.slice(0, top20PercentCount);
    const top20Value = top20Recipients.reduce((sum, [_, value]) => sum + value, 0);

    const concentrationRatio = top20Value / totalDistributed;

    if (concentrationRatio > 0.8) {
      violations.push({
        constraint: 'UNFAIR_DISTRIBUTION',
        severity: 'MEDIUM',
        message: `Unfair distribution detected: Top ${top20PercentCount} addresses received ${(concentrationRatio * 100).toFixed(1)}% of rewards`,
        transaction: distributions[0]?.transactionHash || '',
        details: {
          totalRecipients: recipientMap.size,
          topRecipients: top20Recipients.map(([addr, val]) => ({
            address: addr,
            value: val,
            percentage: (val / totalDistributed) * 100
          })),
          concentrationRatio: concentrationRatio * 100,
          totalDistributed
        }
      });
    }

    return violations;
  }

  /**
   * Detect hidden protocol state changes
   */
  private detectHiddenStateChanges(edges: Edge[]): ConstraintViolation[] {
    const violations: ConstraintViolation[] = [];

    const stateChangeKeywords = ['set', 'update', 'change', 'modify', 'adjust'];
    const criticalParameters = ['rate', 'ratio', 'fee', 'threshold', 'multiplier', 'factor'];

    for (const edge of edges) {
      const isStateChange = edge.Type === 'INTERNAL_CALL' ||
                          edge.Type === 'PARAMETER_CHANGE' ||
                          stateChangeKeywords.some(kw => edge.Action?.toLowerCase().includes(kw));

      if (isStateChange) {
        const affectsCritical = criticalParameters.some(param =>
          edge.Action?.toLowerCase().includes(param)
        );

        if (affectsCritical) {
          // Check if it's from governance (would have specific patterns)
          const isGovernance = edge.from?.includes('governance') ||
                              edge.from?.includes('timelock') ||
                              edge.from?.includes('multisig');

          if (!isGovernance) {
            violations.push({
              constraint: 'HIDDEN_STATE_MANIPULATION',
              severity: 'HIGH',
              message: `Hidden state change detected: ${edge.Action || 'unknown parameter'} modified without governance`,
              transaction: edge.transactionHash || '',
              details: {
                action: edge.Action || 'unknown',
                from: edge.from || 'unknown',
                parameter: criticalParameters.find(p => edge.Action?.toLowerCase().includes(p)) || 'unknown',
                blockNumber: edge.block_number || 0
              }
            });
          }
        }
      }
    }

    return violations;
  }

  /**
   * Detect excessive slippage beyond user expectations
   */
  private detectExcessiveSlippage(edges: Edge[]): ConstraintViolation[] {
    const violations: ConstraintViolation[] = [];
    const maxAcceptableSlippage = 0.05; // 5%

    for (const edge of edges) {
      if (edge.Type === 'SWAP' || edge.Type === 'TRADE') {
        // Skip if missing price data
        if (!edge.value_usd || !edge.value) continue;

        // Calculate implied price and slippage
        const expectedValue = edge.value || 0;
        const actualValue = edge.value_usd || 0;

        if (expectedValue > 0 && actualValue > 0) {
          const slippage = Math.abs(expectedValue - actualValue) / expectedValue;

          // Check if slippage is excessive and not due to volatility
          const isLowVolatility = Math.abs(edge.price_change_1h || 0) < 2;
          const isSignificantValue = actualValue > 1000;

          if (slippage > maxAcceptableSlippage && isLowVolatility && isSignificantValue) {
            violations.push({
              constraint: 'EXCESSIVE_SLIPPAGE',
              severity: 'MEDIUM',
              message: `Excessive slippage detected: ${(slippage * 100).toFixed(2)}% (max acceptable: ${(maxAcceptableSlippage * 100)}%)`,
              transaction: edge.transactionHash || '',
              details: {
                expectedValue,
                actualValue,
                slippagePercentage: slippage * 100,
                lossAmount: Math.abs(expectedValue - actualValue),
                priceVolatility: edge.price_change_1h || 0
              }
            });
          }
        }
      }
    }

    return violations;
  }

  /**
   * Detect reward timing manipulation
   */
  private detectRewardManipulation(edges: Edge[]): ConstraintViolation[] {
    const violations: ConstraintViolation[] = [];

    // Filter reward-related edges
    const rewardEdges = edges.filter(e =>
      e.Type === 'REWARD' ||
      e.Action?.includes('harvest') ||
      e.Action?.includes('claim')
    );

    if (rewardEdges.length < 3) return violations; // Need enough data

    // Sort by block number
    rewardEdges.sort((a, b) => (a.block_number || 0) - (b.block_number || 0));

    // Calculate intervals between rewards
    const intervals: number[] = [];
    for (let i = 1; i < rewardEdges.length; i++) {
      const interval = (rewardEdges[i].block_number || 0) - (rewardEdges[i-1].block_number || 0);
      if (interval > 0) intervals.push(interval);
    }

    if (intervals.length > 1) { // Need at least 2 intervals to calculate variance
      const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      const variance = intervals.reduce((sum, i) => sum + Math.pow(i - avgInterval, 2), 0) / intervals.length;
      const stdDev = Math.sqrt(variance);

      // Check for irregular patterns (lower threshold for detection)
      const hasHighVariance = stdDev > avgInterval * 0.3;

      // Check for outsized rewards
      const avgReward = rewardEdges.reduce((sum, e) => sum + (e.value_usd || 0), 0) / rewardEdges.length;
      const hasOutsizedRewards = rewardEdges.some(e => (e.value_usd || 0) > avgReward * 2.5);

      if (hasHighVariance || hasOutsizedRewards) {  // OR instead of AND for better detection
        violations.push({
          constraint: 'REWARD_TIMING_MANIPULATION',
          severity: 'MEDIUM',
          message: `Reward timing manipulation detected: Irregular intervals with outsized rewards`,
          transaction: rewardEdges[0]?.transactionHash || '',
          details: {
            averageInterval: avgInterval,
            standardDeviation: stdDev,
            coefficientOfVariation: stdDev / avgInterval,
            rewardCount: rewardEdges.length,
            averageReward: avgReward,
            maxReward: Math.max(...rewardEdges.map(e => e.value_usd || 0))
          }
        });
      }
    }

    return violations;
  }

  /**
   * Calculate gas cost in USD
   */
  private calculateGasCost(gasAmount: number, gasPriceGwei?: number): number {
    const gasPrice = gasPriceGwei || 30; // Default 30 gwei
    const ethPrice = 2000; // Approximate ETH price
    return (gasAmount * gasPrice * ethPrice) / 1e9;
  }

  /**
   * Summarize violations for reporting
   */
  private summarizeViolations(violations: ConstraintViolation[]): any {
    const summary = {
      gasBurdens: 0,
      mispricing: 0,
      hiddenFees: 0,
      unfairDistribution: 0,
      stateChanges: 0,
      excessiveSlippage: 0,
      rewardManipulation: 0,
      totalImpact: 0
    };

    for (const violation of violations) {
      switch (violation.constraint) {
        case 'HIDDEN_GAS_BURDEN':
          summary.gasBurdens++;
          summary.totalImpact += violation.details?.estimatedExtraCost || 0;
          break;
        case 'DERIVATIVE_MISPRICING':
          summary.mispricing++;
          summary.totalImpact += violation.details?.estimatedLoss || 0;
          break;
        case 'HIDDEN_FEE_EXTRACTION':
          summary.hiddenFees++;
          summary.totalImpact += violation.details?.hiddenFeeAmount || 0;
          break;
        case 'UNFAIR_DISTRIBUTION':
          summary.unfairDistribution++;
          break;
        case 'HIDDEN_STATE_MANIPULATION':
          summary.stateChanges++;
          break;
        case 'EXCESSIVE_SLIPPAGE':
          summary.excessiveSlippage++;
          summary.totalImpact += violation.details?.lossAmount || 0;
          break;
        case 'REWARD_TIMING_MANIPULATION':
          summary.rewardManipulation++;
          break;
      }
    }

    return summary;
  }
}