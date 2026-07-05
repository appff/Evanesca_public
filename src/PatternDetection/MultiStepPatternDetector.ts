import { 
  AttackPattern, 
  DetectedPattern, 
  PatternEvidence, 
  PatternMatch,
  PatternMatchMetadata,
  TransactionContext,
  SequentialMatchResult,
  StepCondition,
  PatternStep
} from './Interfaces/AttackPattern';
import { PREDEFINED_ATTACK_PATTERNS } from './PredefinedPatterns';
import { IDEXEdge, ILendingEdge } from '../SemanticFinancialGraph/Interfaces/IEdge';
import { DebugLogger } from '../Utils/DebugLogger';
import { SequenceEdge } from '../SemanticFinancialGraph/Types';

export class MultiStepPatternDetector {
  private patterns: AttackPattern[] = [];
  private eventWindow: number = 300; // 5-minute window

  constructor(customPatterns?: AttackPattern[]) {
    this.patterns = customPatterns || PREDEFINED_ATTACK_PATTERNS;
  }

  // 🎯 Main detection logic
  async detectPatterns(edgeSequence: SequenceEdge[], context: TransactionContext): Promise<DetectedPattern[]> {
    const detectedPatterns: DetectedPattern[] = [];
    
    DebugLogger.pattern(`🔍 [PatternDetector] Analyzing ${edgeSequence.length} edges for multi-step patterns...`);
    
    // 1. Sequential pattern matching
    for (const pattern of this.patterns) {
      const match = await this.matchSequentialPattern(edgeSequence, pattern);
      if (match.matched) {
        const detectedPattern = this.createDetectedPattern(match, pattern, context);
        detectedPatterns.push(detectedPattern);
        DebugLogger.pattern(`🚨 [PatternDetector] Pattern detected: ${pattern.name} (confidence: ${(match.confidence * 100).toFixed(1)}%)`);
      }
    }
    
    if (detectedPatterns.length === 0) {
      DebugLogger.pattern(`✅ [PatternDetector] No multi-step attack patterns detected`);
    }
    
    return detectedPatterns;
  }

  // 📝 Sequential pattern matching
  private async matchSequentialPattern(edges: SequenceEdge[], pattern: AttackPattern): Promise<SequentialMatchResult> {
          DebugLogger.pattern(`🔍 [PatternDetector] Matching pattern: ${pattern.name}`);
    
    // Cannot match if there are fewer edges than required pattern steps
    const requiredSteps = pattern.steps.filter(step => !step.optional).length;
    if (edges.length < requiredSteps) {
      return { matched: false, confidence: 0, evidence: [], metadata: this.createEmptyMetadata() };
    }

    // Attempt pattern matching using sliding window approach
    for (let i = 0; i <= edges.length - requiredSteps; i++) {
      const matchResult = await this.tryMatchAtPosition(edges, pattern, i);
      if (matchResult.matched) {
        return matchResult;
      }
    }

    return { matched: false, confidence: 0, evidence: [], metadata: this.createEmptyMetadata() };
  }

  // Attempt pattern matching at specific position
  private async tryMatchAtPosition(edges: SequenceEdge[], pattern: AttackPattern, startIndex: number): Promise<SequentialMatchResult> {
    const evidence: PatternEvidence[] = [];
    let currentIndex = startIndex;
    let matchedSteps = 0;
    let totalConfidence = 0;

          DebugLogger.pattern(`   🔍 Trying match at position ${startIndex}`);

    for (let stepIndex = 0; stepIndex < pattern.steps.length; stepIndex++) {
      const step = pattern.steps[stepIndex];
      const edgeMatch = await this.matchStepAtPosition(edges, step, currentIndex, stepIndex);

      if (edgeMatch.matched) {
        evidence.push(edgeMatch.evidence);
        totalConfidence += edgeMatch.confidence;
        matchedSteps++;
        currentIndex = edgeMatch.nextIndex;
        DebugLogger.pattern(`   ✅ Step ${stepIndex + 1}/${pattern.steps.length} matched (confidence: ${(edgeMatch.confidence * 100).toFixed(1)}%)`);
      } else if (!step.optional) {
        DebugLogger.pattern(`   ❌ Required step ${stepIndex + 1} failed to match`);
        return { matched: false, confidence: 0, evidence: [], metadata: this.createEmptyMetadata() };
      } else {
        console.log(`   ⏭️ Optional step ${stepIndex + 1} skipped`);
      }
    }

    // Must have minimum number of matched steps
    if (matchedSteps < Math.ceil(pattern.steps.length * 0.7)) {
      return { matched: false, confidence: 0, evidence: [], metadata: this.createEmptyMetadata() };
    }

    const finalConfidence = totalConfidence / pattern.steps.length;
    const metadata = await this.calculateMetadata(edges.slice(startIndex, currentIndex));

    return {
      matched: true,
      confidence: finalConfidence,
      evidence,
      metadata
    };
  }

  // Individual step matching
  private async matchStepAtPosition(edges: SequenceEdge[], step: PatternStep, currentIndex: number, stepIndex: number): Promise<{
    matched: boolean;
    confidence: number;
    evidence: PatternEvidence;
    nextIndex: number;
  }> {
    // Matching fails if current index is out of range
    if (currentIndex >= edges.length) {
      return {
        matched: false,
        confidence: 0,
        evidence: { step: stepIndex, edge: null, match_strength: 0, explanation: "No more edges to match" },
        nextIndex: currentIndex
      };
    }

    const edge = edges[currentIndex];
    const edgeData = JSON.parse(typeof edge.name === 'string' ? edge.name : edge.name[0]);

    // Check edge type
    const edgeType = this.determineEdgeType(edge, edgeData);
    if (step.type !== edgeType && step.action !== "Any") {
      return {
        matched: false,
        confidence: 0,
        evidence: { 
          step: stepIndex, 
          edge, 
          match_strength: 0, 
          explanation: `Edge type mismatch: expected ${step.type}, got ${edgeType}` 
        },
        nextIndex: currentIndex
      };
    }

    // Check action
    const edgeAction = (edgeData as Record<string, unknown>).Action as string;
    if (step.action !== "Any" && step.action !== edgeAction) {
      return {
        matched: false,
        confidence: 0,
        evidence: { 
          step: stepIndex, 
          edge, 
          match_strength: 0, 
          explanation: `Action mismatch: expected ${step.action}, got ${edgeAction}` 
        },
        nextIndex: currentIndex
      };
    }

    // Validate conditions
    let conditionConfidence = 1.0;
    let conditionResults: string[] = [];

    for (const condition of step.conditions) {
      const conditionResult = await this.evaluateCondition(edge, edgeData, condition);
      if (!conditionResult.passed) {
        conditionConfidence *= 0.5; // Reduce confidence when condition fails
      }
      conditionResults.push(conditionResult.explanation);
    }

    // Matching successful
    const matchStrength = conditionConfidence;
    const explanation = `Matched ${step.type} ${step.action}: ${conditionResults.join(', ')}`;

    return {
      matched: matchStrength > 0.3, // Matching successful with 30%+ confidence
      confidence: matchStrength,
      evidence: {
        step: stepIndex,
        edge,
        match_strength: matchStrength,
        explanation
      },
      nextIndex: currentIndex + 1
    };
  }

  // Condition evaluation
  private async evaluateCondition(edge: SequenceEdge, edgeData: unknown, condition: StepCondition): Promise<{
    passed: boolean;
    explanation: string;
  }> {
    try {
      const fieldValue = await this.extractFieldValue(edge, edgeData, condition.field);
      const result = this.compareValues(fieldValue, condition.operator, condition.value);
      
      return {
        passed: result,
        explanation: `${condition.field} ${condition.operator} ${condition.value} -> ${fieldValue} (${result ? 'PASS' : 'FAIL'})`
      };
    } catch (error) {
      return {
        passed: false,
        explanation: `Error evaluating ${condition.field}: ${error}`
      };
    }
  }

  // Field value extraction
  private async extractFieldValue(edge: SequenceEdge, edgeData: unknown, fieldName: string): Promise<unknown> {
    switch (fieldName) {
      case 'amountUSD':
        return await this.calculateAmountUSD(edge, edgeData);
      case 'tokenPair':
        return this.extractTokenPair(edgeData);
      case 'protocol':
        return this.extractProtocol(edge);
      case 'tokenType':
        return this.extractTokenType(edgeData);
      case 'priceImpact':
        return await this.calculatePriceImpact(edge, edgeData);
      case 'reverseDirection':
      case 'oppositeDirection':
        return this.checkReverseDirection(edge, edgeData);
      default:
        const data = edgeData as Record<string, unknown>;
        return data[fieldName] || null;
    }
  }

  // USD amount calculation
  private async calculateAmountUSD(edge: SequenceEdge, edgeData: unknown): Promise<number> {
    // Simple approximation calculation (more sophisticated price calculation needed in practice)
    const data = edgeData as Record<string, unknown>;
    
    if (data.AmountIn && typeof data.AmountIn === 'string') {
      // DEX edge
      const amount = parseFloat(data.AmountIn);
      const token = (data.Token0 as string) || (data.Token as string) || '';
      return this.approximateUSDValue(amount, token);
    } else if (data.Amount && typeof data.Amount === 'string') {
      // Lending edge
      const amount = parseFloat(data.Amount);
      const token = data.Token as string || '';
      return this.approximateUSDValue(amount, token);
    }
    return 0;
  }

  // Approximate USD value calculation
  private approximateUSDValue(amount: number, token: string): number {
    const priceMap: { [key: string]: number } = {
      'USDC': 1,
      'USDT': 1,
      'DAI': 1,
      'WETH': 380, // Price at time of Harvest attack
      'ETH': 380,
      'WBTC': 13000
    };
    
    const price = priceMap[token] || 1;
    const normalizedAmount = amount / Math.pow(10, 18); // wei -> ether conversion (simplified)
    
    return normalizedAmount * price;
  }

  // Value comparison
  private compareValues(actual: unknown, operator: string, expected: unknown): boolean {
    switch (operator) {
      case '>':
        return typeof actual === 'number' && typeof expected === 'number' && actual > expected;
      case '<':
        return typeof actual === 'number' && typeof expected === 'number' && actual < expected;
      case '==':
        return actual === expected;
      case 'contains':
        if (Array.isArray(expected)) {
          return Array.isArray(actual) 
            ? expected.some(exp => actual.includes(exp))
            : expected.includes(actual);
        }
        return typeof actual === 'string' && typeof expected === 'string' && actual.includes(expected);
      case 'between':
        return Array.isArray(expected) && expected.length >= 2 && 
               typeof actual === 'number' && 
               typeof expected[0] === 'number' && typeof expected[1] === 'number' &&
               actual >= expected[0] && actual <= expected[1];
      default:
        return false;
    }
  }

  // Determine edge type
  private determineEdgeType(edge: SequenceEdge, edgeData: unknown): string {
    const data = edgeData as Record<string, unknown>;
    
    if (data.AmountIn && data.AmountOut) {
      return "DEX";
    } else if (data.Amount && data.Action && 
               ["Deposit", "Withdraw", "Borrow", "Repay"].includes(data.Action as string)) {
      return "LENDING";
    }
    return "UNKNOWN";
  }

  // Extract token pair
  private extractTokenPair(edgeData: unknown): string[] {
    const data = edgeData as Record<string, unknown>;
    const tokens: string[] = [];
    
    if (data.Token0 && typeof data.Token0 === 'string') tokens.push(data.Token0);
    if (data.Token1 && typeof data.Token1 === 'string') tokens.push(data.Token1);
    if (data.Token && typeof data.Token === 'string') tokens.push(data.Token);
    
    return tokens;
  }

  // Extract protocol
  private extractProtocol(edge: SequenceEdge): string {
    // Identify protocol through edge.w
    const address = (typeof edge.w === 'string') ? edge.w.toLowerCase() : String(edge.w || '').toLowerCase();
    if (address.includes('harvest') || address === '0x053c80ea73dc6941f518a68e2fc52ac45bde7c9c' || address === '0xf0358e8c3cd5fa238a29301d0bea3d63a17bedbe') {
      return 'Harvest';
    } else if (address.includes('bzx') || address === '0xb0200b0677dd825bb32b93d055ebb9dc3521db9d' || 
               address === '0x8b3d70d628ebd30d4a2ea82db95ba2e906c71633' ||
               address === '0xb017c9936f9271daff23d4c9876651442958a80f') {
      return 'bZx';
    }
    // Other protocols can be added
    return 'Unknown';
  }

  // Extract token type
  private extractTokenType(edgeData: unknown): string[] {
    return this.extractTokenPair(edgeData);
  }

  // Price impact calculation (simplified)
  private async calculatePriceImpact(edge: SequenceEdge, edgeData: unknown): Promise<number> {
    const data = edgeData as Record<string, unknown>;
    
    if (!data.AmountIn || !data.AmountOut || 
        typeof data.AmountIn !== 'string' || typeof data.AmountOut !== 'string') {
      return 0;
    }
    
    const amountIn = parseFloat(data.AmountIn);
    const amountOut = parseFloat(data.AmountOut);
    
    // Simple price impact estimation (more complex calculation needed in practice)
    const expectedOut = amountIn; // Assume 1:1 ratio
    const actualRatio = amountOut / amountIn;
    
    return Math.abs(1 - actualRatio);
  }

  // Reverse direction check (simplified)
  private checkReverseDirection(edge: SequenceEdge, edgeData: unknown): boolean {
    // In practice, should compare direction with previous swap
    // Currently simply returns true
    return true;
  }

  // Metadata calculation
  private async calculateMetadata(edges: SequenceEdge[]): Promise<PatternMatchMetadata> {
    let totalVolumeUSD = 0;
    let maxPriceImpact = 0;
    const protocolsInvolved = new Set<string>();
    const tokensInvolved = new Set<string>();

    for (const edge of edges) {
      try {
        const edgeData = JSON.parse(typeof edge.name === 'string' ? edge.name : edge.name[0]);
        const amountUSD = await this.calculateAmountUSD(edge, edgeData);
        totalVolumeUSD += amountUSD;

        const priceImpact = await this.calculatePriceImpact(edge, edgeData);
        maxPriceImpact = Math.max(maxPriceImpact, priceImpact);

        const protocol = this.extractProtocol(edge);
        if (protocol && protocol !== 'Unknown') protocolsInvolved.add(protocol);
        
        const tokens = this.extractTokenPair(edgeData);
        tokens.forEach(token => {
          if (token && typeof token === 'string') tokensInvolved.add(token);
        });
      } catch (error) {
        // Skip edges with parsing errors
        DebugLogger.pattern(`⚠️ Failed to parse edge data: ${error}`);
      }
    }

    return {
      total_volume_usd: totalVolumeUSD,
      max_price_impact: maxPriceImpact,
      time_span_seconds: 60, // Short time since it's a single transaction
      protocols_involved: Array.from(protocolsInvolved),
      tokens_involved: Array.from(tokensInvolved),
      profit_estimate: totalVolumeUSD * 0.01 // 1% profit estimation
    };
  }

  // Create DetectedPattern
  private createDetectedPattern(match: SequentialMatchResult, pattern: AttackPattern, context: TransactionContext): DetectedPattern {
    return {
      pattern: pattern.name,
      confidence: match.confidence,
      evidence: match.evidence,
      severity: pattern.severity,
      profit: match.metadata.profit_estimate,
      risk_score: this.calculateRiskScore(match, pattern),
      description: `${pattern.description} (${match.evidence.length} steps matched)`
    };
  }

  // Risk score calculation
  private calculateRiskScore(match: SequentialMatchResult, pattern: AttackPattern): number {
    let score = match.confidence * 50; // Base score

    // Weight based on severity
    switch (pattern.severity) {
      case 'CRITICAL': score += 40; break;
      case 'HIGH': score += 30; break;
      case 'MEDIUM': score += 20; break;
      case 'LOW': score += 10; break;
    }

    // Weight based on profit scale
    if (match.metadata.profit_estimate > 100000) score += 20;
    else if (match.metadata.profit_estimate > 10000) score += 10;

    return Math.min(Math.round(score), 100);
  }

  // Create empty metadata
  private createEmptyMetadata(): PatternMatchMetadata {
    return {
      total_volume_usd: 0,
      max_price_impact: 0,
      time_span_seconds: 0,
      protocols_involved: [],
      tokens_involved: [],
      profit_estimate: 0
    };
  }
} 