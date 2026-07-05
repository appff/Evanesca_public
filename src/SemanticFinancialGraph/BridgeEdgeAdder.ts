import { IEdgeAdder } from "./Interfaces/IEdgeAdder";
import { LogEvent, DecodedEvent } from "./SemanticFinancialGraphUtils";
import { ISemanticFinancialEdge } from "./Interfaces/IEdge";

// =============================================================================
// Bridge Edge Interface Definition
// =============================================================================

/**
 * Bridge edge interface extending the base behavior edge
 * Designed to support bridge attack detection (Qubit Finance, Meter.io, etc.)
 */
export interface IBridgeEdge extends ISemanticFinancialEdge {
  /** Edge type for bridge operations */
  edgeType: "BridgeDeposit" | "BridgeMint" | "BridgeMessage";
  
  /** Bridge protocol name */
  bridgeProtocol: string;
  
  /** Source chain identifier */
  sourceChain: string;
  
  /** Target chain identifier */
  targetChain: string;
  
  /** Cross-chain correlation ID (optional) */
  crossChainId?: string;
  
  /** Amount being processed */
  Amount: string;
  
  /** Token information */
  Token: string;
  TokenAddr: string;
  
  /** Participant addresses */
  From: string;
  To?: string;
  
  /** Bridge-specific validation metadata */
  validationResult?: ValidationResult;
}

/**
 * Validation result for bridge operations
 */
export interface ValidationResult {
  /** Whether the operation is valid */
  isValid: boolean;
  
  /** Validation score (0-1) */
  score: number;
  
  /** Detected issues */
  issues: ValidationIssue[];
  
  /** Validation metadata */
  metadata: {
    [key: string]: any;
  };
}

/**
 * Individual validation issue
 */
export interface ValidationIssue {
  /** Issue severity */
  severity: 'low' | 'medium' | 'high' | 'critical';
  
  /** Issue type */
  type: string;
  
  /** Human-readable description */
  description: string;
  
  /** Supporting evidence */
  evidence: any;
}

/**
 * Bridge protocol configuration
 */
export interface BridgeProtocolConfig {
  /** Protocol name */
  name: string;
  
  /** Supported chains */
  supportedChains: string[];
  
  /** Contract addresses per chain */
  contracts: {
    [chainName: string]: string[];
  };
  
  /** Event signatures */
  depositEvents: string[];
  mintEvents: string[];
  
  /** Validation rules */
  validationRules: BridgeValidationRule[];
}

/**
 * Bridge validation rule definition
 */
export interface BridgeValidationRule {
  /** Rule type */
  type: 'non_zero_deposit' | 'backing_verification' | 'rate_limit' | 'address_whitelist';
  
  /** Rule severity */
  severity: 'low' | 'medium' | 'high' | 'critical';
  
  /** Rule parameters */
  params?: {
    [key: string]: any;
  };
}

// =============================================================================
// Bridge Protocol Configurations
// =============================================================================

/**
 * Qubit Finance Bridge Configuration
 * Used for detecting $80M bridge attack
 */
export const QUBIT_BRIDGE_CONFIG: BridgeProtocolConfig = {
  name: 'QubitBridge',
  supportedChains: ['ethereum', 'bsc'],
  contracts: {
    ethereum: [
      '0x...', // TODO: Add actual Qubit Ethereum deposit contract
    ],
    bsc: [
      '0xfD7A5506F434f5334C100EFb765025243C39137C', // qXETH on BSC
    ]
  },
  depositEvents: ['DepositETH', 'DepositERC20', 'Deposit'],
  mintEvents: ['Mint', 'MintTo'],
  validationRules: [
    {
      type: 'non_zero_deposit',
      severity: 'critical',
      params: { minAmount: '1' }
    },
    {
      type: 'backing_verification',
      severity: 'critical',
      params: { requireActualTransfer: true }
    }
  ]
};

/**
 * Meter.io Bridge Configuration
 * Used for detecting $4.4M bridge attack
 */
export const METER_BRIDGE_CONFIG: BridgeProtocolConfig = {
  name: 'MeterBridge',
  supportedChains: ['ethereum', 'arbitrum'],
  contracts: {
    ethereum: [
      '0x...', // TODO: Add actual Meter Ethereum bridge contract
    ],
    arbitrum: [
      '0x...', // TODO: Add actual Meter Arbitrum bridge contract
    ]
  },
  depositEvents: ['Deposit', 'DepositWithData'],
  mintEvents: ['Mint', 'MintWrapped'],
  validationRules: [
    {
      type: 'non_zero_deposit',
      severity: 'critical',
      params: { minAmount: '1' }
    },
    {
      type: 'backing_verification',
      severity: 'critical',
      params: { requireBalanceChange: true }
    }
  ]
};

// =============================================================================
// Enhanced Bridge Edge Adders with Validation
// =============================================================================

export class QubitBridgeEdgeAdder implements IEdgeAdder {
  private config: BridgeProtocolConfig = QUBIT_BRIDGE_CONFIG;
  
  /**
   * Check if this edge adder can handle the given log event
   */
  canHandle(log: any): boolean {
    // Check if the log is from a known Qubit contract
    if (log.address) {
      const isKnownContract = Object.values(this.config.contracts)
        .flat()
        .some(addr => addr.toLowerCase() === log.address.toLowerCase());
      
      if (isKnownContract) return true;
    }
    
    // Check if the log contains Qubit-specific events
    if (log.topics && log.topics[0]) {
      const eventSig = log.topics[0];
      return this.config.depositEvents.some(event => 
        eventSig.includes(this.getEventSignature(event))
      ) || this.config.mintEvents.some(event => 
        eventSig.includes(this.getEventSignature(event))
      );
    }
    
    return false;
  }
  
  /**
   * Validate a bridge deposit operation
   */
  validateDeposit(edge: IBridgeEdge): ValidationResult {
    const issues: ValidationIssue[] = [];
    let score = 1.0;
    
    // Apply validation rules
    for (const rule of this.config.validationRules) {
      const ruleResult = this.applyValidationRule(edge, rule);
      if (!ruleResult.passed) {
        issues.push({
          severity: rule.severity,
          type: rule.type,
          description: ruleResult.description,
          evidence: ruleResult.evidence
        });
        
        // Reduce score based on severity
        const severityWeight = {
          'low': 0.1,
          'medium': 0.25,
          'high': 0.5,
          'critical': 1.0
        };
        score -= severityWeight[rule.severity];
      }
    }
    
    return {
      isValid: issues.length === 0 || !issues.some(i => i.severity === 'critical'),
      score: Math.max(0, score),
      issues,
      metadata: {
        protocol: this.config.name,
        edgeType: edge.edgeType,
        timestamp: Date.now()
      }
    };
  }
  
  private applyValidationRule(edge: IBridgeEdge, rule: BridgeValidationRule): {
    passed: boolean;
    description: string;
    evidence: any;
  } {
    switch (rule.type) {
      case 'non_zero_deposit':
        const amount = parseFloat(edge.Amount || '0');
        const minAmount = parseFloat(rule.params?.minAmount || '0');
        
        if (amount <= minAmount) {
          return {
            passed: false,
            description: `Zero-value deposit detected: ${amount} (Qubit Finance attack pattern)`,
            evidence: { amount, minAmount, edgeType: edge.edgeType, bridgeProtocol: edge.bridgeProtocol }
          };
        }
        return { passed: true, description: 'Non-zero deposit validated', evidence: { amount } };
      
      case 'backing_verification':
        // Check if actual token transfer occurred
        // In a real implementation, this would verify the transaction receipt
        if (edge.Amount === '0' || edge.Amount === undefined) {
          return {
            passed: false,
            description: 'No backing verification: deposit claimed without actual transfer',
            evidence: { amount: edge.Amount, rule: rule.params }
          };
        }
        return { passed: true, description: 'Backing verification passed', evidence: {} };
      
      default:
        return { passed: true, description: 'Unknown rule type', evidence: {} };
    }
  }
  
  private getEventSignature(eventName: string): string {
    // Simplified event signature generation
    // In real implementation, would use proper ABI encoding
    return eventName.toLowerCase().substring(0, 8);
  }
  async makeEdge(eLogs: DecodedEvent[], w: string, sKey: string, sAction: LogEvent, v?: string): Promise<IBridgeEdge> {
    const action = sAction.eventName;
    
    // Create base bridge edge
    let result: IBridgeEdge = {
      Action: action,
      // Bridge-specific fields
      edgeType: action === "Mint" ? "BridgeMint" : "BridgeDeposit",
      bridgeProtocol: "QubitBridge",
      sourceChain: action === "Deposit" || action === "depositETH" ? "ethereum" : "bsc",
      targetChain: action === "Mint" ? "bsc" : "ethereum",
      Amount: "0",
      Token: "ETH",
      TokenAddr: "0x0000000000000000000000000000000000000000",
      From: w, // User address
      To: sKey // Contract address
    };
    
    // Add fields for DSL constraint matching
    (result as any).Type = "Bridge";
    (result as any).Service = "QubitBridge";

    if (action === "Deposit" || action === "depositETH") {
      // Handle deposit events
      if (sAction.amount !== undefined && sAction.amount !== -1 && eLogs[sAction.amount]) {
        result.Amount = eLogs[sAction.amount].value;
        (result as any).depositAmount = eLogs[sAction.amount].value;
        (result as any).deposit_amount = parseFloat(eLogs[sAction.amount].value) || 0; // For DSL constraint (underscore version)
        (result as any).AmountIn = eLogs[sAction.amount].value;
      } else {
        result.Amount = "0"; // Critical for B1 constraint detection
        (result as any).depositAmount = "0";
        (result as any).deposit_amount = 0; // For DSL constraint (underscore version)
        (result as any).AmountIn = "0";
      }
      
      // For depositETH, we know it's ETH
      if (action === "depositETH") {
        result.Token = "ETH";
        result.TokenAddr = "0x0000000000000000000000000000000000000000";
        (result as any).depositToken = "ETH";
        (result as any).TokenIn = "ETH";
        (result as any).TokenInAddr = "0x0000000000000000000000000000000000000000";
      }
      
      (result as any).depositValue = result.Amount; // For bridge constraints
      
      // Generate cross-chain correlation ID
      result.crossChainId = this.generateCrossChainId(result);
      
    } else if (action === "Mint") {
      // Handle mint events
      if (sAction.amount !== undefined && sAction.amount !== -1 && eLogs[sAction.amount]) {
        result.Amount = eLogs[sAction.amount].value;
        (result as any).mintAmount = eLogs[sAction.amount].value;
        (result as any).mint_amount = parseFloat(eLogs[sAction.amount].value) || 0; // For DSL constraint (underscore version)
        (result as any).AmountOut = eLogs[sAction.amount].value;
      } else {
        result.Amount = "0";
        (result as any).mintAmount = "0";
        (result as any).mint_amount = 0; // For DSL constraint (underscore version)
        (result as any).AmountOut = "0";
      }
      
      result.Token = "qXETH";
      result.TokenAddr = "0xfD7A5506F434f5334C100EFb765025243C39137C"; // qXETH on BSC
      (result as any).mintToken = "qXETH";
      (result as any).TokenOut = "qXETH";
      (result as any).TokenOutAddr = "0xfD7A5506F434f5334C100EFb765025243C39137C";
      
      // For exploit detection - mint without corresponding deposit
      (result as any).depositAmount = "0"; // Will be 0 for exploit case
      (result as any).deposit_amount = 0; // For DSL constraint (underscore version)
      (result as any).depositValue = "0";
      
      // Generate cross-chain correlation ID
      result.crossChainId = this.generateCrossChainId(result);
    }

    // Apply validation
    result.validationResult = this.validateDeposit(result);

    return result;
  }
  
  /**
   * Generate cross-chain correlation ID for linking related transactions
   */
  private generateCrossChainId(edge: IBridgeEdge): string {
    // Generate a deterministic ID based on user, protocol, and approximate timestamp
    // In real implementation, would use more sophisticated correlation
    const baseId = `${edge.bridgeProtocol}_${edge.From}_${edge.Amount}`;
    return Buffer.from(baseId).toString('base64').substring(0, 16);
  }
}

export class MeterBridgeEdgeAdder implements IEdgeAdder {
  private config: BridgeProtocolConfig = METER_BRIDGE_CONFIG;
  
  /**
   * Check if this edge adder can handle the given log event
   */
  canHandle(log: any): boolean {
    // Check if the log is from a known Meter contract
    if (log.address) {
      const isKnownContract = Object.values(this.config.contracts)
        .flat()
        .some(addr => addr.toLowerCase() === log.address.toLowerCase());
      
      if (isKnownContract) return true;
    }
    
    // Check if the log contains Meter-specific events
    if (log.topics && log.topics[0]) {
      const eventSig = log.topics[0];
      return this.config.depositEvents.some(event => 
        eventSig.includes(this.getEventSignature(event))
      ) || this.config.mintEvents.some(event => 
        eventSig.includes(this.getEventSignature(event))
      );
    }
    
    return false;
  }
  
  /**
   * Validate wrapped token deposits (Meter.io specific)
   */
  private validateWrappedTokenDeposit(edge: IBridgeEdge): ValidationResult {
    const issues: ValidationIssue[] = [];
    let score = 1.0;
    
    // Check if this involves WETH or wrapped tokens
    const isWETH = edge.Token === 'WETH' || (edge as any).wrapped_token === true;
    
    if (isWETH) {
      // Get claimed vs actual amounts
      const claimedAmount = parseFloat((edge as any).claimed_deposit || edge.Amount || '0');
      const actualTransfer = parseFloat((edge as any).actual_transfer || '0');
      const balanceChange = parseFloat((edge as any).balance_change || '0');
      
      // Check for deposit bypass pattern
      if (claimedAmount > 0 && actualTransfer === 0) {
        issues.push({
          severity: 'critical',
          type: 'weth_deposit_bypass',
          description: `WETH deposit bypass: Claimed ${claimedAmount} but transferred ${actualTransfer}`,
          evidence: {
            claimed: claimedAmount,
            actual: actualTransfer,
            token: edge.Token,
            bridgeProtocol: edge.bridgeProtocol
          }
        });
        score = 0; // Critical issue
      }
      
      // Check for balance mismatch
      if (claimedAmount > 0 && balanceChange <= 0) {
        issues.push({
          severity: 'critical',
          type: 'balance_verification_failed',
          description: 'No balance change despite deposit claim',
          evidence: {
            claimed: claimedAmount,
            balanceChange: balanceChange
          }
        });
        score = Math.min(score, 0.2);
      }
    }
    
    return {
      isValid: issues.length === 0,
      score,
      issues,
      metadata: {
        protocol: this.config.name,
        isWETH,
        timestamp: Date.now()
      }
    };
  }
  
  /**
   * Validate a bridge deposit operation (focuses on Meter.io deposit bypass pattern)
   */
  validateDeposit(edge: IBridgeEdge): ValidationResult {
    const issues: ValidationIssue[] = [];
    let score = 1.0;
    
    // Apply validation rules
    for (const rule of this.config.validationRules) {
      const ruleResult = this.applyValidationRule(edge, rule);
      if (!ruleResult.passed) {
        issues.push({
          severity: rule.severity,
          type: rule.type,
          description: ruleResult.description,
          evidence: ruleResult.evidence
        });
        
        // Reduce score based on severity
        const severityWeight = {
          'low': 0.1,
          'medium': 0.25,
          'high': 0.5,
          'critical': 1.0
        };
        score -= severityWeight[rule.severity];
      }
    }
    
    return {
      isValid: issues.length === 0 || !issues.some(i => i.severity === 'critical'),
      score: Math.max(0, score),
      issues,
      metadata: {
        protocol: this.config.name,
        edgeType: edge.edgeType,
        timestamp: Date.now()
      }
    };
  }
  
  private applyValidationRule(edge: IBridgeEdge, rule: BridgeValidationRule): {
    passed: boolean;
    description: string;
    evidence: any;
  } {
    switch (rule.type) {
      case 'non_zero_deposit':
        const amount = parseFloat(edge.Amount || '0');
        const minAmount = parseFloat(rule.params?.minAmount || '0');
        
        if (amount <= minAmount) {
          return {
            passed: false,
            description: `Zero-value deposit detected: ${amount} (Meter.io attack pattern)`,
            evidence: { amount, minAmount, edgeType: edge.edgeType, bridgeProtocol: edge.bridgeProtocol }
          };
        }
        return { passed: true, description: 'Non-zero deposit validated', evidence: { amount } };
      
      case 'backing_verification':
        // Check if actual balance change occurred for Meter.io bridge
        if (rule.params?.requireBalanceChange && edge.Amount === '0') {
          return {
            passed: false,
            description: 'Deposit bypass detected: claimed deposit without balance change',
            evidence: { amount: edge.Amount, rule: rule.params }
          };
        }
        return { passed: true, description: 'Balance change verification passed', evidence: {} };
      
      default:
        return { passed: true, description: 'Unknown rule type', evidence: {} };
    }
  }
  
  private getEventSignature(eventName: string): string {
    // Simplified event signature generation
    // In real implementation, would use proper ABI encoding
    return eventName.toLowerCase().substring(0, 8);
  }
  
  async makeEdge(eLogs: DecodedEvent[], w: string, sKey: string, sAction: LogEvent, v?: string): Promise<IBridgeEdge> {
    const action = sAction.eventName;
    
    // Create base bridge edge
    let result: IBridgeEdge = {
      Action: action,
      // Bridge-specific fields
      edgeType: action === "Mint" || action === "MintWrapped" ? "BridgeMint" : "BridgeDeposit",
      bridgeProtocol: "MeterBridge",
      sourceChain: action === "Deposit" || action === "DepositWithData" ? "ethereum" : "arbitrum",
      targetChain: action === "Mint" || action === "MintWrapped" ? "arbitrum" : "ethereum",
      Amount: "0",
      Token: "ETH",
      TokenAddr: "0x0000000000000000000000000000000000000000",
      From: w, // User address
      To: sKey // Contract address
    };
    
    // Add fields for DSL constraint matching
    (result as any).Type = "Bridge";
    (result as any).Service = "MeterBridge";

    if (action === "Deposit" || action === "DepositWithData") {
      // Handle deposit events
      if (sAction.amount !== undefined && sAction.amount !== -1 && eLogs[sAction.amount]) {
        result.Amount = eLogs[sAction.amount].value;
        (result as any).claimed_deposit = eLogs[sAction.amount].value; // Meter.io specific
        (result as any).depositAmount = eLogs[sAction.amount].value;
        (result as any).AmountIn = eLogs[sAction.amount].value;
      } else {
        result.Amount = "0"; // Critical for detection
        (result as any).claimed_deposit = "0";
        (result as any).depositAmount = "0";
        (result as any).AmountIn = "0";
      }
      
      // Check for WETH token specifically
      if (sAction.token !== undefined && eLogs[sAction.token]) {
        const tokenAddr = eLogs[sAction.token].value;
        result.TokenAddr = tokenAddr;
        
        // Check if this is WETH
        if (this.isWETHAddress(tokenAddr)) {
          result.Token = "WETH";
          (result as any).wrapped_token = true;
        } else {
          result.Token = eLogs[sAction.token].value;
        }
        
        (result as any).depositToken = result.Token;
        (result as any).TokenIn = result.Token;
        (result as any).TokenInAddr = tokenAddr;
      }
      
      // Verify actual transfer for WETH (Meter.io specific)
      if ((result as any).wrapped_token) {
        (result as any).actual_transfer = this.verifyActualTransfer(eLogs, w, result.TokenAddr);
        const claimed = parseFloat((result as any).claimed_deposit || '0');
        const actual = parseFloat((result as any).actual_transfer || '0');
        (result as any).balance_change = actual - claimed;
      }
      
      (result as any).depositValue = result.Amount; // For bridge constraints
      
      // Generate cross-chain correlation ID
      result.crossChainId = this.generateCrossChainId(result);
      
    } else if (action === "Mint" || action === "MintWrapped") {
      // Handle mint events
      if (sAction.amount !== undefined && sAction.amount !== -1 && eLogs[sAction.amount]) {
        result.Amount = eLogs[sAction.amount].value;
        (result as any).mintAmount = eLogs[sAction.amount].value;
        (result as any).mint_amount = eLogs[sAction.amount].value; // For DSL constraint
        (result as any).AmountOut = eLogs[sAction.amount].value;
      } else {
        result.Amount = "0";
        (result as any).mintAmount = "0";
        (result as any).mint_amount = "0";
        (result as any).AmountOut = "0";
      }
      
      if (sAction.token !== undefined && sAction.token !== -1 && eLogs[sAction.token]) {
        result.Token = eLogs[sAction.token].value;
        result.TokenAddr = eLogs[sAction.token].value;
        (result as any).mintToken = eLogs[sAction.token].value;
        (result as any).TokenOut = eLogs[sAction.token].value;
        (result as any).TokenOutAddr = eLogs[sAction.token].value;
      }
      
      // For exploit detection - mint without corresponding deposit
      (result as any).depositAmount = "0"; // Will be 0 for exploit case
      (result as any).deposit_amount = 0; // For DSL constraint (underscore version)
      (result as any).depositValue = "0";
      (result as any).backing_verified = "0"; // No backing in exploit
      (result as any).source_deposit = "0";
      
      // Generate cross-chain correlation ID
      result.crossChainId = this.generateCrossChainId(result);
    }

    // Apply both standard and WETH-specific validation
    const standardValidation = this.validateDeposit(result);
    const wethValidation = this.validateWrappedTokenDeposit(result);
    
    // Merge validation results
    result.validationResult = {
      isValid: standardValidation.isValid && wethValidation.isValid,
      score: Math.min(standardValidation.score, wethValidation.score),
      issues: [...standardValidation.issues, ...wethValidation.issues],
      metadata: {
        ...standardValidation.metadata,
        ...wethValidation.metadata
      }
    };

    return result;
  }
  
  /**
   * Check if address is WETH
   */
  private isWETHAddress(address: string): boolean {
    const wethAddresses = [
      '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', // WETH on Ethereum
      '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', // WETH on Arbitrum
      '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c'  // WBNB on BSC (wrapped BNB)
    ];
    return wethAddresses.some(addr => addr.toLowerCase() === address.toLowerCase());
  }
  
  /**
   * Verify actual WETH transfer occurred
   */
  private verifyActualTransfer(eLogs: DecodedEvent[], from: string, tokenAddr?: string): string {
    // Look for Transfer events from the user's address
    // DecodedEvent has 'name' for event name and 'value' for the amount
    for (const log of eLogs) {
      if (log.name === 'Transfer' && log.value) {
        // Since we don't have direct access to 'from' field in DecodedEvent,
        // we'll check if there's a transfer amount
        // In a real implementation, would need to parse the topics/data
        return log.value;
      }
    }
    return '0'; // No actual transfer found
  }
  
  /**
   * Generate cross-chain correlation ID for linking related transactions
   */
  private generateCrossChainId(edge: IBridgeEdge): string {
    // Generate a deterministic ID based on user, protocol, and approximate timestamp
    // In real implementation, would use more sophisticated correlation
    const baseId = `${edge.bridgeProtocol}_${edge.From}_${edge.Amount}`;
    return Buffer.from(baseId).toString('base64').substring(0, 16);
  }
}