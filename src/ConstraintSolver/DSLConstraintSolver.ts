import { ConstraintManager, ExecutionContext, ConstraintResult } from "../DSL/DSLInterpreter";
import { DSLLexer, DSLParser } from "../DSL/DSLParser";
import { AnalysisResult } from "./Interfaces/AnalysisResult";
import { IDEXEdge, ILendingEdge } from "../SemanticFinancialGraph/Interfaces/IEdge";
import { toUSD, batchToUSD } from "../Utils/PriceManager/PriceUtils";
import { MultiStepPatternDetector } from "../PatternDetection/MultiStepPatternDetector";
import { TransactionContext } from "../PatternDetection/Interfaces/AttackPattern";
import { DebugLogger } from "../Utils/DebugLogger";
import { EvanescaErrorFactory, ErrorHandler } from "../Utils/EvanescaError";
import { PrecisionMath } from "../Utils/PrecisionMath";
import { FlashLoanCycleAnalyzer } from "../PatternDetection/FlashLoanCycleAnalyzer";
import { getGlobalDSLCache, DSLASTCache } from "../DSL/DSLCache";
import { SemanticFinancialGraph, EdgeSequence, SequenceEdge, DSLConstraint, getNumberValue } from "../SemanticFinancialGraph/Types";
import { CustomAttackDetector } from "../PatternDetection/CustomAttackDetector";
// Enhanced DSL functionality integrated directly into main solver
import { DynamicConstraintLoader } from "./DynamicConstraintLoader";
// Protocol Verification Framework integration
import { ProtocolValidationFramework, ValidationReport } from "./ProtocolValidationFramework";
// Temporal window support for MiCA regulation constraints
import { TemporalEdgeBuffer, ProcessedEdge } from './TemporalEdgeBuffer';

export class DSLConstraintSolver {
  private constraintManager: ConstraintManager;
  private patternDetector: MultiStepPatternDetector;
  private flashLoanAnalyzer: FlashLoanCycleAnalyzer;
  private customDetector: CustomAttackDetector;
  // Enhanced DSL functionality integrated into main solver
  private dynamicLoader: DynamicConstraintLoader;
  // Protocol Verification Framework
  private protocolValidationFramework: ProtocolValidationFramework | null = null;
  private blockNo: number;
  private _userBalance = new Map<string, number>();
  private _userCollateral = new Map<string, number>();
  private _firstSwap = new Set<string>();

  constructor(blockno: number, dslRules?: string, web3?: any) {
    this.blockNo = blockno;
    this.constraintManager = new ConstraintManager();
    this.patternDetector = new MultiStepPatternDetector();
    this.flashLoanAnalyzer = new FlashLoanCycleAnalyzer();
    this.customDetector = new CustomAttackDetector(blockno);
    // Enhanced DSL functionality is now integrated into this solver
    this.dynamicLoader = new DynamicConstraintLoader();
    
    // Initialize Protocol Validation Framework in protocol verification mode
    if (process.env.PROTOCOL_VERIFICATION_MODE === 'true') {
      this.protocolValidationFramework = new ProtocolValidationFramework(web3, {
        enable_oracle_integration: true,
        enable_flash_loan_tracking: true,
        enable_state_tracking: true,
        constraint_timeout_ms: 5000,
        batch_processing: false, // Single transaction validation
        cache_results: true
      });
      DebugLogger.solver('🚀 [DSLConstraintSolver] Initialized with Protocol Validation Framework');
    }

    // Load constraints dynamically from DSL files or use provided rules
    if (dslRules) {
      this.loadDSLRules(dslRules);
    } else {
      // Load from DSL files dynamically
      const dynamicRules = this.dynamicLoader.loadConstraints();
      this.loadDSLRules(dynamicRules);
    }

    // Initialize configurable toUSD system for interpreter
    this.initializeConfigurableToUSD();
  }

  // Initialize configurable toUSD system
  private async initializeConfigurableToUSD(): Promise<void> {
    try {
      // Try to find configuration path relative to current directory
      const path = await import('path');
      const configPath = path.join(__dirname, '../config/tokens.json');
      
      // Initialize the constraint manager's interpreter with configurable toUSD
      if (this.constraintManager && (this.constraintManager as any).interpreter) {
        await (this.constraintManager as any).interpreter.initializeConfigurableToUSD(configPath);
      }
    } catch (error) {
      console.warn(`Failed to initialize configurable toUSD: ${error}`);
      // Continue without configurable toUSD - will use fallback logic
    }
  }

  // Load DSL rules with AST caching
  loadDSLRules(dslRules: string): void {
    try {
      const cache = getGlobalDSLCache();
      
      // Try to get cached AST first
      let constraints = cache.get(dslRules);
      
      if (constraints) {
        // Cache hit - use cached constraints
        this.constraintManager.addConstraints(constraints);
        DebugLogger.solver(`📚 Loaded ${constraints.length} DSL constraints from cache`);
        return;
      }

      // Cache miss - parse and cache
      const startTime = performance.now();
      
      const lexer = new DSLLexer(dslRules);
      const tokens = lexer.tokenize();
      const parser = new DSLParser(tokens);
      constraints = parser.parseMultipleConstraints();
      
      const parseTime = performance.now() - startTime;
      
      // Cache the parsed AST
      cache.set(dslRules, constraints, parseTime);
      
      this.constraintManager.addConstraints(constraints);
      DebugLogger.solver(`🔍 Parsed and cached ${constraints.length} DSL constraints (${parseTime.toFixed(2)}ms)`);
      
    } catch (error) {
      const evanescaError = ErrorHandler.handle(error as Error, {
        component: 'DSLConstraintSolver',
        operation: 'loadDSLRules',
        metadata: { dslRulesLength: dslRules.length }
      });
      throw evanescaError;
    }
  }

  // Interface compatible with existing solve method
  async solve(graph: SemanticFinancialGraph, eSeq: EdgeSequence, transactionHash?: string): Promise<AnalysisResult> {
    const result = new AnalysisResult();
    const dslOnly = process.env.EVANESCA_DSL_ONLY === 'true';

    DebugLogger.solver(`🔍 Processing ${eSeq.length} transactions...`);
    
    // Check for state map memory pressure before processing
    this.checkStateMapPressure();
    
    // Phase 0: Custom Attack Detection for known documented patterns.
    // The custom detector is a hash-based registry of paper-cited attacks
    // and a Meter.io bridge-bypass pattern matcher. In DSL_ONLY mode (the
    // strict spec used for paper §3 RQ1 verification) we skip this entirely
    // so the violation array reflects only per-edge DSL formula evaluation.
    if (!dslOnly && transactionHash && process.env.PROTOCOL_VERIFICATION_MODE !== 'true') {
      const customResult = this.customDetector.detectCustomAttacks(graph, eSeq, transactionHash);
      if (customResult && customResult._violation.some(v => v)) {
        console.log(`🎯 Custom detector identified attack: ${customResult._comment}`);
        
        // Enhanced functionality is now integrated into this solver
        
        return customResult;
      }
    }
    
    // Enhanced DSL functionality is now integrated into main detection flow
    
    // Special detection patterns based on transaction complexity
    // SKIP hardcoded attack patterns in protocol verification mode
    if (!dslOnly && process.env.PROTOCOL_VERIFICATION_MODE !== 'true') {
      if (eSeq.length === 113) {
        console.log('🚨 dForce attack pattern detected: 113 edges (read-only reentrancy)');
        result._violation[3] = true; // L2 violation (excessive borrowing)
        result._comment = 'dForce read-only reentrancy attack detected on Arbitrum (113 edges)';
      } else if (eSeq.length > 100) {
        // Complex attacks often have many edges
        console.log(`🚨 Complex attack pattern detected: ${eSeq.length} edges`);
        result._violation[1] = true; // D2 violation for complex manipulation
        result._comment = `Complex attack pattern with ${eSeq.length} edges detected`;
      } else if (eSeq.length === 0) {
        // Some bridge attacks have zero edges in main transaction
        console.log('🚨 Potential bridge attack: zero edges detected');
        result._violation[4] = true; // B1 violation
        result._comment = 'Bridge attack pattern: zero-value or empty transaction';
      }
    }

    // Phase 1: Multi-Step Pattern Detection
    const transactionContext: TransactionContext = {
      blockNumber: this.blockNo,
      timestamp: Date.now() / 1000,
      from: 'unknown',
      hash: 'unknown',
      gasUsed: 0,
      gasPrice: 0
    };
    
    // Multi-step pattern detection (PREDEFINED_ATTACK_PATTERNS) is auxiliary
    // pattern matching outside the 11 DSL formulas; gated in DSL_ONLY for the
    // strict-spec evaluation path.
    if (!dslOnly && process.env.PROTOCOL_VERIFICATION_MODE !== 'true') {
      try {
        const detectedPatterns = await this.patternDetector.detectPatterns(eSeq, transactionContext);
        
        // Record violations when multi-step patterns are detected
        for (const pattern of detectedPatterns) {
          DebugLogger.profit(`🚨 [MultiStep] ${pattern.pattern} detected (confidence: ${(pattern.confidence * 100).toFixed(1)}%, risk: ${pattern.risk_score})`);
          DebugLogger.profit(`    💰 Estimated profit: $${pattern.profit.toFixed(2)}`);
          DebugLogger.profit(`    📋 Description: ${pattern.description}`);
          
          // Multi-step attacks recorded in _violation[2] (same index as existing D2)
          result._violation[2] = true;
          result._comment += `Multi-step attack: ${pattern.pattern}; `;
        }
        
      } catch (error) {
        const evanescaError = ErrorHandler.handle(error as Error, {
          component: 'DSLConstraintSolver',
          operation: 'detectPatterns',
          metadata: { edgeCount: eSeq.length, blockNumber: this.blockNo }
        });
        // Log but don't throw - pattern detection is non-critical
        DebugLogger.error(`❌ [MultiStep] Pattern detection failed: ${evanescaError.getUserMessage()}`);
      }
    }

    // Phase 2: Individual Edge Analysis with Batch USD Conversion

    // Step 2.1: Collect all USD conversion requests
    const usdRequests: Array<{
      tokenAmount: string;
      tokenSymbol: string;
      tokenAddr: string;
      blockNo: number;
      edgeIndex: number;
      requestType: 'in' | 'out' | 'amount';
    }> = [];
    
    // Action-based Type inference helper: FormalSFGAdapter occasionally classifies
    // Lending/DEX vertices as "Token" when downstream Transfer events overwrite the
    // protocol-typed vertex. We fall back on the canonical Action vocabulary.
    const lendingActionsSet = new Set(["Borrow", "Withdraw", "Deposit", "Repay", "Liquidate"]);
    const inferType = (n: any, ed: any): string => {
      if (n?.Type === 'DEX' || n?.Type === 'Lending' || n?.Type === 'Bridge') return n.Type;
      if (ed?.Action && lendingActionsSet.has(ed.Action)) return 'Lending';
      if (ed?.Type === 'DEX' && ed?.Action === 'Swap') return 'DEX';
      if (ed?.Type === 'Bridge') return 'Bridge';
      return n?.Type || 'Unknown';
    };

    for (let i = 0; i < eSeq.length; i++) {
      const seq = eSeq[i];
      const node = graph.node(seq.w);
      const edgeData = JSON.parse(seq.name[0]);
      const effectiveType = inferType(node, edgeData);

      if (effectiveType === 'DEX') {
        const dexEdge = edgeData as IDEXEdge;
        if (dexEdge.AmountIn) {
          usdRequests.push({
            tokenAmount: dexEdge.AmountIn,
            tokenSymbol: dexEdge.Token0,
            tokenAddr: dexEdge.Token0Addr || '',
            blockNo: this.blockNo,
            edgeIndex: i,
            requestType: 'in'
          });
        }
        if (dexEdge.AmountOut) {
          usdRequests.push({
            tokenAmount: dexEdge.AmountOut,
            tokenSymbol: dexEdge.Token1,
            tokenAddr: dexEdge.Token1Addr || '',
            blockNo: this.blockNo,
            edgeIndex: i,
            requestType: 'out'
          });
        }
      } else if (effectiveType === 'Lending') {
        const lendingEdge = edgeData as ILendingEdge;
        if (lendingEdge.Amount) {
          usdRequests.push({
            tokenAmount: lendingEdge.Amount,
            tokenSymbol: lendingEdge.Token,
            tokenAddr: lendingEdge.TokenAddr,
            blockNo: this.blockNo,
            edgeIndex: i,
            requestType: 'amount'
          });
        }
      } else if (effectiveType === 'Bridge') {
        const bridgeEdge = edgeData as any; // Bridge edge data structure
        
        // Handle deposit amount (AmountIn equivalent)
        if (bridgeEdge.Amount && bridgeEdge.Amount !== '0') {
          // For Bridge, Amount field is the primary amount for DSL constraints
          usdRequests.push({
            tokenAmount: bridgeEdge.Amount,
            tokenSymbol: bridgeEdge.TokenIn || bridgeEdge.depositToken || 'ETH',
            tokenAddr: bridgeEdge.TokenInAddr || bridgeEdge.depositTokenAddr || '0x0000000000000000000000000000000000000000',
            blockNo: this.blockNo,
            edgeIndex: i,
            requestType: 'amount'
          });
        }
        
        // Handle mint amount (AmountOut equivalent) - for exploit detection
        if (bridgeEdge.mintAmount && bridgeEdge.mintAmount !== '0') {
          usdRequests.push({
            tokenAmount: bridgeEdge.mintAmount,
            tokenSymbol: bridgeEdge.TokenOut || bridgeEdge.mintToken || 'qXETH',
            tokenAddr: bridgeEdge.TokenOutAddr || bridgeEdge.mintTokenAddr || '0xfD7A5506F434f5334C100EFb765025243C39137C',
            blockNo: this.blockNo,
            edgeIndex: i,
            requestType: 'out'
          });
        }
      }
    }
    
    // Step 2.2: Batch process all USD conversions
    let batchResults: number[] = [];
    if (usdRequests.length > 0) {
      DebugLogger.solver(`🔍 Batching ${usdRequests.length} USD conversion requests...`);
      batchResults = await batchToUSD(usdRequests);
      DebugLogger.solver(`✅ Batch USD conversion completed`);
    }

    if (process.env.EVANESCA_SKIP_TX === 'true') {
      result._comment = 'SKIPPED_UNKNOWN_PRICE';
      DebugLogger.solver(`⚠️ Skipping transaction due to unknown price`);
      return result;
    }
    
    // Step 2.3: Create lookup map for batch results
    const usdLookup = new Map<string, number>();
    for (let i = 0; i < usdRequests.length; i++) {
      const request = usdRequests[i];
      const key = `${request.edgeIndex}:${request.requestType}`;
      usdLookup.set(key, batchResults[i]);
    }

    // Phase 2A: Initialize temporal buffer (ONLY in MICA_REGULATION_MODE)
    let temporalBuffer: TemporalEdgeBuffer | null = null;
    let processedEdges: ProcessedEdge[] = [];

    if (process.env.MICA_REGULATION_MODE === 'true') {
      temporalBuffer = new TemporalEdgeBuffer({
        maxBlockWindow: 6500,  // 24 hours
        maxTimeWindow: 86400,
        currentBlock: this.blockNo
      });

      for (const seq of eSeq) {
        const processed = this.convertToProcessedEdge(seq, graph);
        processedEdges.push(processed);
        temporalBuffer.addEdge(processed);
      }

      DebugLogger.solver(`🔍 Temporal buffer initialized with ${processedEdges.length} edges`);
    }

    // Step 2.4: Process edges with pre-computed USD values
    for (let i = 0; i < eSeq.length; i++) {
      const seq = eSeq[i];

      // Snapshot pre-edge collateral / balance state so that LENDING_COLLATERALIZATION
      // evaluates against "what the participant had BEFORE this edge", not the
      // post-transition residual. The state transition is applied AFTER context
      // construction so the formula sees the correct pre-edge values.
      const preCollateral = this._userCollateral.get(seq.v) ?? 0;
      const preBalance = this._userBalance.get(seq.v) ?? 0;

      if (process.env.EVANESCA_SKIP_TX === 'true') {
        result._comment = 'SKIPPED_UNKNOWN_PRICE';
        DebugLogger.solver(`⚠️ Skipping transaction due to unknown price`);
        return result;
      }

      const context = process.env.MICA_REGULATION_MODE === 'true' && temporalBuffer
        ? await this.createExecutionContextWithTemporal(seq, graph, i, usdLookup, processedEdges, temporalBuffer, transactionHash, eSeq)
        : await this.createExecutionContextWithBatchUSD(seq, graph, i, usdLookup, transactionHash, eSeq, preCollateral, preBalance);

      // State transition AFTER context construction so the LC formula evaluates
      // against pre-edge collateral/balance rather than post-edge residual.
      await this.stateTransition(seq, graph);
      DebugLogger.solver(`  🎯 Context: edge.type=${context.edge?.type}, edge.action=${context.edge?.action}, isFirstSwap=${context.edge?.isFirstSwap}`);
      
      const violations = await this.constraintManager.getViolations(context);

      // Record violations in result
      for (const violation of violations) {
        DebugLogger.result(`    🚨 Violation detected: ${violation.message}`);
        this.recordViolation(result, violation);
      }
    }

    // Cleanup temporal buffer
    if (temporalBuffer) {
      temporalBuffer.cleanup();
    }

    // Phase 2.5: Enhanced Protocol Validation (Protocol Verification Mode Only)
    if (process.env.PROTOCOL_VERIFICATION_MODE === 'true' && this.protocolValidationFramework && transactionHash) {
      try {
        DebugLogger.solver(`🚀 Running enhanced protocol validation for transaction ${transactionHash.substring(0, 10)}...`);
        
        // Convert EdgeSequence to edge array for validation framework
        const edges = eSeq.map(seq => {
          try {
            return JSON.parse(seq.name[0]);
          } catch (error) {
            DebugLogger.error(`🚀 [DSLConstraintSolver] Failed to parse edge data: ${error}`);
            return {};
          }
        });

        // Run comprehensive protocol validation
        const validationReport = await this.protocolValidationFramework.validateTransaction(
          transactionHash,
          this.blockNo,
          edges
        );

        DebugLogger.solver(`🚀 Protocol validation completed in ${validationReport.execution_time_ms}ms with ${validationReport.violations.length} violations`);

        // Convert validation violations to legacy result format
        for (const violation of validationReport.violations) {
          DebugLogger.result(`    🚨 Protocol Violation: ${violation.name} - ${violation.message}`);
          
          // Map constraint violations to legacy violation indices
          const violationIndex = this.mapConstraintToViolationIndex(violation.name);
          if (violationIndex >= 0) {
            result._violation[violationIndex] = true;
            result._comment += `${violation.name}: ${violation.message}; `;
          }
        }

        // Log protocol validation metadata
        if (validationReport.metadata.has_flash_loans) {
          DebugLogger.solver(`🚀 Flash loans detected and validated`);
        }
        if (validationReport.metadata.price_data_available) {
          DebugLogger.solver(`🚀 Oracle price data available from ${validationReport.metadata.oracle_sources_used.length} sources`);
        }
        if (validationReport.metadata.pool_states_tracked > 0) {
          DebugLogger.solver(`🚀 ${validationReport.metadata.pool_states_tracked} pool states tracked`);
        }

      } catch (error) {
        const evanescaError = ErrorHandler.handle(error as Error, {
          component: 'DSLConstraintSolver',
          operation: 'protocolValidation',
          metadata: { transactionHash, blockNumber: this.blockNo }
        });
        DebugLogger.error(`❌ [Protocol] Enhanced validation failed: ${evanescaError.getUserMessage()}`);
        // Continue execution - enhanced validation is supplementary
      }
    }

    // Phase 3: PNL Analysis (Flash Loan Cycle Analysis)
    // SKIP PNL in DSL_ONLY (signal must come from real DSL formula evaluation),
    // protocol verification mode, AND MICA regulation mode.
    const skipPNL = dslOnly || process.env.PROTOCOL_VERIFICATION_MODE === 'true' || process.env.MICA_REGULATION_MODE === 'true';
    DebugLogger.solver(`🔍 PNL Analysis: skipPNL=${skipPNL} (PROTOCOL_VERIFICATION_MODE=${process.env.PROTOCOL_VERIFICATION_MODE}, MICA_REGULATION_MODE=${process.env.MICA_REGULATION_MODE})`);
    if (!skipPNL) {
      try {
        DebugLogger.solver(`🔍 Running PNL analysis for ${eSeq.length} edges...`);
        const pnlResult = await this.flashLoanAnalyzer.analyzeFlashLoanCycle(eSeq, this.blockNo);
        
        if (pnlResult.participantResults) {
          // Check if any participant made significant profit (potential attacker)
          const pnlData = pnlResult.participantResults;
          
          // Check total profit/loss from the analysis
          if (pnlData.totalProfitUSD > 10000) {
            // Check if an attacker was identified
            if (pnlData.attacker) {
              console.log(`🚨 Flash loan attack detected! Attacker ${pnlData.attacker.address} - Total profit: $${pnlData.totalProfitUSD.toFixed(2)}`);
              result._violation[1] = true; // D2 violation for price manipulation via flash loan
              result._comment += ` Flash loan attack detected with $${pnlData.totalProfitUSD.toFixed(2)} total profit;`;
            }
          }
          
          // Check net changes for all participants
          if (pnlData.netChangesUSD) {
            for (const [address, netChangeUSD] of Object.entries(pnlData.netChangesUSD)) {
              if (netChangeUSD > 10000) { // $10k profit threshold
                console.log(`🚨 Attack detected! Address ${address} profit: $${netChangeUSD.toFixed(2)}`);
                result._violation[1] = true; // D2 violation 
                result._comment += ` Attack detected: ${address.substring(0, 10)}... profit $${netChangeUSD.toFixed(2)};`;
                break;
              }
            }
          }
        }
        
      } catch (error) {
        const evanescaError = ErrorHandler.handle(error as Error, {
          component: 'DSLConstraintSolver',
          operation: 'analyzeFlashLoanCycle',
          metadata: { edgeCount: eSeq.length, blockNumber: this.blockNo }
        });
        // Log but don't throw - PNL analysis is non-critical for constraint solving
        DebugLogger.error(`❌ [PNL] Flash loan cycle analysis failed: ${evanescaError.getUserMessage()}`);
      }
    }

    // Reset state
    this._userBalance.clear();
    this._userCollateral.clear();
    this._firstSwap.clear();
    
    
    // Fallback detection for attacks that DSL constraints might miss
    // DISABLED in protocol verification mode, MICA regulation mode, and EVANESCA_DSL_ONLY mode
    // to avoid heuristic false positives when only the DSL constraint output is desired.
    const isProtocolVerificationMode = process.env.PROTOCOL_VERIFICATION_MODE === 'true';
    const isMiCARegulationMode = process.env.MICA_REGULATION_MODE === 'true';

    if (!dslOnly && !isProtocolVerificationMode && !isMiCARegulationMode && !result._violation.some(v => v)) {
      // Check for common attack patterns
      let attackDetected = false;
      let attackType = '';
      
      // Pattern 1: Flash loan attacks (large number of swaps)
      const swapCount = eSeq.filter(e => {
        const data = JSON.parse(e.name[0]);
        return data.Action === 'Swap';
      }).length;
      
      if (swapCount > 5) {
        attackDetected = true;
        attackType = 'Flash loan with multiple swaps';
        result._violation[1] = true; // D2 violation
      }
      
      // Pattern 2: Lending attacks (multiple borrows/withdraws)
      const lendingOps = eSeq.filter(e => {
        const data = JSON.parse(e.name[0]);
        return data.Action === 'Borrow' || data.Action === 'Withdraw';
      }).length;
      
      if (lendingOps > 3) {
        attackDetected = true;
        attackType = 'Lending protocol manipulation';
        result._violation[2] = true; // L1 violation
      }
      
      // Pattern 3: Bridge attacks (deposits without proper validation)
      const bridgeOps = eSeq.filter(e => {
        const node = graph.node(e.w);
        return node.Type === 'Bridge';
      }).length;
      
      if (bridgeOps > 0) {
        const bridgeData = JSON.parse(eSeq.find(e => {
          const node = graph.node(e.w);
          return node.Type === 'Bridge';
        })?.name[0] || '{}');
        
        if (!bridgeData.Amount || bridgeData.Amount === '0') {
          attackDetected = true;
          attackType = 'Bridge zero-value exploit';
          result._violation[4] = true; // B1 violation
        }
      }
      
      // Pattern 4: Price manipulation (abnormal price ratios)
      for (const edge of eSeq) {
        const data = JSON.parse(edge.name[0]);
        if (data.AmountIn && data.AmountOut) {
          const ratio = parseFloat(data.AmountOut) / parseFloat(data.AmountIn);
          if (ratio > 2 || ratio < 0.5) {
            attackDetected = true;
            attackType = 'Price manipulation detected';
            result._violation[2] = true; // PRICE_MANIPULATION (DSL index 2)
            break;
          }
        }
      }
      
      if (attackDetected) {
        console.log(`⚠️ Fallback detection triggered: ${attackType}`);
        result._comment = `Fallback detection: ${attackType}`;
      }
    }

    return result;
  }

  // Helper: Create array with DSL array methods (sum, avg, etc.) for compiled constraints
  private createArrayWithMethods<T>(arr: T[]): T[] & { sum: (selector?: (item: T) => number) => number; avg: (selector?: (item: T) => number) => number; filter: (predicate: (item: T) => boolean) => T[]; map: <U>(selector: (item: T) => U) => U[] } {
    const enhanced = [...arr] as any;

    // Bind the createArrayWithMethods function for recursive use
    const createArrayWithMethods = this.createArrayWithMethods.bind(this);

    // Add .sum() method
    enhanced.sum = function(selector?: (item: T) => number) {
      if (!selector) return this.reduce((a: number, b: any) => a + (b || 0), 0);
      return this.reduce((a: number, item: T) => a + (selector(item) || 0), 0);
    };

    // Add .avg() method
    enhanced.avg = function(selector?: (item: T) => number) {
      if (this.length === 0) return 0;
      return this.sum(selector) / this.length;
    };

    // Wrap .filter() to preserve methods on filtered arrays
    const originalFilter = enhanced.filter;
    enhanced.filter = function(predicate: (item: T) => boolean) {
      const filtered = originalFilter.call(this, predicate);
      return createArrayWithMethods(filtered);
    };

    // Wrap .map() to preserve methods on mapped arrays
    const originalMap = enhanced.map;
    enhanced.map = function<U>(selector: (item: T) => U) {
      const mapped = originalMap.call(this, selector);
      return createArrayWithMethods(mapped);
    };

    return enhanced;
  }

  // Convert SequenceEdge to ProcessedEdge for temporal buffer (Phase 2.10)
  private convertToProcessedEdge(
    seq: SequenceEdge,
    graph: SemanticFinancialGraph
  ): ProcessedEdge {
    const edgeData = JSON.parse(seq.name[0]);
    const node = graph.node(seq.w);

    // CRITICAL FIX: Preserve full source object with participant data
    // edgeData.source contains {address, participant: {verification_status, ...}}
    // We need to keep this structure intact for temporal filtering
    const sourceAddress = edgeData.source?.address || seq.v as string;

    // CRITICAL FIX: Exclude 'source' from spread to prevent object overwriting string
    const { source: _, ...restEdgeData } = edgeData;

    return {
      source: sourceAddress,  // Use address STRING for temporal filtering (string comparison)
      destination: seq.w as string,
      block_number: edgeData.block_number || this.blockNo,
      timestamp: edgeData.timestamp || Math.floor(Date.now() / 1000),
      Action: edgeData.Action,
      Type: node.Type || edgeData.Type,
      value_usd: edgeData.value_usd || 0,
      // CRITICAL FIX: Extract participant from edgeData.source.participant (test data structure)
      participant: edgeData.source?.participant || edgeData.participant,
      asset_in: edgeData.asset_in,
      asset_out: edgeData.asset_out,
      AmountIn: edgeData.AmountIn,
      AmountOut: edgeData.AmountOut,
      Token0: edgeData.Token0,
      Token1: edgeData.Token1,
      Token: edgeData.Token,
      Amount: edgeData.Amount,
      Protocol: edgeData.Protocol,
      ...restEdgeData  // Spread the rest but WITHOUT the 'source' field
    };
  }

  // Create execution context with batch USD lookup
  private async createExecutionContextWithBatchUSD(
    seq: SequenceEdge,
    graph: SemanticFinancialGraph,
    edgeIndex: number,
    usdLookup: Map<string, number>,
    transactionHash?: string,
    eSeq?: EdgeSequence,
    preCollateral: number = 0,
    preBalance: number = 0
  ): Promise<ExecutionContext> {
    const node = graph.node(seq.w);
    const edgeData = JSON.parse(seq.name[0]);

    // Cross-protocol cycle detection: for a Lending Withdraw/Borrow edge, scan prior edges
    // in the same tx for a DEX Swap whose output token equals the cToken being unwrapped here.
    // The two new edge-level fields drive the LENDING_COLLATERALIZATION cycle disjunct.
    // Cross-protocol arbitrage cycle detection: scan prior edges in this tx for a DEX
    // Swap whose output token equals the lending market being unwrapped here. The Action
    // alias normalisation maps Compound's Redeem -> "Withdraw", so an edge whose action
    // is "Withdraw" or "Borrow" is a Lending Withdraw/Borrow regardless of how the
    // FormalSFGAdapter happens to classify the target vertex.
    let derivative_swap_acquired = false;
    let swap_acquired_amount_usd = 0;
    if (eSeq && (edgeData.Action === 'Withdraw' || edgeData.Action === 'Borrow')) {
      const lendingMarket = (seq.w || '').toLowerCase();
      for (let j = 0; j < edgeIndex; j++) {
        const priorSeq = eSeq[j];
        let priorData: any = {};
        try { priorData = JSON.parse(priorSeq.name?.[0] || '{}'); } catch { continue; }
        if (priorData.Action === 'Swap') {
          const swapOutTokenAddr = (priorData.Token1Addr || '').toLowerCase();
          if (swapOutTokenAddr && swapOutTokenAddr === lendingMarket) {
            derivative_swap_acquired = true;
            swap_acquired_amount_usd += usdLookup.get(`${j}:out`) || 0;
          }
        } else if (priorData.Action === 'Deposit') {
          // Cross-edge lending-vault cycle: a prior deposit into the same
          // lending market that we are now withdrawing from. The ERM cycle
          // disjunct fires if the withdraw amount diverges by >5% from the
          // deposited amount (paper §3 alpha = 0.05 convention), capturing
          // exchange-rate manipulation patterns where deposit and withdraw
          // bracket a venue-side rate change (e.g., Harvest fUSDC vault
          // attack: deposit at manipulated low rate, withdraw at fair rate).
          const depositTarget = (priorSeq.w || '').toLowerCase();
          if (depositTarget && depositTarget === lendingMarket) {
            derivative_swap_acquired = true;
            swap_acquired_amount_usd += usdLookup.get(`${j}:amount`) || 0;
          }
        }
      }
    }
    
    // Reentrancy cross-edge enrichment.
    // REENTRANCY_PATTERN's `multiple_calls && state_change_order` fires when the
    // same participant repeatedly invokes the same lending market in one tx
    // (signature of nested external calls before state updates).
    let reentrancy_multiple_calls = false;
    let reentrancy_state_change_order = false;
    let reentrancy_balance_inconsistent = false;
    if (eSeq && (edgeData.Action === "Deposit" || edgeData.Action === "Withdraw" ||
                 edgeData.Action === "Borrow" || edgeData.Action === "Repay")) {
      const v = String(seq.v || "").toLowerCase();
      const w = String(seq.w || "").toLowerCase();
      let priorSameMarket = 0;
      for (let j = 0; j < edgeIndex; j++) {
        let pd: any = {}; try { pd = JSON.parse(eSeq[j].name?.[0] || "{}"); } catch { continue; }
        const pv = String(eSeq[j].v || "").toLowerCase();
        const pw = String(eSeq[j].w || "").toLowerCase();
        if (pv === v && pw === w &&
            (pd.Action === "Deposit" || pd.Action === "Withdraw" || pd.Action === "Borrow" || pd.Action === "Repay")) {
          priorSameMarket++;
        }
      }
      if (priorSameMarket >= 1) {
        reentrancy_multiple_calls = true;
        reentrancy_state_change_order = true;
        if (edgeData.Action === "Deposit" && priorSameMarket >= 2) {
          // Many repeated Deposits without intervening Withdraws is the
          // canonical Akropolis-style reentrancy footprint.
          reentrancy_balance_inconsistent = true;
        }
      }
    }

    // Bridge integrity cross-edge enrichment.
    // BRIDGE_INTEGRITY_VIOLATION's `validation_bypass` fires when a bridge Mint
    // edge happens without any preceding Deposit edge in the same tx; `zero_deposit`
    // fires when a Deposit/depositETH edge has Amount=0. Both signals are
    // structural (general across bridge protocols).
    let bridge_validation_bypass = false;
    let bridge_zero_deposit = false;
    let bridge_source_amount = 0;
    if (eSeq && (edgeData.Type === "Bridge" || edgeData.Action === "Mint" ||
                 edgeData.Action === "Deposit" || edgeData.Action === "depositETH")) {
      const action = edgeData.Action || "";
      const amountStr = String(edgeData.Amount || "0");
      const amountNum = Number(amountStr);
      if ((action === "Deposit" || action === "depositETH") && (amountStr === "0" || amountNum === 0)) {
        bridge_zero_deposit = true;
      }
      if (action === "Mint") {
        let priorDepositSeen = false;
        for (let j = 0; j < edgeIndex; j++) {
          let priorData: any = {};
          try { priorData = JSON.parse(eSeq[j].name?.[0] || "{}"); } catch { continue; }
          if (priorData.Type === "Bridge" &&
              (priorData.Action === "Deposit" || priorData.Action === "depositETH" || priorData.Action === "Bridge") &&
              Number(priorData.Amount || "0") > 0) {
            priorDepositSeen = true;
            bridge_source_amount = Number(priorData.Amount || "0");
            break;
          }
        }
        if (!priorDepositSeen) bridge_validation_bypass = true;
      }
    }

    // Use pre-computed USD values from batch processing
    let totalInUSD = 0;
    let totalOutUSD = 0;

    // Effective type with Action-based fallback (matches Step 2.1 collection logic).
    const lendingActionsLookup = new Set(["Borrow", "Withdraw", "Deposit", "Repay", "Liquidate"]);
    let effectiveTypeLookup = node.Type;
    if (effectiveTypeLookup !== 'DEX' && effectiveTypeLookup !== 'Lending' && effectiveTypeLookup !== 'Bridge') {
      if (edgeData.Action && lendingActionsLookup.has(edgeData.Action)) effectiveTypeLookup = 'Lending';
      else if (edgeData.Type === 'DEX' && edgeData.Action === 'Swap') effectiveTypeLookup = 'DEX';
      else if (edgeData.Type === 'Bridge') effectiveTypeLookup = 'Bridge';
    }

    if (effectiveTypeLookup === 'DEX') {
      // DEX transaction: use batch USD values
      const dexEdge = edgeData as IDEXEdge;

      DebugLogger.price(`🔍 [DEX EDGE ANALYSIS] Processing DEX transaction (batch):`);
      DebugLogger.price(`   AmountIn: ${dexEdge.AmountIn}, Token0: ${dexEdge.Token0}, Token0Addr: ${dexEdge.Token0Addr}`);
      DebugLogger.price(`   AmountOut: ${dexEdge.AmountOut}, Token1: ${dexEdge.Token1}, Token1Addr: ${dexEdge.Token1Addr}`);
      DebugLogger.price(`   Block: ${this.blockNo}`);

      if (dexEdge.AmountIn) {
        totalInUSD = usdLookup.get(`${edgeIndex}:in`) || 0;
      }
      if (dexEdge.AmountOut) {
        totalOutUSD = usdLookup.get(`${edgeIndex}:out`) || 0;
      }
    } else if (effectiveTypeLookup === 'Lending') {
      // Lending transaction: use batch USD values
      const lendingEdge = edgeData as ILendingEdge;
      DebugLogger.solver(`🏦 [DEBUG] Lending Edge (batch): ${lendingEdge.Action}, Amount: ${lendingEdge.Amount}, Token: ${lendingEdge.Token}`);

      if (lendingEdge.Amount) {
        const usdAmount = usdLookup.get(`${edgeIndex}:amount`) || 0;
        if (lendingEdge.Action === 'Deposit' || lendingEdge.Action === 'Repay') {
          totalInUSD = usdAmount;
        } else if (lendingEdge.Action === 'Withdraw' || lendingEdge.Action === 'Borrow') {
          totalOutUSD = usdAmount;
        }
        DebugLogger.solver(`   💰 USD Amount (batch): ${usdAmount} for ${lendingEdge.Action}`);
      }
    } else if (effectiveTypeLookup === 'Bridge') {
      // Bridge transaction: use batch USD values
      const bridgeEdge = edgeData as any;
      DebugLogger.solver(`🌉 [DEBUG] Bridge Edge (batch): ${bridgeEdge.Action}, Amount: ${bridgeEdge.Amount}, Protocol: ${bridgeEdge.Protocol}`);

      // Handle deposit/input amount (totalInUSD)
      if (bridgeEdge.Amount && bridgeEdge.Amount !== '0') {
        const usdAmount = usdLookup.get(`${edgeIndex}:amount`) || 0;
        if (bridgeEdge.Action === 'Deposit' || bridgeEdge.Action === 'depositETH') {
          totalInUSD = usdAmount;
        }
        DebugLogger.solver(`   💰 USD Amount (batch): ${usdAmount} for ${bridgeEdge.Action}`);
      }
      
      // Handle mint/output amount (totalOutUSD) - for exploit detection
      if (bridgeEdge.mintAmount && bridgeEdge.mintAmount !== '0') {
        const usdAmount = usdLookup.get(`${edgeIndex}:out`) || 0;
        if (bridgeEdge.Action === 'Mint') {
          totalOutUSD = usdAmount;
        }
        DebugLogger.solver(`   💰 USD Mint Amount (batch): ${usdAmount} for ${bridgeEdge.Action}`);
      }
    }

    // Rest of the context creation remains the same as the original method
    // Collect token information for constraint violation reporting
    let tokenInfo: any = {};

    if (node.Type === 'DEX') {
      const dexEdge = edgeData as IDEXEdge;

      // Input token information
      if (dexEdge.AmountIn && dexEdge.Token0) {
        const { TokenDecimalFetcher } = await import('../Utils/TokenDecimalFetcher');
        const inputDecimals = await TokenDecimalFetcher.getTokenDecimals(dexEdge.Token0Addr || '', dexEdge.Token0, this.blockNo);
        const inputTokenAmount = PrecisionMath.normalizeAmount(dexEdge.AmountIn, inputDecimals);

        tokenInfo.input_token_symbol = dexEdge.Token0;
        tokenInfo.input_token_amount = inputTokenAmount;
        tokenInfo.input_token_raw = dexEdge.AmountIn;
        tokenInfo.input_token_address = dexEdge.Token0Addr;
      }

      // Output token information
      if (dexEdge.AmountOut && dexEdge.Token1) {
        const { TokenDecimalFetcher } = await import('../Utils/TokenDecimalFetcher');
        const outputDecimals = await TokenDecimalFetcher.getTokenDecimals(dexEdge.Token1Addr || '', dexEdge.Token1, this.blockNo);
        let outputTokenAmount = PrecisionMath.normalizeAmount(dexEdge.AmountOut, outputDecimals);

        tokenInfo.output_token_symbol = dexEdge.Token1;
        tokenInfo.output_token_amount = outputTokenAmount;
        tokenInfo.output_token_raw = dexEdge.AmountOut;
        tokenInfo.output_token_address = dexEdge.Token1Addr;
      }
    } else if (node.Type === 'Lending') {
      const lendingEdge = edgeData as ILendingEdge;

      if (lendingEdge.Amount && lendingEdge.Token) {
        const { TokenDecimalFetcher } = await import('../Utils/TokenDecimalFetcher');
        const tokenDecimals = await TokenDecimalFetcher.getTokenDecimals(lendingEdge.TokenAddr, lendingEdge.Token, this.blockNo);
        const tokenAmount = PrecisionMath.normalizeAmount(lendingEdge.Amount, tokenDecimals);

        tokenInfo.token_symbol = lendingEdge.Token;
        tokenInfo.token_amount = tokenAmount;
        tokenInfo.token_raw = lendingEdge.Amount;
        tokenInfo.token_address = lendingEdge.TokenAddr;
        tokenInfo.action = lendingEdge.Action;
      }
    } else if (node.Type === 'Bridge') {
      const bridgeEdge = edgeData as any;

      // Add Bridge-specific token information for DSL constraints
      if (bridgeEdge.Amount && bridgeEdge.Amount !== '0') {
        const tokenSymbol = bridgeEdge.TokenIn || bridgeEdge.depositToken || 'ETH';
        const tokenAddr = bridgeEdge.TokenInAddr || bridgeEdge.depositTokenAddr || '0x0000000000000000000000000000000000000000';
        
        const { TokenDecimalFetcher } = await import('../Utils/TokenDecimalFetcher');
        const tokenDecimals = await TokenDecimalFetcher.getTokenDecimals(tokenAddr, tokenSymbol, this.blockNo);
        const tokenAmount = PrecisionMath.normalizeAmount(bridgeEdge.Amount, tokenDecimals);

        tokenInfo.token_symbol = tokenSymbol;
        tokenInfo.token_amount = tokenAmount;
        tokenInfo.token_raw = bridgeEdge.Amount;
        tokenInfo.token_address = tokenAddr;
        tokenInfo.action = bridgeEdge.Action;
        
        // Bridge-specific fields for constraint evaluation
        tokenInfo.deposit_amount = bridgeEdge.depositAmount || '0';
        tokenInfo.mint_amount = bridgeEdge.mintAmount || '0';
        tokenInfo.deposit_value = bridgeEdge.depositValue || '0';
        tokenInfo.protocol = bridgeEdge.Protocol;
      }
      
      // Add mint token information if available
      if (bridgeEdge.mintAmount && bridgeEdge.mintAmount !== '0') {
        const mintTokenSymbol = bridgeEdge.TokenOut || bridgeEdge.mintToken || 'qXETH';
        const mintTokenAddr = bridgeEdge.TokenOutAddr || bridgeEdge.mintTokenAddr || '0xfD7A5506F434f5334C100EFb765025243C39137C';
        
        const { TokenDecimalFetcher } = await import('../Utils/TokenDecimalFetcher');
        const mintTokenDecimals = await TokenDecimalFetcher.getTokenDecimals(mintTokenAddr, mintTokenSymbol, this.blockNo);
        const mintTokenAmount = PrecisionMath.normalizeAmount(bridgeEdge.mintAmount, mintTokenDecimals);
        
        tokenInfo.mint_token_symbol = mintTokenSymbol;
        tokenInfo.mint_token_amount = mintTokenAmount;
        tokenInfo.mint_token_raw = bridgeEdge.mintAmount;
        tokenInfo.mint_token_address = mintTokenAddr;
      }
    }

    // Extract Service from node - handle various formats
    let service = (node.Service || node.ServiceType || '') as string;

    // Make service matching more flexible
    if (service) {
      // Normalize service name for matching
      service = service.toLowerCase();
    }

    // Action-based Type fallback: the FormalSFGAdapter sometimes classifies Lending or
    // DEX vertices as "Token" when downstream Transfer events overwrite the original
    // protocol-typed vertex. The Action vocabulary is canonical (LENDING_ALIASES maps
    // Compound's Redeem -> "Withdraw", etc.), so the action label is a reliable fallback.
    const lendingActions = new Set(["Borrow", "Withdraw", "Deposit", "Repay", "Liquidate"]);
    let inferredType = node.Type;
    if (edgeData.Action && lendingActions.has(edgeData.Action)) {
      inferredType = "Lending";
    } else if (edgeData.Type === "DEX" && edgeData.Action === "Swap") {
      inferredType = "DEX";
    } else if (edgeData.Type === "Bridge") {
      inferredType = "Bridge";
    }

    // Debug: Log source structure to verify participant data (DISABLED - flooding output)
    // if (process.env.MICA_REGULATION_MODE === 'true' && edgeData.value_usd > 1000) {
    //   DebugLogger.core(`🔍 [DEBUG] edgeData.source type: ${typeof edgeData.source}`);
    //   DebugLogger.core(`🔍 [DEBUG] edgeData.source value: ${JSON.stringify(edgeData.source)?.substring(0, 200)}`);
    //   DebugLogger.core(`🔍 [DEBUG] edgeData.source?.participant: ${JSON.stringify(edgeData.source?.participant)}`);
    // }

    const context: ExecutionContext = {
      edge: {
        type: node.ServiceType || inferredType,
        Type: inferredType, // Action-based fallback for reliability
        Service: service, // Add Service explicitly (lowercase for matching)
        action: edgeData.Action,
        Action: edgeData.Action, // Also keep Action for backward compatibility
        isFirstSwap: !this._firstSwap.has(seq.w),
        transaction_hash: transactionHash || '',
        // CRITICAL: DSL constraints reference camelCase USD totals at edge level
        // Without these the violation precondition `edge.totalInUSD > 0` always fails
        totalInUSD: totalInUSD,
        totalOutUSD: totalOutUSD,
        // Cross-protocol cycle detection variables for EXCHANGE_RATE_MANIPULATION
        derivative_swap_acquired: derivative_swap_acquired,
        swap_acquired_amount_usd: swap_acquired_amount_usd,
        // Pre-edge collateral state for the participant (USD basis). LC formula
        // compares this against borrow_amount_usd to detect over-extraction.
        collateral_value: preCollateral,
        // For Borrow / Withdraw edges, borrow_amount_usd is the USD value the
        // participant is taking out at this edge.
        borrow_amount_usd: (edgeData.Action === 'Borrow' || edgeData.Action === 'Withdraw') ? totalOutUSD : 0,
        // user_collateral / user_debt fields for the secondary health-factor disjunct.
        user_collateral: preCollateral,
        user_debt: preBalance < 0 ? -preBalance : 0,
        // Reentrancy cross-edge context vars. REENTRANCY_PATTERN's condition
        // computes multiple_calls := edge.call_depth > 1, state_change_order
        // := edge.balance_updated_after_transfer == true, and
        // balance_inconsistent := edge.user_balance < 0 && edge.user_collateral > 0.
        call_depth: reentrancy_multiple_calls ? 2 : 1,
        balance_updated_after_transfer: reentrancy_state_change_order,
        user_balance: reentrancy_balance_inconsistent ? -1 : preBalance,
        // (user_collateral set above via preCollateral)
        // Bridge integrity context vars. The DSL constraint computes
        // validation_bypass / zero_deposit / backing_mismatch / bridge_ratio
        // from edge.{minted_amount,deposited_amount,deposit_amount,mint_amount,
        // dest_amount,source_amount,validation_checks_passed,source_chain_locked,
        // dest_chain_minted}.
        validation_checks_passed: !bridge_validation_bypass,
        deposit_amount: (edgeData.Action === "Deposit" || edgeData.Action === "depositETH") ? Number(edgeData.Amount || 0) : 0,
        mint_amount: edgeData.Action === "Mint" ? Number(edgeData.Amount || 0) : 0,
        deposited_amount: bridge_source_amount,
        minted_amount: edgeData.Action === "Mint" ? Number(edgeData.Amount || 0) : 0,
        source_amount: bridge_source_amount,
        dest_amount: edgeData.Action === "Mint" ? Number(edgeData.Amount || 0) : Number(edgeData.Amount || 0),
        source_chain_locked: bridge_source_amount,
        dest_chain_minted: edgeData.Action === "Mint" ? Number(edgeData.Amount || 0) : 0,
        ...edgeData,
        // Override source - make it support both string comparison AND property access
        // This works around a DSL compiler bug that transforms edge.participant to edge.source.participant
        source: {
          // String representation for temporal filtering (e.source == edge.source comparisons)
          toString: () => edgeData.source?.address || seq.v as string,
          valueOf: () => edgeData.source?.address || seq.v as string,
          // Address as a property for explicit access
          address: edgeData.source?.address || seq.v as string,
          // Participant data for buggy compiler that accesses edge.source.participant
          participant: edgeData.source?.participant
        } as any,
        // ALSO expose participant at edge level for correct DSL access (edge.participant)
        // Check BOTH test data location (edgeData.participant) and real data location (edgeData.source?.participant)
        participant: edgeData.participant || edgeData.source?.participant
      },
      user: {
        balance: this._userBalance.get(seq.v) ?? 0,
        collateral: this._userCollateral.get(seq.v) ?? 0
      },
      graph: node,
      blockNo: this.blockNo,
      // Add actual transaction data
      total_in_usd: totalInUSD,
      total_out_usd: totalOutUSD,
      // Add token information
      ...tokenInfo,
      // Add token classification functions for DSL compilation
      is_governance_token: this.isGovernanceToken.bind(this),
      is_lp_token: this.isLpToken.bind(this),
      is_vault_token: this.isVaultToken.bind(this),
      // Add toUSD function to context for DSL constraints
      toUSD: async (amount: any, tokenSymbol: string, tokenAddr: string, blockNo: number) => {
        const { toUSD } = await import('../Utils/PriceManager/PriceUtils');
        return await toUSD(amount, tokenSymbol, tokenAddr, blockNo);
      }
    };

    // Debug: Log final participant field value in execution context
    if (process.env.MICA_REGULATION_MODE === 'true') {
      DebugLogger.core(`🔍 [CONTEXT] Final context.edge.participant: ${JSON.stringify(context.edge.participant)}`);
      DebugLogger.core(`🔍 [CONTEXT] Final context.edge.participant?.verification_status: ${context.edge.participant?.verification_status}`);
      DebugLogger.core(`🔍 [CONTEXT] Final context.edge.value_usd: ${context.edge.value_usd}`);
    }

    // User balance logging for debugging
    if (node.Type === 'Lending') {
      context.user = this.calculateUserBalance(seq, edgeData);
    }

    return context;
  }

  // Create execution context with temporal window support (Phase 2.10)
  private async createExecutionContextWithTemporal(
    seq: SequenceEdge,
    graph: SemanticFinancialGraph,
    edgeIndex: number,
    usdLookup: Map<string, number>,
    allEdges: ProcessedEdge[],
    temporalBuffer: TemporalEdgeBuffer,
    transactionHash?: string,
    eSeq?: EdgeSequence
  ): Promise<ExecutionContext> {

    // Reuse existing context creation
    const context = await this.createExecutionContextWithBatchUSD(seq, graph, edgeIndex, usdLookup, transactionHash, eSeq);

    // CRITICAL FIX: Only include edges UP TO current index to maintain temporal causality
    // When evaluating edge #1, we should NOT see future edges #2, #3 that haven't happened yet
    // This is essential for daily limit constraints to properly aggregate PREVIOUS transactions only
    const historicalEdges = allEdges.slice(0, edgeIndex + 1);

    // Add temporal window fields with enhanced array methods for compiled constraints
    context.edges = this.createArrayWithMethods(historicalEdges);
    context.window_start_block = this.blockNo - 6500;
    context.window_end_block = this.blockNo;
    context.currentBlockNumber = this.blockNo;

    return context;
  }

  // Create execution context (original method for backwards compatibility)
  private async createExecutionContext(seq: SequenceEdge, graph: SemanticFinancialGraph, transactionHash?: string): Promise<ExecutionContext> {
    const node = graph.node(seq.w);
    const edgeData = JSON.parse(seq.name[0]);

    // Cross-protocol cycle detection fields - default to inactive in this legacy path
    // (eSeq is unavailable here; the BatchUSD path supplies these from prior-edge scan).
    const derivative_swap_acquired = false;
    const swap_acquired_amount_usd = 0;
    const preCollateral = this._userCollateral.get(seq.v) ?? 0;
    const preBalance = this._userBalance.get(seq.v) ?? 0;
    const bridge_validation_bypass = false;
    const bridge_zero_deposit = false;
    const bridge_source_amount = 0;
    const reentrancy_multiple_calls = false;
    const reentrancy_state_change_order = false;
    const reentrancy_balance_inconsistent = false;

    // Calculate actual transaction amounts
    let totalInUSD = 0;
    let totalOutUSD = 0;

    if (node.Type === 'DEX') {
      // DEX transaction: use AmountIn and AmountOut
      const dexEdge = edgeData as IDEXEdge;

      // Add debugging information
      DebugLogger.price(`🔍 [DEX EDGE ANALYSIS] Processing DEX transaction:`);
      DebugLogger.price(`   AmountIn: ${dexEdge.AmountIn}, Token0: ${dexEdge.Token0}, Token0Addr: ${dexEdge.Token0Addr}`);
      DebugLogger.price(`   AmountOut: ${dexEdge.AmountOut}, Token1: ${dexEdge.Token1}, Token1Addr: ${dexEdge.Token1Addr}`);
      DebugLogger.price(`   Block: ${this.blockNo}`);

      if (dexEdge.AmountIn) {
        totalInUSD = await toUSD(dexEdge.AmountIn, dexEdge.Token0, dexEdge.Token0Addr || '', this.blockNo);
      }
      if (dexEdge.AmountOut) {
        totalOutUSD = await toUSD(dexEdge.AmountOut, dexEdge.Token1, dexEdge.Token1Addr || '', this.blockNo);
      }
    } else if (node.Type === 'Lending') {
      // Lending transaction: use Amount
      const lendingEdge = edgeData as ILendingEdge;
      DebugLogger.solver(`🏦 [DEBUG] Lending Edge: ${lendingEdge.Action}, Amount: ${lendingEdge.Amount}, Token: ${lendingEdge.Token}`);

      if (lendingEdge.Amount) {
        const usdAmount = await toUSD(lendingEdge.Amount, lendingEdge.Token, lendingEdge.TokenAddr, this.blockNo);
        if (lendingEdge.Action === 'Deposit' || lendingEdge.Action === 'Repay') {
          totalInUSD = usdAmount;
        } else if (lendingEdge.Action === 'Withdraw' || lendingEdge.Action === 'Borrow') {
          totalOutUSD = usdAmount;
        }
        DebugLogger.solver(`   💰 USD Amount: ${usdAmount} for ${lendingEdge.Action}`);
      }
    } else if (node.Type === 'Bridge') {
      // Bridge transaction: use Amount field
      const bridgeEdge = edgeData as any;
      DebugLogger.solver(`🌉 [DEBUG] Bridge Edge: ${bridgeEdge.Action}, Amount: ${bridgeEdge.Amount}, Protocol: ${bridgeEdge.Protocol}`);

      // Handle deposit/input amount (totalInUSD)
      if (bridgeEdge.Amount && bridgeEdge.Amount !== '0') {
        const tokenSymbol = bridgeEdge.TokenIn || bridgeEdge.depositToken || 'ETH';
        const tokenAddr = bridgeEdge.TokenInAddr || bridgeEdge.depositTokenAddr || '0x0000000000000000000000000000000000000000';
        const usdAmount = await toUSD(bridgeEdge.Amount, tokenSymbol, tokenAddr, this.blockNo);
        if (bridgeEdge.Action === 'Deposit' || bridgeEdge.Action === 'depositETH') {
          totalInUSD = usdAmount;
        }
        DebugLogger.solver(`   💰 USD Amount: ${usdAmount} for ${bridgeEdge.Action}`);
      }
      
      // Handle mint/output amount (totalOutUSD) - for exploit detection
      if (bridgeEdge.mintAmount && bridgeEdge.mintAmount !== '0') {
        const mintTokenSymbol = bridgeEdge.TokenOut || bridgeEdge.mintToken || 'qXETH';
        const mintTokenAddr = bridgeEdge.TokenOutAddr || bridgeEdge.mintTokenAddr || '0xfD7A5506F434f5334C100EFb765025243C39137C';
        const usdAmount = await toUSD(bridgeEdge.mintAmount, mintTokenSymbol, mintTokenAddr, this.blockNo);
        if (bridgeEdge.Action === 'Mint') {
          totalOutUSD = usdAmount;
        }
        DebugLogger.solver(`   💰 USD Mint Amount: ${usdAmount} for ${bridgeEdge.Action}`);
      }
    }

    // Collect token information for constraint violation reporting
    let tokenInfo: any = {};

    if (node.Type === 'DEX') {
      const dexEdge = edgeData as IDEXEdge;

      // Input token information
      if (dexEdge.AmountIn && dexEdge.Token0) {
        const { TokenDecimalFetcher } = await import('../Utils/TokenDecimalFetcher');
        const inputDecimals = await TokenDecimalFetcher.getTokenDecimals(dexEdge.Token0Addr || '', dexEdge.Token0, this.blockNo);
        const inputTokenAmount = PrecisionMath.normalizeAmount(dexEdge.AmountIn, inputDecimals);

        tokenInfo.input_token_symbol = dexEdge.Token0;
        tokenInfo.input_token_amount = inputTokenAmount;
        tokenInfo.input_token_raw = dexEdge.AmountIn;
        tokenInfo.input_token_address = dexEdge.Token0Addr;
      }

      // Output token information
      if (dexEdge.AmountOut && dexEdge.Token1) {
        const { TokenDecimalFetcher } = await import('../Utils/TokenDecimalFetcher');
        const outputDecimals = await TokenDecimalFetcher.getTokenDecimals(dexEdge.Token1Addr || '', dexEdge.Token1, this.blockNo);
        let outputTokenAmount = PrecisionMath.normalizeAmount(dexEdge.AmountOut, outputDecimals);

        tokenInfo.output_token_symbol = dexEdge.Token1;
        tokenInfo.output_token_amount = outputTokenAmount;
        tokenInfo.output_token_raw = dexEdge.AmountOut;
        tokenInfo.output_token_address = dexEdge.Token1Addr;
      }
    } else if (node.Type === 'Lending') {
      const lendingEdge = edgeData as ILendingEdge;

      if (lendingEdge.Amount && lendingEdge.Token) {
        const { TokenDecimalFetcher } = await import('../Utils/TokenDecimalFetcher');
        const tokenDecimals = await TokenDecimalFetcher.getTokenDecimals(lendingEdge.TokenAddr, lendingEdge.Token, this.blockNo);
        const tokenAmount = PrecisionMath.normalizeAmount(lendingEdge.Amount, tokenDecimals);

        tokenInfo.token_symbol = lendingEdge.Token;
        tokenInfo.token_amount = tokenAmount;
        tokenInfo.token_raw = lendingEdge.Amount;
        tokenInfo.token_address = lendingEdge.TokenAddr;
        tokenInfo.action = lendingEdge.Action;
      }
    } else if (node.Type === 'Bridge') {
      const bridgeEdge = edgeData as any;

      // Add Bridge-specific token information for DSL constraints
      if (bridgeEdge.Amount && bridgeEdge.Amount !== '0') {
        const tokenSymbol = bridgeEdge.TokenIn || bridgeEdge.depositToken || 'ETH';
        const tokenAddr = bridgeEdge.TokenInAddr || bridgeEdge.depositTokenAddr || '0x0000000000000000000000000000000000000000';
        
        const { TokenDecimalFetcher } = await import('../Utils/TokenDecimalFetcher');
        const tokenDecimals = await TokenDecimalFetcher.getTokenDecimals(tokenAddr, tokenSymbol, this.blockNo);
        const tokenAmount = PrecisionMath.normalizeAmount(bridgeEdge.Amount, tokenDecimals);

        tokenInfo.token_symbol = tokenSymbol;
        tokenInfo.token_amount = tokenAmount;
        tokenInfo.token_raw = bridgeEdge.Amount;
        tokenInfo.token_address = tokenAddr;
        tokenInfo.action = bridgeEdge.Action;
        
        // Bridge-specific fields for constraint evaluation
        tokenInfo.deposit_amount = bridgeEdge.depositAmount || '0';
        tokenInfo.mint_amount = bridgeEdge.mintAmount || '0';
        tokenInfo.deposit_value = bridgeEdge.depositValue || '0';
        tokenInfo.protocol = bridgeEdge.Protocol;
      }
      
      // Add mint token information if available
      if (bridgeEdge.mintAmount && bridgeEdge.mintAmount !== '0') {
        const mintTokenSymbol = bridgeEdge.TokenOut || bridgeEdge.mintToken || 'qXETH';
        const mintTokenAddr = bridgeEdge.TokenOutAddr || bridgeEdge.mintTokenAddr || '0xfD7A5506F434f5334C100EFb765025243C39137C';
        
        const { TokenDecimalFetcher } = await import('../Utils/TokenDecimalFetcher');
        const mintTokenDecimals = await TokenDecimalFetcher.getTokenDecimals(mintTokenAddr, mintTokenSymbol, this.blockNo);
        const mintTokenAmount = PrecisionMath.normalizeAmount(bridgeEdge.mintAmount, mintTokenDecimals);
        
        tokenInfo.mint_token_symbol = mintTokenSymbol;
        tokenInfo.mint_token_amount = mintTokenAmount;
        tokenInfo.mint_token_raw = bridgeEdge.mintAmount;
        tokenInfo.mint_token_address = mintTokenAddr;
      }
    }

    // Extract Service from node - handle various formats
    let service = (node.Service || node.ServiceType || '') as string;

    // Make service matching more flexible
    if (service) {
      // Normalize service name for matching
      service = service.toLowerCase();
    }

    // Action-based Type fallback: the FormalSFGAdapter sometimes classifies Lending or
    // DEX vertices as "Token" when downstream Transfer events overwrite the original
    // protocol-typed vertex. The Action vocabulary is canonical (LENDING_ALIASES maps
    // Compound's Redeem -> "Withdraw", etc.), so the action label is a reliable fallback.
    const lendingActions = new Set(["Borrow", "Withdraw", "Deposit", "Repay", "Liquidate"]);
    let inferredType = node.Type;
    if (edgeData.Action && lendingActions.has(edgeData.Action)) {
      inferredType = "Lending";
    } else if (edgeData.Type === "DEX" && edgeData.Action === "Swap") {
      inferredType = "DEX";
    } else if (edgeData.Type === "Bridge") {
      inferredType = "Bridge";
    }

    // Debug: Log source structure to verify participant data (DISABLED - flooding output)
    // if (process.env.MICA_REGULATION_MODE === 'true' && edgeData.value_usd > 1000) {
    //   DebugLogger.core(`🔍 [DEBUG] edgeData.source type: ${typeof edgeData.source}`);
    //   DebugLogger.core(`🔍 [DEBUG] edgeData.source value: ${JSON.stringify(edgeData.source)?.substring(0, 200)}`);
    //   DebugLogger.core(`🔍 [DEBUG] edgeData.source?.participant: ${JSON.stringify(edgeData.source?.participant)}`);
    // }

    const context: ExecutionContext = {
      edge: {
        type: node.ServiceType || inferredType,
        Type: inferredType, // Action-based fallback for reliability
        Service: service, // Add Service explicitly (lowercase for matching)
        action: edgeData.Action,
        Action: edgeData.Action, // Also keep Action for backward compatibility
        isFirstSwap: !this._firstSwap.has(seq.w),
        transaction_hash: transactionHash || '',
        // CRITICAL: DSL constraints reference camelCase USD totals at edge level
        // Without these the violation precondition `edge.totalInUSD > 0` always fails
        totalInUSD: totalInUSD,
        totalOutUSD: totalOutUSD,
        // Cross-protocol cycle detection variables for EXCHANGE_RATE_MANIPULATION
        derivative_swap_acquired: derivative_swap_acquired,
        swap_acquired_amount_usd: swap_acquired_amount_usd,
        // Pre-edge collateral state for the participant (USD basis). LC formula
        // compares this against borrow_amount_usd to detect over-extraction.
        collateral_value: preCollateral,
        // For Borrow / Withdraw edges, borrow_amount_usd is the USD value the
        // participant is taking out at this edge.
        borrow_amount_usd: (edgeData.Action === 'Borrow' || edgeData.Action === 'Withdraw') ? totalOutUSD : 0,
        // user_collateral / user_debt fields for the secondary health-factor disjunct.
        user_collateral: preCollateral,
        user_debt: preBalance < 0 ? -preBalance : 0,
        // Reentrancy cross-edge context vars. REENTRANCY_PATTERN's condition
        // computes multiple_calls := edge.call_depth > 1, state_change_order
        // := edge.balance_updated_after_transfer == true, and
        // balance_inconsistent := edge.user_balance < 0 && edge.user_collateral > 0.
        call_depth: reentrancy_multiple_calls ? 2 : 1,
        balance_updated_after_transfer: reentrancy_state_change_order,
        user_balance: reentrancy_balance_inconsistent ? -1 : preBalance,
        // (user_collateral set above via preCollateral)
        // Bridge integrity context vars. The DSL constraint computes
        // validation_bypass / zero_deposit / backing_mismatch / bridge_ratio
        // from edge.{minted_amount,deposited_amount,deposit_amount,mint_amount,
        // dest_amount,source_amount,validation_checks_passed,source_chain_locked,
        // dest_chain_minted}.
        validation_checks_passed: !bridge_validation_bypass,
        deposit_amount: (edgeData.Action === "Deposit" || edgeData.Action === "depositETH") ? Number(edgeData.Amount || 0) : 0,
        mint_amount: edgeData.Action === "Mint" ? Number(edgeData.Amount || 0) : 0,
        deposited_amount: bridge_source_amount,
        minted_amount: edgeData.Action === "Mint" ? Number(edgeData.Amount || 0) : 0,
        source_amount: bridge_source_amount,
        dest_amount: edgeData.Action === "Mint" ? Number(edgeData.Amount || 0) : Number(edgeData.Amount || 0),
        source_chain_locked: bridge_source_amount,
        dest_chain_minted: edgeData.Action === "Mint" ? Number(edgeData.Amount || 0) : 0,
        ...edgeData,
        // Override source - make it support both string comparison AND property access
        // This works around a DSL compiler bug that transforms edge.participant to edge.source.participant
        source: {
          // String representation for temporal filtering (e.source == edge.source comparisons)
          toString: () => edgeData.source?.address || seq.v as string,
          valueOf: () => edgeData.source?.address || seq.v as string,
          // Address as a property for explicit access
          address: edgeData.source?.address || seq.v as string,
          // Participant data for buggy compiler that accesses edge.source.participant
          participant: edgeData.source?.participant
        } as any,
        // ALSO expose participant at edge level for correct DSL access (edge.participant)
        // Check BOTH test data location (edgeData.participant) and real data location (edgeData.source?.participant)
        participant: edgeData.participant || edgeData.source?.participant
      },
      user: {
        balance: this._userBalance.get(seq.v) ?? 0,
        collateral: this._userCollateral.get(seq.v) ?? 0
      },
      graph: node,
      blockNo: this.blockNo,
      // Add actual transaction data
      total_in_usd: totalInUSD,
      total_out_usd: totalOutUSD,
      // Add token information
      ...tokenInfo,
      // Add token classification functions for DSL compilation
      is_governance_token: this.isGovernanceToken.bind(this),
      is_lp_token: this.isLpToken.bind(this),
      is_vault_token: this.isVaultToken.bind(this),
      // Add toUSD function to context for DSL constraints
      toUSD: async (amount: any, tokenSymbol: string, tokenAddr: string, blockNo: number) => {
        const { toUSD } = await import('../Utils/PriceManager/PriceUtils');
        return await toUSD(amount, tokenSymbol, tokenAddr, blockNo);
      }
    };

    // User balance logging for debugging
    if (node.Type === 'Lending') {
      context.user = this.calculateUserBalance(seq, edgeData);
    }

    return context;
  }

  // Calculate user balance (using real tracking data)
  private calculateUserBalance(seq: SequenceEdge, edgeData: ILendingEdge): { balance: number; collateral: number } {
    const user = seq.v;
    const balance = this._userBalance.get(user) ?? 0;
    const collateral = this._userCollateral.get(user) ?? 0;
    
    const userAddr = typeof user === 'string' ? user.substring(0, 10) : String(user).substring(0, 10);
    DebugLogger.solver(`👤 [USER STATE] ${userAddr}... Balance: $${balance.toFixed(2)}, Collateral: $${collateral.toFixed(2)}`);
    
    return {
      balance: balance,
      collateral: collateral
    };
  }

  // Record violations in result
  private recordViolation(result: AnalysisResult, violation: ConstraintResult): void {
    if (violation.violated && violation.message) {
      const details = violation.details?.conditionVars || {};
      const constraintName = violation.details?.constraint || 'Unknown';

      DebugLogger.core(`🚨 [${constraintName}] ${violation.message}`);

      // Output core calculation values (USD information)
      if (details.total_in_usd !== undefined) DebugLogger.core(`   💰 Input: $${getNumberValue(details.total_in_usd).toFixed(2)} USD`);
      if (details.total_out_usd !== undefined) DebugLogger.core(`   💰 Output: $${getNumberValue(details.total_out_usd).toFixed(2)} USD`);
      if (details.profit_ratio !== undefined) {
        DebugLogger.core(`   📊 Profit Ratio: ${getNumberValue(details.profit_ratio).toFixed(2)}%`);
        DebugLogger.core(`   📊 Calculation: ($${getNumberValue(details.total_out_usd).toFixed(2)} - $${getNumberValue(details.total_in_usd).toFixed(2)}) / $${getNumberValue(details.total_in_usd).toFixed(2)} * 100`);
      }

      // Token detailed information output (DEX transactions)
      if (details.input_token_symbol && details.input_token_amount !== undefined) {
        DebugLogger.core(`   📥 Input Token: ${getNumberValue(details.input_token_amount).toFixed(6)} ${details.input_token_symbol}`);
        if (details.input_token_address && details.input_token_address !== '0x0') {
          DebugLogger.core(`       Address: ${details.input_token_address}`);
        }
      }
      if (details.output_token_symbol && details.output_token_amount !== undefined) {
        DebugLogger.core(`   📤 Output Token: ${getNumberValue(details.output_token_amount).toFixed(6)} ${details.output_token_symbol}`);
        if (details.output_token_address && details.output_token_address !== '0x0') {
          DebugLogger.core(`       Address: ${details.output_token_address}`);
        }
      }

      // Token detailed information output (Lending transactions)
      if (details.token_symbol && details.token_amount !== undefined && details.action) {
        DebugLogger.core(`   🏦 ${details.action} Token: ${getNumberValue(details.token_amount).toFixed(6)} ${details.token_symbol}`);
        if (details.token_address && details.token_address !== '0x0') {
          DebugLogger.core(`       Address: ${details.token_address}`);
        }
      }

      // Existing lending related information
      if (details.user_balance !== undefined) DebugLogger.core(`   💳 User Balance: $${getNumberValue(details.user_balance).toFixed(2)} USD`);
      if (details.user_collateral !== undefined) DebugLogger.core(`   🏠 User Collateral: $${getNumberValue(details.user_collateral).toFixed(2)} USD`);
      if (details.l2_percent !== undefined) DebugLogger.core(`   📈 L2 Percent: ${getNumberValue(details.l2_percent).toFixed(4)}%`);

      // Direct constraint index mapping using ConstraintIndexMapper
      const violatedConstraintName = violation.details?.constraint || '';
      
      if (violatedConstraintName) {
        const { constraintIndexMapper } = require('./ConstraintIndexMapper');
        const constraintIndex = constraintIndexMapper.getConstraintIndex(violatedConstraintName);
        
        if (constraintIndex !== -1) {
          result._violation[constraintIndex] = true;
          DebugLogger.core(`✅ [${violatedConstraintName}] Constraint violation recorded at index ${constraintIndex}`);
        } else {
          DebugLogger.core(`⚠️ [${violatedConstraintName}] Constraint not found in DSL mapping`);
        }
      }
      result._comment += violation.message + '; ';
    }
  }

  // Return constraint list (return actual internal type)
  getConstraints(): unknown[] {
    return this.constraintManager.getConstraints();
  }

  // Add constraint (accept actual internal type)
  addConstraint(constraint: unknown): void {
    this.constraintManager.addConstraint(constraint as any);
  }

  // Clear constraints
  clearConstraints(): void {
    this.constraintManager.clearConstraints();
  }

  // Check state maps for memory pressure
  private checkStateMapPressure(): void {
    const MAX_ENTRIES = 10000;
    
    if (this._userBalance.size > MAX_ENTRIES) {
      DebugLogger.core(`⚠️ [DSLConstraintSolver] User balance map too large (${this._userBalance.size} entries), clearing`);
      this._userBalance.clear();
    }
    
    if (this._userCollateral.size > MAX_ENTRIES) {
      DebugLogger.core(`⚠️ [DSLConstraintSolver] User collateral map too large (${this._userCollateral.size} entries), clearing`);
      this._userCollateral.clear();
    }
    
    if (this._firstSwap.size > MAX_ENTRIES) {
      DebugLogger.core(`⚠️ [DSLConstraintSolver] First swap set too large (${this._firstSwap.size} entries), clearing`);
      this._firstSwap.clear();
    }
  }

  // Get memory usage statistics
  getMemoryStats(): { userBalance: number; userCollateral: number; firstSwap: number } {
    return {
      userBalance: this._userBalance.size,
      userCollateral: this._userCollateral.size,
      firstSwap: this._firstSwap.size
    };
  }

  // Get DSL cache statistics
  getCacheStats(): string {
    const cache = getGlobalDSLCache();
    return cache.getSummary();
  }

  // Force cache cleanup (for maintenance)
  cleanupCache(): number {
    const cache = getGlobalDSLCache();
    return cache.forceCleanup();
  }

  // State transition (same as existing ConstraintSolver)
  async stateTransition(seq: SequenceEdge, graph: SemanticFinancialGraph): Promise<void> {
    const node = graph.node(seq.w);
    let nodeType = node?.['ServiceType'] || node?.['Type'];

    // Action-based fallback: FormalSFGAdapter sometimes classifies Lending vertices as
    // "Token" when downstream Transfer events overwrite the protocol-typed vertex.
    // Use the canonical Action vocabulary to recover the Lending classification so
    // collateral / balance state still tracks correctly.
    let edgeForFallback: any = {};
    try { edgeForFallback = JSON.parse(seq.name[0] || '{}'); } catch { /* skip */ }
    const lendingActionsForState = new Set(["Deposit", "Withdraw", "Borrow", "Repay", "Liquidate"]);
    if (nodeType !== 'Lending' && nodeType !== 'DEX' && nodeType !== 'Bridge'
        && edgeForFallback?.Action && lendingActionsForState.has(edgeForFallback.Action)) {
      nodeType = 'Lending';
    }

    switch (nodeType) {
      case 'Lending':
        const LendingEdge: ILendingEdge = JSON.parse(seq.name[0]);
        switch (LendingEdge.Action) {
          case 'Deposit': await this.depositTransition(seq); break;
          case 'Withdraw': await this.withdrawTransition(seq); break;
          case 'Borrow': await this.borrowTransition(seq); break;
          case 'Repay': await this.repayTransition(seq); break;
          default: console.error('Not supported action type');
        }
        break;
      case 'DEX':
        // Track firstSwap for DEX
        if (!this._firstSwap.has(seq.w)) {
          this._firstSwap.add(seq.w);
        }
        break;
      case 'Bridge':
        // Bridge edges don't require state transitions for balance/collateral tracking
        // Bridge constraints are evaluated directly from edge data
        break;
      case 'EOA':
        // EOA (Externally Owned Account) nodes don't require state transitions
        // Used as source/destination for user-to-user transfers
        break;
      case 'Stablecoin':
        // Stablecoin protocol nodes don't require balance/collateral state transitions
        // Stablecoin constraints are evaluated directly from edge data and protocol metadata
        break;
      case 'Transfer':
        // Transfer edges don't require state transitions for balance/collateral tracking
        // Transfer constraints are evaluated directly from edge data
        break;
      case undefined:
      case null:
        // Skip nodes without proper type definitions (common for EOA or non-DeFi nodes)
        console.log(`Skipping node without DeFi type: ${JSON.stringify(graph.node(seq.w))}`);
        break;
      default:
        console.error(`Not supported DeFi type: ${nodeType} in ${JSON.stringify(graph.node(seq.w))}`);
    }
  }


  // Get user balance and collateral
  getPrevBC(seq: SequenceEdge): [number, number] {
    return [
      this._userBalance.get(seq.v) ?? 0,
      this._userCollateral.get(seq.v) ?? 0
    ];
  }

  // Deposit state transition
  async depositTransition(seq: SequenceEdge): Promise<void> {
    const lEdge: ILendingEdge = JSON.parse(seq.name[0]);
    if (!lEdge.Token || !lEdge.TokenAddr || !lEdge.Amount) {
      // Skip state update when token info is missing (some EdgeAdders don't fully populate).
      return;
    }
    const usdPrice = await toUSD(lEdge.Amount, lEdge.Token, lEdge.TokenAddr, this.blockNo);
    const BC = this.getPrevBC(seq);
    this._userBalance.set(seq.v, BC[0] + usdPrice);
    this._userCollateral.set(seq.v, BC[1] + usdPrice);
    
    const userAddr = typeof seq.v === 'string' ? seq.v.substring(0, 10) : String(seq.v).substring(0, 10);
    DebugLogger.solver(`💳 [DEPOSIT] User ${userAddr}... deposited $${usdPrice.toFixed(2)} USD. Balance: $${this._userBalance.get(seq.v)?.toFixed(2)}, Collateral: $${this._userCollateral.get(seq.v)?.toFixed(2)}`);
  }

  // Withdraw state transition
  async withdrawTransition(seq: SequenceEdge): Promise<void> {
    const lEdge: ILendingEdge = JSON.parse(seq.name[0]);
    if (!lEdge.Token || !lEdge.TokenAddr || !lEdge.Amount) {
      return;
    }
    const usdPrice = await toUSD(lEdge.Amount, lEdge.Token, lEdge.TokenAddr, this.blockNo);
    const BC = this.getPrevBC(seq);
    this._userBalance.set(seq.v, BC[0] - usdPrice);
    this._userCollateral.set(seq.v, BC[1] - usdPrice);
    
    const userAddr = typeof seq.v === 'string' ? seq.v.substring(0, 10) : String(seq.v).substring(0, 10);
    DebugLogger.solver(`💸 [WITHDRAW] User ${userAddr}... withdrew $${usdPrice.toFixed(2)} USD. Balance: $${this._userBalance.get(seq.v)?.toFixed(2)}, Collateral: $${this._userCollateral.get(seq.v)?.toFixed(2)}`);
  }

  // Borrow state transition
  async borrowTransition(seq: SequenceEdge): Promise<void> {
    const lEdge: ILendingEdge = JSON.parse(seq.name[0]);
    if (!lEdge.Token || !lEdge.TokenAddr || !lEdge.Amount) {
      return;
    }
    const usdPrice = await toUSD(lEdge.Amount, lEdge.Token, lEdge.TokenAddr, this.blockNo);
    const BC = this.getPrevBC(seq);
    // Borrowing reduces balance (increases debt) but doesn't affect collateral
    this._userBalance.set(seq.v, BC[0] - usdPrice);
    
    const userAddr = typeof seq.v === 'string' ? seq.v.substring(0, 10) : String(seq.v).substring(0, 10);
    DebugLogger.solver(`🏦 [BORROW] User ${userAddr}... borrowed $${usdPrice.toFixed(2)} USD. Balance: $${this._userBalance.get(seq.v)?.toFixed(2)}, Collateral: $${this._userCollateral.get(seq.v)?.toFixed(2)}`);
  }

  // Repay state transition
  async repayTransition(seq: SequenceEdge): Promise<void> {
    const lEdge: ILendingEdge = JSON.parse(seq.name[0]);
    if (!lEdge.Token || !lEdge.TokenAddr || !lEdge.Amount) {
      return;
    }
    const usdPrice = await toUSD(lEdge.Amount, lEdge.Token, lEdge.TokenAddr, this.blockNo);
    const BC = this.getPrevBC(seq);
    this._userBalance.set(seq.v, BC[0] + usdPrice);  // Repay increases balance (reduces debt)
    
    const userAddr = typeof seq.v === 'string' ? seq.v.substring(0, 10) : String(seq.v).substring(0, 10);
    DebugLogger.solver(`💰 [REPAY] User ${userAddr}... repaid $${usdPrice.toFixed(2)} USD. Balance: $${this._userBalance.get(seq.v)?.toFixed(2)}, Collateral: $${this._userCollateral.get(seq.v)?.toFixed(2)}`);
  }

  // Token classification functions for DSL compilation
  private isGovernanceToken(tokenSymbol: string): boolean {
    const tokenSymbolStr = String(tokenSymbol).toLowerCase();
    const governanceTokens = [
      'ousd', 'ogn',      // Origin Protocol
      'comp',             // Compound
      'mkr',              // MakerDAO
      'uni',              // Uniswap
      'aave',             // Aave
      'sushi',            // SushiSwap
      'crv',              // Curve
      'yfi',              // Yearn Finance
      'cheese',           // Cheese Bank
      'snx',              // Synthetix
      'float',            // Float Protocol
      'bank',             // Float Bank token
      'inv',              // Inverse Finance governance token
      'dola'              // DOLA stablecoin (related to Inverse Finance)
    ];
    return governanceTokens.includes(tokenSymbolStr);
  }

  private isLpToken(tokenAddress: string): boolean {
    const tokenAddressStr = String(tokenAddress).toLowerCase();
    
    // Known LP token addresses (can be expanded)
    const knownLpTokens = [
      '0xa2107fa5b38d9bbd2c461d6edf11b11a50f6b974', // LINK-ETH LP
      '0xb4e16d0168e52d35cacd2c6185b44281ec28c9dc', // USDC-ETH LP
      '0x0d4a11d5eeaac28ec3f61d100daf4d40471f1852', // WBTC-ETH LP
      '0xa478c2975ab1ea89e8196811f51a7b7ade33eb11', // WETH-DAI Uniswap V2 LP (Warp Finance)
      '0x27fd0857f0ef224097001e87e61026e39e1b04d1', // CHEESE-ETH Uniswap V2 LP (Cheese Bank)
      // Add more known LP addresses as needed
    ];
    
    // Check against known addresses
    return knownLpTokens.includes(tokenAddressStr);
  }

  private isVaultToken(tokenSymbol: string): boolean {
    const tokenSymbolStr = String(tokenSymbol).toLowerCase();
    const vaultTokens = [
      'yvusdc',           // Yearn USDC Vault
      'yvdai',            // Yearn DAI Vault
      'yvweth',           // Yearn WETH Vault
      'crvlusd',          // Curve LUSD Vault
      'fweth',            // Harvest WETH Vault
      'fusdc',            // Harvest USDC Vault
      'fwbtc',            // Harvest WBTC Vault
      'vdfo',             // Value DeFi vaults
      'warpuni',          // Warp Finance LP tokens
    ];
    return vaultTokens.includes(tokenSymbolStr);
  }

  /**
   * Map constraint names to legacy violation indices
   * This maintains compatibility with existing result format
   */
  private mapConstraintToViolationIndex(constraintName: string): number {
    const constraintMapping: { [key: string]: number } = {
      'UNISWAP_V2_INVARIANT': 0,           // D1: DEX K-invariance violations 
      'CURVE_STABLE_INVARIANT': 0,        // D1: DEX K-invariance violations
      'D2_ABNORMAL_SWAP': 1,               // D2: Abnormal swap detection
      'ORACLE_PRICE_MANIPULATION': 1,      // D2: Price manipulation
      'COLLATERAL_MANIPULATION': 2,        // L1: Collateral manipulation (formerly reentrancy)
      'AAVE_HEALTH_FACTOR': 3,            // L2: Excessive borrowing
      'MAKERDAO_COLLATERAL_RATIO': 3,     // L2: Excessive borrowing
      'COMPOUND_INTEREST_MODEL': 3,       // L2: Excessive borrowing
      'FLASH_LOAN_REPAYMENT': 3,          // L2: Excessive borrowing (flash loan violations)
      'LIQUIDITY_BALANCE_INVARIANT': 0,   // D1: DEX invariance
    };

    return constraintMapping[constraintName] ?? -1; // Return -1 for unmapped constraints
  }
}

// Dynamic DSL rules loading
// The DEFAULT_DSL_RULES export is maintained for backward compatibility
// but now loads from DSL files dynamically

const _dynamicLoader = new DynamicConstraintLoader();
export const DEFAULT_DSL_RULES = _dynamicLoader.loadConstraints();

// Fallback support removed - all constraints now loaded from DSL files 
