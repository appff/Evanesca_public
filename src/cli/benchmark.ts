#!/usr/bin/env node

import { runBenchmarks, PerformanceBenchmark } from '../Benchmarks/PerformanceBenchmark';

// Simple command line parsing
const args = process.argv.slice(2);
const options = {
  warmupIterations: 10,
  testIterations: 100,
  verbose: false,
  compare: false,
  file1: '',
  file2: ''
};

// Parse arguments
for (let i = 0; i < args.length; i++) {
  switch (args[i]) {
    case '--warmup':
    case '-w':
      options.warmupIterations = parseInt(args[++i]) || 10;
      break;
    case '--iterations':
    case '-i':
      options.testIterations = parseInt(args[++i]) || 100;
      break;
    case '--verbose':
    case '-v':
      options.verbose = true;
      break;
    case '--compare':
    case '-c':
      options.compare = true;
      options.file1 = args[++i];
      options.file2 = args[++i];
      break;
    case '--help':
    case '-h':
      console.log(`
Evanesca Performance Benchmark Tool

Usage:
  npm run benchmark                    Run benchmarks with default settings
  npm run benchmark -- --verbose       Run with verbose output
  npm run benchmark -- -w 5 -i 50     Set warmup and test iterations
  npm run benchmark -- --compare file1.json file2.json  Compare results

Options:
  -w, --warmup <n>      Number of warmup iterations (default: 10)
  -i, --iterations <n>  Number of test iterations (default: 100)
  -v, --verbose         Enable verbose output
  -c, --compare         Compare two benchmark result files
  -h, --help            Show this help message
      `);
      process.exit(0);
  }
}

async function main() {
  if (options.compare) {
    // Compare two benchmark files
    if (!options.file1 || !options.file2) {
      console.error('❌ Please provide two files to compare');
      process.exit(1);
    }
    PerformanceBenchmark.compareBenchmarks(options.file1, options.file2);
  } else {
    // Run benchmarks
    await runBenchmarks({
      warmupIterations: options.warmupIterations,
      testIterations: options.testIterations,
      verbose: options.verbose
    });
  }
}

main().catch(error => {
  console.error('❌ Benchmark failed:', error);
  process.exit(1);
});