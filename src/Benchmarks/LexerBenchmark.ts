import { DSLLexer } from '../DSL/DSLParser';
import { DebugLogger } from '../Utils/DebugLogger';

/**
 * Lexer Performance Benchmark
 * Tests the optimized lexer regex operations
 */
export class LexerBenchmark {
  private testDSL: string;

  constructor() {
    // Complex DSL with many tokens to stress test the lexer
    this.testDSL = `
      constraint D1_INVARIANT_VIOLATION {
        when: edge.type == "DEX" && edge.action == "Swap" && edge.protocol != "Balancer"
        condition: {
          k_before: reserve0_before * reserve1_before,
          k_after: reserve0_after * reserve1_after,
          invariant_ratio: k_after / k_before,
          slippage_threshold: 0.98
        }
        violation: invariant_ratio < slippage_threshold
        message: "K-invariant violation detected in DEX swap"
      }

      constraint D2_ABNORMAL_SWAP {
        when: edge.type == "DEX" && edge.action == "Swap"
        condition: {
          total_in_usd: total_in_usd,
          total_out_usd: total_out_usd,
          profit_ratio: (total_out_usd / total_in_usd) * 100,
          normal_threshold: 105.0,
          extreme_threshold: 200.0
        }
        violation: profit_ratio > extreme_threshold || (profit_ratio > normal_threshold && total_in_usd > 10000)
        message: "Abnormal swap detected: extreme profit ratio"
      }

      constraint L1_USER_BALANCE_CHECK {
        when: edge.type == "Lending" && (edge.action == "Borrow" || edge.action == "Repay")
        condition: {
          user_balance: getUserBalance(edge.from),
          collateral_value: getCollateralValue(edge.from),
          borrowed_amount: getBorrowedAmount(edge.from),
          health_factor: collateral_value / borrowed_amount,
          minimum_health: 1.5
        }
        violation: health_factor < minimum_health && borrowed_amount > 0
        message: "User balance health factor below minimum threshold"
      }

      constraint L2_ABNORMAL_BORROW {
        when: edge.type == "Lending" && edge.action == "Borrow"
        condition: {
          borrow_amount_usd: borrow_amount_usd,
          user_collateral_usd: user_collateral_usd,
          borrowing_ratio: borrow_amount_usd / user_collateral_usd,
          max_safe_ratio: 0.75,
          flash_loan_threshold: 100000
        }
        violation: borrowing_ratio > max_safe_ratio || borrow_amount_usd > flash_loan_threshold
        message: "Abnormal borrowing pattern detected"
      }

      constraint MULTI_HOP_ARBITRAGE {
        when: edge.type == "DEX" && edge.action == "Swap" && edge.hop_count >= 3
        condition: {
          initial_token: getInitialToken(edge.path),
          final_token: getFinalToken(edge.path),
          initial_amount: getInitialAmount(edge.path),
          final_amount: getFinalAmount(edge.path),
          arbitrage_profit: final_amount - initial_amount,
          profit_threshold: initial_amount * 0.01
        }
        violation: initial_token == final_token && arbitrage_profit > profit_threshold
        message: "Multi-hop arbitrage opportunity detected"
      }
    `;
  }

  /**
   * Benchmark lexer tokenization performance
   */
  async benchmarkTokenization(): Promise<void> {
    console.log('🔍 Benchmarking Lexer Tokenization Performance\n');

    const iterations = 1000;
    const times: number[] = [];

    // Warmup
    for (let i = 0; i < 10; i++) {
      const lexer = new DSLLexer(this.testDSL);
      lexer.tokenize();
    }

    // Benchmark
    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      const lexer = new DSLLexer(this.testDSL);
      const tokens = lexer.tokenize();
      const end = performance.now();
      times.push(end - start);
      
      // Verify consistent token count
      if (i === 0) {
        console.log(`📊 Total tokens generated: ${tokens.length}`);
      }
    }

    // Calculate statistics
    const totalTime = times.reduce((a, b) => a + b, 0);
    const averageTime = totalTime / times.length;
    const minTime = Math.min(...times);
    const maxTime = Math.max(...times);
    const throughput = 1000 / averageTime;

    console.log(`🚀 Lexer Performance Results (${iterations} iterations):`);
    console.log(`   Average: ${averageTime.toFixed(3)}ms`);
    console.log(`   Min/Max: ${minTime.toFixed(3)}ms / ${maxTime.toFixed(3)}ms`);
    console.log(`   Throughput: ${throughput.toFixed(1)} tokenizations/sec\n`);
  }

  /**
   * Benchmark different token types
   */
  async benchmarkTokenTypes(): Promise<void> {
    console.log('🔤 Benchmarking Token Type Performance\n');

    const testCases = [
      { name: 'Identifiers', input: 'edge total_in_usd profit_ratio getUserBalance getCollateralValue' },
      { name: 'Numbers', input: '123 456.789 0.98 105.0 200.0 1.5 0.75 100000' },
      { name: 'Operators', input: '== != <= >= && || + - * / < > !' },
      { name: 'Strings', input: '"DEX" "Swap" "Lending" "Borrow" "Repay" "Balancer"' },
      { name: 'Mixed', input: 'edge.type == "DEX" && profit_ratio > 105.0' }
    ];

    for (const testCase of testCases) {
      const times: number[] = [];
      const iterations = 5000;

      // Warmup
      for (let i = 0; i < 10; i++) {
        const lexer = new DSLLexer(testCase.input);
        lexer.tokenize();
      }

      // Benchmark
      for (let i = 0; i < iterations; i++) {
        const start = performance.now();
        const lexer = new DSLLexer(testCase.input);
        lexer.tokenize();
        const end = performance.now();
        times.push(end - start);
      }

      const averageTime = times.reduce((a, b) => a + b, 0) / times.length;
      const throughput = 1000 / averageTime;

      console.log(`   ${testCase.name.padEnd(12)}: ${averageTime.toFixed(3)}ms avg (${throughput.toFixed(1)} ops/sec)`);
    }

    console.log();
  }

  /**
   * Memory usage benchmark
   */
  async benchmarkMemoryUsage(): Promise<void> {
    console.log('💾 Benchmarking Lexer Memory Usage\n');

    const startMemory = process.memoryUsage();
    const lexers: DSLLexer[] = [];

    // Create many lexer instances
    for (let i = 0; i < 1000; i++) {
      const lexer = new DSLLexer(this.testDSL);
      lexer.tokenize();
      lexers.push(lexer);
    }

    const endMemory = process.memoryUsage();
    const memoryIncrease = (endMemory.heapUsed - startMemory.heapUsed) / 1024 / 1024;

    console.log(`📊 Memory Usage Results:`);
    console.log(`   Memory increase: ${memoryIncrease.toFixed(2)} MB`);
    console.log(`   Per lexer instance: ${(memoryIncrease / 1000).toFixed(4)} MB\n`);

    // Cleanup
    lexers.length = 0;
    if (global.gc) global.gc();
  }

  /**
   * Compare character code vs regex performance
   */
  async benchmarkCharCodeVsRegex(): Promise<void> {
    console.log('⚡ Comparing Character Code vs Regex Performance\n');

    const testString = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_';
    const iterations = 100000;

    // Regex approach
    const regexTimes: number[] = [];
    const identifierRegex = /[a-zA-Z0-9_]/;
    
    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      for (let j = 0; j < testString.length; j++) {
        identifierRegex.test(testString[j]);
      }
      const end = performance.now();
      regexTimes.push(end - start);
    }

    // Character code approach
    const charCodeTimes: number[] = [];
    
    const isIdentifierChar = (charCode: number): boolean => {
      return (charCode >= 97 && charCode <= 122) ||  // a-z
             (charCode >= 65 && charCode <= 90) ||   // A-Z
             (charCode >= 48 && charCode <= 57) ||   // 0-9
             charCode === 95;                        // _
    };

    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      for (let j = 0; j < testString.length; j++) {
        isIdentifierChar(testString.charCodeAt(j));
      }
      const end = performance.now();
      charCodeTimes.push(end - start);
    }

    const regexAvg = regexTimes.reduce((a, b) => a + b, 0) / regexTimes.length;
    const charCodeAvg = charCodeTimes.reduce((a, b) => a + b, 0) / charCodeTimes.length;
    const improvement = ((regexAvg - charCodeAvg) / regexAvg * 100);

    console.log(`📊 Character Classification Performance:`);
    console.log(`   Regex approach: ${regexAvg.toFixed(3)}ms avg`);
    console.log(`   CharCode approach: ${charCodeAvg.toFixed(3)}ms avg`);
    console.log(`   ✅ Improvement: ${improvement.toFixed(1)}% faster\n`);
  }

  /**
   * Run all lexer benchmarks
   */
  async runAllBenchmarks(): Promise<void> {
    console.log('🚀 Starting Lexer Performance Benchmark Suite\n');
    console.log('=' .repeat(60) + '\n');

    await this.benchmarkTokenization();
    await this.benchmarkTokenTypes();
    await this.benchmarkMemoryUsage();
    await this.benchmarkCharCodeVsRegex();

    console.log('=' .repeat(60));
    console.log('✅ Lexer benchmarks completed successfully!');
  }
}

// Export convenience function
export async function runLexerBenchmarks(): Promise<void> {
  const benchmark = new LexerBenchmark();
  await benchmark.runAllBenchmarks();
}

// Run if called directly
if (require.main === module) {
  runLexerBenchmarks().catch(console.error);
}