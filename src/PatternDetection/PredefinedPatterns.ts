import { AttackPattern } from './Interfaces/AttackPattern';

// 🚨 미리 정의된 공격 패턴들
export const PREDEFINED_ATTACK_PATTERNS: AttackPattern[] = [
  
  // Pattern 1: Flash Loan Arbitrage (bZx, Harvest 스타일)
  {
    name: "FLASH_LOAN_ARBITRAGE",
    description: "Flash loan → Market manipulation → Profit extraction",
    steps: [
      { 
        type: "LENDING", 
        action: "Borrow", 
        conditions: [
          { field: "amountUSD", operator: ">", value: 100000 } // $100k+
        ], 
        optional: false 
      },
      { 
        type: "DEX", 
        action: "Swap", 
        conditions: [
          { field: "priceImpact", operator: ">", value: 0.05 } // 5%+ impact  
        ], 
        optional: false 
      },
      { 
        type: "LENDING", 
        action: "Any", 
        conditions: [], 
        optional: true 
      },
      { 
        type: "DEX", 
        action: "Swap", 
        conditions: [
          { field: "oppositeDirection", operator: "==", value: true }
        ], 
        optional: false 
      },
      { 
        type: "LENDING", 
        action: "Repay", 
        conditions: [], 
        optional: false 
      }
    ],
    constraints: [
      { type: "PROFIT", condition: "netProfit > 10000", threshold: 10000 },
      { type: "TEMPORAL", condition: "totalTime < 300", threshold: 300 },
      { type: "PRICE_IMPACT", condition: "maxPriceImpact > 0.03", threshold: 0.03 }
    ],
    severity: "CRITICAL"
  },

  // Pattern 2: Cross-Protocol Yield Farming Exploit (Harvest 스타일)
  {
    name: "CROSS_PROTOCOL_ARBITRAGE", 
    description: "DEX manipulation → Vault exploitation → Profit extraction",
    steps: [
      { 
        type: "DEX", 
        action: "Swap", 
        conditions: [
          { field: "tokenPair", operator: "contains", value: ["USDC", "USDT"] },
          { field: "amountUSD", operator: ">", value: 10000 }
        ], 
        optional: false 
      },
      { 
        type: "LENDING", 
        action: "Deposit", 
        conditions: [
          { field: "protocol", operator: "contains", value: ["Harvest", "Yearn", "Compound"] },
          { field: "amountUSD", operator: ">", value: 30000 }
        ], 
        optional: false 
      },
      { 
        type: "DEX", 
        action: "Swap", 
        conditions: [
          { field: "reverseDirection", operator: "==", value: true }
        ], 
        optional: false 
      },
      { 
        type: "LENDING", 
        action: "Withdraw", 
        conditions: [], 
        optional: false 
      }
    ],
    constraints: [
      { type: "PROFIT", condition: "netProfit > 50000", threshold: 50000 },
      { type: "CORRELATION", condition: "sharePriceChange > 0.01", threshold: 0.01 },
      { type: "TEMPORAL", condition: "totalTime < 600", threshold: 600 }
    ],
    severity: "HIGH"
  },

  // Pattern 3: Oracle Manipulation  
  {
    name: "ORACLE_MANIPULATION",
    description: "Price oracle manipulation → Liquidation/Borrowing exploit",
    steps: [
      { 
        type: "DEX", 
        action: "Swap", 
        conditions: [
          { field: "amountUSD", operator: ">", value: 500000 } // Large trade
        ], 
        optional: false 
      },
      { 
        type: "LENDING", 
        action: "Borrow", 
        conditions: [
          { field: "utilizationChange", operator: ">", value: 0.1 }
        ], 
        optional: false 
      },
      { 
        type: "DEX", 
        action: "Swap", 
        conditions: [], 
        optional: true 
      }
    ],
    constraints: [
      { type: "PRICE_IMPACT", condition: "oraclePriceChange > 0.1", threshold: 0.1 },
      { type: "TEMPORAL", condition: "timeGap < 60", threshold: 60 }
    ],
    severity: "HIGH"
  },

  // Pattern 4: Sandwich Attack
  {
    name: "SANDWICH_ATTACK",
    description: "Front-run → Victim tx → Back-run → MEV profit",
    steps: [
      { 
        type: "DEX", 
        action: "Swap", 
        conditions: [
          { field: "gasPrice", operator: ">", value: "high" }
        ], 
        optional: false 
      },
      { 
        type: "DEX", 
        action: "Swap", 
        conditions: [
          { field: "samePool", operator: "==", value: true },
          { field: "oppositeDirection", operator: "==", value: true }
        ], 
        optional: false 
      }
    ],
    constraints: [
      { type: "TEMPORAL", condition: "blockGap <= 3", threshold: 3 },
      { type: "PROFIT", condition: "mevProfit > 100", threshold: 100 }
    ],
    severity: "MEDIUM"
  },

  // Pattern 5: Simple Arbitrage (많은 단계를 거치지 않는 간단한 차익거래)
  {
    name: "SIMPLE_ARBITRAGE",
    description: "Simple cross-DEX or cross-protocol arbitrage",
    steps: [
      { 
        type: "DEX", 
        action: "Swap", 
        conditions: [
          { field: "amountUSD", operator: ">", value: 1000 }
        ], 
        optional: false 
      },
      { 
        type: "DEX", 
        action: "Swap", 
        conditions: [
          { field: "reverseDirection", operator: "==", value: true }
        ], 
        optional: false 
      }
    ],
    constraints: [
      { type: "PROFIT", condition: "netProfit > 500", threshold: 500 },
      { type: "TEMPORAL", condition: "totalTime < 120", threshold: 120 }
    ],
    severity: "LOW"
  },

  // Pattern 6: Harvest-Style Vault Arbitrage (더 구체적)
  {
    name: "HARVEST_VAULT_ARBITRAGE",
    description: "Curve pool manipulation → Harvest vault exploitation → Restoration",
    steps: [
      { 
        type: "DEX", 
        action: "Swap", 
        conditions: [
          { field: "tokenPair", operator: "contains", value: ["USDC", "USDT"] },
          { field: "amountUSD", operator: ">", value: 15000 },
          { field: "priceImpact", operator: ">", value: 0.001 }
        ], 
        optional: false 
      },
      { 
        type: "LENDING", 
        action: "Deposit", 
        conditions: [
          { field: "protocol", operator: "==", value: "Harvest" },
          { field: "tokenType", operator: "contains", value: ["USDC", "USDT"] }
        ], 
        optional: false 
      },
      { 
        type: "DEX", 
        action: "Swap", 
        conditions: [
          { field: "tokenPair", operator: "contains", value: ["USDC", "USDT"] },
          { field: "reverseDirection", operator: "==", value: true }
        ], 
        optional: false 
      },
      { 
        type: "LENDING", 
        action: "Withdraw", 
        conditions: [
          { field: "protocol", operator: "==", value: "Harvest" }
        ], 
        optional: false 
      }
    ],
    constraints: [
      { type: "PROFIT", condition: "netProfit > 1000", threshold: 1000 },
      { type: "CORRELATION", condition: "sharePriceManipulation > 0.005", threshold: 0.005 },
      { type: "TEMPORAL", condition: "totalTime < 300", threshold: 300 },
      { type: "PRICE_IMPACT", condition: "poolRestoration > 0.8", threshold: 0.8 }
    ],
    severity: "HIGH"
  }
];

// 패턴 이름으로 패턴을 찾는 헬퍼 함수
export function getPatternByName(name: string): AttackPattern | undefined {
  return PREDEFINED_ATTACK_PATTERNS.find(pattern => pattern.name === name);
}

// 심각도별로 패턴을 필터링하는 헬퍼 함수
export function getPatternsBySeverity(severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"): AttackPattern[] {
  return PREDEFINED_ATTACK_PATTERNS.filter(pattern => pattern.severity === severity);
}

// 특정 타입의 단계를 포함하는 패턴들을 찾는 헬퍼 함수
export function getPatternsWithStepType(stepType: "DEX" | "LENDING" | "FLASH_LOAN" | "ORACLE" | "TRANSFER"): AttackPattern[] {
  return PREDEFINED_ATTACK_PATTERNS.filter(pattern => 
    pattern.steps.some(step => step.type === stepType)
  );
} 