/**
 * FormalSFGAdapter - Backward Compatibility Layer
 * 
 * Implements the legacy SemanticFinancialGraph interface on top of the formal graph
 * to ensure backward compatibility with existing DSL constraints and solvers.
 */

import {
  SemanticFinancialGraph as LegacySemanticFinancialGraph,
  GraphNode,
  SequenceEdge
} from '../../SemanticFinancialGraph/Types';
import {
  SemanticFinancialGraph as FormalSemanticFinancialGraph,
  FormalVertex,
  FormalEdge,
  VertexType,
  EdgeType
} from '../SemanticFinancialGraphSpec';

/**
 * Adapter that implements legacy SemanticFinancialGraph interface
 * using formal graph as the backend data store
 */
export class FormalSFGAdapter implements LegacySemanticFinancialGraph {
  private formalGraph: FormalSemanticFinancialGraph;
  private nodeCache: Map<string, GraphNode> = new Map();
  private edgesCache: SequenceEdge[] | null = null;
  private nodesCache: string[] | null = null;
  private rawEdgeSeq: SequenceEdge[] = []; // Store original untransformed edges

  constructor(formalGraph: FormalSemanticFinancialGraph, rawEdgeSeq?: SequenceEdge[]) {
    this.formalGraph = formalGraph;
    this.rawEdgeSeq = rawEdgeSeq || [];
  }

  /**
   * Legacy node() method - returns GraphNode from FormalVertex
   * Maps formal vertex to legacy node structure
   */
  node(id: string): GraphNode {
    // Check cache first
    if (this.nodeCache.has(id)) {
      return this.nodeCache.get(id)!;
    }

    const vertex = this.formalGraph.vertices.get(id);
    if (!vertex) {
      // Return a default node if vertex not found (legacy behavior)
      const defaultNode: GraphNode = { Type: 'Unknown' };
      this.nodeCache.set(id, defaultNode);
      return defaultNode;
    }

    // Convert formal vertex to legacy GraphNode
    const legacyNode: GraphNode = {
      Type: this.convertVertexTypeToLegacy(vertex.type),
      ...vertex.metadata // Include all metadata fields
    };

    // Cache the result
    this.nodeCache.set(id, legacyNode);
    return legacyNode;
  }

  /**
   * Legacy edge() method - finds specific edge between two vertices
   */
  edge(source: string, target: string): SequenceEdge | undefined {
    const edges = this.edges();
    return edges.find(e => e.w === source && e.v === target);
  }

  /**
   * Legacy nodes() method - returns all vertex IDs
   */
  nodes(): string[] {
    if (this.nodesCache) {
      return this.nodesCache;
    }

    this.nodesCache = Array.from(this.formalGraph.vertices.keys());
    return this.nodesCache;
  }

  /**
   * Legacy edges() method - returns all edges as SequenceEdge array
   * This is the most critical method for DSL compatibility
   */
  edges(): SequenceEdge[] {
    if (this.edgesCache) {
      return this.edgesCache;
    }

    // CRITICAL: Return raw untransformed edges for DSL compatibility
    // This ensures all original fields are preserved exactly as created
    if (this.rawEdgeSeq && this.rawEdgeSeq.length > 0) {
      console.log(`[FormalSFGAdapter] Returning ${this.rawEdgeSeq.length} raw edges for DSL evaluation`);
      this.edgesCache = this.rawEdgeSeq;
      return this.rawEdgeSeq;
    }

    // Fallback: Convert formal edges to legacy format if no raw edges available
    const edges: SequenceEdge[] = [];

    // Convert formal edges to legacy SequenceEdge format
    for (const formalEdge of this.formalGraph.edges.values()) {
      const sequenceEdge: SequenceEdge = {
        w: formalEdge.source,
        v: formalEdge.target,
        name: [this.convertFormalEdgeToLegacyJSON(formalEdge)]
      };
      edges.push(sequenceEdge);
    }

    // Sort edges by temporal order to match legacy behavior
    edges.sort((a, b) => {
      const edgeA = this.formalGraph.edges.get(this.getEdgeIdFromSequenceEdge(a));
      const edgeB = this.formalGraph.edges.get(this.getEdgeIdFromSequenceEdge(b));
      if (!edgeA || !edgeB) return 0;
      return edgeA.timestamp - edgeB.timestamp;
    });

    this.edgesCache = edges;
    return edges;
  }

  /**
   * Convert formal vertex type to legacy node Type
   */
  private convertVertexTypeToLegacy(vertexType: VertexType): string {
    switch (vertexType) {
      case VertexType.DEX:
        return 'DEX';
      case VertexType.LENDING:
        return 'Lending';
      case VertexType.FLASH_LOAN:
        return 'FlashLoan';
      case VertexType.BRIDGE:
        return 'Bridge';
      case VertexType.USER:
        return 'User';
      case VertexType.TOKEN:
        return 'Token';
      case VertexType.ORACLE:
        return 'Oracle';
      case VertexType.PROTOCOL:
        return 'Protocol';
      default:
        return 'Unknown';
    }
  }

  /**
   * Convert FormalEdge to legacy JSON string format
   * This preserves all fields that DSL constraints expect
   */
  private convertFormalEdgeToLegacyJSON(formalEdge: FormalEdge): string {
    const legacyEdgeData: any = {
      // Core fields
      Type: this.convertEdgeTypeToLegacy(formalEdge.type),
      Action: formalEdge.type,
      Service: this.getServiceFromEdge(formalEdge),
      
      // Token information
      token: formalEdge.attributes.token || '',
      tokenAddress: formalEdge.attributes.token || '',
      
      // Amount information (convert BigInt to number/string for compatibility)
      amount: formalEdge.attributes.amount ? Number(formalEdge.attributes.amount) : 0,
      amountRaw: formalEdge.attributes.amount ? formalEdge.attributes.amount.toString() : '0',
      
      // Price information
      price: formalEdge.attributes.price ? Number(formalEdge.attributes.price) : undefined,
      
      // Gas information
      gasUsed: formalEdge.attributes.gasUsed ? Number(formalEdge.attributes.gasUsed) : undefined,
      
      // Timestamp
      timestamp: formalEdge.timestamp,
      
      // DEX specific fields (if applicable)
      ...(formalEdge.type === EdgeType.SWAP && {
        AmountIn: formalEdge.attributes.amountIn ? Number(formalEdge.attributes.amountIn) : undefined,
        AmountOut: formalEdge.attributes.amountOut ? Number(formalEdge.attributes.amountOut) : undefined,
        TokenInAddress: formalEdge.attributes.tokenIn || '',
        TokenOutAddress: formalEdge.attributes.tokenOut || '',
        TokenInSymbol: formalEdge.attributes.tokenInSymbol || '',
        TokenOutSymbol: formalEdge.attributes.tokenOutSymbol || '',
      }),
      
      // Lending specific fields (if applicable)
      ...(this.isLendingEdge(formalEdge.type) && {
        From: formalEdge.source,
        To: formalEdge.target,
        Amount: formalEdge.attributes.amount ? Number(formalEdge.attributes.amount) : 0,
      }),
      
      // Flash loan specific fields (critical for BSC attack detection)
      ...(this.isFlashLoanEdge(formalEdge.type) && {
        flashLoanAmount: formalEdge.attributes.amount ? Number(formalEdge.attributes.amount) : 0,
        flashLoanFee: formalEdge.attributes.flashLoanFee ? Number(formalEdge.attributes.flashLoanFee) : 0,
        flashLoanProvider: formalEdge.attributes.flashLoanProvider || formalEdge.attributes.service || '',
        isFlashLoan: true,
        pattern: formalEdge.attributes.pattern || undefined,
      }),
      
      // Bridge specific fields (if applicable)
      ...(this.isBridgeEdge(formalEdge.type) && {
        bridgeContract: formalEdge.attributes.bridgeContract || '',
        destinationChain: formalEdge.attributes.destinationChain || '',
        sourceChain: formalEdge.attributes.sourceChain || '',
        // Zero-value bridge exploit detection
        depositAmount: formalEdge.attributes.depositAmount || formalEdge.attributes.amount || 0,
        mintAmount: formalEdge.attributes.mintAmount || 0,
      }),
      
      // Oracle specific fields (if applicable)
      ...(formalEdge.attributes.isOracle && {
        isOracle: true,
        oraclePrice: formalEdge.attributes.oraclePrice,
      }),
      
      // Additional attributes from formal edge
      ...formalEdge.attributes
    };

    return JSON.stringify(legacyEdgeData);
  }

  /**
   * Convert formal EdgeType to legacy Type string
   */
  private convertEdgeTypeToLegacy(edgeType: EdgeType): string {
    switch (edgeType) {
      case EdgeType.SWAP:
        return 'DEX';
      case EdgeType.BORROW:
      case EdgeType.REPAY:
        return 'Lending';
      case EdgeType.FLASH_LOAN_INIT:
      case EdgeType.FLASH_LOAN_REPAY:
        return 'FlashLoan';
      case EdgeType.BRIDGE_DEPOSIT:
      case EdgeType.BRIDGE_WITHDRAW:
        return 'Bridge';
      case EdgeType.TRANSFER:
        return 'Transfer';
      case EdgeType.LIQUIDATION:
        return 'Liquidation';
      default:
        return 'Unknown';
    }
  }

  /**
   * Determine service name from formal edge
   */
  private getServiceFromEdge(formalEdge: FormalEdge): string {
    // Try to get service from attributes first
    if (formalEdge.attributes.service) {
      return formalEdge.attributes.service;
    }

    // Infer service from edge type and vertex types
    const sourceVertex = this.formalGraph.vertices.get(formalEdge.source);
    const targetVertex = this.formalGraph.vertices.get(formalEdge.target);

    if (sourceVertex?.metadata.protocol) {
      return sourceVertex.metadata.protocol;
    }
    if (targetVertex?.metadata.protocol) {
      return targetVertex.metadata.protocol;
    }

    // Default service names based on edge type
    switch (formalEdge.type) {
      case EdgeType.SWAP:
        return 'Uniswap'; // Default DEX
      case EdgeType.BORROW:
      case EdgeType.REPAY:
        return 'Compound'; // Default lending
      case EdgeType.FLASH_LOAN_INIT:
      case EdgeType.FLASH_LOAN_REPAY:
        return 'dYdX'; // Default flash loan
      default:
        return 'Unknown';
    }
  }

  /**
   * Check if edge type is a lending operation
   */
  private isLendingEdge(edgeType: EdgeType): boolean {
    return edgeType === EdgeType.BORROW || edgeType === EdgeType.REPAY;
  }

  /**
   * Check if edge type is a flash loan operation
   */
  private isFlashLoanEdge(edgeType: EdgeType): boolean {
    return edgeType === EdgeType.FLASH_LOAN_INIT || edgeType === EdgeType.FLASH_LOAN_REPAY;
  }

  /**
   * Check if edge type is a bridge operation
   */
  private isBridgeEdge(edgeType: EdgeType): boolean {
    return edgeType === EdgeType.BRIDGE_DEPOSIT || edgeType === EdgeType.BRIDGE_WITHDRAW;
  }

  /**
   * Helper to get formal edge ID from SequenceEdge (for sorting)
   */
  private getEdgeIdFromSequenceEdge(sequenceEdge: SequenceEdge): string {
    // Generate a consistent ID based on source, target, and some edge data
    const edgeData = JSON.parse(sequenceEdge.name[0]);
    return `${sequenceEdge.w}-${sequenceEdge.v}-${edgeData.timestamp || 0}`;
  }

  /**
   * Clear internal caches when formal graph changes
   */
  public clearCache(): void {
    this.nodeCache.clear();
    this.edgesCache = null;
    this.nodesCache = null;
  }

  /**
   * Factory method to create adapter from formal graph
   */
  static fromFormalGraph(formalGraph: FormalSemanticFinancialGraph, rawEdgeSeq?: SequenceEdge[]): FormalSFGAdapter {
    return new FormalSFGAdapter(formalGraph, rawEdgeSeq);
  }

  /**
   * Get the underlying formal graph (for advanced usage)
   */
  public getFormalGraph(): FormalSemanticFinancialGraph {
    return this.formalGraph;
  }

  // Support for arbitrary properties (legacy compatibility)
  [key: string]: unknown;
}