/**
 * Flash Loan State Management System
 * Tracks flash loan lifecycles across transactions for protocol verification
 */

import BigNumber from 'bignumber.js';
import { DebugLogger } from '../Utils/DebugLogger';
import { ProtocolStateTracker, FlashLoanState, RepaymentEvent } from '../SemanticFinancialGraph/ProtocolStateTracker';

export interface FlashLoanValidationResult {
  is_valid: boolean;
  loan_id: string;
  expected_repayment: BigNumber;
  actual_repayment: BigNumber;
  fee_compliance: boolean;
  timing_compliance: boolean;
  repayment_deficit: BigNumber;
  validation_errors: string[];
}

export interface FlashLoanMetrics {
  total_loans: number;
  active_loans: number;
  completed_loans: number;
  failed_loans: number;
  total_volume: BigNumber;
  total_fees_expected: BigNumber;
  total_fees_paid: BigNumber;
  average_loan_size: BigNumber;
  protocols_used: string[];
}

export interface FlashLoanPattern {
  pattern_id: string;
  loan_sequence: FlashLoanState[];
  total_amount: BigNumber;
  net_profit: BigNumber;
  arbitrage_detected: boolean;
  manipulation_risk: number; // 0-1 scale
  complexity_score: number;
}

/**
 * Flash Loan State Manager
 * Comprehensive tracking and validation of flash loan operations
 */
export class FlashLoanStateManager {
  private stateTracker: ProtocolStateTracker;
  private activeLoansByTransaction: Map<string, Map<string, FlashLoanState>>;
  private loanHistory: Map<string, FlashLoanState[]>;
  private validationCache: Map<string, FlashLoanValidationResult>;
  
  // Protocol-specific fee rates
  private readonly protocolFeeRates: Map<string, number> = new Map([
    ['aave', 0.0009],      // 0.09%
    ['aavev2', 0.0009],    // 0.09%  
    ['aavev3', 0.0005],    // 0.05%
    ['dydx', 0],           // 0%
    ['balancer', 0],       // 0%
    ['compound', 0],       // 0%
    ['maker', 0],          // 0%
    ['uniswapv3', 0]       // 0%
  ]);

  constructor(stateTracker: ProtocolStateTracker) {
    this.stateTracker = stateTracker;
    this.activeLoansByTransaction = new Map();
    this.loanHistory = new Map();
    this.validationCache = new Map();
    
    DebugLogger.core('💳 [FlashLoanStateManager] Initialized flash loan tracking system');
  }

  /**
   * Initialize flash loan tracking for a transaction
   */
  initializeTransaction(txHash: string, blockNumber: number): void {
    if (!this.activeLoansByTransaction.has(txHash)) {
      this.activeLoansByTransaction.set(txHash, new Map());
    }
    
    // Initialize transaction in state tracker
    this.stateTracker.initializeTransaction(txHash, blockNumber);
    
    DebugLogger.core(`💳 [FlashLoanStateManager] Initialized flash loan tracking for ${txHash.substring(0, 10)}...`);
  }

  /**
   * Track a new flash loan initiation
   */
  trackFlashLoan(
    txHash: string, 
    protocol: string, 
    token: string, 
    amount: BigNumber,
    blockNumber: number,
    logIndex?: number
  ): string {
    const loanId = this.generateLoanId(txHash, protocol, token, logIndex);
    const feeRate = this.getProtocolFeeRate(protocol);
    
    const flashLoanState: FlashLoanState = {
      transaction_hash: txHash,
      protocol: protocol.toLowerCase(),
      token,
      loan_amount: amount,
      expected_repayment: amount.multipliedBy(new BigNumber(1 + feeRate)),
      actual_repayment: new BigNumber(0),
      repayments: [],
      is_complete: false,
      initiated_at: blockNumber,
      fee_rate: feeRate
    };

    // Store in local tracking
    const txLoans = this.activeLoansByTransaction.get(txHash) || new Map();
    txLoans.set(loanId, flashLoanState);
    this.activeLoansByTransaction.set(txHash, txLoans);

    // Store in state tracker
    this.stateTracker.trackFlashLoan(txHash, protocol, token, amount);

    DebugLogger.core(`💳 [FlashLoanStateManager] Tracked flash loan: ${amount.toString()} ${token} from ${protocol} (${loanId})`);
    
    return loanId;
  }

  /**
   * Record a flash loan repayment
   */
  recordRepayment(
    txHash: string,
    protocol: string,
    token: string,
    amount: BigNumber,
    blockNumber: number,
    logIndex?: number
  ): boolean {
    const loanId = this.generateLoanId(txHash, protocol, token, logIndex);
    const txLoans = this.activeLoansByTransaction.get(txHash);
    
    if (!txLoans) {
      DebugLogger.error(`💳 [FlashLoanStateManager] No active loans found for transaction ${txHash}`);
      return false;
    }

    const flashLoan = txLoans.get(loanId);
    if (!flashLoan) {
      DebugLogger.error(`💳 [FlashLoanStateManager] Flash loan ${loanId} not found`);
      return false;
    }

    const repaymentEvent: RepaymentEvent = {
      amount,
      block_number: blockNumber,
      transaction_hash: txHash,
      timestamp: Date.now() / 1000
    };

    flashLoan.repayments.push(repaymentEvent);
    flashLoan.actual_repayment = flashLoan.actual_repayment.plus(amount);
    
    // Check if loan is now complete
    flashLoan.is_complete = flashLoan.actual_repayment.gte(flashLoan.expected_repayment);

    // Update state tracker
    this.stateTracker.recordFlashLoanRepayment(txHash, token, protocol, amount);

    DebugLogger.core(`💳 [FlashLoanStateManager] Recorded repayment: ${amount.toString()} ${token} to ${protocol} (Complete: ${flashLoan.is_complete})`);
    
    return true;
  }

  /**
   * Validate flash loan completion for a transaction
   */
  validateFlashLoanCompletion(txHash: string): FlashLoanValidationResult[] {
    const txLoans = this.activeLoansByTransaction.get(txHash);
    if (!txLoans || txLoans.size === 0) {
      return [];
    }

    const results: FlashLoanValidationResult[] = [];
    
    for (const [loanId, loan] of txLoans) {
      const validationResult = this.validateSingleLoan(loanId, loan);
      results.push(validationResult);
    }

    return results;
  }

  /**
   * Validate a single flash loan
   */
  private validateSingleLoan(loanId: string, loan: FlashLoanState): FlashLoanValidationResult {
    const validationErrors: string[] = [];
    
    // Check repayment completeness
    const repaymentDeficit = loan.expected_repayment.minus(loan.actual_repayment);
    const isRepaid = repaymentDeficit.lte(new BigNumber(0.01)); // Allow small rounding errors
    
    if (!isRepaid) {
      validationErrors.push(`Insufficient repayment: ${repaymentDeficit.toString()} ${loan.token} deficit`);
    }

    // Check fee compliance
    const expectedFee = loan.loan_amount.multipliedBy(loan.fee_rate);
    const actualFee = loan.actual_repayment.minus(loan.loan_amount);
    const feeCompliance = actualFee.gte(expectedFee.multipliedBy(0.99)); // 1% tolerance
    
    if (!feeCompliance) {
      validationErrors.push(`Fee compliance violation: expected ${expectedFee.toString()}, got ${actualFee.toString()}`);
    }

    // Timing compliance (must be repaid in same transaction)
    const timingCompliance = loan.repayments.length > 0;
    if (!timingCompliance) {
      validationErrors.push('No repayment recorded in transaction');
    }

    return {
      is_valid: isRepaid && feeCompliance && timingCompliance,
      loan_id: loanId,
      expected_repayment: loan.expected_repayment,
      actual_repayment: loan.actual_repayment,
      fee_compliance: feeCompliance,
      timing_compliance: timingCompliance,
      repayment_deficit: repaymentDeficit,
      validation_errors: validationErrors
    };
  }

  /**
   * Complete transaction and move loans to history
   */
  completeTransaction(txHash: string): void {
    const txLoans = this.activeLoansByTransaction.get(txHash);
    if (txLoans) {
      // Move to history
      const loanArray = Array.from(txLoans.values());
      this.loanHistory.set(txHash, loanArray);
      
      // Remove from active
      this.activeLoansByTransaction.delete(txHash);
      
      DebugLogger.core(`💳 [FlashLoanStateManager] Completed transaction ${txHash.substring(0, 10)}... with ${loanArray.length} loans`);
    }

    // Complete in state tracker
    this.stateTracker.completeTransaction(txHash);
  }

  /**
   * Get flash loan metrics for analysis
   */
  getFlashLoanMetrics(txHash?: string): FlashLoanMetrics {
    let loans: FlashLoanState[] = [];
    
    if (txHash) {
      // Single transaction metrics
      const txLoans = this.activeLoansByTransaction.get(txHash) || new Map();
      const historyLoans = this.loanHistory.get(txHash) || [];
      loans = Array.from(txLoans.values()).concat(historyLoans);
    } else {
      // All transactions metrics
      for (const txLoans of this.activeLoansByTransaction.values()) {
        loans = loans.concat(Array.from(txLoans.values()));
      }
      for (const historyLoans of this.loanHistory.values()) {
        loans = loans.concat(historyLoans);
      }
    }

    const totalLoans = loans.length;
    const activeLoans = loans.filter(l => !l.is_complete).length;
    const completedLoans = loans.filter(l => l.is_complete).length;
    const failedLoans = totalLoans - completedLoans - activeLoans;

    const totalVolume = loans.reduce((sum, loan) => sum.plus(loan.loan_amount), new BigNumber(0));
    const totalFeesExpected = loans.reduce((sum, loan) => sum.plus(loan.expected_repayment.minus(loan.loan_amount)), new BigNumber(0));
    const totalFeesPaid = loans.reduce((sum, loan) => sum.plus(loan.actual_repayment.minus(loan.loan_amount)), new BigNumber(0));

    const averageLoanSize = totalLoans > 0 ? totalVolume.dividedBy(totalLoans) : new BigNumber(0);
    const protocolsUsed = [...new Set(loans.map(l => l.protocol))];

    return {
      total_loans: totalLoans,
      active_loans: activeLoans,
      completed_loans: completedLoans,
      failed_loans: failedLoans,
      total_volume: totalVolume,
      total_fees_expected: totalFeesExpected,
      total_fees_paid: totalFeesPaid,
      average_loan_size: averageLoanSize,
      protocols_used: protocolsUsed
    };
  }

  /**
   * Detect flash loan arbitrage patterns
   */
  detectArbitragePattern(txHash: string): FlashLoanPattern | null {
    const txLoans = this.activeLoansByTransaction.get(txHash) || new Map();
    const loanArray = Array.from(txLoans.values());
    
    if (loanArray.length === 0) {
      return null;
    }

    const totalAmount = loanArray.reduce((sum, loan) => sum.plus(loan.loan_amount), new BigNumber(0));
    const totalExpectedFees = loanArray.reduce((sum, loan) => sum.plus(loan.expected_repayment.minus(loan.loan_amount)), new BigNumber(0));
    const totalActualRepayment = loanArray.reduce((sum, loan) => sum.plus(loan.actual_repayment), new BigNumber(0));
    
    // Net profit calculation (simplified)
    const netProfit = totalActualRepayment.minus(totalAmount).minus(totalExpectedFees);
    
    // Arbitrage detection heuristics
    const hasMultipleTokens = new Set(loanArray.map(l => l.token)).size > 1;
    const hasMultipleProtocols = new Set(loanArray.map(l => l.protocol)).size > 1;
    const hasLargeProfitMargin = netProfit.gt(totalAmount.multipliedBy(0.01)); // 1% profit margin
    
    const arbitrageDetected = hasMultipleTokens || hasMultipleProtocols || hasLargeProfitMargin;
    
    // Risk scoring (0-1 scale)
    let manipulationRisk = 0;
    if (netProfit.gt(totalAmount.multipliedBy(0.1))) manipulationRisk += 0.4; // 10%+ profit
    if (loanArray.length > 3) manipulationRisk += 0.2; // Complex loan structure
    if (hasMultipleProtocols) manipulationRisk += 0.2; // Cross-protocol
    if (totalAmount.gt(new BigNumber(1000000))) manipulationRisk += 0.2; // Large amount (>1M in token units)

    // Complexity scoring
    const complexityScore = loanArray.length * 0.3 + (hasMultipleProtocols ? 0.4 : 0) + (hasMultipleTokens ? 0.3 : 0);

    return {
      pattern_id: `${txHash.substring(0, 10)}-pattern`,
      loan_sequence: loanArray,
      total_amount: totalAmount,
      net_profit: netProfit,
      arbitrage_detected: arbitrageDetected,
      manipulation_risk: Math.min(1.0, manipulationRisk),
      complexity_score: Math.min(1.0, complexityScore)
    };
  }

  /**
   * Get protocol-specific fee rate
   */
  private getProtocolFeeRate(protocol: string): number {
    return this.protocolFeeRates.get(protocol.toLowerCase()) || 0;
  }

  /**
   * Generate unique loan identifier
   */
  private generateLoanId(txHash: string, protocol: string, token: string, logIndex?: number): string {
    const base = `${txHash.substring(0, 10)}-${protocol}-${token}`;
    return logIndex !== undefined ? `${base}-${logIndex}` : base;
  }

  /**
   * Get active loans for a transaction
   */
  getActiveLoans(txHash: string): FlashLoanState[] {
    const txLoans = this.activeLoansByTransaction.get(txHash);
    return txLoans ? Array.from(txLoans.values()) : [];
  }

  /**
   * Get loan history for a transaction
   */
  getLoanHistory(txHash: string): FlashLoanState[] {
    return this.loanHistory.get(txHash) || [];
  }

  /**
   * Check if transaction has any flash loans
   */
  hasFlashLoans(txHash: string): boolean {
    const active = this.activeLoansByTransaction.has(txHash) && this.activeLoansByTransaction.get(txHash)!.size > 0;
    const history = this.loanHistory.has(txHash) && this.loanHistory.get(txHash)!.length > 0;
    return active || history;
  }

  /**
   * Clear all state (for testing)
   */
  clearState(): void {
    this.activeLoansByTransaction.clear();
    this.loanHistory.clear();
    this.validationCache.clear();
    this.stateTracker.clearState();
    
    DebugLogger.core('💳 [FlashLoanStateManager] Cleared all state data');
  }

  /**
   * Get statistics for monitoring
   */
  getStatistics(): any {
    const activeTransactions = this.activeLoansByTransaction.size;
    const totalActiveLoans = Array.from(this.activeLoansByTransaction.values())
      .reduce((sum, txLoans) => sum + txLoans.size, 0);
    const totalHistoryTransactions = this.loanHistory.size;
    const totalHistoryLoans = Array.from(this.loanHistory.values())
      .reduce((sum, loans) => sum + loans.length, 0);

    return {
      active_transactions: activeTransactions,
      active_loans: totalActiveLoans,
      completed_transactions: totalHistoryTransactions,
      completed_loans: totalHistoryLoans,
      total_protocols: this.protocolFeeRates.size,
      cache_size: this.validationCache.size
    };
  }
}