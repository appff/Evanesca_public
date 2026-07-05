import { DSLLexer, DSLParser } from './DSLParser';
import { ConstraintManager, ExecutionContext } from './DSLInterpreter';

// Test DSL code
const testDSL = `
constraint DEX_PRICE_MANIPULATION {
  when: edge.type == "DEX" && edge.action == "Swap"
  condition: {
    price_ratio: edge.amountOut / edge.amountIn,
    threshold: 105
  }
  violation: price_ratio > threshold
  message: "Abnormal swap detected: price ratio exceeds threshold"
}

constraint LENDING_REENTRANCY {
  when: edge.type == "Lending" && (edge.action == "Deposit" || edge.action == "Withdraw")
  condition: {
    user_balance: user.balance,
    user_collateral: user.collateral
  }
  violation: user_balance < 0 || user_collateral < 0
  message: "Re-entrancy attack detected: negative balance"
}
`;

function testLexer() {
  console.log("=== Testing DSL Lexer ===");
  
  try {
    const lexer = new DSLLexer(testDSL);
    const tokens = lexer.tokenize();
    
    console.log("Tokens found:", tokens.length);
    tokens.forEach((token, index) => {
      console.log(`${index}: ${token.type} = "${token.value}" (line: ${token.line}, col: ${token.column})`);
    });
  } catch (error) {
    console.error("Lexer error:", error);
  }
}

function testParser() {
  console.log("\n=== Testing DSL Parser ===");
  
  try {
    const lexer = new DSLLexer(testDSL);
    const tokens = lexer.tokenize();
    
    const parser = new DSLParser(tokens);
    const ast = parser.parse();
    
    console.log("Parse successful!");
    console.log("AST:", JSON.stringify(ast, null, 2));
  } catch (error) {
    console.error("Parse error:", error);
  }
}

function testInterpreter() {
  console.log("\n=== Testing Interpreter ===");
  
  try {
    // DSL parsing - multiple constraints
    const lexer = new DSLLexer(testDSL);
    const tokens = lexer.tokenize();
    const parser = new DSLParser(tokens);
    const constraints = parser.parseMultipleConstraints();
    
    console.log(`Parsed ${constraints.length} constraints:`, constraints.map(c => c.name));
    
    // Create constraint manager
    const constraintManager = new ConstraintManager();
    constraintManager.addConstraints(constraints);
    
    // Test case 1: Normal DEX swap
    const normalSwapContext: ExecutionContext = {
      edge: {
        type: "DEX",
        action: "Swap",
        amountIn: 100,
        amountOut: 95
      }
    };
    
    console.log("Test 1: Normal DEX swap");
    const normalResults = constraintManager.executeConstraints(normalSwapContext);
    console.log("Results:", normalResults);
    
    // Test case 2: Abnormal DEX swap (price manipulation)
    const abnormalSwapContext: ExecutionContext = {
      edge: {
        type: "DEX",
        action: "Swap",
        amountIn: 100,
        amountOut: 120  // 120% profit ratio
      }
    };
    
    console.log("\nTest 2: Abnormal DEX swap (price manipulation)");
    const abnormalResults = constraintManager.executeConstraints(abnormalSwapContext);
    console.log("Results:", abnormalResults);
    
    // Test case 3: Lending service (normal)
    const normalLendingContext: ExecutionContext = {
      edge: {
        type: "Lending",
        action: "Deposit"
      },
      user: {
        balance: 1000,
        collateral: 1000
      }
    };
    
    console.log("\nTest 3: Normal Lending operation");
    const normalLendingResults = constraintManager.executeConstraints(normalLendingContext);
    console.log("Results:", normalLendingResults);
    
    // Test case 4: Lending service (Re-entrancy suspected)
    const reentrancyContext: ExecutionContext = {
      edge: {
        type: "Lending",
        action: "Withdraw"
      },
      user: {
        balance: -50,  // negative balance
        collateral: 1000
      }
    };
    
    console.log("\nTest 4: Lending operation with negative balance (re-entrancy)");
    const reentrancyResults = constraintManager.executeConstraints(reentrancyContext);
    console.log("Results:", reentrancyResults);
    
  } catch (error) {
    console.error("Interpreter error:", error);
  }
}

// Run tests
testLexer();
testParser();
testInterpreter(); 