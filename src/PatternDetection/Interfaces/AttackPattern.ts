// Type definitions for Multi-Step Pattern Detection

export interface AttackPattern {
  name: string;
  description: string;
  steps: PatternStep[];
  constraints: PatternConstraint[];
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
}

export interface PatternStep {
  type: "DEX" | "LENDING" | "FLASH_LOAN" | "ORACLE" | "TRANSFER";
  action: string;  // "Swap", "Deposit", "Borrow", etc.
  conditions: StepCondition[];
  optional: boolean;
}

export interface StepCondition {
  field: string;     // "amountUSD", "tokenType", "protocol"
  operator: ">" | "<" | "==" | "contains" | "between";
  value: any;
}

export interface PatternConstraint {
  type: "TEMPORAL" | "VOLUME" | "PRICE_IMPACT" | "PROFIT" | "CORRELATION";
  condition: string;  // DSL expression
  threshold: number;
}

export interface DetectedPattern {
  pattern: string;
  confidence: number;  // 0-1
  evidence: PatternEvidence[];
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  profit: number;      // USD
  risk_score: number;  // 0-100
  description: string;
}

export interface PatternEvidence {
  step: number;
  edge: any; // Edge information
  match_strength: number;  // 0-1
  explanation: string;
}

export interface PatternMatch {
  pattern: AttackPattern;
  edges: any[];  // matched edges
  confidence: number;
  evidence: PatternEvidence[];
  metadata: PatternMatchMetadata;
}

export interface PatternMatchMetadata {
  total_volume_usd: number;
  max_price_impact: number;
  time_span_seconds: number;
  protocols_involved: string[];
  tokens_involved: string[];
  profit_estimate: number;
}

export interface TransactionContext {
  blockNumber: number;
  timestamp: number;
  from: string;
  hash: string;
  gasUsed: number;
  gasPrice: number;
}

export interface TimeWindow {
  start: number;
  end: number;
  duration: number;  // seconds
}

// Pattern matching result
export interface SequentialMatchResult {
  matched: boolean;
  confidence: number;
  evidence: PatternEvidence[];
  metadata: PatternMatchMetadata;
} 