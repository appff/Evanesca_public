import { EvanescaContext } from "./Interfaces/EvanescaContext";

// Formal System Implementation - Default for production
import { FormalSemanticFinancialGraphBuilder } from "./SemanticFinancialGraph/FormalSemanticFinancialGraphBuilder";
import { MultiChainSemanticFinancialGraphBuilder } from "./SemanticFinancialGraph/MultiChainSemanticFinancialGraphBuilder";
import { buildModelMap, DecodedLog } from "./SemanticFinancialGraph/SemanticFinancialGraphUtils";
import { getEventLogs, filterOut, makeReport, Result, detectChainFromTxHash } from "./Utils/Driver/DriverUtils";
import { makeLogs } from "./ABIDecoder/LogDecoder";
import { DSLConstraintSolver, DEFAULT_DSL_RULES } from "./ConstraintSolver/DSLConstraintSolver";
import { TransactionCorrelator } from "./CrossChain/TransactionCorrelator";
import { ChainType } from "./CrossChain/ITransactionCorrelator";
import { TransactionReceipt } from 'web3-core';
import { AnalysisResult } from "./ConstraintSolver/Interfaces/AnalysisResult";
import { StateTracker } from "./ProtocolVerification/StateTracker";
import { InvariantChecker } from "./ProtocolVerification/InvariantChecker";
import { globalProfiler } from "./Utils/PerformanceProfiler";
import { HiddenBehaviorAnalyzer } from "./PatternDetection/HiddenBehaviorAnalyzer";


import { getLogger } from "./Utils/Logger";

const logger = getLogger('Driver');

// Operation Mode Detection
export enum OperationMode {
  ATTACK_DETECTION = 'attack',
  PROTOCOL_VERIFICATION = 'verification'
}

export function getOperationMode(): OperationMode {
  if (process.env.PROTOCOL_VERIFICATION_MODE === 'true') {
    return OperationMode.PROTOCOL_VERIFICATION;
  }
  return OperationMode.ATTACK_DETECTION;
}

export async function run(hash: string, cntx: EvanescaContext) {
  globalProfiler.start('total_transaction_processing');
  
  globalProfiler.start('build_model_map');
  buildModelMap();
  globalProfiler.end('build_model_map');
  
  globalProfiler.start('get_event_logs');
  let receipt = await getEventLogs(hash);
  globalProfiler.end('get_event_logs');
  
  let elapsed: string = "0";
  
  // Check if receipt is null or undefined
  if (!receipt) {
    logger.error(`No receipt found for transaction: ${hash}`);
    globalProfiler.end('total_transaction_processing');
    return {
      reports: [],
      fins: [Result.ERROR],
      complexity: [],
      analyzed: cntx.analyzed,
      tList: cntx.tList
    };
  }
  
  try {
    globalProfiler.start('chain_detection_and_setup');
    // Detect chain ID for this transaction
    const chainId = detectChainFromTxHash(hash);
    // Use formal builder as the primary implementation (100% test coverage achieved!)
    const GraphBuilder = FormalSemanticFinancialGraphBuilder;
    const bGraph = new GraphBuilder(receipt.blockNumber, receipt.from, chainId);
    globalProfiler.end('chain_detection_and_setup');
    
    globalProfiler.start('decode_logs');
    const decodedLogs: DecodedLog[] = makeLogs(receipt);
    globalProfiler.end('decode_logs');
    
    // Transaction filtering (can be bypassed for protocol verification)
    const bypassFilter = process.env.BYPASS_FILTER === 'true';
    const shouldFilter = bypassFilter ? false : filterOut(receipt, decodedLogs, hash, cntx.analyzed);

    if (bypassFilter && decodedLogs.length > 0) {
      logger.info(`🔍 Transaction ${hash.slice(0,10)}... bypassing filter for protocol verification, decodedLogs: ${decodedLogs.length}`);
    } else {
      logger.info(`🔍 Transaction ${hash.slice(0,10)}... shouldFilter: ${shouldFilter}, decodedLogs: ${decodedLogs.length}`);
    }

    if (!shouldFilter) {
      globalProfiler.start('sfg_building');
      bGraph.setOriginalLogs(receipt.logs);
      await bGraph.build(decodedLogs);
      globalProfiler.end('sfg_building');
      
      // Formal Foundations Validation (Phase 1 - Non-intrusive)
      // Temporarily disabled during development - will re-enable after testing
      /*
      globalProfiler.start('formal_validation');
      if (isFormalValidationEnabled()) {
        try {
          const validationResult = await validateGraph(bGraph, {
            skipAttackDetection: false,
            skipPerformanceChecks: false,
            forceValidation: false
          });
          
          if (!validationResult.success) {
            formalLogger.warn(`Formal validation issues for ${hash.slice(0,10)}...`, {
              errors: validationResult.errors.length,
              warnings: validationResult.warnings.length,
              validationTime: validationResult.performance.validationTime
            });
          } else if (validationResult.warnings.length > 0) {
            formalLogger.warn(`Formal validation warnings for ${hash.slice(0,10)}...`, {
              warnings: validationResult.warnings.length,
              validationTime: validationResult.performance.validationTime
            });
          } else {
            formalLogger.info(`Formal validation passed for ${hash.slice(0,10)}...`, {
              validationTime: validationResult.performance.validationTime,
              graphSize: validationResult.metadata.graphSize
            });
          }
          
          // Store validation metrics in context for potential analysis
          if (!cntx.formalValidation) cntx.formalValidation = [];
          cntx.formalValidation.push({
            transactionHash: hash,
            validationResult,
            timestamp: Date.now()
          });
          
        } catch (error) {
          formalLogger.error(`Formal validation failed for ${hash.slice(0,10)}...`, error);
        }
      }
      globalProfiler.end('formal_validation');
      */
      
      // Get operation mode
      const operationMode = getOperationMode();
      logger.info(`🎯 Operating in ${operationMode} mode`);
      
      // Protocol Verification - Check invariants (only in verification mode)
      if (operationMode === OperationMode.PROTOCOL_VERIFICATION) {
        globalProfiler.start('protocol_verification');
        const stateTracker = new StateTracker();
        const invariantChecker = new InvariantChecker(stateTracker);
        
        try {
          // Extract protocol states from the graph (pass edgeSeq as the actual edges)
          const protocolStates = await stateTracker.extractStatesFromGraph(
            bGraph.graph,
            bGraph.edgeSeq,
            receipt.blockNumber,
            hash
          );
          
          // Check all protocol invariants
          const invariantViolations = await invariantChecker.checkAllInvariantsFromGraph(
            protocolStates,
            bGraph.edgeSeq,
            receipt.blockNumber,
            hash
          );
          
          // Log protocol violations if any
          if (invariantViolations.length > 0) {
            logger.warn(`⚠️ Protocol invariant violations detected: ${invariantViolations.length}`);
          }
        } catch (error) {
          logger.warn(`[Protocol Verification] Skipping due to error: ${error}`);
        }
        globalProfiler.end('protocol_verification');
      }
      
      // DSL-based constraint solving (mode-specific constraints)
      globalProfiler.start('dsl_constraint_solving');
      const dslSolver = new DSLConstraintSolver(receipt.blockNumber, DEFAULT_DSL_RULES);
      const curReport = await dslSolver.solve(bGraph.graph, bGraph.edgeSeq, hash);
      curReport.blockNumber = receipt.blockNumber;
      globalProfiler.end('dsl_constraint_solving');

      // Hidden behavior analysis (new use case)
      globalProfiler.start('hidden_behavior_analysis');
      try {
        const hiddenAnalyzer = new HiddenBehaviorAnalyzer();
        const hiddenViolations = await hiddenAnalyzer.analyzeHiddenBehaviors(bGraph.edgeSeq);

        // Add hidden behavior violations to the report
        if (hiddenViolations.length > 0) {
          logger.info(`🔍 Hidden behaviors detected: ${hiddenViolations.length}`);
          curReport.constraintViolations.push(...hiddenViolations);
        }
      } catch (error) {
        logger.warn(`[Hidden Behavior Analysis] Skipping due to error: ${error}`);
      }
      globalProfiler.end('hidden_behavior_analysis');
      
      // Removed formal caching - pure formal system only

      globalProfiler.start('make_report');
      elapsed = makeReport(curReport, 0, hash, cntx);
      globalProfiler.end('make_report');

      // Store actual edges in context
      cntx.edges = bGraph.edgeSeq;
    }
    else {
      cntx.fins[0] = Result.SKIPPED;
    }
    
    globalProfiler.end('total_transaction_processing');
    globalProfiler.printReport();
    
    // Return the context with reports in the expected format
    return {
      reports: cntx.reports,
      fins: cntx.fins,
      edges: cntx.edges,  // Include edges in return
      complexity: cntx.complexity,
      analyzed: cntx.analyzed,
      tList: cntx.tList
    };
  } catch (e) {
    globalProfiler.end('total_transaction_processing');
    cntx.fins[0] = Result.ERROR;
    logger.error('Transaction processing error:', e);
    // Return empty result on error
    return {
      reports: [],
      fins: cntx.fins,
      edges: cntx.edges || [],  // Include edges (empty array on error)
      complexity: cntx.complexity,
      analyzed: cntx.analyzed,
      tList: cntx.tList
    };
  }
}

/**
 * Multi-chain analysis function for bridge attack detection
 * 
 * @param chainTransactions Map of chain -> transaction receipts
 * @param cntx Evanesca context
 * @returns Analysis results including cross-chain correlations
 */
export async function runMultiChain(chainTransactions: Map<ChainType, TransactionReceipt[]>, cntx: EvanescaContext) {
  buildModelMap();
  
  try {
    logger.info(`🌐 [MultiChain] Starting analysis across ${chainTransactions.size} chains`);
    
    // Initialize multi-chain graph builder with correlation
    const correlator = new TransactionCorrelator();
    const multiChainBuilder = new MultiChainSemanticFinancialGraphBuilder(
      getFirstBlockNumber(chainTransactions),
      getFirstFromAddress(chainTransactions),
      correlator
    );
    
    // Build multi-chain behavior graph
    const multiChainGraph = await multiChainBuilder.buildMultiChain(chainTransactions);
    
    // Run DSL constraint analysis on the merged graph
    const dslSolver = new DSLConstraintSolver(
      getFirstBlockNumber(chainTransactions), 
      DEFAULT_DSL_RULES
    );
    
    const analysisResult = await dslSolver.solve(
      multiChainBuilder.graph, 
      multiChainBuilder.edgeSeq
    );
    
    // Generate multi-chain report
    const elapsed = makeMultiChainReport(analysisResult, multiChainGraph, cntx);
    
    logger.info(`🌐 [MultiChain] Analysis complete: ${elapsed}ms`);
    
    return {
      reports: cntx.reports,
      fins: cntx.fins,
      complexity: cntx.complexity,
      analyzed: cntx.analyzed,
      tList: cntx.tList,
      multiChainResults: multiChainBuilder.getMultiChainResults(),
      crossChainEdges: multiChainBuilder.getCrossChainEdges(),
      bridgeDeposits: multiChainBuilder.getBridgeDeposits(),
      bridgeMints: multiChainBuilder.getBridgeMints()
    };
    
  } catch (error) {
    logger.error('❌ [MultiChain] Analysis failed:', error);
    cntx.fins[0] = Result.ERROR;
    
    return {
      reports: [],
      fins: cntx.fins,
      complexity: cntx.complexity,
      analyzed: cntx.analyzed,
      tList: cntx.tList,
      multiChainResults: null,
      crossChainEdges: [],
      bridgeDeposits: [],
      bridgeMints: []
    };
  }
}

/**
 * Enhanced single transaction analysis with bridge detection
 * 
 * @param hash Transaction hash
 * @param cntx Evanesca context
 * @param enableBridgeDetection Whether to enable enhanced bridge detection
 * @returns Analysis results
 */
export async function runEnhanced(hash: string, cntx: EvanescaContext, enableBridgeDetection: boolean = true) {
  buildModelMap();
  let receipt = await getEventLogs(hash);
  
  if (!receipt) {
    logger.error(`No receipt found for transaction: ${hash}`);
    return {
      reports: [],
      fins: [Result.ERROR],
      complexity: [],
      analyzed: cntx.analyzed,
      tList: cntx.tList
    };
  }
  
  try {
    // Use formal graph builder (default implementation)
    const GraphBuilder = FormalSemanticFinancialGraphBuilder;
    const bGraph = enableBridgeDetection ? 
      new MultiChainSemanticFinancialGraphBuilder(receipt.blockNumber, receipt.from) :
      new GraphBuilder(receipt.blockNumber, receipt.from);
    
    const decodedLogs: DecodedLog[] = makeLogs(receipt);
    
    // Transaction filtering
    const shouldFilter = filterOut(receipt, decodedLogs, hash, cntx.analyzed);
    
    if (!shouldFilter) {
      bGraph.setOriginalLogs(receipt.logs);
      await bGraph.build(decodedLogs);
      
      // Enhanced DSL constraint analysis
      const dslSolver = new DSLConstraintSolver(receipt.blockNumber, DEFAULT_DSL_RULES);
      const curReport = await dslSolver.solve(bGraph.graph, bGraph.edgeSeq, hash);
      curReport.blockNumber = receipt.blockNumber;
      
      const elapsed = makeReport(curReport, 0, hash, cntx);
      
      // Log bridge detection results if enabled
      if (enableBridgeDetection && bGraph instanceof MultiChainSemanticFinancialGraphBuilder) {
        const bridgeResults = bGraph.getMultiChainResults();
        if (bridgeResults.bridgeTransactions > 0) {
          logger.info(`🌉 [Bridge] Detected ${bridgeResults.bridgeTransactions} bridge transactions`);
          if (bridgeResults.suspiciousActivity) {
            logger.warn(`🚨 [Bridge] Suspicious bridge activity detected!`);
          }
        }
      }
    }
    else cntx.fins[0] = Result.SKIPPED;
    
    return {
      reports: cntx.reports,
      fins: cntx.fins,
      complexity: cntx.complexity,
      analyzed: cntx.analyzed,
      tList: cntx.tList
    };
  } catch (e) { 
    cntx.fins[0] = Result.ERROR; 
    logger.error('Transaction processing error:', e);
    return {
      reports: [],
      fins: cntx.fins,
      complexity: cntx.complexity,
      analyzed: cntx.analyzed,
      tList: cntx.tList
    };
  }
}

// =============================================================================
// Helper Functions
// =============================================================================

function getFirstBlockNumber(chainTransactions: Map<ChainType, TransactionReceipt[]>): number {
  for (const [chain, receipts] of chainTransactions) {
    if (receipts.length > 0) {
      return receipts[0].blockNumber;
    }
  }
  return 0;
}

function getFirstFromAddress(chainTransactions: Map<ChainType, TransactionReceipt[]>): string {
  for (const [chain, receipts] of chainTransactions) {
    if (receipts.length > 0) {
      return receipts[0].from;
    }
  }
  return "0x0000000000000000000000000000000000000000";
}

function makeMultiChainReport(analysisResult: any, multiChainGraph: any, cntx: EvanescaContext): string {
  const startTime = Date.now();
  
  // Generate multi-chain specific report
  const bridgeTransactions = multiChainGraph.bridgeDeposits.length + multiChainGraph.bridgeMints.length;
  const crossChainCorrelations = multiChainGraph.correlations.size;
  const suspiciousEdges = multiChainGraph.crossChainEdges.filter((edge: any) => 
    edge.relationshipType === 'suspicious_correlation'
  ).length;
  
  // Create a proper AnalysisResult object for multi-chain analysis
  const multiChainReport = new AnalysisResult();
  multiChainReport._index = 0;
  multiChainReport._violation = analysisResult._violation;
  multiChainReport._elapsed = Date.now() - startTime;
  multiChainReport._comment = `Multi-chain Analysis: ${analysisResult._comment} [Chains: ${multiChainGraph.chainGraphs.size}, Bridge Txs: ${bridgeTransactions}, Correlations: ${crossChainCorrelations}, Suspicious: ${suspiciousEdges}]`;
  multiChainReport._hash = "multi_chain_analysis";
  
  cntx.reports.push(multiChainReport);
  
  const elapsed = Date.now() - startTime;
  
  logger.info(`📊 [MultiChain] Report generated:
  - Chains: ${multiChainGraph.chainGraphs.size}
  - Bridge Transactions: ${bridgeTransactions}
  - Cross-Chain Correlations: ${crossChainCorrelations}
  - Suspicious Activity: ${suspiciousEdges > 0 ? 'YES' : 'NO'}
  - Processing Time: ${elapsed}ms`);
  
  return elapsed.toString();
}

// Export the main driver functions
export const Driver = { run };
