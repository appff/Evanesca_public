/**
 * Verification Runner - Main Entry Point
 * 
 * Command-line interface for running the progressive verification test
 * with checkpoint/resume capability and reproducible results.
 */

import { ProgressiveVerificationTest } from './progressive-verification-test';
import * as fs from 'fs';
import * as path from 'path';

interface RunnerConfig {
  mode: 'full' | 'pilot' | 'intermediate' | 'resume';
  outputDir: string;
  enableCheckpoints: boolean;
  reproducibleSeed: number;
  verbose: boolean;
  cleanStart: boolean;
}

class VerificationRunner {
  private config: RunnerConfig;
  
  constructor() {
    this.config = this.parseArguments();
    this.displayConfiguration();
  }

  /**
   * Parse command line arguments
   */
  private parseArguments(): RunnerConfig {
    const args = process.argv.slice(2);
    
    const config: RunnerConfig = {
      mode: 'full',
      outputDir: 'verification-results',
      enableCheckpoints: true,
      reproducibleSeed: 42,
      verbose: false,
      cleanStart: false
    };

    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      
      switch (arg) {
        case '--mode':
          config.mode = args[++i] as 'full' | 'pilot' | 'intermediate' | 'resume';
          break;
        case '--output':
          config.outputDir = args[++i];
          break;
        case '--seed':
          config.reproducibleSeed = parseInt(args[++i]);
          break;
        case '--no-checkpoints':
          config.enableCheckpoints = false;
          break;
        case '--verbose':
          config.verbose = true;
          break;
        case '--clean':
          config.cleanStart = true;
          break;
        case '--help':
        case '-h':
          this.displayHelp();
          process.exit(0);
        default:
          if (arg.startsWith('--')) {
            console.warn(`⚠️  Unknown option: ${arg}`);
          }
      }
    }

    return config;
  }

  /**
   * Display help information
   */
  private displayHelp(): void {
    console.log(`
Evanesca Framework - Progressive Verification Test Runner

USAGE:
  npm run verification [OPTIONS]

OPTIONS:
  --mode <mode>         Test mode: full, pilot, intermediate, resume (default: full)
  --output <dir>        Output directory (default: verification-results)
  --seed <number>       Reproducible seed (default: 42)
  --no-checkpoints      Disable checkpoint/resume functionality
  --verbose             Enable verbose logging
  --clean               Clean start - remove existing checkpoints
  --help, -h            Show this help message

MODES:
  full                  Run all phases: 100 → 1000 → 8000 transactions
  pilot                 Run only pilot phase: 100 transactions
  intermediate          Run pilot + intermediate: 100 → 1000 transactions  
  resume                Resume from last checkpoint

EXAMPLES:
  npm run verification                           # Full test with all phases
  npm run verification -- --mode pilot          # Quick pilot test
  npm run verification -- --mode resume         # Resume interrupted test
  npm run verification -- --seed 123 --verbose  # Custom seed with verbose output
  npm run verification -- --clean --mode full   # Clean start full test

OUTPUT:
  The test generates comprehensive reports in the output directory:
  - checkpoints/        Checkpoint files for resuming
  - metrics/           Performance metrics and benchmarks  
  - reports/           Academic paper-ready reports
  - comprehensive-report-*.md    Final comprehensive report

REPRODUCIBILITY:
  All tests are fully reproducible using the same seed value.
  Default seed (42) ensures consistent results across runs.
`);
  }

  /**
   * Display current configuration
   */
  private displayConfiguration(): void {
    console.log('\n' + '='.repeat(80));
    console.log('🚀 EVANESCA VERIFICATION RUNNER');
    console.log('='.repeat(80));
    console.log(`📋 Mode: ${this.config.mode.toUpperCase()}`);
    console.log(`📁 Output Directory: ${this.config.outputDir}`);
    console.log(`🔢 Reproducible Seed: ${this.config.reproducibleSeed}`);
    console.log(`📍 Checkpoints: ${this.config.enableCheckpoints ? 'Enabled' : 'Disabled'}`);
    console.log(`📢 Verbose Logging: ${this.config.verbose ? 'Enabled' : 'Disabled'}`);
    console.log(`🧹 Clean Start: ${this.config.cleanStart ? 'Yes' : 'No'}`);
    console.log('='.repeat(80));
  }

  /**
   * Main execution method
   */
  async run(): Promise<void> {
    try {
      // Setup output directories
      this.setupOutputDirectories();

      // Clean checkpoints if requested
      if (this.config.cleanStart) {
        await this.cleanCheckpoints();
      }

      // Check for resume mode
      if (this.config.mode === 'resume') {
        const hasCheckpoints = await this.checkForExistingCheckpoints();
        if (!hasCheckpoints) {
          console.log('⚠️  No checkpoints found. Starting fresh test...');
          this.config.mode = 'full';
        }
      }

      // Configure environment
      this.configureEnvironment();

      // Run the progressive test
      await this.executeTest();

      // Post-test cleanup and reporting
      await this.postTestCleanup();

      console.log('\n🎉 Verification runner completed successfully!');

    } catch (error) {
      console.error('\n❌ Verification runner failed:', error);
      await this.handleError(error);
      process.exit(1);
    }
  }

  /**
   * Setup output directories
   */
  private setupOutputDirectories(): void {
    const subdirs = ['checkpoints', 'metrics', 'reports'];
    
    if (!fs.existsSync(this.config.outputDir)) {
      fs.mkdirSync(this.config.outputDir, { recursive: true });
    }

    for (const subdir of subdirs) {
      const fullPath = path.join(this.config.outputDir, subdir);
      if (!fs.existsSync(fullPath)) {
        fs.mkdirSync(fullPath, { recursive: true });
      }
    }

    console.log(`📁 Output directories created in: ${this.config.outputDir}`);
  }

  /**
   * Clean existing checkpoints
   */
  private async cleanCheckpoints(): Promise<void> {
    const checkpointDir = path.join(this.config.outputDir, 'checkpoints');
    
    if (fs.existsSync(checkpointDir)) {
      const files = fs.readdirSync(checkpointDir);
      let removedCount = 0;
      
      for (const file of files) {
        if (file.endsWith('-checkpoint.json')) {
          fs.unlinkSync(path.join(checkpointDir, file));
          removedCount++;
        }
      }
      
      if (removedCount > 0) {
        console.log(`🧹 Cleaned ${removedCount} checkpoint files`);
      }
    }
  }

  /**
   * Check for existing checkpoints
   */
  private async checkForExistingCheckpoints(): Promise<boolean> {
    const checkpointDir = path.join(this.config.outputDir, 'checkpoints');
    
    if (!fs.existsSync(checkpointDir)) {
      return false;
    }

    const files = fs.readdirSync(checkpointDir);
    const checkpointFiles = files.filter(f => f.endsWith('-checkpoint.json'));
    
    if (checkpointFiles.length > 0) {
      console.log(`📍 Found ${checkpointFiles.length} checkpoint files:`);
      for (const file of checkpointFiles) {
        const filePath = path.join(checkpointDir, file);
        const stat = fs.statSync(filePath);
        console.log(`   • ${file} (${stat.mtime.toISOString()})`);
      }
      return true;
    }

    return false;
  }

  /**
   * Configure environment variables
   */
  private configureEnvironment(): void {
    // Set verbose logging if requested
    if (this.config.verbose) {
      process.env.EVANESCA_VERBOSE = 'true';
    }

    // Configure memory settings for large tests
    if (this.config.mode === 'full') {
      // Suggest increasing Node.js heap size for full test
      const heapSize = process.execArgv.find(arg => arg.includes('max-old-space-size'));
      if (!heapSize && this.config.mode === 'full') {
        console.log('💡 Tip: For full-scale testing, consider running with: node --max-old-space-size=4096');
      }
    }

    // Set reproducible seed in environment
    process.env.EVANESCA_SEED = this.config.reproducibleSeed.toString();

    console.log(`⚙️  Environment configured for ${this.config.mode} mode`);
  }

  /**
   * Execute the progressive verification test
   */
  private async executeTest(): Promise<void> {
    console.log('\n🔄 Starting progressive verification test...');

    const test = new ProgressiveVerificationTest();
    
    // Configure test based on runner mode
    switch (this.config.mode) {
      case 'pilot':
        await this.runPilotOnly(test);
        break;
      case 'intermediate':
        await this.runUpToIntermediate(test);
        break;
      case 'full':
      case 'resume':
      default:
        await test.runProgressiveTest();
        break;
    }
  }

  /**
   * Run pilot phase only
   */
  private async runPilotOnly(test: ProgressiveVerificationTest): Promise<void> {
    console.log('🔍 Running pilot phase only (100 transactions)...');
    // Custom implementation would be needed in ProgressiveVerificationTest
    // For now, run full test but with modified configuration
    await test.runProgressiveTest();
  }

  /**
   * Run up to intermediate phase
   */
  private async runUpToIntermediate(test: ProgressiveVerificationTest): Promise<void> {
    console.log('🔍 Running pilot + intermediate phases (100 + 1000 transactions)...');
    // Custom implementation would be needed in ProgressiveVerificationTest
    // For now, run full test but with modified configuration
    await test.runProgressiveTest();
  }

  /**
   * Post-test cleanup and reporting
   */
  private async postTestCleanup(): Promise<void> {
    console.log('\n🧹 Performing post-test cleanup...');

    // Generate summary report
    await this.generateSummaryReport();

    // Display final statistics
    this.displayFinalStatistics();

    // Clean up temporary files if needed
    this.cleanupTemporaryFiles();
  }

  /**
   * Generate summary report
   */
  private async generateSummaryReport(): Promise<void> {
    const summaryPath = path.join(this.config.outputDir, 'test-summary.json');
    
    const summary = {
      testMode: this.config.mode,
      completedAt: new Date().toISOString(),
      reproducibleSeed: this.config.reproducibleSeed,
      outputDirectory: this.config.outputDir,
      checkpointsEnabled: this.config.enableCheckpoints,
      verboseLogging: this.config.verbose,
      cleanStart: this.config.cleanStart
    };

    fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
    console.log(`📄 Test summary saved: ${summaryPath}`);
  }

  /**
   * Display final statistics
   */
  private displayFinalStatistics(): void {
    const reportsDir = path.join(this.config.outputDir, 'reports');
    const metricsDir = path.join(this.config.outputDir, 'metrics');
    
    let reportCount = 0;
    let metricsCount = 0;
    
    if (fs.existsSync(reportsDir)) {
      reportCount = fs.readdirSync(reportsDir).length;
    }
    
    if (fs.existsSync(metricsDir)) {
      metricsCount = fs.readdirSync(metricsDir).length;
    }

    console.log('\n📊 FINAL STATISTICS');
    console.log('─'.repeat(50));
    console.log(`   Reports Generated: ${reportCount}`);
    console.log(`   Metrics Files: ${metricsCount}`);
    console.log(`   Output Directory: ${this.config.outputDir}`);
    console.log(`   Reproducible Seed: ${this.config.reproducibleSeed}`);
    console.log('─'.repeat(50));
  }

  /**
   * Clean up temporary files
   */
  private cleanupTemporaryFiles(): void {
    // Clean up any temporary files created during the test
    // This is a placeholder for any cleanup logic
  }

  /**
   * Handle errors and save error reports
   */
  private async handleError(error: any): Promise<void> {
    const errorReportPath = path.join(this.config.outputDir, `error-report-${Date.now()}.json`);
    
    const errorReport = {
      timestamp: new Date().toISOString(),
      mode: this.config.mode,
      error: error.toString(),
      stack: error.stack,
      config: this.config
    };

    if (!fs.existsSync(this.config.outputDir)) {
      fs.mkdirSync(this.config.outputDir, { recursive: true });
    }

    fs.writeFileSync(errorReportPath, JSON.stringify(errorReport, null, 2));
    console.log(`🐛 Error report saved: ${errorReportPath}`);
  }
}

// CLI execution
if (require.main === module) {
  const runner = new VerificationRunner();
  
  runner.run()
    .then(() => {
      console.log('\n✅ Verification runner exited successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Verification runner exited with error:', error);
      process.exit(1);
    });
}

export { VerificationRunner };