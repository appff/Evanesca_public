#!/usr/bin/env npx tsx

/**
 * Protocol Verification Script - Adjustable Transaction Size
 * 
 * Usage:
 *   npx tsx src/verification-tools/run-protocol-verification.ts --limit 100
 *   npm run verify:protocol -- --limit 100
 *   npm run verify:protocol -- --limit 2000 --progressive
 *   npm run verify:protocol -- --limit 8000 --save-violations
 * 
 * Dataset Location:
 *   verification-results/protocol-verification-dataset/
 *   - Contains 8000 pre-loaded transactions (2000 per protocol)
 */

// IMPORTANT: Set environment variables BEFORE any imports to ensure proper DSL loading
process.env.PROTOCOL_VERIFICATION_MODE = 'true';  // Ensure ONLY ProtocolInvariants.dsl is used
process.env.DSL_FILE = 'src/DSL/constraints/protocol_invariants.dsl';
process.env.BYPASS_FILTER = 'true';  // Protocol verification analyzes ALL transactions

import fs from 'fs';
import path from 'path';
import { run } from '../Driver';
import { performance } from 'perf_hooks';
import { EvanescaContext } from '../Interfaces/EvanescaContext';
import { AnalysisResult } from '../ConstraintSolver/Interfaces/AnalysisResult';
import { getEventLogs } from '../Utils/Driver/DriverUtils';
import { makeLogs } from '../ABIDecoder/LogDecoder';
import { getSemantic, buildModelMap } from '../SemanticFinancialGraph/SemanticFinancialGraphUtils';
import { ConstraintIndexMapper } from '../ConstraintSolver/ConstraintIndexMapper';
import { BatchProcessor, BatchResult } from '../ProtocolVerification/BatchProcessor';

// Parse command line arguments
interface CLIOptions {
    limit: number;
    progressive: boolean;
    saveViolations: boolean;
    verbose: boolean;
    exportCsv: boolean;
    batchMode: boolean;
    batchSize: number;
    parallel: number;
}

function parseArgs(): CLIOptions {
    const args = process.argv.slice(2);
    const options: CLIOptions = {
        limit: 10000, // Default - balanced 10K dataset
        progressive: false,
        saveViolations: false,
        verbose: false,
        exportCsv: false,
        batchMode: false,
        batchSize: 100,
        parallel: 4
    };
    
    for (let i = 0; i < args.length; i++) {
        switch (args[i]) {
            case '--limit':
            case '-l':
                const limit = parseInt(args[++i]);
                if (!isNaN(limit) && limit > 0) {
                    options.limit = limit;
                } else {
                    console.error('❌ Invalid limit value. Using default 8000.');
                }
                break;
            case '--progressive':
            case '-p':
                options.progressive = true;
                break;
            case '--save-violations':
            case '-s':
                options.saveViolations = true;
                break;
            case '--verbose':
            case '-v':
                options.verbose = true;
                break;
            case '--export-csv':
            case '-csv':
                options.exportCsv = true;
                break;
            case '--batch':
            case '-b':
                options.batchMode = true;
                break;
            case '--batch-size':
                const batchSize = parseInt(args[++i]);
                if (!isNaN(batchSize) && batchSize > 0) {
                    options.batchSize = batchSize;
                }
                break;
            case '--parallel':
                const parallel = parseInt(args[++i]);
                if (!isNaN(parallel) && parallel > 0) {
                    options.parallel = parallel;
                }
                break;
            case '--help':
            case '-h':
                console.log(`
Protocol Verification Script

Usage:
  npx tsx src/verification-tools/run-protocol-verification.ts [options]

Options:
  --limit, -l <number>      Number of transactions to verify (default: 8000)
  --progressive, -p         Run progressive verification (10, 100, 1000, up to limit)
  --save-violations, -s     Save violation details to JSON file
  --verbose, -v            Show detailed output
  --export-csv, -csv       Export detailed results to CSV for ground truth analysis
  --batch, -b              Enable batch processing mode for performance
  --batch-size <number>    Batch size for processing (default: 100)
  --parallel <number>      Number of parallel workers (default: 4)
  --help, -h               Show this help message

Examples:
  npx tsx src/verification-tools/run-protocol-verification.ts --limit 100
  npx tsx src/verification-tools/run-protocol-verification.ts --limit 2000 --progressive
  npm run verify:protocol -- --limit 500 --save-violations
                `);
                process.exit(0);
        }
    }
    
    return options;
}

interface TransactionData {
    hash: string;
    blockNumber: number;
    timestamp: number;
    protocol?: string;
    [key: string]: any;
}

interface TransactionVerificationResult {
    txHash: string;
    protocol: string;
    blockNumber: number;
    etherscanLink: string;
    expectedEdges: string;  // Description of expected edges from transaction sampling
    actualEdges: string;    // Description of actual edges created in SFG
    eventDiagnostics: string;  // Diagnostic info about events
    foundEvents: string;    // Events found in transaction
    matchedEvents: string;  // Events that matched semantic model
    constraintViolations: string[];
    sfgCreated: boolean;
    processingTimeMs: number;
    errorMessage?: string;
}

interface VerificationStats {
    phase: string;
    totalTransactions: number;
    successfulAnalysis: number;
    protocolViolations: number;  // Protocol compliance violations (NOT attacks)
    edgeCreationRate: number;
    expectedEdges: number;  // Expected number of edges (should equal totalTransactions for DeFi)
    actualEdges: number;    // Actual number of edges created
    totalEdgeCount: number; // Total edges across all transactions
    processingTimeMs: number;
    transactionsPerSecond: number;
}

class ProtocolVerifier {
    private allTransactions: TransactionData[] = [];
    private stats: VerificationStats[] = [];
    private options: CLIOptions;
    private violations: any[] = [];
    private detailedResults: TransactionVerificationResult[] = [];
    private semanticGaps: Map<string, Set<string>> = new Map(); // Track unmapped events per protocol
    private eventFrequency: Map<string, number> = new Map(); // Track event frequency
    private constraintMapper: ConstraintIndexMapper; // Dynamic constraint mapper for correct DSL file
    private batchProcessor: BatchProcessor | null = null; // Batch processor for performance optimization
    
    constructor(options: CLIOptions) {
        this.options = options;
        // Initialize constraint mapper with the correct DSL file
        const dslPath = path.join(__dirname, '..', 'DSL', 'constraints', 'protocol_invariants.dsl');
        this.constraintMapper = new ConstraintIndexMapper(dslPath);
        console.log('📜 [ProtocolVerifier] Using DSL file for constraint mapping:', dslPath);
        
        // Initialize batch processor if batch mode is enabled
        if (options.batchMode) {
            this.batchProcessor = new BatchProcessor({
                batchSize: options.batchSize,
                parallelWorkers: options.parallel,
                cacheEnabled: true,
                memoryLimit: 4096
            });
            console.log('🚀 [ProtocolVerifier] Batch processing enabled with batch size:', options.batchSize);
        }
    }
    
    /**
     * Get current timestamp in KST (Korean Standard Time)
     * KST is UTC+9
     */
    private getKSTTimestamp(): string {
        const now = new Date();
        // Add 9 hours for KST (UTC+9)
        const kstOffset = 9 * 60 * 60 * 1000;
        const kstTime = new Date(now.getTime() + kstOffset);
        
        // Format: YYYY-MM-DDTHH:mm:ss.sssZ with KST indicator
        const isoString = kstTime.toISOString().replace('Z', '+09:00');
        return isoString;
    }
    
    /**
     * Get KST timestamp formatted for filenames (no colons or dots)
     */
    private getKSTFilenameTimestamp(): string {
        return this.getKSTTimestamp().replace(/[:.]/g, '-').replace('+09-00', 'KST');
    }
    
    /**
     * Track semantic model gaps for analysis
     */
    private trackSemanticGaps(protocol: string, edgeAnalysis: any): void {
        // Track unmapped events per protocol
        if (!this.semanticGaps.has(protocol)) {
            this.semanticGaps.set(protocol, new Set());
        }
        
        const protocolGaps = this.semanticGaps.get(protocol)!;
        
        // Add unmapped events to the gap set
        for (const event of edgeAnalysis.unmatchedEvents) {
            protocolGaps.add(event);
        }
        
        // Track event frequency
        for (const event of edgeAnalysis.foundEvents) {
            const key = `${protocol}:${event}`;
            this.eventFrequency.set(key, (this.eventFrequency.get(key) || 0) + 1);
        }
    }
    
    /**
     * Generate semantic gap analysis report
     */
    private generateSemanticGapReport(): void {
        console.log('\n🎯 Semantic Model Gap Analysis');
        console.log('=' .repeat(60));
        
        if (this.semanticGaps.size === 0) {
            console.log('No semantic gaps detected.');
            return;
        }
        
        // Report gaps per protocol
        for (const [protocol, gaps] of this.semanticGaps.entries()) {
            if (gaps.size > 0) {
                console.log(`\n📁 Protocol: ${protocol}`);
                console.log(`  Unmapped Events (${gaps.size}):`);
                
                // Sort gaps by frequency
                const sortedGaps = Array.from(gaps).sort((a, b) => {
                    const freqA = this.eventFrequency.get(`${protocol}:${a.split('(')[0]}`) || 0;
                    const freqB = this.eventFrequency.get(`${protocol}:${b.split('(')[0]}`) || 0;
                    return freqB - freqA;
                });
                
                for (const gap of sortedGaps.slice(0, 5)) {  // Show top 5
                    const eventName = gap.split('(')[0];
                    const freq = this.eventFrequency.get(`${protocol}:${eventName}`) || 0;
                    console.log(`    - ${gap} (${freq} occurrences)`);
                }
                
                if (sortedGaps.length > 5) {
                    console.log(`    ... and ${sortedGaps.length - 5} more`);
                }
            }
        }
        
        // Summary recommendations
        console.log('\n💡 Recommendations:');
        console.log('  1. Add Transfer event mapping for DEX protocols (most common gap)');
        console.log('  2. Update semantic models to include protocol-specific events');
        console.log('  3. Consider dynamic semantic model updates based on observed patterns');
        
        console.log('\n' + '='.repeat(60));
    }
    
    private getExplorerLink(txHash: string, chainId: number = 1): string {
        // Map chain IDs to explorer URLs
        const explorers: { [key: number]: string } = {
            1: 'https://etherscan.io/tx/',
            56: 'https://bscscan.com/tx/',
            137: 'https://polygonscan.com/tx/',
            42161: 'https://arbiscan.io/tx/',
            10: 'https://optimistic.etherscan.io/tx/',
            43114: 'https://snowtrace.io/tx/',
            1285: 'https://moonriver.moonscan.io/tx/'
        };
        
        const baseUrl = explorers[chainId] || explorers[1];
        return `${baseUrl}${txHash}`;
    }
    
    /**
     * Enhanced event analysis with diagnostic information
     * @param txHash Transaction hash to analyze
     * @returns Detailed edge expectation with diagnostics
     */
    private async getExpectedEdgesFromEvents(txHash: string): Promise<{
        expectedCount: string;
        eventDiagnostics: string;
        foundEvents: string[];
        matchedEvents: string[];
        unmatchedEvents: string[];
    }> {
        try {
            // Get transaction logs
            const logs = await getEventLogs(txHash);
            if (!logs || logs.length === 0) {
                return {
                    expectedCount: '0',
                    eventDiagnostics: 'No logs found',
                    foundEvents: [],
                    matchedEvents: [],
                    unmatchedEvents: []
                };
            }
            
            // Decode logs
            const decodedLogs = makeLogs(logs);
            
            // Enhanced analysis
            let expectedEdgeCount = 0;
            const foundEvents: string[] = [];
            const matchedEvents: string[] = [];
            const unmatchedEvents: string[] = [];
            let transferEventCount = 0;
            
            for (const log of decodedLogs) {
                foundEvents.push(log.name);
                
                // Get semantic model for this contract
                const semantic = getSemantic({ address: log.address });
                
                if (semantic) {
                    // Define administrative events to exclude from expected edge count
                    const administrativeEvents = [
                        'AccrueInterest', 'UpdateInterest', 'NewReserveFactor', 
                        'NewMarketInterestRateModel', 'NewAdmin', 'NewPendingAdmin',
                        'ActionPaused', 'MarketEntered', 'MarketExited', 'Transfer'
                    ];
                    
                    // Skip administrative events - they don't contribute to protocol verification
                    if (administrativeEvents.includes(log.name)) {
                        unmatchedEvents.push(`${log.name}(${semantic.Service}-Administrative)`);
                        continue; // Don't count these in expected edges
                    }
                    
                    // Special handling for Uniswap protocol
                    if (semantic.Service === 'Uniswap' || semantic.Service === 'UniswapV2' || semantic.Service === 'UniswapV3') {
                        // For Uniswap, only count events that actually create SFG edges:
                        // 1. Events in semantic model (Swap, TokenPurchase, EthPurchase)
                        // 2. Mint/Burn (liquidity events that create edges but aren't in semantic model)
                        
                        if (semantic.Events && semantic.Events.includes(log.name)) {
                            // Event is in semantic model (Swap, TokenPurchase, EthPurchase)
                            expectedEdgeCount++;
                            matchedEvents.push(`${log.name}(${semantic.Service})`);
                        } else if (log.name === 'Mint' || log.name === 'Burn') {
                            // Mint and Burn events for Uniswap create edges in SFG
                            expectedEdgeCount++;
                            matchedEvents.push(`${log.name}(${semantic.Service}-Liquidity)`);
                        } else {
                            // Other Uniswap events excluded from baseline
                            unmatchedEvents.push(`${log.name}(${semantic.Service}-Excluded)`);
                        }
                    } else {
                        // For non-Uniswap protocols, only count events in semantic model (SFG contributors)
                        if (semantic.Events && semantic.Events.includes(log.name)) {
                            // This event will create an edge in the SFG
                            expectedEdgeCount++;
                            matchedEvents.push(`${log.name}(${semantic.Service})`);
                        } else {
                            // Unmapped events excluded from baseline
                            unmatchedEvents.push(`${log.name}(${semantic.Service}-Unsupported)`);
                        }
                    }
                } else {
                    // Unsupported protocols - exclude from expected edge count
                    unmatchedEvents.push(`${log.name}(Unknown-Protocol)`);
                }
            }
            
            // Build diagnostics message
            let expectedCount = expectedEdgeCount.toString();
            let diagnostics = `Found ${foundEvents.length} events`;
            
            if (matchedEvents.length > 0) {
                diagnostics += `, ${matchedEvents.length} create SFG edges`;
            }
            
            if (unmatchedEvents.length > 0) {
                diagnostics += `, ${unmatchedEvents.length} ignored`;
            }
            
            return {
                expectedCount,
                eventDiagnostics: diagnostics,
                foundEvents,
                matchedEvents,
                unmatchedEvents
            };
        } catch (error) {
            // If we can't get events, provide diagnostic info
            return {
                expectedCount: '≥1',
                eventDiagnostics: `Error: ${error}`,
                foundEvents: [],
                matchedEvents: [],
                unmatchedEvents: []
            };
        }
    }
    
    private getExpectedEdgesDescription(protocol: string): string {
        // Fallback for when we can't analyze events
        // We expect at least 1 edge per DeFi transaction
        return '≥1';  // Expected at least 1 edge for DeFi protocols
    }
    
    async loadTransactions(): Promise<void> {
        console.log('📂 Loading transaction dataset...\n');
        
        // Build semantic model map for event matching
        buildModelMap();
        
        const baseDir = path.join(__dirname, '../..', 'verification-results', 'protocol-verification-dataset');
        
        // First try to load the balanced 10K dataset
        const balanced10kPath = path.join(baseDir, 'balanced-10k', 'balanced-10k-shuffled.json');
        if (fs.existsSync(balanced10kPath)) {
            console.log('📊 Loading balanced 10K dataset (2000 per protocol)...');
            const data = JSON.parse(fs.readFileSync(balanced10kPath, 'utf-8'));
            
            // Extract transactions from the dataset
            const transactions = data.transactions || [];
            
            // Convert to expected format with protocol detection
            this.allTransactions = transactions.map((hash: string) => {
                // Try to determine protocol from the transaction (can be enhanced with actual logic)
                // For now, we'll distribute evenly across protocols
                return {
                    hash: hash,
                    protocol: 'Mixed',  // Will be determined from actual transaction
                    blockNumber: 0,  // Will be fetched by Driver
                    timestamp: 0     // Will be fetched by Driver
                };
            });
            
            // Show metadata if available
            if (data.metadata && data.metadata.protocols) {
                console.log('  📊 Protocol Distribution:');
                for (const [protocol, info] of Object.entries(data.metadata.protocols as any)) {
                    console.log(`     - ${protocol}: ${(info as any).count} transactions`);
                }
            }
            
            console.log(`  ✅ Loaded ${this.allTransactions.length} transactions from balanced dataset`);
        } else {
            // Fallback to loading individual protocol files
            console.log('⚠️  Balanced 10K dataset not found, loading individual protocol files...');
            
            // Try to load balanced 2000 files first
            const protocols = ['uniswap', 'curve', 'compound', 'aave', 'balancer'];
            
            for (const protocol of protocols) {
                // First try balanced-10k directory
                let filePath = path.join(baseDir, 'balanced-10k', `${protocol}-balanced-2000.json`);
                
                // If not found, try main directory
                if (!fs.existsSync(filePath)) {
                    filePath = path.join(baseDir, `${protocol}-transactions.json`);
                }
                
                if (fs.existsSync(filePath)) {
                    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
                    
                    // Data is an array of transaction hashes
                    const hashes = Array.isArray(data) ? data : (data.transactions || data);
                    
                    // Take exactly 2000 transactions for balance
                    const limitedHashes = hashes.slice(0, 2000);
                    
                    // Convert hash array to expected format
                    const protocolTxs = limitedHashes.map((item: any) => {
                        // Handle both string hashes and objects
                        if (typeof item === 'string') {
                            return {
                                hash: item,
                                protocol: protocol.charAt(0).toUpperCase() + protocol.slice(1),
                                blockNumber: 0,  // Will be fetched by Driver
                                timestamp: 0     // Will be fetched by Driver
                            };
                        } else {
                            return {
                                ...item,
                                protocol: protocol.charAt(0).toUpperCase() + protocol.slice(1)
                            };
                        }
                    });
                    
                    this.allTransactions.push(...protocolTxs);
                    console.log(`  ✅ Loaded ${protocolTxs.length} ${protocol} transactions`);
                }
            }
            
            // Shuffle transactions to ensure protocol diversity
            this.shuffleArray(this.allTransactions);
        }
        
        console.log(`\n📊 Total transactions loaded: ${this.allTransactions.length} (shuffled for diversity)`);
    }
    
    /**
     * Shuffle array to ensure protocol diversity (Fisher-Yates algorithm)
     */
    private shuffleArray<T>(array: T[]): void {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
    }
    
    /**
     * Get protocol distribution in transactions
     */
    private getProtocolDistribution(transactions: TransactionData[]): Map<string, number> {
        const distribution = new Map<string, number>();
        for (const tx of transactions) {
            const protocol = tx.protocol || 'Unknown';
            distribution.set(protocol, (distribution.get(protocol) || 0) + 1);
        }
        return distribution;
    }
    
    async runVerification(): Promise<void> {
        if (this.options.progressive) {
            await this.runProgressiveVerification();
        } else {
            await this.runSingleVerification();
        }
    }
    
    async runProgressiveVerification(): Promise<void> {
        // Generate progressive phases based on limit
        const phases: { name: string; count: number }[] = [];
        
        if (this.options.limit >= 10) phases.push({ name: 'baseline', count: 10 });
        if (this.options.limit >= 100) phases.push({ name: 'small', count: 100 });
        if (this.options.limit >= 1000) phases.push({ name: 'medium', count: 1000 });
        if (this.options.limit >= 2000) phases.push({ name: 'large', count: 2000 });
        if (this.options.limit >= 5000) phases.push({ name: 'xlarge', count: 5000 });
        phases.push({ name: 'full', count: this.options.limit });
        
        console.log('\n🚀 Starting Progressive Protocol Verification');
        console.log('=' .repeat(60));
        console.log(`📊 Target: ${this.options.limit} transactions`);
        console.log(`🕐 Current Time (KST): ${this.getKSTTimestamp()}`);
        console.log('⚠️  Using ProtocolInvariants.dsl for protocol compliance');
        console.log('=' .repeat(60));
        
        for (const phase of phases) {
            if (phase.count <= this.options.limit) {
                await this.runPhase(phase.name, phase.count);
                
                // Allow GC between phases
                if (global.gc) {
                    global.gc();
                }
            }
        }
        
        this.generateFinalReport();
    }
    
    async runSingleVerification(): Promise<void> {
        console.log('\n🚀 Starting Protocol Verification');
        console.log('=' .repeat(60));
        console.log(`📊 Transactions to verify: ${this.options.limit}`);
        console.log(`🕐 Current Time (KST): ${this.getKSTTimestamp()}`);
        console.log('⚠️  Using ProtocolInvariants.dsl for protocol compliance');
        console.log('=' .repeat(60));
        
        await this.runPhase('verification', this.options.limit);
        this.generateFinalReport();
    }
    
    async runPhase(phaseName: string, transactionCount: number): Promise<void> {
        console.log(`\n📍 Phase: ${phaseName.toUpperCase()} (${transactionCount} transactions)`);
        console.log('-'.repeat(40));
        
        const transactions = this.allTransactions.slice(0, transactionCount);
        const startTime = performance.now();
        
        const stats: VerificationStats = {
            phase: phaseName,
            totalTransactions: transactionCount,
            successfulAnalysis: 0,
            protocolViolations: 0,
            edgeCreationRate: 0,
            expectedEdges: 0,  // Will be calculated from actual events
            actualEdges: 0,
            totalEdgeCount: 0,
            processingTimeMs: 0,
            transactionsPerSecond: 0
        };
        
        // Ensure protocol diversity for better testing
        const protocolDistribution = this.getProtocolDistribution(transactions);
        console.log(`  📊 Protocol Distribution:`);
        for (const [protocol, count] of protocolDistribution.entries()) {
            console.log(`     - ${protocol}: ${count} transactions`);
        }
        
        // Process transactions - use batch mode if enabled
        if (this.options.batchMode && this.batchProcessor) {
            // Batch processing mode for performance
            console.log(`\n🚀 Using batch processing with batch size ${this.options.batchSize} and ${this.options.parallel} workers`);
            
            const batchResults = await this.batchProcessor.processBatch(transactions, {
                progressCallback: (progress) => {
                    console.log(`  ⏳ Batch Progress: ${progress.toFixed(1)}%`);
                }
            });
            
            // Process batch results
            for (const batchResult of batchResults) {
                stats.successfulAnalysis++;
                
                // Get expected edges for every transaction (not just CSV export)
                const edgeAnalysis = await this.getExpectedEdgesFromEvents(batchResult.txHash);
                const expectedCount = parseInt(edgeAnalysis.expectedCount) || 0;
                stats.expectedEdges += expectedCount;
                
                if (batchResult.edgeCreated) {
                    stats.edgeCreationRate++;
                    stats.actualEdges++;  // Count of transactions with edges
                    stats.totalEdgeCount += batchResult.edgeCount; // Use actual edge count from batch result
                }
                
                if (batchResult.violations.length > 0) {
                    stats.protocolViolations++;
                    
                    if (this.options.saveViolations) {
                        this.violations.push({
                            txHash: batchResult.txHash,
                            protocol: batchResult.protocol,
                            violations: batchResult.violations
                        });
                    }
                }
                
                // Store detailed result if CSV export is enabled
                if (this.options.exportCsv) {
                    const tx = transactions.find(t => t.hash === batchResult.txHash);
                    
                    this.detailedResults.push({
                        txHash: batchResult.txHash,
                        protocol: batchResult.protocol,
                        blockNumber: tx?.blockNumber || 0,
                        etherscanLink: this.getExplorerLink(batchResult.txHash),
                        expectedEdges: edgeAnalysis.expectedCount,
                        actualEdges: batchResult.edgeCount.toString(),
                        eventDiagnostics: edgeAnalysis.eventDiagnostics,
                        foundEvents: edgeAnalysis.foundEvents.join('; '),
                        matchedEvents: edgeAnalysis.matchedEvents.join('; '),
                        constraintViolations: batchResult.violations,
                        sfgCreated: batchResult.edgeCreated,
                        processingTimeMs: batchResult.processingTime
                    });
                }
            }
            
            // Print batch processor statistics
            this.batchProcessor.printStatisticsReport();
            
        } else {
            // Original sequential processing
            for (let i = 0; i < transactions.length; i++) {
                const tx = transactions[i];
                
                // Progress indicator
                if (i > 0 && i % Math.max(1, Math.floor(transactionCount / 10)) === 0) {
                    const progress = Math.round((i / transactionCount) * 100);
                    console.log(`  ⏳ Progress: ${progress}% (${i}/${transactionCount})`);
                }
                
                const txStartTime = performance.now();
            
            // Get enhanced expected edges analysis
            const edgeAnalysis = await this.getExpectedEdgesFromEvents(tx.hash);
            
            // Initialize detailed result for this transaction
            const detailedResult: TransactionVerificationResult = {
                txHash: tx.hash,
                protocol: tx.protocol || 'Unknown',
                blockNumber: tx.blockNumber || 0,
                etherscanLink: this.getExplorerLink(tx.hash),
                expectedEdges: edgeAnalysis.expectedCount,
                actualEdges: '0',  // Will be updated if edges are created
                eventDiagnostics: edgeAnalysis.eventDiagnostics,
                foundEvents: edgeAnalysis.foundEvents.join('; '),
                matchedEvents: edgeAnalysis.matchedEvents.join('; '),
                constraintViolations: [],
                sfgCreated: false,
                processingTimeMs: 0
            };
            
            try {
                // Create proper EvanescaContext
                const context: EvanescaContext = {
                    tList: [tx.hash],
                    fins: [],
                    reports: [],
                    analyzed: new Set<string>(),
                    complexity: []
                };
                
                const result = await run(tx.hash, context);
                
                stats.successfulAnalysis++;
                
                // Check if SFG edges were created (edges contains the actual edges)
                if (context.edges && context.edges.length > 0) {
                    // Actual edges were created in the SFG
                    stats.edgeCreationRate++;
                    stats.actualEdges++;  // Track that this transaction created edges
                    stats.totalEdgeCount += context.edges.length;  // Track total number of edges
                    
                    // Update detailed result
                    detailedResult.sfgCreated = true;
                    detailedResult.actualEdges = context.edges.length.toString();  // Number of edges created
                }
                
                // Update expected edges count in stats
                // Handle both numeric and inferred (*) expectations
                const expectedStr = detailedResult.expectedEdges.replace('*', '');
                const expectedCount = parseInt(expectedStr) || 0;
                stats.expectedEdges += expectedCount;
                
                // Check for violations in the report (separate from edge creation)
                if (context.reports && context.reports.length > 0) {
                    for (const report of context.reports) {
                        let hasViolation = false;
                        const violatedConstraints: string[] = [];
                        
                        // Check violation array and collect constraint names
                        if (report._violation && Array.isArray(report._violation)) {
                            report._violation.forEach((violated: boolean, index: number) => {
                                if (violated) {
                                    // Get the actual constraint name from the DSL file
                                    const constraintNames = this.constraintMapper.getConstraintNames();
                                    const constraintName = constraintNames[index] || `Unknown_Constraint_${index}`;
                                    
                                    // Format: "CONSTRAINT_NAME"
                                    violatedConstraints.push(constraintName);
                                    hasViolation = true;
                                    
                                    // Debug log for constraint mapping
                                    if (this.options.verbose) {
                                        console.log(`    🔍 Violation at index ${index}: ${constraintName}`);
                                    }
                                }
                            });
                        }
                        
                        if (hasViolation) {
                            stats.protocolViolations++;
                            detailedResult.constraintViolations = violatedConstraints;
                        }
                        
                        // Also check protocolViolations property if it exists
                        if (!hasViolation && report.protocolViolations && report.protocolViolations.length > 0) {
                            stats.protocolViolations++;
                            hasViolation = true;
                            detailedResult.constraintViolations = report.protocolViolations;
                        }
                        
                        // Save violation details if requested
                        if (hasViolation && this.options.saveViolations) {
                            this.violations.push({
                                txHash: tx.hash,
                                protocol: tx.protocol,
                                blockNumber: tx.blockNumber,
                                report: report
                            });
                        }
                        
                        if (hasViolation) break;
                    }
                }
                
            } catch (error: any) {
                // Log error for debugging
                if (this.options.verbose) {
                    console.error(`    ❌ Failed tx ${i + 1}: ${error.message.substring(0, 100)}`);
                }
                detailedResult.errorMessage = error.message;
                // Count as failed but continue processing
            }
            
            // Calculate processing time for this transaction
            detailedResult.processingTimeMs = performance.now() - txStartTime;
            
            // Store detailed result if CSV export is enabled
            if (this.options.exportCsv) {
                this.detailedResults.push(detailedResult);
            }
            
            // Track semantic model gaps for analysis
            this.trackSemanticGaps(tx.protocol || 'Unknown', edgeAnalysis);
            }
        }
        
        const endTime = performance.now();
        stats.processingTimeMs = endTime - startTime;
        stats.transactionsPerSecond = transactionCount / (stats.processingTimeMs / 1000);
        stats.edgeCreationRate = stats.edgeCreationRate / transactionCount;
        
        // Display results
        console.log(`\n📈 Results for ${phaseName}:`);
        console.log(`  ✅ Success Rate: ${((stats.successfulAnalysis / transactionCount) * 100).toFixed(2)}%`);
        console.log(`  📊 Edge Creation: ${(stats.edgeCreationRate * 100).toFixed(2)}%`);
        console.log(`  📉 Edge Statistics:`);
        console.log(`      Expected Edges: ${stats.expectedEdges} (1 per transaction)`);
        console.log(`      Actual Edges Created: ${stats.actualEdges} transactions with edges`);
        console.log(`      Total Edge Count: ${stats.totalEdgeCount} edges total`);
        console.log(`      Avg Edges/Tx: ${stats.actualEdges > 0 ? (stats.totalEdgeCount / stats.actualEdges).toFixed(2) : '0'}`);
        console.log(`  🔍 Protocol Compliance Violations: ${stats.protocolViolations} (${((stats.protocolViolations / transactionCount) * 100).toFixed(2)}%)`);
        
        // Note: ProtocolInvariants.dsl checks protocol compliance, not attacks
        
        console.log(`  ⏱️  Processing Time: ${(stats.processingTimeMs / 1000).toFixed(2)}s`);
        console.log(`  🚀 TPS: ${stats.transactionsPerSecond.toFixed(2)} tx/sec`);
        
        this.stats.push(stats);
    }
    
    generateFinalReport(): void {
        console.log('\n' + '='.repeat(60));
        console.log(`📊 FINAL REPORT - ${this.options.limit} Transaction Protocol Verification`);
        console.log('='.repeat(60));
        
        // Create summary table
        console.log('\n| Phase | Txs | Success % | Edge % | Protocol Compliance Issues | TPS |');
        console.log('|-------|-----|-----------|--------|-------------------|-----|');
        
        for (const stat of this.stats) {
            const successRate = ((stat.successfulAnalysis / stat.totalTransactions) * 100).toFixed(1);
            const edgeRate = (stat.edgeCreationRate * 100).toFixed(1);
            const violationRate = ((stat.protocolViolations / stat.totalTransactions) * 100).toFixed(1);
            const tps = stat.transactionsPerSecond.toFixed(1);
            
            console.log(`| ${stat.phase.padEnd(7)} | ${stat.totalTransactions.toString().padEnd(4)} | ${successRate.padStart(8)}% | ${edgeRate.padStart(5)}% | ${stat.protocolViolations.toString().padStart(3)} (${violationRate}%) | ${tps.padStart(6)} |`);
        }
        
        // Final assessment
        const finalStats = this.stats[this.stats.length - 1];
        console.log(`\n📋 Final Assessment (${finalStats.totalTransactions} transactions):`);
        console.log(`  ✅ Edge Creation Rate: ${(finalStats.edgeCreationRate * 100).toFixed(2)}%`);
        console.log(`  ✅ Success Rate: ${((finalStats.successfulAnalysis / finalStats.totalTransactions) * 100).toFixed(2)}%`);
        console.log(`  📊 Edge Statistics:`);
        console.log(`      Expected: ${finalStats.expectedEdges} transactions`);
        console.log(`      Actual: ${finalStats.actualEdges} transactions with edges`);
        console.log(`      Total Edges: ${finalStats.totalEdgeCount}`);
        console.log(`      Avg Edges/Tx: ${finalStats.actualEdges > 0 ? (finalStats.totalEdgeCount / finalStats.actualEdges).toFixed(2) : '0'}`);
        console.log(`  📍 Protocol Compliance Issues: ${finalStats.protocolViolations} (${((finalStats.protocolViolations / finalStats.totalTransactions) * 100).toFixed(2)}%)`);
        console.log(`  🚀 Performance: ${finalStats.transactionsPerSecond.toFixed(2)} TPS`);
        
        // Success criteria check
        console.log('\n🎯 Success Criteria:');
        const edgeSuccess = finalStats.edgeCreationRate >= 0.95;
        const performanceGood = finalStats.transactionsPerSecond > 100;
        
        console.log(`  ${edgeSuccess ? '✅' : '❌'} Edge Creation > 95%: ${(finalStats.edgeCreationRate * 100).toFixed(2)}%`);
        console.log(`  📊 Protocol Compliance: ${finalStats.protocolViolations} violations found (${((finalStats.protocolViolations / finalStats.totalTransactions) * 100).toFixed(2)}%)`);
        console.log(`  ${performanceGood ? '✅' : '❌'} Performance > 100 TPS: ${finalStats.transactionsPerSecond.toFixed(2)} TPS`);
        
        // Generate semantic gap analysis
        this.generateSemanticGapReport();
        
        // Save report to file
        this.saveReport();
    }
    
    private exportToCSV(): void {
        if (!this.options.exportCsv || this.detailedResults.length === 0) {
            return;
        }
        
        const reportDir = path.join(__dirname, '../..', 'verification-results', 'reports');
        if (!fs.existsSync(reportDir)) {
            fs.mkdirSync(reportDir, { recursive: true });
        }
        
        const timestamp = this.getKSTFilenameTimestamp();
        const csvPath = path.join(reportDir, `protocol-verification-detailed-${this.options.limit}tx-${timestamp}.csv`);
        
        // Create CSV header with diagnostic fields
        const headers = [
            'Transaction Hash',
            'Protocol',
            'Block Number',
            'Etherscan Link',
            'Expected Edges',
            'Actual Edges',
            'Event Diagnostics',
            'Found Events',
            'Matched Events',
            'SFG Created',
            'Constraint Violations',
            'Processing Time (ms)',
            'Error Message'
        ];
        
        // Create CSV rows with diagnostic information
        const rows = this.detailedResults.map(result => [
            result.txHash,
            result.protocol,
            result.blockNumber.toString(),
            result.etherscanLink,
            result.expectedEdges,  // Expected edges with inference marker
            result.actualEdges,     // Actual edges count
            result.eventDiagnostics || '',  // Diagnostic summary
            result.foundEvents || '',  // All events found
            result.matchedEvents || '',  // Events that matched semantic model
            result.sfgCreated ? 'Yes' : 'No',
            result.constraintViolations.length > 0 ? result.constraintViolations.join('; ') : 'None',
            result.processingTimeMs.toFixed(2),
            result.errorMessage || ''
        ]);
        
        // Combine headers and rows
        const csvContent = [
            headers.join(','),
            ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
        ].join('\n');
        
        fs.writeFileSync(csvPath, csvContent);
        
        console.log(`\n📊 CSV Export saved to: ${csvPath}`);
        console.log(`   Total transactions analyzed: ${this.detailedResults.length}`);
        console.log(`   Transactions with SFG created: ${this.detailedResults.filter(r => r.sfgCreated).length}`);
        console.log(`   Transactions with violations: ${this.detailedResults.filter(r => r.constraintViolations.length > 0).length}`);
    }
    
    saveReport(): void {
        const reportDir = path.join(__dirname, '../..', 'verification-results', 'reports');
        if (!fs.existsSync(reportDir)) {
            fs.mkdirSync(reportDir, { recursive: true });
        }
        
        const timestamp = this.getKSTFilenameTimestamp();
        const finalStats = this.stats[this.stats.length - 1];
        const reportPath = path.join(reportDir, `protocol-verification-${this.options.limit}tx-${timestamp}.json`);
        
        const reportData: any = {
            timestamp: this.getKSTTimestamp(),
            configuration: {
                limit: this.options.limit,
                progressive: this.options.progressive,
                saveViolations: this.options.saveViolations
            },
            stats: this.stats,
            summary: {
                totalTransactions: finalStats.totalTransactions,
                finalEdgeCreationRate: finalStats.edgeCreationRate,
                finalSuccessRate: finalStats.successfulAnalysis / finalStats.totalTransactions,
                edgeStatistics: {
                    expectedEdges: finalStats.expectedEdges,
                    transactionsWithEdges: finalStats.actualEdges,  // Renamed for clarity
                    totalEdgeCount: finalStats.totalEdgeCount,
                    avgEdgesPerTransaction: finalStats.totalTransactions > 0 ? finalStats.totalEdgeCount / finalStats.totalTransactions : 0
                },
                protocolViolations: finalStats.protocolViolations,
                violationRate: finalStats.protocolViolations / finalStats.totalTransactions
            }
        };
        
        // Add violations if saved
        if (this.options.saveViolations && this.violations.length > 0) {
            reportData.violations = this.violations;
            console.log(`\n📝 Saved ${this.violations.length} violation details`);
        }
        
        fs.writeFileSync(reportPath, JSON.stringify(reportData, null, 2));
        
        console.log(`\n💾 Report saved to: ${reportPath}`);
        
        // Export to CSV if requested
        this.exportToCSV();
    }
}

// Main execution
async function main() {
    const options = parseArgs();
    const verifier = new ProtocolVerifier(options);
    
    try {
        console.log(`\n🔧 Configuration:`);
        console.log(`  - Transaction Limit: ${options.limit}`);
        console.log(`  - Progressive Mode: ${options.progressive}`);
        console.log(`  - Save Violations: ${options.saveViolations}`);
        console.log(`  - Verbose Mode: ${options.verbose}`);
        console.log(`  - Export CSV: ${options.exportCsv}`);
        
        await verifier.loadTransactions();
        
        // Check if we have enough transactions
        const maxAvailable = verifier['allTransactions'].length;
        if (options.limit > maxAvailable) {
            console.log(`\n⚠️  Warning: Only ${maxAvailable} transactions available. Adjusting limit.`);
            options.limit = maxAvailable;
        }
        
        await verifier.runVerification();
        
        console.log('\n✅ Protocol verification completed successfully!');
        console.log('📝 Note: Protocol compliance issues indicate deviations from expected protocol behavior');
        console.log('📝 ProtocolInvariants.dsl verifies correct protocol operation (e.g., Uniswap, Curve), NOT attack detection');
    } catch (error) {
        console.error('❌ Verification failed:', error);
        process.exit(1);
    }
}

// Run if executed directly
if (require.main === module) {
    main();
}