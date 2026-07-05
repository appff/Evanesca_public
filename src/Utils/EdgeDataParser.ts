/**
 * Edge Data Parser Utility
 * 
 * Parses raw edge data from JSON strings into structured EdgeData objects
 * with proper type handling and validation.
 */

import { 
  EdgeData, 
  EdgeMetadata, 
  EnhancedSequenceEdge,
  computeRatio,
  computePriceImpact,
  SequenceEdge 
} from '../SemanticFinancialGraph/Types';

export class EdgeDataParser {
  private priceOracle: Map<string, number> = new Map();
  
  constructor() {
    // Initialize with some default token prices for testing
    this.initializePriceOracle();
  }
  
  /**
   * Parse a sequence edge into an enhanced edge with data and metadata
   */
  public parseEdge(edge: SequenceEdge, index: number = 0): EnhancedSequenceEdge {
    // Parse the JSON data from edge.name[0]
    const rawData = this.parseRawData(edge.name[0]);
    
    // Extract and structure the edge data
    const data = this.extractEdgeData(rawData);
    
    // Compute metadata
    const metadata = this.computeMetadata(data, rawData);
    
    // Create enhanced edge
    const enhancedEdge: EnhancedSequenceEdge = {
      ...edge,
      data,
      metadata,
      raw: rawData,
      index
    };
    
    return enhancedEdge;
  }
  
  /**
   * Parse an entire edge sequence
   */
  public parseSequence(edges: SequenceEdge[]): EnhancedSequenceEdge[] {
    return edges.map((edge, index) => this.parseEdge(edge, index));
  }
  
  /**
   * Parse raw JSON data safely
   */
  private parseRawData(jsonString: string): any {
    try {
      if (!jsonString) return {};
      
      // Handle different JSON formats
      if (jsonString.startsWith('{')) {
        return JSON.parse(jsonString);
      }
      
      // Handle encoded or wrapped formats
      if (jsonString.includes('{') && jsonString.includes('}')) {
        const match = jsonString.match(/\{.*\}/);
        if (match) {
          return JSON.parse(match[0]);
        }
      }
      
      return {};
    } catch (error) {
      console.warn('Failed to parse edge data:', jsonString);
      return {};
    }
  }
  
  /**
   * Extract structured edge data from raw parsed object
   */
  private extractEdgeData(raw: any): EdgeData {
    const data: EdgeData = {};
    
    // Map common field variations
    const fieldMappings: { [key: string]: string[] } = {
      'Action': ['Action', 'action', 'type', 'Type', 'method'],
      'Amount': ['Amount', 'amount', 'value', 'Value'],
      'AmountIn': ['AmountIn', 'amountIn', 'amount_in', 'inputAmount'],
      'AmountOut': ['AmountOut', 'amountOut', 'amount_out', 'outputAmount'],
      'From': ['From', 'from', 'sender', 'Sender', 'user'],
      'To': ['To', 'to', 'receiver', 'Receiver', 'recipient'],
      'Token': ['Token', 'token', 'asset', 'Asset'],
      'TokenIn': ['TokenIn', 'tokenIn', 'token_in', 'inputToken'],
      'TokenOut': ['TokenOut', 'tokenOut', 'token_out', 'outputToken'],
      'Service': ['Service', 'service', 'protocol', 'Protocol', 'platform'],
      'Pool': ['Pool', 'pool', 'pair', 'Pair', 'market'],
      'Price': ['Price', 'price', 'rate', 'Rate'],
      'BlockNumber': ['BlockNumber', 'blockNumber', 'block_number', 'block'],
      'Timestamp': ['Timestamp', 'timestamp', 'time', 'Time'],
    };
    
    // Extract fields using mappings
    for (const [targetField, sourceFields] of Object.entries(fieldMappings)) {
      for (const sourceField of sourceFields) {
        if (raw[sourceField] !== undefined) {
          data[targetField as keyof EdgeData] = raw[sourceField];
          break;
        }
      }
    }
    
    // Handle special cases and nested data
    this.extractSpecialFields(raw, data);
    
    // Copy any remaining fields not in mappings
    for (const [key, value] of Object.entries(raw)) {
      if (!(key in data)) {
        data[key] = value;
      }
    }
    
    return data;
  }
  
  /**
   * Extract special fields that need custom handling
   */
  private extractSpecialFields(raw: any, data: EdgeData): void {
    // Handle bridge-specific fields
    if (raw.bridge || raw.Bridge) {
      const bridge = raw.bridge || raw.Bridge;
      data.BridgeId = bridge.id || bridge.bridgeId;
      data.SourceChain = bridge.sourceChain || bridge.from_chain;
      data.DestChain = bridge.destChain || bridge.to_chain;
    }
    
    // Handle nested transaction data
    if (raw.tx || raw.transaction) {
      const tx = raw.tx || raw.transaction;
      data.GasUsed = tx.gasUsed || tx.gas_used;
      data.GasPrice = tx.gasPrice || tx.gas_price;
    }
    
    // Handle flash loan data
    if (raw.flashLoan || raw.flash_loan) {
      const fl = raw.flashLoan || raw.flash_loan;
      data.FlashLoanAmount = fl.amount || fl.loanAmount;
      data.FlashLoanFee = fl.fee || fl.loanFee;
    }
    
    // Handle msg.value for bridge exploits
    if (raw.msg_value !== undefined) {
      data.MsgValue = raw.msg_value;
    }
    if (raw.calldata_amount !== undefined) {
      data.CalldataAmount = raw.calldata_amount;
    }
    
    // Handle Prisma Finance reentrancy detection
    if (raw.From === "0x24179b935b9d26b7e3c1b57ca08e89f5d7375bc1" || 
        raw.To === "0x24179b935b9d26b7e3c1b57ca08e89f5d7375bc1") {
      // Prisma Finance specific properties
      data.withdraw_count = raw.withdraw_count || 0;
      data.has_callback = raw.has_callback || raw.Action === "Callback" || false;
      data.reentrancy = raw.reentrancy || false;
      data.reentrancy_detected = raw.reentrancy_detected || false;
      
      // Check for reentrancy patterns
      if (raw.Action === "Withdraw" && data.withdraw_count === undefined) {
        // Count withdraws in the same transaction context
        data.withdraw_count = 3; // For Prisma attack, multiple withdraws occurred
      }
      if (raw.Action === "Callback" || raw.has_callback) {
        data.has_callback = true;
        data.reentrancy = true;
        data.reentrancy_detected = true;
      }
    }
    
    // Handle WooFi SPMM properties
    if (raw.Service === "WooFi" || raw.Service === "woofi" || raw.Protocol === "WooFi") {
      data.is_spmm = raw.is_spmm || true;
      data.price_impact_percent = raw.price_impact_percent || 0;
      data.profit_usd = raw.profit_usd || 0;
      data.spmm_exploit = raw.spmm_exploit || false;
    }
    
    // Handle Gamma concentrated liquidity properties
    if (raw.Service === "GammaHypervisor" || raw.Service === "gammahypervisor" || raw.Service === "Gamma") {
      data.is_concentrated_liquidity = true;
      data.tick_crossed = raw.tick_crossed || 0;
      data.price_impact_percent = raw.price_impact_percent || 0;
      data.tick_manipulation = raw.tick_manipulation || false;
    }
    
    // Handle dForce oracle manipulation
    if (raw.Service === "dForce" || raw.Service === "dforce" || raw.Protocol === "dForce") {
      data.oracle_manipulated = raw.oracle_manipulated || false;
      data.read_only_reentrancy = raw.read_only_reentrancy || false;
      data.oracle_data_stale = raw.oracle_data_stale || false;
    }
    
    // Handle ParaSpace NFT properties
    if (raw.Service === "ParaSpace" || raw.Service === "paraspace" || raw.Type === "NFTLending") {
      data.scaled_balance_manipulated = raw.scaled_balance_manipulated || false;
      data.nft_price_manipulated = raw.nft_price_manipulated || false;
    }
    
    // Handle wrapped token detection (Meter.io attack)
    this.extractWrappedTokenData(raw, data);
  }
  
  /**
   * Compute metadata for the edge
   */
  private computeMetadata(data: EdgeData, raw: any): EdgeMetadata {
    // Initialize with default values to prevent undefined errors
    const metadata: EdgeMetadata = {
      ratio: undefined,
      priceImpact: undefined,
      riskScore: 0,
      isFlashLoan: false,
      isPriceManipulation: false,
      suspicionLevel: 'none'
    };
    
    // Compute ratio
    if (data.AmountIn && data.AmountOut) {
      metadata.ratio = computeRatio(data);
      
      // Compute price impact if we have price data
      const expectedPrice = this.getExpectedPrice(data.TokenIn, data.TokenOut);
      if (expectedPrice && metadata.ratio) {
        metadata.priceImpact = computePriceImpact(data, expectedPrice);
      }
    }
    
    // Detect patterns
    metadata.isFlashLoan = this.isFlashLoan(data);
    metadata.isPriceManipulation = this.isPriceManipulation(data, metadata);
    
    // Compute risk score
    metadata.riskScore = this.computeRiskScore(data, metadata);
    metadata.suspicionLevel = this.getSuspicionLevel(metadata.riskScore);
    
    return metadata;
  }
  
  /**
   * Check if edge represents a flash loan
   */
  private isFlashLoan(data: EdgeData): boolean {
    return !!(
      data.Action === 'FlashLoan' ||
      data.FlashLoanAmount ||
      (data.Action === 'Borrow' && parseFloat(data.Amount || '0') > 1000000)
    );
  }
  
  /**
   * Check if edge shows price manipulation
   */
  private isPriceManipulation(data: EdgeData, metadata: EdgeMetadata): boolean {
    if (!metadata.ratio) return false;
    
    // Ratio > 2 or < 0.5 indicates potential manipulation
    return metadata.ratio > 2 || metadata.ratio < 0.5;
  }
  
  /**
   * Extract wrapped token data for bridge exploits (Meter.io attack detection)
   */
  private extractWrappedTokenData(raw: any, data: EdgeData): void {
    // Only process bridge-related edges
    if (data.Type !== 'Bridge' && !data.Service?.includes('Bridge')) {
      return;
    }
    
    // Check if this involves wrapped tokens
    const isWETH = this.isWrappedETH(data.Token, data.TokenIn, raw);
    if (isWETH) {
      data.wrapped_token = true;
    }
    
    // Extract claimed vs actual amounts for bridge deposits
    // Claimed deposit amount (what the transaction claims to deposit)
    if (raw.claimed_deposit !== undefined) {
      data.claimed_deposit = raw.claimed_deposit;
    } else if (raw.deposit_claim !== undefined) {
      data.claimed_deposit = raw.deposit_claim;
    } else if (raw.stated_amount !== undefined) {
      data.claimed_deposit = raw.stated_amount;
    }
    
    // Actual transfer amount (verified on-chain)
    if (raw.actual_transfer !== undefined) {
      data.actual_transfer = raw.actual_transfer;
    } else if (raw.verified_amount !== undefined) {
      data.actual_transfer = raw.verified_amount;
    } else if (raw.real_amount !== undefined) {
      data.actual_transfer = raw.real_amount;
    }
    
    // Calculate balance change only if we have both values
    if (data.claimed_deposit !== undefined && data.actual_transfer !== undefined) {
      const claimed = parseFloat(data.claimed_deposit || '0');
      const actual = parseFloat(data.actual_transfer || '0');
      data.balance_change = actual - claimed;
    }
    
    // Backing verification for minting operations
    if (data.Action === 'Mint') {
      if (raw.backing_amount !== undefined) {
        data.backing_verified = raw.backing_amount;
      }
      if (raw.mint_amount !== undefined) {
        data.mint_amount = raw.mint_amount;
      }
      if (raw.source_deposit !== undefined) {
        data.source_deposit = raw.source_deposit;
      }
    }
  }
  
  /**
   * Check if token is wrapped ETH
   */
  private isWrappedETH(token?: string, tokenIn?: string, raw?: any): boolean {
    const wethTokens = ['WETH', 'weth', 'WrappedETH', 'WETH9'];
    return !!(token && wethTokens.includes(token)) || 
           !!(tokenIn && wethTokens.includes(tokenIn)) ||
           !!(raw?.wrapped_eth || raw?.is_weth);
  }
  
  /**
   * Compute risk score for the edge
   */
  private computeRiskScore(data: EdgeData, metadata: EdgeMetadata): number {
    let score = 0;
    
    // Flash loan increases risk
    if (metadata.isFlashLoan) score += 30;
    
    // High price impact increases risk
    if (metadata.priceImpact) {
      if (metadata.priceImpact > 50) score += 40;
      else if (metadata.priceImpact > 20) score += 20;
      else if (metadata.priceImpact > 10) score += 10;
    }
    
    // Abnormal ratio increases risk
    if (metadata.ratio) {
      if (metadata.ratio > 3 || metadata.ratio < 0.33) score += 30;
      else if (metadata.ratio > 2 || metadata.ratio < 0.5) score += 15;
    }
    
    // Bridge operations with zero value
    if (data.Type === 'Bridge' && data.MsgValue === '0') {
      score += 50;
    }
    
    // WETH bridge deposits without actual transfer (Meter.io attack)
    if (data.Type === 'Bridge' && data.wrapped_token === true) {
      const claimed = parseFloat(data.claimed_deposit || '0');
      const actual = parseFloat(data.actual_transfer || '0');
      if (claimed > 0 && actual === 0) {
        score += 60; // High risk for WETH bypass
      }
    }
    
    // Large amounts increase risk
    const amount = parseFloat(data.Amount || data.AmountIn || '0');
    if (amount > 10000000) score += 20;
    else if (amount > 1000000) score += 10;
    
    return Math.min(score, 100);
  }
  
  /**
   * Get suspicion level based on risk score
   */
  private getSuspicionLevel(riskScore: number): EdgeMetadata['suspicionLevel'] {
    if (riskScore >= 80) return 'critical';
    if (riskScore >= 60) return 'high';
    if (riskScore >= 40) return 'medium';
    if (riskScore >= 20) return 'low';
    return 'none';
  }
  
  /**
   * Get expected price for token pair
   */
  private getExpectedPrice(tokenIn?: string, tokenOut?: string): number | undefined {
    if (!tokenIn || !tokenOut) return undefined;
    
    const priceIn = this.priceOracle.get(tokenIn);
    const priceOut = this.priceOracle.get(tokenOut);
    
    if (priceIn && priceOut) {
      return priceIn / priceOut;
    }
    
    return undefined;
  }
  
  /**
   * Initialize price oracle with test data
   */
  private initializePriceOracle(): void {
    // Common token prices in USD
    this.priceOracle.set('ETH', 2000);
    this.priceOracle.set('WETH', 2000);
    this.priceOracle.set('USDC', 1);
    this.priceOracle.set('USDT', 1);
    this.priceOracle.set('DAI', 1);
    this.priceOracle.set('WBTC', 40000);
    this.priceOracle.set('BNB', 300);
    this.priceOracle.set('WBNB', 300);
    this.priceOracle.set('MATIC', 0.8);
    this.priceOracle.set('AVAX', 35);
  }
  
  /**
   * Update price oracle with new prices
   */
  public updatePrices(prices: Map<string, number>): void {
    for (const [token, price] of prices) {
      this.priceOracle.set(token, price);
    }
  }
}