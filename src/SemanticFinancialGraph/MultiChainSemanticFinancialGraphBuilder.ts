/**
 * Multi-Chain Semantic Financial Graph Builder
 * 
 * Extends SemanticFinancialGraphBuilder to support cross-chain transaction analysis
 * for detecting bridge attacks like Qubit Finance ($80M) and Meter.io ($4.4M).
 * 
 * Features:
 * - Multi-chain transaction processing
 * - Cross-chain correlation and edge generation
 * - Bridge attack pattern detection
 * - Backward compatibility with single-chain analysis
 */

import { SemanticFinancialGraphBuilder } from './SemanticFinancialGraphBuilder';
import { DecodedLog, getSemantic } from './SemanticFinancialGraphUtils';
import { SimpleGraph } from './SimpleGraph';
import { TransactionReceipt } from 'web3-core';
import { 
  ITransactionCorrelator, 
  ChainType, 
  CorrelationScore,
  RelatedTransaction,
  BridgeDepositInfo,
  BridgeMintInfo
} from '../CrossChain/ITransactionCorrelator';
import { TransactionCorrelator } from '../CrossChain/TransactionCorrelator';
import { IBridgeEdge } from './BridgeEdgeAdder';
import { DebugLogger } from '../Utils/DebugLogger';

// =============================================================================
// Multi-Chain Interfaces
// =============================================================================

/**
 * Multi-chain graph containing individual chain graphs and cross-chain edges
 */
export interface IMultiChainGraph {
  /** Individual chain graphs */
  chainGraphs: Map<ChainType, any>;
  
  /** Cross-chain correlation edges */
  crossChainEdges: ICrossChainEdge[];
  
  /** Overall edge sequence across all chains */
  globalEdgeSeq: Array<any>;
  
  /** Bridge deposits detected across chains */
  bridgeDeposits: BridgeDepositInfo[];
  
  /** Bridge mints detected across chains */
  bridgeMints: BridgeMintInfo[];
  
  /** Cross-chain correlations */
  correlations: Map<string, CorrelationScore>;
}

/**
 * Cross-chain edge linking transactions across different blockchains
 */
export interface ICrossChainEdge {
  /** Source transaction info */
  source: {
    chain: ChainType;
    txHash: string;
    edgeIndex: number;
  };
  
  /** Target transaction info */
  target: {
    chain: ChainType;
    txHash: string;
    edgeIndex: number;
  };
  
  /** Correlation score between transactions */
  correlationScore: CorrelationScore;
  
  /** Cross-chain relationship type */
  relationshipType: 'bridge_deposit_mint' | 'related_transaction' | 'suspicious_correlation';
  
  /** Cross-chain ID for grouping related transactions */
  crossChainId: string;
  
  /** Bridge protocol involved (if applicable) */
  bridgeProtocol?: string;
}

/**
 * Chain-specific transaction data
 */
export interface ChainTransactionData {
  /** Chain identifier */
  chain: ChainType;
  
  /** Transaction receipts for this chain */
  receipts: TransactionReceipt[];
  
  /** Decoded logs for this chain */
  decodedLogs: DecodedLog[];
  
  /** Block numbers involved */
  blockNumbers: number[];
  
  /** Analysis metadata */
  metadata: {
    totalTransactions: number;
    timeRange: {
      start: number;
      end: number;
    };
    bridgeTransactions: number;
  };
}

// =============================================================================
// MultiChainSemanticFinancialGraphBuilder Implementation
// =============================================================================

export class MultiChainSemanticFinancialGraphBuilder extends SemanticFinancialGraphBuilder {
  private correlator: ITransactionCorrelator;
  private multiChainGraph: IMultiChainGraph;
  private chainData: Map<ChainType, ChainTransactionData>;
  
  constructor(blockno: number, msgSender: string, correlator?: ITransactionCorrelator) {
    super(blockno, msgSender);
    this.correlator = correlator || new TransactionCorrelator();
    this.chainData = new Map();
    this.multiChainGraph = {
      chainGraphs: new Map(),
      crossChainEdges: [],
      globalEdgeSeq: [],
      bridgeDeposits: [],
      bridgeMints: [],
      correlations: new Map()
    };
  }
  
  // =============================================================================
  // Multi-Chain Analysis Methods
  // =============================================================================
  
  /**
   * Build behavior graph from multi-chain transaction data
   * 
   * @param chainTransactions Map of chain -> transaction receipts
   * @returns Promise resolving to multi-chain graph
   */
  async buildMultiChain(chainTransactions: Map<ChainType, TransactionReceipt[]>): Promise<IMultiChainGraph> {
    DebugLogger.core("🌐 [MultiChain] Starting multi-chain behavior graph construction");
    
    // Step 1: Prepare chain data
    await this.prepareChainData(chainTransactions);
    
    // Step 2: Build individual chain graphs
    await this.buildChainGraphs();
    
    // Step 3: Correlate transactions across chains
    await this.correlateAcrossChains();
    
    // Step 4: Generate cross-chain edges
    await this.generateCrossChainEdges();
    
    // Step 5: Merge graphs and create global view
    await this.mergeGraphs();
    
    DebugLogger.core(`🌐 [MultiChain] Completed: ${this.multiChainGraph.chainGraphs.size} chains, ${this.multiChainGraph.crossChainEdges.length} cross-chain edges`);
    
    return this.multiChainGraph;
  }
  
  /**
   * Prepare chain-specific transaction data
   */
  private async prepareChainData(chainTransactions: Map<ChainType, TransactionReceipt[]>): Promise<void> {
    for (const [chain, receipts] of chainTransactions) {
      // Convert receipts to decoded logs (simplified - would need proper decoding)
      const decodedLogs: DecodedLog[] = [];
      const blockNumbers: number[] = [];
      let bridgeTransactionCount = 0;
      
      for (const receipt of receipts) {
        blockNumbers.push(receipt.blockNumber);
        
        // Detect bridge transactions
        const bridgeDeposit = await this.correlator.identifyBridgeDeposit(receipt);
        if (bridgeDeposit) {
          this.multiChainGraph.bridgeDeposits.push(bridgeDeposit);
          bridgeTransactionCount++;
        }
        
        // Convert receipt logs to decoded logs (simplified)
        for (const log of receipt.logs) {
          // This would need proper ABI decoding in real implementation
          const decodedLog: DecodedLog = {
            name: log.topics[0] || 'Unknown',
            address: log.address,
            events: [] // Would be populated by proper decoding
          };
          decodedLogs.push(decodedLog);
        }
      }
      
      const chainData: ChainTransactionData = {
        chain,
        receipts,
        decodedLogs,
        blockNumbers,
        metadata: {
          totalTransactions: receipts.length,
          timeRange: {
            start: Math.min(...blockNumbers),
            end: Math.max(...blockNumbers)
          },
          bridgeTransactions: bridgeTransactionCount
        }
      };
      
      this.chainData.set(chain, chainData);
      DebugLogger.core(`🔗 [MultiChain] Prepared ${chain}: ${receipts.length} transactions, ${bridgeTransactionCount} bridge transactions`);
    }
  }
  
  /**
   * Build individual behavior graphs for each chain
   */
  private async buildChainGraphs(): Promise<void> {
    for (const [chain, chainData] of this.chainData) {
      DebugLogger.core(`🔨 [MultiChain] Building graph for ${chain}...`);
      
      // Create a new graph builder for this chain
      const chainBuilder = new SemanticFinancialGraphBuilder(
        this.blockNo, 
        this.msgSender
      );
      
      // Set original logs for proper processing
      const originalLogs = chainData.receipts.flatMap(receipt => receipt.logs);
      chainBuilder.setOriginalLogs(originalLogs);
      
      // Build the chain-specific graph
      await chainBuilder.build(chainData.decodedLogs);
      
      // Store the chain graph
      this.multiChainGraph.chainGraphs.set(chain, chainBuilder.graph);
      
      // Add chain edges to global sequence with chain context
      const chainEdges = chainBuilder.edgeSeq.map(edge => ({
        ...edge,
        chain,
        chainSpecific: true
      }));
      
      this.multiChainGraph.globalEdgeSeq.push(...chainEdges);
      
      DebugLogger.core(`✅ [MultiChain] Completed ${chain}: ${chainBuilder.edgeSeq.length} edges`);
    }
  }
  
  /**
   * Correlate transactions across different chains
   */
  private async correlateAcrossChains(): Promise<void> {
    DebugLogger.core("🔍 [MultiChain] Starting cross-chain correlation analysis...");
    
    const chains = Array.from(this.chainData.keys());
    let totalCorrelations = 0;
    
    // Compare transactions between each pair of chains
    for (let i = 0; i < chains.length; i++) {
      for (let j = i + 1; j < chains.length; j++) {
        const chain1 = chains[i];
        const chain2 = chains[j];
        
        const data1 = this.chainData.get(chain1)!;
        const data2 = this.chainData.get(chain2)!;
        
        DebugLogger.core(`🔄 [MultiChain] Correlating ${chain1} <-> ${chain2}...`);
        
        // Correlate transactions between these chains
        for (const receipt1 of data1.receipts) {
          for (const receipt2 of data2.receipts) {
            try {
              const correlation = await this.correlator.correlateTransactions(receipt1, receipt2);
              
              // Store significant correlations
              if (correlation.score > 0.7) {
                const correlationKey = `${receipt1.transactionHash}_${receipt2.transactionHash}`;
                this.multiChainGraph.correlations.set(correlationKey, correlation);
                totalCorrelations++;
                
                DebugLogger.core(`🎯 [MultiChain] Strong correlation found: ${correlation.score.toFixed(3)} between ${chain1} and ${chain2}`);
              }
            } catch (error) {
              // Handle correlation errors gracefully
              DebugLogger.core(`⚠️ [MultiChain] Correlation error: ${error}`);
            }
          }
        }
      }
    }
    
    DebugLogger.core(`🔍 [MultiChain] Correlation analysis complete: ${totalCorrelations} significant correlations found`);
  }
  
  /**
   * Generate cross-chain edges based on correlations
   */
  private async generateCrossChainEdges(): Promise<void> {
    DebugLogger.core("🌉 [MultiChain] Generating cross-chain edges...");
    
    let crossChainEdgeCount = 0;
    
    // Process bridge deposits and find corresponding mints
    for (const deposit of this.multiChainGraph.bridgeDeposits) {
      const correspondingMint = await this.correlator.findCorrespondingMint(deposit);
      
      if (correspondingMint) {
        // Create cross-chain edge for deposit-mint pair
        const crossChainEdge: ICrossChainEdge = {
          source: {
            chain: deposit.sourceChain,
            txHash: deposit.txHash,
            edgeIndex: this.findEdgeIndex(deposit.txHash, deposit.sourceChain)
          },
          target: {
            chain: correspondingMint.targetChain,
            txHash: correspondingMint.txHash,
            edgeIndex: this.findEdgeIndex(correspondingMint.txHash, correspondingMint.targetChain)
          },
          correlationScore: {
            score: 0.95, // High confidence for deposit-mint pairs
            factors: { temporal: 0.9, amount: 1.0, address: 1.0, protocol: 1.0 },
            evidence: ['Bridge deposit-mint pair', 'Same user', 'Same protocol']
          },
          relationshipType: 'bridge_deposit_mint',
          crossChainId: `${deposit.bridgeProtocol}_${deposit.depositor}_${deposit.amount}`,
          bridgeProtocol: deposit.bridgeProtocol
        };
        
        this.multiChainGraph.crossChainEdges.push(crossChainEdge);
        crossChainEdgeCount++;
        
        // Add to bridge mints if not already present
        if (!this.multiChainGraph.bridgeMints.some(m => m.txHash === correspondingMint.txHash)) {
          this.multiChainGraph.bridgeMints.push(correspondingMint);
        }
        
        DebugLogger.core(`🌉 [MultiChain] Created bridge edge: ${deposit.bridgeProtocol} ${deposit.sourceChain} -> ${correspondingMint.targetChain}`);
      }
    }
    
    // Process high-correlation transaction pairs
    for (const [correlationKey, correlation] of this.multiChainGraph.correlations) {
      if (correlation.score > 0.8) {
        const [txHash1, txHash2] = correlationKey.split('_');
        
        // Find chains for these transactions
        const chain1 = this.findChainForTransaction(txHash1);
        const chain2 = this.findChainForTransaction(txHash2);
        
        if (chain1 && chain2 && chain1 !== chain2) {
          const crossChainEdge: ICrossChainEdge = {
            source: {
              chain: chain1,
              txHash: txHash1,
              edgeIndex: this.findEdgeIndex(txHash1, chain1)
            },
            target: {
              chain: chain2,
              txHash: txHash2,
              edgeIndex: this.findEdgeIndex(txHash2, chain2)
            },
            correlationScore: correlation,
            relationshipType: correlation.score > 0.9 ? 'suspicious_correlation' : 'related_transaction',
            crossChainId: `correlation_${txHash1}_${txHash2}`
          };
          
          this.multiChainGraph.crossChainEdges.push(crossChainEdge);
          crossChainEdgeCount++;
        }
      }
    }
    
    DebugLogger.core(`🌉 [MultiChain] Generated ${crossChainEdgeCount} cross-chain edges`);
  }
  
  /**
   * Merge individual chain graphs into cohesive multi-chain view
   */
  private async mergeGraphs(): Promise<void> {
    DebugLogger.core("🔄 [MultiChain] Merging chain graphs...");
    
    // Create a new merged graph
    const mergedGraph = new SimpleGraph({ multigraph: true });
    
    // Add all nodes and edges from individual chain graphs
    for (const [chain, chainGraph] of this.multiChainGraph.chainGraphs) {
      // Add nodes with chain prefix to avoid conflicts
      chainGraph.nodes().forEach((nodeId: string) => {
        const chainNodeId = `${chain}:${nodeId}`;
        const nodeData = chainGraph.node(nodeId);
        mergedGraph.setNode(chainNodeId, { ...nodeData, chain });
      });
      
      // Add edges with chain context
      chainGraph.edges().forEach((edge: any) => {
        const chainEdge = {
          v: `${chain}:${edge.v}`,
          w: `${chain}:${edge.w}`,
          name: edge.name
        };
        const edgeData = chainGraph.edge(edge);
        mergedGraph.setEdge({ ...chainEdge, name: [JSON.stringify({ ...edgeData, chain })] });
      });
    }
    
    // Add cross-chain edges to merged graph
    for (const crossChainEdge of this.multiChainGraph.crossChainEdges) {
      const sourceNode = `${crossChainEdge.source.chain}:${crossChainEdge.source.txHash}`;
      const targetNode = `${crossChainEdge.target.chain}:${crossChainEdge.target.txHash}`;
      
      // Add cross-chain edge with special marking
      mergedGraph.setEdge({
        v: sourceNode,
        w: targetNode,
        name: [JSON.stringify({
          type: 'cross_chain',
          relationshipType: crossChainEdge.relationshipType,
          correlationScore: crossChainEdge.correlationScore.score,
          bridgeProtocol: crossChainEdge.bridgeProtocol
        })]
      });
    }
    
    // Update main graph to merged version
    this.graph = mergedGraph;
    
    DebugLogger.core(`🔄 [MultiChain] Merge complete: ${mergedGraph.nodeCount()} nodes, ${mergedGraph.edgeCount()} edges`);
  }
  
  // =============================================================================
  // Utility Methods
  // =============================================================================
  
  /**
   * Find which chain a transaction belongs to
   */
  private findChainForTransaction(txHash: string): ChainType | null {
    for (const [chain, chainData] of this.chainData) {
      if (chainData.receipts.some(receipt => receipt.transactionHash === txHash)) {
        return chain;
      }
    }
    return null;
  }
  
  /**
   * Find edge index for a transaction in a specific chain
   */
  private findEdgeIndex(txHash: string, chain: ChainType): number {
    const chainEdges = this.multiChainGraph.globalEdgeSeq.filter(edge => 
      edge.chain === chain
    );
    
    // This is simplified - would need proper transaction-to-edge mapping
    return chainEdges.findIndex(edge => 
      edge.name && edge.name[0] && edge.name[0].includes(txHash)
    );
  }
  
  /**
   * Get multi-chain analysis results
   */
  getMultiChainResults(): {
    totalChains: number;
    totalTransactions: number;
    bridgeTransactions: number;
    crossChainCorrelations: number;
    suspiciousActivity: boolean;
  } {
    const totalTransactions = Array.from(this.chainData.values())
      .reduce((sum, data) => sum + data.metadata.totalTransactions, 0);
    
    const bridgeTransactions = Array.from(this.chainData.values())
      .reduce((sum, data) => sum + data.metadata.bridgeTransactions, 0);
    
    const suspiciousActivity = this.multiChainGraph.crossChainEdges.some(edge => 
      edge.relationshipType === 'suspicious_correlation' || 
      edge.correlationScore.score > 0.95
    );
    
    return {
      totalChains: this.chainData.size,
      totalTransactions,
      bridgeTransactions,
      crossChainCorrelations: this.multiChainGraph.correlations.size,
      suspiciousActivity
    };
  }
  
  // =============================================================================
  // Backward Compatibility
  // =============================================================================
  
  /**
   * Build single-chain graph (backward compatibility)
   * Delegates to parent class for existing functionality
   */
  async build(logs: DecodedLog[]): Promise<void> {
    // Call parent implementation for backward compatibility
    await super.build(logs);
    
    // Also populate multi-chain structure for consistency
    this.multiChainGraph.chainGraphs.set('ethereum', this.graph);
    this.multiChainGraph.globalEdgeSeq = [...this.edgeSeq];
  }
  
  /**
   * Get the multi-chain graph structure
   */
  getMultiChainGraph(): IMultiChainGraph {
    return this.multiChainGraph;
  }
  
  /**
   * Get cross-chain edges
   */
  getCrossChainEdges(): ICrossChainEdge[] {
    return this.multiChainGraph.crossChainEdges;
  }
  
  /**
   * Get bridge deposits across all chains
   */
  getBridgeDeposits(): BridgeDepositInfo[] {
    return this.multiChainGraph.bridgeDeposits;
  }
  
  /**
   * Get bridge mints across all chains
   */
  getBridgeMints(): BridgeMintInfo[] {
    return this.multiChainGraph.bridgeMints;
  }
}