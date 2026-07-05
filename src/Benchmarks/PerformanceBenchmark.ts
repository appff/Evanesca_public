import { DSLConstraintSolver } from '../DSL/DSLConstraintSolver';
import { DSLLexer, DSLParser } from '../DSL/DSLParser';
import { getGlobalDSLCache } from '../DSL/DSLCache';
import { getGlobalPriceCache } from '../config/PriceCache';
import { getGlobalDSLCompiler } from '../DSL/DSLCompiler';
import { batchToUSD, toUSD } from '../Utils/PriceManager/PriceUtils';
import { DebugLogger } from '../Utils/DebugLogger';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Performance benchmark results interface
 */
export interface BenchmarkResult {
  name: string;
  iterations: number;
  totalTime: number;
  averageTime: number;
  minTime: number;
  maxTime: number;
  standardDeviation: number;
  throughput: number; // operations per second
}

/**
 * Benchmark suite configuration
 */
export interface BenchmarkConfig {
  warmupIterations: number;
  testIterations: number;
  verbose: boolean;
}

/**
 * Performance Benchmarking Suite for Evanesca
 * Measures performance of various optimizations
 */
export class PerformanceBenchmark {
  private config: BenchmarkConfig;
  private results: BenchmarkResult[] = [];

  constructor(config: Partial<BenchmarkConfig> = {}) {
    this.config = {
      warmupIterations: 10,
      testIterations: 100,
      verbose: false,
      ...config
    };
  }

  /**
   * Run all benchmarks
   */
  async runAllBenchmarks(): Promise<void> {
    console.log('🚀 Starting Evanesca Performance Benchmark Suite\n');
    
    // DSL Parsing benchmarks
    await this.benchmarkDSLParsing();
    
    // DSL Compilation benchmarks
    await this.benchmarkDSLCompilation();
    
    // Price conversion benchmarks
    await this.benchmarkPriceConversion();
    
    // Memory usage benchmarks
    await this.benchmarkMemoryUsage();
    
    // Full constraint solving benchmark
    await this.benchmarkConstraintSolving();
    
    // Generate report
    this.generateReport();
  }

  /**
   * Benchmark DSL parsing with and without caching
   */
  private async benchmarkDSLParsing(): Promise<void> {
    console.log('📊 Benchmarking DSL Parsing...\n');
    
    const dslRules = `
    constraint D2_TEST {
      when: edge.type == "DEX" && edge.action == "Swap"
      condition: {
        profit_ratio: (total_out_usd / total_in_usd) * 100
      }
      violation: profit_ratio > 110
      message: "Test constraint"
    }`;

    // Clear cache
    getGlobalDSLCache().clear();

    // Benchmark without caching
    const noCacheResult = await this.runBenchmark('DSL Parsing (No Cache)', () => {
      const lexer = new DSLLexer(dslRules);
      const tokens = lexer.tokenize();
      const parser = new DSLParser(tokens);
      parser.parseMultipleConstraints();
    });

    // Benchmark with caching
    const cache = getGlobalDSLCache();
    const cacheResult = await this.runBenchmark('DSL Parsing (With Cache)', () => {
      let constraints = cache.get(dslRules);
      if (!constraints) {
        const lexer = new DSLLexer(dslRules);
        const tokens = lexer.tokenize();
        const parser = new DSLParser(tokens);
        constraints = parser.parseMultipleConstraints();
        if (constraints) {
          cache.set(dslRules, constraints, 1);
        }
      }
    });

    this.results.push(noCacheResult, cacheResult);
    
    const improvement = ((noCacheResult.averageTime - cacheResult.averageTime) / noCacheResult.averageTime * 100).toFixed(1);
    console.log(`✅ Cache improvement: ${improvement}% faster\n`);
  }

  /**
   * Benchmark DSL compilation
   */
  private async benchmarkDSLCompilation(): Promise<void> {
    console.log('📊 Benchmarking DSL Compilation...\n');
    
    const testConstraint = {
      type: 'constraint_def' as const,
      name: 'BENCH_CONSTRAINT',
      when: {
        type: 'binary_expression' as const,
        operator: '==',
        left: { type: 'identifier' as const, name: 'test' },
        right: { type: 'number' as const, value: 1 }
      },
      violation: {
        type: 'binary_expression' as const,
        operator: '>',
        left: { type: 'identifier' as const, name: 'value' },
        right: { type: 'number' as const, value: 100 }
      },
      message: 'Benchmark violation'
    };

    const compiler = getGlobalDSLCompiler();
    compiler.clearCache();

    // Benchmark compilation
    const compileResult = await this.runBenchmark('DSL Compilation', () => {
      compiler.compileConstraint(testConstraint);
    });

    // Benchmark execution
    const compiled = compiler.compileConstraint(testConstraint);
    const context = { test: 1, value: 150 };
    
    const execResult = await this.runBenchmark('Compiled Constraint Execution', () => {
      compiler.executeCompiled(compiled, context);
    });

    this.results.push(compileResult, execResult);
  }

  /**
   * Benchmark price conversion with batching
   */
  private async benchmarkPriceConversion(): Promise<void> {
    console.log('📊 Benchmarking Price Conversion...\n');
    
    // Test data
    const tokens = [
      { tokenAmount: '1000000000000000000', tokenSymbol: 'ETH', tokenAddr: '0x0', blockNo: 9506114 },
      { tokenAmount: '100000000', tokenSymbol: 'WBTC', tokenAddr: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599', blockNo: 9506114 },
      { tokenAmount: '1000000', tokenSymbol: 'USDT', tokenAddr: '0xdAC17F958D2ee523a2206206994597C13D831ec7', blockNo: 9506114 },
      { tokenAmount: '1000000', tokenSymbol: 'USDC', tokenAddr: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', blockNo: 9506114 }
    ];

    // Clear price cache
    getGlobalPriceCache().clear();

    // Benchmark individual conversions
    const individualResult = await this.runBenchmark('Individual toUSD Calls', async () => {
      for (const token of tokens) {
        await toUSD(token.tokenAmount, token.tokenSymbol, token.tokenAddr, token.blockNo);
      }
    });

    // Benchmark batch conversion
    const batchResult = await this.runBenchmark('Batch toUSD Call', async () => {
      await batchToUSD(tokens);
    });

    this.results.push(individualResult, batchResult);
    
    const improvement = ((individualResult.averageTime - batchResult.averageTime) / individualResult.averageTime * 100).toFixed(1);
    console.log(`✅ Batch improvement: ${improvement}% faster\n`);
  }

  /**
   * Benchmark memory usage patterns
   */
  private async benchmarkMemoryUsage(): Promise<void> {
    console.log('📊 Benchmarking Memory Usage...\n');
    
    const startMemory = process.memoryUsage();
    
    // Create many constraints
    const solver = new DSLConstraintSolver(9506114);
    const constraints: string[] = [];
    
    for (let i = 0; i < 1000; i++) {
      constraints.push(`
        constraint MEMORY_TEST_${i} {
          when: edge.type == "DEX"
          violation: total_out_usd > ${100 + i}
          message: "Memory test ${i}"
        }
      `);
    }
    
    const loadResult = await this.runBenchmark('Loading 1000 Constraints', () => {
      solver.loadDSLRules(constraints.join('\n'));
    });
    
    const endMemory = process.memoryUsage();
    const memoryIncrease = (endMemory.heapUsed - startMemory.heapUsed) / 1024 / 1024;
    
    console.log(`💾 Memory increase: ${memoryIncrease.toFixed(2)} MB\n`);
    
    // Test memory cleanup
    const cleanupResult = await this.runBenchmark('Memory Cleanup', () => {
      solver.clearConstraints();
      getGlobalDSLCache().clear();
      getGlobalPriceCache().clear();
      if (global.gc) global.gc();
    });
    
    this.results.push(loadResult, cleanupResult);
  }

  /**
   * Benchmark full constraint solving
   */
  private async benchmarkConstraintSolving(): Promise<void> {
    console.log('📊 Benchmarking Full Constraint Solving...\n');
    
    // Mock graph and edge sequence
    const mockGraph = {
      node: (id: string) => ({ Type: 'DEX', id }),
      edge: (source: string, target: string) => undefined,
      nodes: () => ['node1', 'node2'],
      edges: () => []
    };
    
    const mockEdgeSeq = Array(10).fill(0).map((_, i) => ({
      w: `node${i}`,
      v: `user${i}`,
      name: [JSON.stringify({
        Action: 'Swap',
        AmountIn: '1000000000000000000',
        Token0: 'ETH',
        Token0Addr: '0x0',
        AmountOut: '100000000',
        Token1: 'WBTC',
        Token1Addr: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599'
      })]
    }));

    const solver = new DSLConstraintSolver(9506114);
    solver.loadDSLRules(`
      constraint BENCH_D2 {
        when: edge.type == "DEX"
        condition: {
          profit_ratio: (total_out_usd / total_in_usd) * 100
        }
        violation: profit_ratio > 105
        message: "Benchmark abnormal swap"
      }
    `);

    const solveResult = await this.runBenchmark('Full Constraint Solving', async () => {
      await solver.solve(mockGraph, mockEdgeSeq);
    });

    this.results.push(solveResult);
  }

  /**
   * Run a single benchmark
   */
  private async runBenchmark(name: string, fn: () => void | Promise<void>): Promise<BenchmarkResult> {
    const times: number[] = [];
    
    // Warmup
    for (let i = 0; i < this.config.warmupIterations; i++) {
      await fn();
    }
    
    // Test iterations
    for (let i = 0; i < this.config.testIterations; i++) {
      const start = performance.now();
      await fn();
      const end = performance.now();
      times.push(end - start);
    }
    
    // Calculate statistics
    const totalTime = times.reduce((a, b) => a + b, 0);
    const averageTime = totalTime / times.length;
    const minTime = Math.min(...times);
    const maxTime = Math.max(...times);
    
    // Standard deviation
    const variance = times.reduce((sum, time) => sum + Math.pow(time - averageTime, 2), 0) / times.length;
    const standardDeviation = Math.sqrt(variance);
    
    // Throughput (operations per second)
    const throughput = 1000 / averageTime;
    
    const result: BenchmarkResult = {
      name,
      iterations: this.config.testIterations,
      totalTime,
      averageTime,
      minTime,
      maxTime,
      standardDeviation,
      throughput
    };
    
    if (this.config.verbose) {
      console.log(`${name}:`);
      console.log(`  Average: ${averageTime.toFixed(3)}ms`);
      console.log(`  Min/Max: ${minTime.toFixed(3)}ms / ${maxTime.toFixed(3)}ms`);
      console.log(`  Std Dev: ${standardDeviation.toFixed(3)}ms`);
      console.log(`  Throughput: ${throughput.toFixed(1)} ops/sec\n`);
    }
    
    return result;
  }

  /**
   * Generate benchmark report
   */
  private generateReport(): void {
    console.log('\n' + '='.repeat(80));
    console.log('📈 PERFORMANCE BENCHMARK REPORT');
    console.log('='.repeat(80) + '\n');
    
    // Create results table
    const headers = ['Benchmark', 'Avg Time (ms)', 'Min (ms)', 'Max (ms)', 'Std Dev', 'Throughput'];
    const colWidths = [30, 15, 10, 10, 10, 15];
    
    // Print headers
    headers.forEach((header, i) => {
      process.stdout.write(header.padEnd(colWidths[i]));
    });
    console.log('\n' + '-'.repeat(80));
    
    // Print results
    for (const result of this.results) {
      const row = [
        result.name,
        result.averageTime.toFixed(3),
        result.minTime.toFixed(3),
        result.maxTime.toFixed(3),
        result.standardDeviation.toFixed(3),
        `${result.throughput.toFixed(1)} ops/s`
      ];
      
      row.forEach((cell, i) => {
        process.stdout.write(cell.padEnd(colWidths[i]));
      });
      console.log();
    }
    
    console.log('\n' + '='.repeat(80));
    
    // Save to file
    this.saveResults();
  }

  /**
   * Save benchmark results to file
   */
  private saveResults(): void {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `benchmark-results-${timestamp}.json`;
    const filepath = path.join(__dirname, '..', '..', 'benchmark-results', filename);
    
    // Create directory if it doesn't exist
    const dir = path.dirname(filepath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    const data = {
      timestamp: new Date().toISOString(),
      config: this.config,
      results: this.results,
      environment: {
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
        memory: process.memoryUsage()
      }
    };
    
    fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
    console.log(`\n💾 Results saved to: ${filename}`);
  }

  /**
   * Compare two benchmark files
   */
  static compareBenchmarks(file1: string, file2: string): void {
    const data1 = JSON.parse(fs.readFileSync(file1, 'utf8'));
    const data2 = JSON.parse(fs.readFileSync(file2, 'utf8'));
    
    console.log('\n📊 BENCHMARK COMPARISON');
    console.log(`Old: ${data1.timestamp}`);
    console.log(`New: ${data2.timestamp}\n`);
    
    const results1Map = new Map(data1.results.map((r: BenchmarkResult) => [r.name, r]));
    
    for (const result2 of data2.results) {
      const result1 = results1Map.get(result2.name);
      if (result1) {
        const improvement = (((result1 as BenchmarkResult).averageTime - result2.averageTime) / (result1 as BenchmarkResult).averageTime * 100);
        const symbol = improvement > 0 ? '✅' : '❌';
        console.log(`${symbol} ${result2.name}:`);
        console.log(`   Old: ${(result1 as BenchmarkResult).averageTime.toFixed(3)}ms`);
        console.log(`   New: ${result2.averageTime.toFixed(3)}ms`);
        console.log(`   Change: ${improvement > 0 ? '+' : ''}${improvement.toFixed(1)}%\n`);
      }
    }
  }
}

// Export convenience function
export async function runBenchmarks(config?: Partial<BenchmarkConfig>): Promise<void> {
  const benchmark = new PerformanceBenchmark(config);
  await benchmark.runAllBenchmarks();
}