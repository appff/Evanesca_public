/**
 * Core type definitions for DeFi Semantic Financial Graph system
 * 
 * This file centralizes type definitions to eliminate 'any' types across
 * the codebase and improve type safety for the semantic financial graph system.
 */

import { IDEXEdge, ILendingEdge, ISemanticFinancialEdge } from '../Interfaces/IEdge';

// =============================================================================
// Edge and Graph Types
// =============================================================================

/**
 * Union type for all semantic financial edge types
 */
export type SemanticFinancialEdge = IDEXEdge | ILendingEdge;

/**
 * Graph sequence edge representation
 */
export interface SequenceEdge {
  w: string;  // Source node
  v: string;  // Target node  
  name: string[];  // Edge data (JSON string array)
}

/**
 * Graph node representation
 */
export interface GraphNode {
  Type: 'DEX' | 'Lending' | string;
  [key: string]: unknown;
}

/**
 * Semantic financial graph interface
 */
export interface SemanticFinancialGraph {
  node(id: string): GraphNode;
  edge(source: string, target: string): SequenceEdge | undefined;
  nodes(): string[];
  edges(): SequenceEdge[];
  [key: string]: unknown;
}

/**
 * Edge sequence type for analysis
 */
export type EdgeSequence = SequenceEdge[];

// =============================================================================
// DSL Execution Context Types  
// =============================================================================

/**
 * User state in lending protocols
 */
export interface UserState {
  balance: number;
  collateral: number;
}

/**
 * Edge context for constraint evaluation
 */
export interface EdgeContext {
  type: string;
  action: string;
  isFirstSwap?: boolean;
  [key: string]: unknown;
}

/**
 * DSL constraint execution context
 */
export interface ExecutionContext {
  edge?: EdgeContext;
  user?: UserState;
  graph?: GraphNode;
  blockNo?: number;
  total_in_usd?: number;
  total_out_usd?: number;

  // Token information (DEX)
  input_token_symbol?: string;
  input_token_amount?: number;
  input_token_raw?: string;
  input_token_address?: string;
  output_token_symbol?: string;
  output_token_amount?: number;
  output_token_raw?: string;
  output_token_address?: string;

  // Token information (Lending)
  token_symbol?: string;
  token_amount?: number;
  token_raw?: string;
  token_address?: string;
  action?: string;

  // Temporal window support (Phase 2.9 - MiCA regulation compliance)
  edges?: any[];                    // All edges in current transaction for temporal constraints
  window_start_block?: number;      // Start block for BLOCK_WINDOW constraints
  window_end_block?: number;        // End block for BLOCK_WINDOW constraints
  currentBlockNumber?: number;      // Alias for edge.block_number

  // Additional context
  [key: string]: unknown;
}

/**
 * Expression value types in DSL - Extended for Phase 3 language enhancement
 */
export type ExpressionValue = string | number | boolean | null | undefined | ExpressionValue[] | {[key: string]: ExpressionValue} | unknown;

/**
 * Expression variables map
 */
export interface ExpressionVariables {
  [key: string]: ExpressionValue;
}

/**
 * DSL constraint interface
 */
export interface DSLConstraint {
  name: string;
  when: string;
  condition: { [key: string]: ExpressionValue };
  violation: string;
  message: string;
}

// =============================================================================
// Transaction and Log Types
// =============================================================================

/**
 * Decoded transaction log
 */
export interface DecodedLog {
  address: string;
  topics: string[];
  data: string;
  blockNumber?: number;
  transactionHash?: string;
  [key: string]: unknown;
}

/**
 * Transaction log (raw)  
 */
export interface TransactionLog {
  address: string;
  topics: string[];
  data: string;
  logIndex?: number;
  transactionIndex?: number;
  blockHash?: string;
  blockNumber?: number;
  transactionHash?: string;
}

// =============================================================================
// Analysis Result Types
// =============================================================================

/**
 * Token balance information
 */
export interface TokenBalance {
  token: string;
  symbol?: string;
  amount: number;
  normalizedAmount: number;
  usdValue: number;
  address?: string;
}

/**
 * Participant balance analysis result
 */
export interface ParticipantBalance {
  address: string;
  totalUsdValue: number;
  tokens: TokenBalance[];
}

/**
 * Flash loan cycle information
 */
export interface FlashLoanCycle {
  borrower: string;
  repayer: string;
  token: string;
  amount: number;
  protocol: string;
  fee?: number;
}

/**
 * Constraint violation details
 */
export interface ConstraintViolationDetails {
  constraint: string;
  conditionVars: { [key: string]: ExpressionValue };
  violatedCondition: string;
}

/**
 * Helper function to safely get number value from ExpressionValue
 */
export function getNumberValue(value: ExpressionValue): number {
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = parseFloat(value);
    return isNaN(parsed) ? 0 : parsed;
  }
  return 0;
}

/**
 * Constraint evaluation result
 */
export interface ConstraintResult {
  violated: boolean;
  message?: string;
  details?: ConstraintViolationDetails;
}

// =============================================================================
// Pattern Detection Types
// =============================================================================

/**
 * Attack pattern detection result
 */
export interface AttackPattern {
  pattern: string;
  confidence: number;
  risk_score: number;
  profit: number; 
  description: string;
  evidence: unknown[];
}

/**
 * Transaction context for pattern detection
 */
export interface TransactionContext {
  blockNumber: number;
  timestamp: number;
  from: string;
  hash: string;
  gasUsed: number;
  gasPrice: number;
}

// =============================================================================
// Cache and Configuration Types
// =============================================================================

/**
 * Generic cache entry
 */
export interface CacheEntry<T = unknown> {
  data: T;
  timestamp: number;
  ttl?: number;
}

/**
 * Price cache entry
 */
export interface PriceCacheEntry extends CacheEntry<number> {
  token: string;
  blockNumber: number;
  source: string;
}

/**
 * Token metadata
 */
export interface TokenMetadata {
  symbol: string;
  decimals: number;
  address: string;
  name?: string;
  price?: number;
}

// =============================================================================
// Type Guards
// =============================================================================

/**
 * Type guard for DEX edges
 */
export function isDEXEdge(edge: SemanticFinancialEdge): edge is IDEXEdge {
  return 'AmountIn' in edge && 'AmountOut' in edge;
}

/**
 * Type guard for Lending edges  
 */
export function isLendingEdge(edge: SemanticFinancialEdge): edge is ILendingEdge {
  return 'Amount' in edge && 'From' in edge && 'To' in edge;
}

/**
 * Type guard for sequence edges
 */
export function isSequenceEdge(obj: unknown): obj is SequenceEdge {
  return typeof obj === 'object' && obj !== null &&
         'w' in obj && 'v' in obj && 'name' in obj &&
         Array.isArray((obj as SequenceEdge).name);
}

/**
 * Type guard for graph nodes
 */
export function isGraphNode(obj: unknown): obj is GraphNode {
  return typeof obj === 'object' && obj !== null && 'Type' in obj;
}

// =============================================================================
// Dynamic Edge Properties (from EnhancedSemanticFinancialGraphTypes)
// =============================================================================

/**
 * Edge data containing all parsed properties from the transaction
 */
export interface EdgeData {
  // Common DeFi actions
  Action?: string;
  Type?: string;
  
  // Amounts
  Amount?: string;
  AmountIn?: string;
  AmountOut?: string;
  AmountInMax?: string;
  AmountOutMin?: string;
  
  // Tokens
  Token?: string;
  TokenIn?: string;
  TokenOut?: string;
  TokenA?: string;
  TokenB?: string;
  
  // Addresses
  From?: string;
  To?: string;
  Sender?: string;
  Receiver?: string;
  Liquidator?: string;
  Borrower?: string;
  
  // Protocol/Service info
  Service?: string;
  Protocol?: string;
  Pool?: string;
  Pair?: string;
  Market?: string;
  
  // Prices and rates
  Price?: string;
  PriceIn?: string;
  PriceOut?: string;
  ExchangeRate?: string;
  InterestRate?: string;
  
  // Bridge specific
  SourceChain?: string;
  DestChain?: string;
  BridgeId?: string;
  MsgValue?: string;
  CalldataAmount?: string;
  
  // Lending specific
  CollateralAmount?: string;
  BorrowAmount?: string;
  RepayAmount?: string;
  LiquidationAmount?: string;
  HealthFactor?: string;
  
  // Flash loan specific
  FlashLoanAmount?: string;
  FlashLoanFee?: string;
  
  // Metadata
  BlockNumber?: number;
  Timestamp?: number;
  GasUsed?: string;
  GasPrice?: string;
  
  // Allow arbitrary properties
  [key: string]: any;
}

/**
 * Metadata about the edge for analysis
 */
export interface EdgeMetadata {
  // Computed properties
  ratio?: number;           // AmountOut / AmountIn
  priceImpact?: number;     // Price impact percentage
  profitAmount?: number;    // Calculated profit
  profitRatio?: number;     // Profit ratio
  exchangeRateImpact?: number; // Exchange rate manipulation impact
  priceDeviation?: number; // Price deviation from oracle
  tickDeviation?: number; // Tick deviation in concentrated liquidity pools
  
  // Statistical properties
  isOutlier?: boolean;
  standardDeviations?: number;
  percentileRank?: number;
  
  // Pattern detection
  isFlashLoan?: boolean;
  isFlashSwap?: boolean;
  isSandwichAttack?: boolean;
  isArbitrage?: boolean;
  isPriceManipulation?: boolean;
  tickManipulation?: boolean;
  coverageRatioManipulation?: boolean;
  oracleManipulation?: boolean;
  nftPriceManipulation?: boolean;
  
  // Risk scores
  riskScore?: number;
  suspicionLevel?: 'none' | 'low' | 'medium' | 'high' | 'critical';
  
  // Timestamps
  processingTime?: number;
  analysisTime?: number;
}

/**
 * Enhanced sequence edge with parsed data and metadata
 */
export interface EnhancedSequenceEdge extends SequenceEdge {
  // Parsed edge data
  data: EdgeData;
  
  // Computed metadata
  metadata: EdgeMetadata;
  
  // Original raw data (for debugging)
  raw?: any;
  
  // Edge index in sequence
  index?: number;
  
  // Related edges (for pattern detection)
  relatedEdges?: string[];
}

/**
 * Statistical data for the entire graph
 */
export interface GraphStatistics {
  // Basic stats
  edgeCount: number;
  nodeCount: number;
  totalVolume: number;
  
  // Swap statistics
  swapCount: number;
  avgSwapRatio: number;
  maxSwapRatio: number;
  minSwapRatio: number;
  stdDevSwapRatio: number;
  
  // Price statistics
  avgPriceImpact: number;
  maxPriceImpact: number;
  
  // Timing statistics
  timeSpan: number;  // milliseconds
  transactionsPerSecond: number;
  
  // Protocol distribution
  protocolCounts: Map<string, number>;
  actionCounts: Map<string, number>;
}

/**
 * Detected pattern in the graph
 */
export interface DetectedPattern {
  type: 'flash_loan' | 'sandwich' | 'arbitrage' | 'liquidation' | 'reentrancy' | 'bridge_exploit';
  confidence: number;  // 0-1
  edges: number[];     // Edge indices involved
  description: string;
  evidence: string[];
}

/**
 * Helper functions for edge data
 */
export function isEnhancedSequenceEdge(edge: SequenceEdge | EnhancedSequenceEdge): edge is EnhancedSequenceEdge {
  return 'data' in edge && 'metadata' in edge;
}

export function hasAmount(data: EdgeData): boolean {
  return !!(data.Amount || data.AmountIn || data.AmountOut);
}

export function isSwapEdge(data: EdgeData): boolean {
  return data.Action === 'Swap' || data.Type === 'Swap';
}

export function isFlashLoanEdge(data: EdgeData): boolean {
  return data.Action === 'FlashLoan' || data.Type === 'FlashLoan' || !!data.FlashLoanAmount;
}

export function isBridgeEdge(data: EdgeData): boolean {
  return data.Type === 'Bridge' || !!data.BridgeId || !!data.SourceChain;
}

export function computeRatio(data: EdgeData): number | undefined {
  const amountIn = parseFloat(data.AmountIn || '0');
  const amountOut = parseFloat(data.AmountOut || '0');
  
  if (amountIn > 0) {
    return amountOut / amountIn;
  }
  
  return undefined;
}

export function computePriceImpact(data: EdgeData, expectedPrice: number): number | undefined {
  const ratio = computeRatio(data);
  
  if (ratio !== undefined && expectedPrice > 0) {
    return Math.abs((ratio - expectedPrice) / expectedPrice) * 100;
  }
  
  return undefined;
}

export function computeProfit(sequence: EnhancedSequenceEdge[], address: string): number {
  let totalIn = 0;
  let totalOut = 0;
  
  for (const edge of sequence) {
    if (edge.data.From === address) {
      totalOut += parseFloat(edge.data.AmountOut || edge.data.Amount || '0');
    }
    if (edge.data.To === address) {
      totalIn += parseFloat(edge.data.AmountIn || edge.data.Amount || '0');
    }
  }
  
  return totalIn - totalOut;
}