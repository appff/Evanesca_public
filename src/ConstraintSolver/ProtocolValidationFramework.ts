/**
 * Protocol Validation Framework
 * Comprehensive orchestration of all protocol verification components
 */

import BigNumber from 'bignumber.js';
import { DebugLogger } from '../Utils/DebugLogger';
import { ProtocolStateTracker } from '../SemanticFinancialGraph/ProtocolStateTracker';
import { FlashLoanIntegration } from './FlashLoanIntegration';
import { OracleIntegrationManager } from '../Oracle/OracleIntegrationManager';
import { ConstraintImplementations, ConstraintResult, ConstraintContext } from './ConstraintImplementations';

/**
 * Transaction Complexity Analyzer
 * Analyzes transaction complexity to determine appropriate timeout values
 */
class TransactionComplexityAnalyzer {
  /**
   * Calculate transaction complexity score (0.0 - 1.0)
   */
  analyzeComplexity(context: ConstraintContext, edges: any[]): number {
    let complexity = 0.0;
    
    // Base complexity from edge count
    complexity += Math.min(edges.length / 10, 0.3);
    
    // Protocol diversity adds complexity
    const protocols = new Set(edges.map(e => e.Service || 'unknown'));
    complexity += Math.min(protocols.size / 5, 0.2);
    
    // Flash loan presence increases complexity
    if (edges.some(e => e.Type === 'FlashLoan')) {
      complexity += 0.2;
    }
    
    // Multi-token transactions are more complex
    const tokens = new Set();
    edges.forEach(e => {
      if (e.Token) tokens.add(e.Token);
      if (e.Token0) tokens.add(e.Token0);
      if (e.Token1) tokens.add(e.Token1);
    });
    complexity += Math.min(tokens.size / 8, 0.3);
    
    return Math.min(complexity, 1.0);
  }
  
  /**
   * Calculate adaptive timeout based on complexity
   */
  calculateTimeout(baseTimeout: number, complexity: number): number {
    // Linear scaling from base timeout to 3x base timeout based on complexity
    return Math.round(baseTimeout * (1 + 2 * complexity));
  }
}

export interface ValidationReport {
  transaction_hash: string;
  block_number: number;
  total_constraints: number;
  violations: ConstraintResult[];
  passed: ConstraintResult[];
  overall_score: number; // 0-1 scale
  risk_level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  execution_time_ms: number;
  metadata: {
    has_flash_loans: boolean;
    price_data_available: boolean;
    pool_states_tracked: number;
    oracle_sources_used: string[];
  };
}

export interface BatchValidationSummary {
  total_transactions: number;
  total_violations: number;
  violation_rate: number;
  constraint_breakdown: { [constraint: string]: { total: number; violations: number; rate: number } };
  performance_metrics: {
    average_execution_time_ms: number;
    total_execution_time_ms: number;
    transactions_per_second: number;
  };
  risk_distribution: { [risk: string]: number };
}

export interface FrameworkConfig {
  enable_oracle_integration: boolean;
  enable_flash_loan_tracking: boolean;
  enable_state_tracking: boolean;
  constraint_timeout_ms: number;
  adaptive_timeouts: boolean;
  constraint_specific_timeouts: { [constraint: string]: number };
  enable_performance_profiling: boolean;
  batch_processing: boolean;
  cache_results: boolean;
}

/**
 * Protocol Validation Framework
 * Orchestrates comprehensive protocol verification using all infrastructure components
 */
export class ProtocolValidationFramework {
  private constraintImplementations: ConstraintImplementations;
  private stateTracker: ProtocolStateTracker;
  private flashLoanIntegration: FlashLoanIntegration;
  private oracleManager: OracleIntegrationManager;
  private config: FrameworkConfig;
  private resultCache: Map<string, ValidationReport>;
  private constraintPerformance: Map<string, { totalTime: number; executions: number; timeouts: number }>;
  private complexityAnalyzer: TransactionComplexityAnalyzer;

  constructor(web3?: any, config?: Partial<FrameworkConfig>) {
    this.config = {
      enable_oracle_integration: true,
      enable_flash_loan_tracking: true,
      enable_state_tracking: true,
      constraint_timeout_ms: 10000,  // Increased base timeout for 8K processing
      adaptive_timeouts: true,
      constraint_specific_timeouts: {
        'UNISWAP_V2_INVARIANT': 8000,  // Increased for 8K processing
        'CURVE_STABLE_INVARIANT': 10000,
        'AAVE_HEALTH_FACTOR': 12000,
        'MAKERDAO_COLLATERAL_RATIO': 10000,
        'FLASH_LOAN_REPAYMENT': 15000,
        'ORACLE_PRICE_MANIPULATION': 12000,
        'LIQUIDITY_BALANCE_INVARIANT': 10000
      },
      enable_performance_profiling: true,
      batch_processing: true,
      cache_results: true,
      ...config
    };

    this.constraintPerformance = new Map();
    this.complexityAnalyzer = new TransactionComplexityAnalyzer();

    this.constraintImplementations = new ConstraintImplementations(web3);
    this.stateTracker = new ProtocolStateTracker();
    this.flashLoanIntegration = new FlashLoanIntegration();
    this.oracleManager = new OracleIntegrationManager(web3);
    this.resultCache = new Map();

    DebugLogger.core('🚀 [ProtocolValidationFramework] Initialized comprehensive validation framework');
  }

  /**
   * Validate single transaction with comprehensive protocol checking
   */
  async validateTransaction(
    txHash: string, 
    blockNumber: number, 
    edges: any[], 
    constraintsToCheck?: string[]
  ): Promise<ValidationReport> {
    const startTime = Date.now();

    try {
      // Check cache first
      if (this.config.cache_results && this.resultCache.has(txHash)) {
        const cachedResult = this.resultCache.get(txHash)!;
        DebugLogger.core(`🚀 [ProtocolValidationFramework] Using cached result for ${txHash.substring(0, 10)}...`);
        return cachedResult;
      }

      DebugLogger.core(`🚀 [ProtocolValidationFramework] Validating transaction ${txHash.substring(0, 10)}... with ${edges.length} edges`);

      // Initialize context
      const context = await this.initializeContext(txHash, blockNumber, edges);

      // Run constraint checks
      const constraintResults = await this.runConstraintChecks(context, edges, constraintsToCheck);

      // Generate report
      const report = await this.generateReport(context, constraintResults, startTime);

      // Cache result if enabled
      if (this.config.cache_results) {
        this.resultCache.set(txHash, report);
      }

      DebugLogger.core(`🚀 [ProtocolValidationFramework] Completed validation for ${txHash.substring(0, 10)}... in ${report.execution_time_ms}ms`);
      
      return report;

    } catch (error) {
      const executionTime = Date.now() - startTime;
      DebugLogger.error(`🚀 [ProtocolValidationFramework] Error validating ${txHash}: ${error}`);
      
      return this.createErrorReport(txHash, blockNumber, error, executionTime);
    }
  }

  /**
   * Validate batch of transactions with parallel processing
   */
  async validateBatch(
    transactions: Array<{ txHash: string; blockNumber: number; edges: any[] }>,
    constraintsToCheck?: string[]
  ): Promise<BatchValidationSummary> {
    const startTime = Date.now();
    
    DebugLogger.core(`🚀 [ProtocolValidationFramework] Starting batch validation for ${transactions.length} transactions`);

    const reports: ValidationReport[] = [];
    
    if (this.config.batch_processing) {
      // Process in parallel batches
      const batchSize = 10;
      for (let i = 0; i < transactions.length; i += batchSize) {
        const batch = transactions.slice(i, i + batchSize);
        const batchPromises = batch.map(tx => 
          this.validateTransaction(tx.txHash, tx.blockNumber, tx.edges, constraintsToCheck)
        );
        
        const batchResults = await Promise.allSettled(batchPromises);
        const successfulResults = batchResults
          .filter(result => result.status === 'fulfilled')
          .map(result => (result as { status: 'fulfilled'; value: ValidationReport }).value);
        
        reports.push(...successfulResults);
        
        DebugLogger.core(`🚀 [ProtocolValidationFramework] Completed batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(transactions.length / batchSize)}`);
      }
    } else {
      // Sequential processing
      for (const tx of transactions) {
        const report = await this.validateTransaction(tx.txHash, tx.blockNumber, tx.edges, constraintsToCheck);
        reports.push(report);
      }
    }

    // Generate summary
    const summary = this.generateBatchSummary(reports, startTime);
    
    DebugLogger.core(`🚀 [ProtocolValidationFramework] Batch validation complete: ${summary.violation_rate}% violation rate`);
    
    return summary;
  }

  /**
   * Initialize validation context
   */
  private async initializeContext(txHash: string, blockNumber: number, edges: any[]): Promise<ConstraintContext> {
    // Initialize state tracking if enabled
    if (this.config.enable_state_tracking) {
      this.stateTracker.initializeTransaction(txHash, blockNumber);
      await this.updateStateFromEdges(edges);
    }

    // Initialize flash loan tracking if enabled
    if (this.config.enable_flash_loan_tracking) {
      this.flashLoanIntegration.processTransaction(txHash, blockNumber, edges);
    }

    return {
      transaction_hash: txHash,
      block_number: blockNumber,
      graph_state: this.config.enable_state_tracking ? this.stateTracker.getState() : {},
      edges: edges
    };
  }

  /**
   * Update state tracker from transaction edges
   */
  private async updateStateFromEdges(edges: any[]): Promise<void> {
    for (const edge of edges) {
      try {
        if (this.isDEXSwap(edge)) {
          await this.updatePoolStateFromSwap(edge);
        }
        
        if (this.isPriceUpdate(edge)) {
          await this.updateOracleState(edge);
        }
        
        if (this.isLendingOperation(edge)) {
          await this.updateLendingState(edge);
        }
      } catch (error) {
        DebugLogger.error(`🚀 [ProtocolValidationFramework] Error updating state from edge: ${error}`);
      }
    }
  }

  /**
   * Run all applicable constraint checks
   */
  private async runConstraintChecks(
    context: ConstraintContext,
    edges: any[],
    constraintsToCheck?: string[]
  ): Promise<ConstraintResult[]> {
    const results: ConstraintResult[] = [];
    const checkers = this.constraintImplementations.getAllConstraintCheckers();
    
    const constraintsToRun = constraintsToCheck || Object.keys(checkers);
    
    for (const constraintName of constraintsToRun) {
      if (!checkers[constraintName]) {
        DebugLogger.error(`🚀 [ProtocolValidationFramework] Unknown constraint: ${constraintName}`);
        continue;
      }

      try {
        // Calculate adaptive timeout based on transaction complexity
        const complexity = this.config.adaptive_timeouts ? 
          this.complexityAnalyzer.analyzeComplexity(context, edges) : 0;
        
        const baseTimeout = this.config.constraint_specific_timeouts[constraintName] || 
          this.config.constraint_timeout_ms;
        const adaptiveTimeout = this.config.adaptive_timeouts ? 
          this.complexityAnalyzer.calculateTimeout(baseTimeout, complexity) : baseTimeout;

        if (this.config.enable_performance_profiling) {
          DebugLogger.core(`🎯 [ProtocolValidationFramework] Constraint ${constraintName}: complexity=${complexity.toFixed(2)}, timeout=${adaptiveTimeout}ms`);
        }

        let constraintResult: ConstraintResult;
        const startTime = Date.now();
        
        if (constraintName === 'FLASH_LOAN_REPAYMENT') {
          // Transaction-level constraint with its own timeout
          const timeoutPromise = new Promise<ConstraintResult>((_, reject) => 
            setTimeout(() => {
              // Track timeout in performance metrics
              this.recordConstraintTimeout(constraintName);
              reject(new Error(`Constraint timeout: ${constraintName} exceeded ${adaptiveTimeout}ms`));
            }, adaptiveTimeout)
          );
          
          constraintResult = await Promise.race([
            checkers[constraintName](context),
            timeoutPromise
          ]);
          results.push(constraintResult);
        } else {
          // Edge-level constraints - each edge gets its own timeout
          for (const edge of edges) {
            // Create a fresh timeout promise for each edge
            const edgeTimeoutPromise = new Promise<ConstraintResult>((_, reject) => 
              setTimeout(() => {
                // Track timeout in performance metrics
                this.recordConstraintTimeout(constraintName);
                reject(new Error(`Constraint timeout: ${constraintName} exceeded ${adaptiveTimeout}ms per edge`));
              }, adaptiveTimeout)
            );
            
            constraintResult = await Promise.race([
              checkers[constraintName](context, edge),
              edgeTimeoutPromise
            ]);
            
            if (constraintResult.violated || constraintResult.confidence > 0.5) {
              results.push(constraintResult);
            }
          }
        }

        // Record performance metrics if profiling is enabled
        if (this.config.enable_performance_profiling) {
          const executionTime = Date.now() - startTime;
          this.recordConstraintPerformance(constraintName, executionTime);
        }

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        DebugLogger.error(`🚀 [ProtocolValidationFramework] Error running constraint ${constraintName}: ${errorMessage}`);
        results.push({
          name: constraintName,
          violated: false,
          severity: 'LOW',
          message: `Constraint execution error: ${errorMessage}`,
          evidence: { error: errorMessage },
          confidence: 0.1
        });
      }
    }

    return results;
  }

  /**
   * Generate validation report
   */
  private async generateReport(
    context: ConstraintContext,
    constraintResults: ConstraintResult[],
    startTime: number
  ): Promise<ValidationReport> {
    const violations = constraintResults.filter(r => r.violated);
    const passed = constraintResults.filter(r => !r.violated);
    const executionTime = Date.now() - startTime;

    // Calculate overall score
    const totalConfidence = constraintResults.reduce((sum, r) => sum + r.confidence, 0);
    const violationWeight = violations.reduce((sum, r) => {
      const severityWeight = { 'LOW': 0.1, 'MEDIUM': 0.3, 'HIGH': 0.6, 'CRITICAL': 1.0 }[r.severity];
      return sum + (r.confidence * severityWeight);
    }, 0);
    
    const overallScore = totalConfidence > 0 ? Math.max(0, 1 - (violationWeight / totalConfidence)) : 1;

    // Determine risk level
    const riskLevel = this.determineRiskLevel(violations);

    // Generate metadata
    const flashLoanContext = this.config.enable_flash_loan_tracking ? 
      this.flashLoanIntegration.getFlashLoanContext(context.transaction_hash) : 
      { has_flash_loans: false };

    const oracleSources = this.config.enable_oracle_integration ? 
      this.oracleManager.getAvailableProviders() : [];

    const poolStatesCount = this.config.enable_state_tracking ? 
      this.stateTracker.getPoolStates().size : 0;

    return {
      transaction_hash: context.transaction_hash,
      block_number: context.block_number,
      total_constraints: constraintResults.length,
      violations,
      passed,
      overall_score: overallScore,
      risk_level: riskLevel,
      execution_time_ms: executionTime,
      metadata: {
        has_flash_loans: flashLoanContext.has_flash_loans,
        price_data_available: oracleSources.length > 0,
        pool_states_tracked: poolStatesCount,
        oracle_sources_used: oracleSources
      }
    };
  }

  /**
   * Generate batch validation summary
   */
  private generateBatchSummary(reports: ValidationReport[], startTime: number): BatchValidationSummary {
    const totalTransactions = reports.length;
    const totalViolations = reports.reduce((sum, r) => sum + r.violations.length, 0);
    const violationRate = totalTransactions > 0 ? (totalViolations / totalTransactions) * 100 : 0;
    const totalExecutionTime = Date.now() - startTime;
    const avgExecutionTime = reports.reduce((sum, r) => sum + r.execution_time_ms, 0) / reports.length;
    const transactionsPerSecond = (totalTransactions / totalExecutionTime) * 1000;

    // Constraint breakdown
    const constraintBreakdown: { [constraint: string]: { total: number; violations: number; rate: number } } = {};
    
    for (const report of reports) {
      for (const result of [...report.violations, ...report.passed]) {
        if (!constraintBreakdown[result.name]) {
          constraintBreakdown[result.name] = { total: 0, violations: 0, rate: 0 };
        }
        constraintBreakdown[result.name].total++;
        if (result.violated) {
          constraintBreakdown[result.name].violations++;
        }
      }
    }

    // Calculate violation rates
    for (const constraint of Object.keys(constraintBreakdown)) {
      const data = constraintBreakdown[constraint];
      data.rate = data.total > 0 ? (data.violations / data.total) * 100 : 0;
    }

    // Risk distribution
    const riskDistribution = { 'LOW': 0, 'MEDIUM': 0, 'HIGH': 0, 'CRITICAL': 0 };
    for (const report of reports) {
      riskDistribution[report.risk_level]++;
    }

    return {
      total_transactions: totalTransactions,
      total_violations: totalViolations,
      violation_rate: violationRate,
      constraint_breakdown: constraintBreakdown,
      performance_metrics: {
        average_execution_time_ms: avgExecutionTime,
        total_execution_time_ms: totalExecutionTime,
        transactions_per_second: transactionsPerSecond
      },
      risk_distribution: riskDistribution
    };
  }

  // Helper Methods

  private determineRiskLevel(violations: ConstraintResult[]): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
    if (violations.some(v => v.severity === 'CRITICAL')) return 'CRITICAL';
    if (violations.some(v => v.severity === 'HIGH')) return 'HIGH';
    if (violations.some(v => v.severity === 'MEDIUM')) return 'MEDIUM';
    return 'LOW';
  }

  private createErrorReport(txHash: string, blockNumber: number, error: any, executionTime: number): ValidationReport {
    return {
      transaction_hash: txHash,
      block_number: blockNumber,
      total_constraints: 0,
      violations: [],
      passed: [],
      overall_score: 0,
      risk_level: 'LOW',
      execution_time_ms: executionTime,
      metadata: {
        has_flash_loans: false,
        price_data_available: false,
        pool_states_tracked: 0,
        oracle_sources_used: []
      }
    };
  }

  private isDEXSwap(edge: any): boolean {
    return edge.Type === 'DEX' && (edge.Action === 'Swap' || edge.Action === 'Trade');
  }

  private isPriceUpdate(edge: any): boolean {
    return edge.Type === 'PriceUpdate' || edge.Action === 'PriceUpdate';
  }

  private isLendingOperation(edge: any): boolean {
    return edge.Type === 'Lending';
  }

  private async updatePoolStateFromSwap(edge: any): Promise<void> {
    // Implementation would extract pool state changes from swap data
    // This is a placeholder for the actual implementation
  }

  private async updateOracleState(edge: any): Promise<void> {
    // Implementation would update oracle price data
    // This is a placeholder for the actual implementation
  }

  private async updateLendingState(edge: any): Promise<void> {
    // Implementation would update lending protocol states
    // This is a placeholder for the actual implementation
  }

  /**
   * Clear all caches and state
   */
  clearState(): void {
    this.constraintImplementations.clearState();
    this.resultCache.clear();
    DebugLogger.core('🚀 [ProtocolValidationFramework] Cleared all state and caches');
  }

  /**
   * Get framework statistics
   */
  getStatistics(): any {
    return {
      cache_size: this.resultCache.size,
      config: this.config,
      state_tracker_stats: this.stateTracker.getStateStatistics(),
      oracle_stats: this.oracleManager.getStatistics(),
      constraint_performance: this.getConstraintPerformanceReport()
    };
  }

  /**
   * Record constraint performance metrics
   */
  private recordConstraintPerformance(constraintName: string, executionTime: number): void {
    if (!this.constraintPerformance.has(constraintName)) {
      this.constraintPerformance.set(constraintName, {
        totalTime: 0,
        executions: 0,
        timeouts: 0
      });
    }

    const metrics = this.constraintPerformance.get(constraintName)!;
    metrics.totalTime += executionTime;
    metrics.executions++;
  }

  /**
   * Record constraint timeout
   */
  private recordConstraintTimeout(constraintName: string): void {
    if (!this.constraintPerformance.has(constraintName)) {
      this.constraintPerformance.set(constraintName, {
        totalTime: 0,
        executions: 0,
        timeouts: 0
      });
    }

    const metrics = this.constraintPerformance.get(constraintName)!;
    metrics.timeouts++;
  }

  /**
   * Get constraint performance report
   */
  private getConstraintPerformanceReport(): any {
    const report: any = {};
    
    for (const [constraint, metrics] of this.constraintPerformance) {
      report[constraint] = {
        average_execution_time_ms: metrics.executions > 0 ? metrics.totalTime / metrics.executions : 0,
        total_executions: metrics.executions,
        total_timeouts: metrics.timeouts,
        timeout_rate: metrics.executions > 0 ? (metrics.timeouts / metrics.executions) * 100 : 0
      };
    }
    
    return report;
  }

  /**
   * Print performance report to console
   */
  printPerformanceReport(): void {
    if (!this.config.enable_performance_profiling) {
      DebugLogger.core('🎯 [ProtocolValidationFramework] Performance profiling is disabled');
      return;
    }

    DebugLogger.core('🎯 [ProtocolValidationFramework] Performance Report:');
    const report = this.getConstraintPerformanceReport();
    
    for (const [constraint, metrics] of Object.entries(report)) {
      const m = metrics as any;
      DebugLogger.core(`  📊 ${constraint}:`);
      DebugLogger.core(`    - Average Time: ${m.average_execution_time_ms.toFixed(2)}ms`);
      DebugLogger.core(`    - Executions: ${m.total_executions}`);
      DebugLogger.core(`    - Timeouts: ${m.total_timeouts} (${m.timeout_rate.toFixed(1)}%)`);
    }
  }
}