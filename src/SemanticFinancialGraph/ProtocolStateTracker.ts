/**
 * Protocol State Tracker for Enhanced SemanticFinancialGraph
 * Tracks protocol-specific states required for invariant validation
 */

import BigNumber from 'bignumber.js';
import { DebugLogger } from '../Utils/DebugLogger';

// Type definitions for protocol states
export interface PoolState {
  reserveA: BigNumber;
  reserveB: BigNumber;
  totalSupply: BigNumber;
  k_before?: BigNumber;
  k_after?: BigNumber;
  amplification_coefficient?: BigNumber; // Curve-specific
  fee_rate: number;
  last_update: number;
}

export interface OracleState {
  spot_price: BigNumber;
  twap_price: BigNumber;
  chainlink_price?: BigNumber;
  historical_prices: PricePoint[];
  last_update: number;
  deviation_threshold: number;
}

export interface PricePoint {
  price: BigNumber;
  timestamp: number;
  block_number: number;
  source: string;
}

export interface FlashLoanState {
  transaction_hash: string;
  protocol: string;
  token: string;
  loan_amount: BigNumber;
  expected_repayment: BigNumber;
  actual_repayment: BigNumber;
  repayments: RepaymentEvent[];
  is_complete: boolean;
  initiated_at: number;
  fee_rate: number;
}

export interface RepaymentEvent {
  amount: BigNumber;
  block_number: number;
  transaction_hash: string;
  timestamp: number;
}

export interface LendingState {
  collateral_factors: Map<string, number>;
  utilization_rates: Map<string, BigNumber>;
  interest_rates: Map<string, BigNumber>;
  health_factors: Map<string, BigNumber>;
  total_borrows: Map<string, BigNumber>;
  total_supply: Map<string, BigNumber>;
}

export interface TransactionState {
  hash: string;
  block_number: number;
  timestamp: number;
  is_complete: boolean;
  flash_loans: Map<string, FlashLoanState>;
  price_updates: Map<string, PricePoint>;
  pool_interactions: string[];
}

export interface ProtocolGraphState {
  // Pool states indexed by pool address
  pools: Map<string, PoolState>;
  
  // Oracle states indexed by token symbol/address
  oracles: Map<string, OracleState>;
  
  // Transaction states indexed by transaction hash
  transactions: Map<string, TransactionState>;
  
  // Lending protocol states indexed by protocol name
  lending: Map<string, LendingState>;
  
  // Global state tracking
  current_transaction?: string;
  current_block?: number;
}

/**
 * Protocol State Tracker - Core state management for protocol verification
 */
export class ProtocolStateTracker {
  private state: ProtocolGraphState;
  private stateHistory: Map<number, Partial<ProtocolGraphState>>;

  constructor() {
    this.state = this.initializeState();
    this.stateHistory = new Map();
    
    DebugLogger.core('📊 [ProtocolStateTracker] Initialized with empty state');
  }

  private initializeState(): ProtocolGraphState {
    return {
      pools: new Map(),
      oracles: new Map(), 
      transactions: new Map(),
      lending: new Map()
    };
  }

  // Pool State Management
  updatePoolState(poolAddress: string, before: Partial<PoolState>, after: Partial<PoolState>): void {
    const existingPool = this.state.pools.get(poolAddress) || this.createEmptyPoolState();
    
    // Update with before state
    const updatedPool: PoolState = {
      ...existingPool,
      ...before,
      k_before: before.reserveA && before.reserveB ? 
        before.reserveA.multipliedBy(before.reserveB) : existingPool.k_before,
      last_update: Date.now()
    };

    // Calculate k_after if we have after reserves
    if (after.reserveA && after.reserveB) {
      updatedPool.k_after = after.reserveA.multipliedBy(after.reserveB);
      updatedPool.reserveA = after.reserveA;
      updatedPool.reserveB = after.reserveB;
    }

    this.state.pools.set(poolAddress, updatedPool);
    
    DebugLogger.core(`📊 [ProtocolStateTracker] Updated pool state for ${poolAddress.substring(0, 8)}...`);
  }

  private createEmptyPoolState(): PoolState {
    return {
      reserveA: new BigNumber(0),
      reserveB: new BigNumber(0),
      totalSupply: new BigNumber(0),
      fee_rate: 0.003, // Default 0.3%
      last_update: Date.now()
    };
  }

  getPoolState(poolAddress: string): PoolState | undefined {
    return this.state.pools.get(poolAddress);
  }

  // Oracle State Management
  updateOracleState(token: string, priceData: Partial<OracleState>): void {
    const existingOracle = this.state.oracles.get(token) || this.createEmptyOracleState();
    
    const updatedOracle: OracleState = {
      ...existingOracle,
      ...priceData,
      last_update: Date.now()
    };

    // Add to historical prices if we have new spot price
    if (priceData.spot_price) {
      const pricePoint: PricePoint = {
        price: priceData.spot_price,
        timestamp: Date.now() / 1000,
        block_number: this.state.current_block || 0,
        source: 'oracle_update'
      };
      updatedOracle.historical_prices.push(pricePoint);
      
      // Keep only last 100 price points
      if (updatedOracle.historical_prices.length > 100) {
        updatedOracle.historical_prices = updatedOracle.historical_prices.slice(-100);
      }
    }

    this.state.oracles.set(token, updatedOracle);
    
    DebugLogger.core(`📊 [ProtocolStateTracker] Updated oracle state for ${token}`);
  }

  private createEmptyOracleState(): OracleState {
    return {
      spot_price: new BigNumber(0),
      twap_price: new BigNumber(0),
      historical_prices: [],
      last_update: Date.now(),
      deviation_threshold: 0.05 // 5% default
    };
  }

  getOracleState(token: string): OracleState | undefined {
    return this.state.oracles.get(token);
  }

  // Transaction State Management
  initializeTransaction(txHash: string, blockNumber: number): void {
    const transactionState: TransactionState = {
      hash: txHash,
      block_number: blockNumber,
      timestamp: Date.now() / 1000,
      is_complete: false,
      flash_loans: new Map(),
      price_updates: new Map(),
      pool_interactions: []
    };

    this.state.transactions.set(txHash, transactionState);
    this.state.current_transaction = txHash;
    this.state.current_block = blockNumber;
    
    DebugLogger.core(`📊 [ProtocolStateTracker] Initialized transaction state for ${txHash.substring(0, 10)}...`);
  }

  completeTransaction(txHash: string): void {
    const txState = this.state.transactions.get(txHash);
    if (txState) {
      txState.is_complete = true;
      this.state.transactions.set(txHash, txState);
      
      DebugLogger.core(`📊 [ProtocolStateTracker] Completed transaction ${txHash.substring(0, 10)}...`);
    }
  }

  getTransactionState(txHash: string): TransactionState | undefined {
    return this.state.transactions.get(txHash);
  }

  // Flash Loan State Management
  trackFlashLoan(txHash: string, protocol: string, token: string, amount: BigNumber): void {
    const txState = this.state.transactions.get(txHash);
    if (!txState) {
      DebugLogger.error(`📊 [ProtocolStateTracker] No transaction state found for ${txHash}`);
      return;
    }

    const feeRates = {
      'aave': 0.0009,      // 0.09%
      'dydx': 0,           // 0%
      'balancer': 0,       // 0%
      'compound': 0        // 0%
    };

    const feeRate = feeRates[protocol.toLowerCase() as keyof typeof feeRates] || 0;
    const flashLoanState: FlashLoanState = {
      transaction_hash: txHash,
      protocol,
      token,
      loan_amount: amount,
      expected_repayment: amount.multipliedBy(new BigNumber(1 + feeRate)),
      actual_repayment: new BigNumber(0),
      repayments: [],
      is_complete: false,
      initiated_at: txState.block_number,
      fee_rate: feeRate
    };

    txState.flash_loans.set(`${token}-${protocol}`, flashLoanState);
    this.state.transactions.set(txHash, txState);
    
    DebugLogger.core(`📊 [ProtocolStateTracker] Tracked flash loan: ${amount.toString()} ${token} from ${protocol}`);
  }

  recordFlashLoanRepayment(txHash: string, token: string, protocol: string, amount: BigNumber): void {
    const txState = this.state.transactions.get(txHash);
    if (!txState) return;

    const flashLoan = txState.flash_loans.get(`${token}-${protocol}`);
    if (!flashLoan) return;

    const repaymentEvent: RepaymentEvent = {
      amount,
      block_number: txState.block_number,
      transaction_hash: txHash,
      timestamp: Date.now() / 1000
    };

    flashLoan.repayments.push(repaymentEvent);
    flashLoan.actual_repayment = flashLoan.actual_repayment.plus(amount);
    
    // Check if fully repaid
    flashLoan.is_complete = flashLoan.actual_repayment.gte(flashLoan.expected_repayment);

    txState.flash_loans.set(`${token}-${protocol}`, flashLoan);
    this.state.transactions.set(txHash, txState);
    
    DebugLogger.core(`📊 [ProtocolStateTracker] Recorded repayment: ${amount.toString()} ${token} to ${protocol}`);
  }

  // Lending State Management
  updateLendingState(protocol: string, updates: Partial<LendingState>): void {
    const existingState = this.state.lending.get(protocol) || this.createEmptyLendingState();
    
    const updatedState: LendingState = {
      collateral_factors: updates.collateral_factors || existingState.collateral_factors,
      utilization_rates: updates.utilization_rates || existingState.utilization_rates,
      interest_rates: updates.interest_rates || existingState.interest_rates,
      health_factors: updates.health_factors || existingState.health_factors,
      total_borrows: updates.total_borrows || existingState.total_borrows,
      total_supply: updates.total_supply || existingState.total_supply
    };

    this.state.lending.set(protocol, updatedState);
    
    DebugLogger.core(`📊 [ProtocolStateTracker] Updated lending state for ${protocol}`);
  }

  private createEmptyLendingState(): LendingState {
    return {
      collateral_factors: new Map(),
      utilization_rates: new Map(),
      interest_rates: new Map(),
      health_factors: new Map(),
      total_borrows: new Map(),
      total_supply: new Map()
    };
  }

  getLendingState(protocol: string): LendingState | undefined {
    return this.state.lending.get(protocol);
  }

  // State Access Methods
  getState(): ProtocolGraphState {
    return this.state;
  }

  getPoolStates(): Map<string, PoolState> {
    return this.state.pools;
  }

  getOracleStates(): Map<string, OracleState> {
    return this.state.oracles;
  }

  // State Persistence
  saveStateSnapshot(blockNumber: number): void {
    const snapshot: Partial<ProtocolGraphState> = {
      pools: new Map(this.state.pools),
      oracles: new Map(this.state.oracles),
      transactions: new Map(this.state.transactions),
      lending: new Map(this.state.lending),
      current_block: blockNumber
    };

    this.stateHistory.set(blockNumber, snapshot);
    
    // Keep only last 1000 block snapshots
    if (this.stateHistory.size > 1000) {
      const oldestBlock = Math.min(...this.stateHistory.keys());
      this.stateHistory.delete(oldestBlock);
    }
    
    DebugLogger.core(`📊 [ProtocolStateTracker] Saved state snapshot for block ${blockNumber}`);
  }

  loadStateSnapshot(blockNumber: number): boolean {
    const snapshot = this.stateHistory.get(blockNumber);
    if (!snapshot) return false;

    if (snapshot.pools) this.state.pools = new Map(snapshot.pools);
    if (snapshot.oracles) this.state.oracles = new Map(snapshot.oracles);
    if (snapshot.transactions) this.state.transactions = new Map(snapshot.transactions);
    if (snapshot.lending) this.state.lending = new Map(snapshot.lending);
    
    this.state.current_block = snapshot.current_block;
    
    DebugLogger.core(`📊 [ProtocolStateTracker] Loaded state snapshot for block ${blockNumber}`);
    return true;
  }

  // Debug and Monitoring
  getStateStatistics(): any {
    return {
      pools_tracked: this.state.pools.size,
      oracles_tracked: this.state.oracles.size,
      transactions_tracked: this.state.transactions.size,
      lending_protocols: this.state.lending.size,
      current_block: this.state.current_block,
      current_transaction: this.state.current_transaction
    };
  }

  clearState(): void {
    this.state = this.initializeState();
    this.stateHistory.clear();
    
    DebugLogger.core('📊 [ProtocolStateTracker] Cleared all state data');
  }
}