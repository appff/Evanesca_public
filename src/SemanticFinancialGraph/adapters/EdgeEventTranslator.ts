/**
 * EdgeEventTranslator - Legacy to Formal Format Converter
 * 
 * Translates between legacy edge sequences and formal graph structures
 * while preserving all DSL-required fields and maintaining data integrity.
 */

import {
  SequenceEdge,
  SemanticFinancialEdge,
  DecodedLog
} from '../../SemanticFinancialGraph/Types';
import {
  FormalVertex,
  FormalEdge,
  VertexType,
  EdgeType
} from '../SemanticFinancialGraphSpec';

/**
 * Translation result containing formal graph components
 */
export interface TranslationResult {
  vertices: FormalVertex[];
  edges: FormalEdge[];
  success: boolean;
  errors: string[];
}

/**
 * EdgeEventTranslator handles conversion between legacy and formal formats
 */
export class EdgeEventTranslator {
  
  /**
   * Translate a legacy SequenceEdge to formal graph components
   */
  static translateLegacyEdge(sequenceEdge: SequenceEdge, edgeId?: string): TranslationResult {
    const errors: string[] = [];
    const vertices: FormalVertex[] = [];
    const edges: FormalEdge[] = [];

    try {
      // Parse the edge data from the JSON string
      const edgeData = JSON.parse(sequenceEdge.name[0]);
      
      // Create source and target vertices
      const sourceVertex = this.createVertexFromEdgeData(sequenceEdge.w, edgeData, 'source');
      const targetVertex = this.createVertexFromEdgeData(sequenceEdge.v, edgeData, 'target');
      
      vertices.push(sourceVertex, targetVertex);
      
      // Create formal edge
      const formalEdge = this.createFormalEdgeFromLegacyData(
        edgeId || `${sequenceEdge.w}-${sequenceEdge.v}-${edgeData.timestamp || Date.now()}`,
        sequenceEdge.w,
        sequenceEdge.v,
        edgeData
      );
      
      edges.push(formalEdge);

      return {
        vertices,
        edges,
        success: true,
        errors
      };
      
    } catch (error: any) {
      errors.push(`Failed to translate legacy edge: ${error.message}`);
      return {
        vertices,
        edges,
        success: false,
        errors
      };
    }
  }

  /**
   * Create a formal vertex from edge data and role
   */
  private static createVertexFromEdgeData(
    vertexId: string, 
    edgeData: any, 
    role: 'source' | 'target'
  ): FormalVertex {
    // Determine vertex type from edge data
    const vertexType = this.inferVertexTypeFromEdgeData(vertexId, edgeData, role);
    
    return {
      id: vertexId,
      type: vertexType,
      metadata: {
        address: vertexId,
        protocol: edgeData.Service || edgeData.service || undefined,
        chain: edgeData.chain || 'ethereum',
        // Include additional metadata from edge data
        ...(edgeData.protocol && { protocol: edgeData.protocol }),
        ...(edgeData.poolAddress && { poolAddress: edgeData.poolAddress }),
        ...(edgeData.contractName && { contractName: edgeData.contractName })
      }
    };
  }

  /**
   * Infer vertex type from edge data and context
   */
  private static inferVertexTypeFromEdgeData(
    vertexId: string, 
    edgeData: any, 
    role: 'source' | 'target'
  ): VertexType {
    // Check explicit type information first
    if (edgeData.Type) {
      switch (edgeData.Type) {
        case 'DEX':
          return VertexType.DEX;
        case 'Lending':
          return VertexType.LENDING;
        case 'FlashLoan':
          return VertexType.FLASH_LOAN;
        case 'Bridge':
          return VertexType.BRIDGE;
        default:
          break;
      }
    }

    // Infer from service/protocol
    const service = edgeData.Service || edgeData.service || '';
    if (service) {
      if (this.isDEXProtocol(service)) {
        return VertexType.DEX;
      }
      if (this.isLendingProtocol(service)) {
        return VertexType.LENDING;
      }
      if (this.isFlashLoanProtocol(service)) {
        return VertexType.FLASH_LOAN;
      }
      if (this.isBridgeProtocol(service)) {
        return VertexType.BRIDGE;
      }
    }

    // Infer from action/edge type
    const action = edgeData.Action || edgeData.action || '';
    if (action.includes('swap') || action.includes('exchange')) {
      return VertexType.DEX;
    }
    if (action.includes('borrow') || action.includes('lend') || action.includes('repay')) {
      return VertexType.LENDING;
    }
    if (action.includes('flash')) {
      return VertexType.FLASH_LOAN;
    }
    if (action.includes('bridge')) {
      return VertexType.BRIDGE;
    }

    // Check for token contract addresses (20 bytes hex)
    if (this.isTokenAddress(vertexId)) {
      return VertexType.TOKEN;
    }

    // Check for user addresses (EOAs)
    if (this.isUserAddress(vertexId, edgeData)) {
      return VertexType.USER;
    }

    // Default to protocol if no other match
    return VertexType.PROTOCOL;
  }

  /**
   * Create formal edge from legacy edge data
   */
  private static createFormalEdgeFromLegacyData(
    edgeId: string,
    source: string,
    target: string,
    edgeData: any
  ): FormalEdge {
    // Determine edge type from legacy data
    const edgeType = this.inferEdgeTypeFromLegacyData(edgeData);
    
    return {
      id: edgeId,
      source,
      target,
      type: edgeType,
      timestamp: edgeData.timestamp || Date.now(),
      attributes: {
        // Core attributes
        token: edgeData.token || edgeData.tokenAddress || undefined,
        amount: edgeData.amount && !isNaN(edgeData.amount) ? BigInt(Math.floor(edgeData.amount)) : undefined,
        price: edgeData.price && !isNaN(edgeData.price) ? BigInt(Math.floor(edgeData.price * 1e18)) : undefined, // Convert to Wei
        gasUsed: edgeData.gasUsed && !isNaN(edgeData.gasUsed) ? BigInt(edgeData.gasUsed) : undefined,
        
        // Service/protocol information
        service: edgeData.Service || edgeData.service || undefined,
        protocol: edgeData.protocol || undefined,
        
        // DEX specific attributes
        ...(edgeType === EdgeType.SWAP && {
          amountIn: edgeData.AmountIn && !isNaN(edgeData.AmountIn) ? BigInt(Math.floor(edgeData.AmountIn)) : undefined,
          amountOut: edgeData.AmountOut && !isNaN(edgeData.AmountOut) ? BigInt(Math.floor(edgeData.AmountOut)) : undefined,
          tokenIn: edgeData.TokenInAddress || edgeData.input_token_address || undefined,
          tokenOut: edgeData.TokenOutAddress || edgeData.output_token_address || undefined,
          tokenInSymbol: edgeData.TokenInSymbol || edgeData.input_token_symbol || undefined,
          tokenOutSymbol: edgeData.TokenOutSymbol || edgeData.output_token_symbol || undefined,
        }),

        // Lending specific attributes
        ...(this.isLendingEdgeType(edgeType) && {
          lendingAmount: edgeData.Amount && !isNaN(edgeData.Amount) ? BigInt(Math.floor(edgeData.Amount)) : undefined,
          borrower: edgeData.From || undefined,
          lender: edgeData.To || undefined,
        }),

        // Flash loan specific attributes
        ...(this.isFlashLoanEdgeType(edgeType) && {
          flashLoanFee: edgeData.fee && !isNaN(edgeData.fee) ? BigInt(Math.floor(edgeData.fee)) : undefined,
          flashLoanProvider: edgeData.provider || undefined,
        }),

        // Bridge specific attributes
        ...(this.isBridgeEdgeType(edgeType) && {
          bridgeContract: edgeData.bridgeContract || undefined,
          destinationChain: edgeData.destinationChain || undefined,
          sourceChain: edgeData.sourceChain || 'ethereum',
        }),

        // Oracle information
        ...(edgeData.isOracle && {
          isOracle: true,
          oraclePrice: edgeData.oraclePrice && !isNaN(edgeData.oraclePrice) ? BigInt(Math.floor(edgeData.oraclePrice * 1e18)) : undefined,
        }),

        // USD values (commonly used in DSL constraints)
        totalInUSD: edgeData.total_in_usd || edgeData.totalInUSD || undefined,
        totalOutUSD: edgeData.total_out_usd || edgeData.totalOutUSD || undefined,

        // Preserve all original attributes for complete compatibility
        ...edgeData
      }
    };
  }

  /**
   * Infer EdgeType from legacy edge data
   */
  private static inferEdgeTypeFromLegacyData(edgeData: any): EdgeType {
    const action = (edgeData.Action || edgeData.action || '').toLowerCase();
    const type = (edgeData.Type || '').toLowerCase();
    const service = (edgeData.Service || edgeData.service || '').toLowerCase();

    // Direct action mapping
    if (action.includes('swap') || action.includes('exchange')) {
      return EdgeType.SWAP;
    }
    if (action.includes('borrow')) {
      return EdgeType.BORROW;
    }
    if (action.includes('repay')) {
      return EdgeType.REPAY;
    }
    
    // Enhanced flash loan detection for BSC patterns
    if (action.includes('flashloan') || action.includes('flash')) {
      if (action.includes('repay') || action.includes('return')) {
        return EdgeType.FLASH_LOAN_REPAY;
      }
      return EdgeType.FLASH_LOAN_INIT;
    }
    // BSC-specific flash loan patterns (Fortress, Venus, etc.)
    if (action.includes('flashborrow') || service.includes('fortress')) {
      return EdgeType.FLASH_LOAN_INIT;
    }
    if (action.includes('flashrepay')) {
      return EdgeType.FLASH_LOAN_REPAY;
    }
    
    // Enhanced bridge detection for exploits like Qubit
    if (action.includes('bridge') || service.includes('bridge') || service.includes('qubit')) {
      if (action.includes('withdraw') || action.includes('mint')) {
        return EdgeType.BRIDGE_WITHDRAW;
      }
      return EdgeType.BRIDGE_DEPOSIT;
    }
    // Zero-value bridge exploit pattern
    if (action.includes('deposit') && service.includes('bridge')) {
      return EdgeType.BRIDGE_DEPOSIT;
    }
    
    if (action.includes('liquidation') || action.includes('liquidate')) {
      return EdgeType.LIQUIDATION;
    }

    // Type-based mapping
    if (type === 'dex') {
      return EdgeType.SWAP;
    }
    if (type === 'lending') {
      // Default to borrow if not specified
      return EdgeType.BORROW;
    }
    if (type === 'flashloan' || type === 'flash') {
      return EdgeType.FLASH_LOAN_INIT;
    }
    if (type === 'bridge') {
      return EdgeType.BRIDGE_DEPOSIT;
    }

    // Check for specific field combinations
    if (edgeData.AmountIn && edgeData.AmountOut) {
      return EdgeType.SWAP;
    }
    if (edgeData.Amount && (edgeData.From || edgeData.To)) {
      return EdgeType.BORROW; // Default lending operation
    }
    
    // BSC Pattern 4b swap detection
    if (edgeData.pattern === '4b' || (service.includes('pancake') && type === 'dex')) {
      return EdgeType.SWAP;
    }

    // Default to transfer
    return EdgeType.TRANSFER;
  }

  /**
   * Normalize decoded log to formal event structure
   */
  static normalizeEvent(decodedLog: DecodedLog, semanticModel: any): any {
    // This method would extract and normalize event data
    // from decoded blockchain logs for formal graph construction
    return {
      address: decodedLog.address,
      blockNumber: decodedLog.blockNumber,
      transactionHash: decodedLog.transactionHash,
      // ... additional normalization logic based on semantic model
    };
  }

  // Helper methods for protocol/service classification
  private static isDEXProtocol(protocol: string): boolean {
    const dexProtocols = ['uniswap', 'sushiswap', 'curve', 'balancer', 'pancakeswap', 'kyber', 'biswap', 'apeswap'];
    return dexProtocols.some(p => protocol.toLowerCase().includes(p));
  }

  private static isLendingProtocol(protocol: string): boolean {
    const lendingProtocols = ['compound', 'aave', 'cream', 'bzx', 'venus', 'fortress'];
    return lendingProtocols.some(p => protocol.toLowerCase().includes(p));
  }

  private static isFlashLoanProtocol(protocol: string): boolean {
    const flashLoanProtocols = ['dydx', 'aave', 'compound', 'uniswap', 'fortress', 'venus', 'pancakeswap'];
    return flashLoanProtocols.some(p => protocol.toLowerCase().includes(p));
  }

  private static isBridgeProtocol(protocol: string): boolean {
    const bridgeProtocols = ['polygon', 'arbitrum', 'optimism', 'avalanche', 'qubit', 'meter', 'allbridge', 'multichain', 'stargate', 'wormhole'];
    return bridgeProtocols.some(p => protocol.toLowerCase().includes(p));
  }

  private static isTokenAddress(address: string): boolean {
    // Simple heuristic: 20-byte hex addresses starting with 0x
    return /^0x[a-fA-F0-9]{40}$/.test(address);
  }

  private static isUserAddress(address: string, edgeData: any): boolean {
    // Heuristic: if it's not a known protocol and not a token contract
    return this.isTokenAddress(address) && 
           !edgeData.Service && 
           !edgeData.protocol;
  }

  // Edge type helpers
  private static isLendingEdgeType(edgeType: EdgeType): boolean {
    return edgeType === EdgeType.BORROW || edgeType === EdgeType.REPAY;
  }

  private static isFlashLoanEdgeType(edgeType: EdgeType): boolean {
    return edgeType === EdgeType.FLASH_LOAN_INIT || edgeType === EdgeType.FLASH_LOAN_REPAY;
  }

  private static isBridgeEdgeType(edgeType: EdgeType): boolean {
    return edgeType === EdgeType.BRIDGE_DEPOSIT || edgeType === EdgeType.BRIDGE_WITHDRAW;
  }
}