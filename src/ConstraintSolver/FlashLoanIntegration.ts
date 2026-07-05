/**
 * Flash Loan Integration Layer
 * Connects FlashLoanStateManager to SemanticFinancialGraph system
 */

import BigNumber from 'bignumber.js';
import { DebugLogger } from '../Utils/DebugLogger';
import { FlashLoanStateManager, FlashLoanValidationResult } from './FlashLoanStateManager';
import { ProtocolStateTracker } from '../SemanticFinancialGraph/ProtocolStateTracker';

export interface FlashLoanContext {
  has_flash_loans: boolean;
  active_loans: number;
  total_loan_amount: BigNumber;
  all_loans_repaid: boolean;
  repayment_violations: string[];
  manipulation_risk_score: number;
  protocols_involved: string[];
}

export interface FlashLoanConstraintData {
  loan_amount: BigNumber;
  expected_repayment: BigNumber;
  actual_repayment: BigNumber;
  fee_rate: number;
  protocol: string;
  is_repaid: boolean;
  repayment_deficit: BigNumber;
}

/**
 * Flash Loan Integration Layer
 * Provides seamless integration between flash loan tracking and constraint validation
 */
export class FlashLoanIntegration {
  private flashLoanManager: FlashLoanStateManager;
  private stateTracker: ProtocolStateTracker;

  constructor() {
    this.stateTracker = new ProtocolStateTracker();
    this.flashLoanManager = new FlashLoanStateManager(this.stateTracker);
    
    DebugLogger.core('🔗 [FlashLoanIntegration] Initialized flash loan integration layer');
  }

  /**
   * Process transaction for flash loan detection and tracking
   */
  processTransaction(txHash: string, blockNumber: number, edges: any[]): void {
    this.flashLoanManager.initializeTransaction(txHash, blockNumber);
    
    // Process edges for flash loan events
    this.processEdgesForFlashLoans(txHash, blockNumber, edges);
    
    // Complete transaction processing
    this.flashLoanManager.completeTransaction(txHash);
  }

  /**
   * Process edges to detect flash loan initiation and repayment
   */
  private processEdgesForFlashLoans(txHash: string, blockNumber: number, edges: any[]): void {
    const flashLoanEvents: any[] = [];
    const transferEvents: any[] = [];
    
    // Separate flash loan events from transfer events
    for (const edge of edges) {
      if (this.isFlashLoanEvent(edge)) {
        flashLoanEvents.push(edge);
      } else if (this.isRelevantTransferEvent(edge)) {
        transferEvents.push(edge);
      }
    }

    // Process flash loan initiations
    for (const event of flashLoanEvents) {
      this.processFlashLoanInitiation(txHash, blockNumber, event);
    }

    // Process potential repayments
    this.processRepaymentEvents(txHash, blockNumber, transferEvents);
  }

  /**
   * Detect flash loan initiation events
   */
  private isFlashLoanEvent(edge: any): boolean {
    if (!edge || !edge.Type || !edge.Action) return false;

    // Check for explicit flash loan types
    if (edge.Type === 'FlashLoan' || edge.Type === 'Flash Loan') {
      return true;
    }

    // Check for flash loan-related actions
    const flashLoanActions = [
      'Flash Loan',
      'FlashLoan',
      'Borrow',
      'flashloan',
      'flash'
    ];

    return flashLoanActions.some(action => 
      edge.Action?.toLowerCase().includes(action.toLowerCase())
    );
  }

  /**
   * Process flash loan initiation
   */
  private processFlashLoanInitiation(txHash: string, blockNumber: number, event: any): void {
    try {
      const protocol = this.extractProtocol(event);
      const token = this.extractToken(event);
      const amount = this.extractAmount(event);

      if (protocol && token && amount && amount.gt(0)) {
        this.flashLoanManager.trackFlashLoan(
          txHash,
          protocol,
          token,
          amount,
          blockNumber,
          event.LogIndex
        );

        DebugLogger.core(`🔗 [FlashLoanIntegration] Detected flash loan: ${amount.toString()} ${token} from ${protocol}`);
      }
    } catch (error) {
      DebugLogger.error(`🔗 [FlashLoanIntegration] Error processing flash loan initiation: ${error}`);
    }
  }

  /**
   * Check if transfer event is relevant for flash loan repayment
   */
  private isRelevantTransferEvent(edge: any): boolean {
    if (!edge || !edge.Type || !edge.Action) return false;

    return edge.Type === 'Transfer' || 
           edge.Action === 'Transfer' ||
           edge.Type === 'ERC20Transfer';
  }

  /**
   * Process transfer events to detect flash loan repayments
   */
  private processRepaymentEvents(txHash: string, blockNumber: number, transfers: any[]): void {
    const activeLoans = this.flashLoanManager.getActiveLoans(txHash);
    
    for (const loan of activeLoans) {
      // Look for transfers that match loan token and could be repayments
      const potentialRepayments = transfers.filter(transfer => 
        this.couldBeRepayment(transfer, loan.token, loan.protocol)
      );

      for (const repayment of potentialRepayments) {
        const amount = this.extractAmount(repayment);
        if (amount && amount.gt(0)) {
          this.flashLoanManager.recordRepayment(
            txHash,
            loan.protocol,
            loan.token,
            amount,
            blockNumber,
            repayment.LogIndex
          );
        }
      }
    }
  }

  /**
   * Check if transfer could be a flash loan repayment
   */
  private couldBeRepayment(transfer: any, loanToken: string, protocol: string): boolean {
    const transferToken = this.extractToken(transfer);
    const transferAmount = this.extractAmount(transfer);
    
    // Basic checks
    if (!transferToken || !transferAmount || transferAmount.lte(0)) {
      return false;
    }

    // Token must match
    if (transferToken.toLowerCase() !== loanToken.toLowerCase()) {
      return false;
    }

    // Additional heuristics could be added here
    // For now, any transfer of the loan token is considered a potential repayment
    return true;
  }

  /**
   * Get flash loan context for constraint evaluation
   */
  getFlashLoanContext(txHash: string): FlashLoanContext {
    const activeLoans = this.flashLoanManager.getActiveLoans(txHash);
    const historyLoans = this.flashLoanManager.getLoanHistory(txHash);
    const allLoans = activeLoans.concat(historyLoans);
    
    const validationResults = this.flashLoanManager.validateFlashLoanCompletion(txHash);
    const hasViolations = validationResults.some(r => !r.is_valid);
    const violations = validationResults.flatMap(r => r.validation_errors);
    
    const pattern = this.flashLoanManager.detectArbitragePattern(txHash);
    const manipulationRisk = pattern?.manipulation_risk || 0;
    
    const totalAmount = allLoans.reduce((sum, loan) => sum.plus(loan.loan_amount), new BigNumber(0));
    const protocols = [...new Set(allLoans.map(l => l.protocol))];
    const allRepaid = allLoans.every(loan => loan.is_complete);

    return {
      has_flash_loans: allLoans.length > 0,
      active_loans: activeLoans.length,
      total_loan_amount: totalAmount,
      all_loans_repaid: allRepaid,
      repayment_violations: violations,
      manipulation_risk_score: manipulationRisk,
      protocols_involved: protocols
    };
  }

  /**
   * Get constraint data for specific flash loan validation
   */
  getConstraintData(txHash: string): FlashLoanConstraintData[] {
    const activeLoans = this.flashLoanManager.getActiveLoans(txHash);
    const historyLoans = this.flashLoanManager.getLoanHistory(txHash);
    const allLoans = activeLoans.concat(historyLoans);

    return allLoans.map(loan => ({
      loan_amount: loan.loan_amount,
      expected_repayment: loan.expected_repayment,
      actual_repayment: loan.actual_repayment,
      fee_rate: loan.fee_rate,
      protocol: loan.protocol,
      is_repaid: loan.is_complete,
      repayment_deficit: loan.expected_repayment.minus(loan.actual_repayment)
    }));
  }

  /**
   * Validate all flash loans in transaction
   */
  validateTransaction(txHash: string): FlashLoanValidationResult[] {
    return this.flashLoanManager.validateFlashLoanCompletion(txHash);
  }

  /**
   * Extract protocol from event
   */
  private extractProtocol(event: any): string | null {
    if (event.Service) return event.Service;
    if (event.Protocol) return event.Protocol;
    if (event.To && typeof event.To === 'string') {
      // Try to infer protocol from address or other fields
      // This could be enhanced with a protocol address mapping
      return 'unknown';
    }
    return null;
  }

  /**
   * Extract token from event
   */
  private extractToken(event: any): string | null {
    if (event.Token) return event.Token;
    if (event.TokenSymbol) return event.TokenSymbol;
    if (event.Asset) return event.Asset;
    return null;
  }

  /**
   * Extract amount from event
   */
  private extractAmount(event: any): BigNumber | null {
    try {
      if (event.Amount) {
        return new BigNumber(event.Amount);
      }
      if (event.Value) {
        return new BigNumber(event.Value);
      }
      if (event.amount) {
        return new BigNumber(event.amount);
      }
      if (event.value) {
        return new BigNumber(event.value);
      }
      return null;
    } catch (error) {
      DebugLogger.error(`🔗 [FlashLoanIntegration] Error extracting amount: ${error}`);
      return null;
    }
  }

  /**
   * Get flash loan manager instance
   */
  getFlashLoanManager(): FlashLoanStateManager {
    return this.flashLoanManager;
  }

  /**
   * Get state tracker instance
   */
  getStateTracker(): ProtocolStateTracker {
    return this.stateTracker;
  }

  /**
   * Clear all state
   */
  clearState(): void {
    this.flashLoanManager.clearState();
    DebugLogger.core('🔗 [FlashLoanIntegration] Cleared integration state');
  }
}