/**
 * Performance Test Script - Single Transaction Analysis
 */

import { run } from '../Driver';
import { EvanescaContext } from '../Interfaces/EvanescaContext';
import { globalProfiler } from '../Utils/PerformanceProfiler';

async function testSingleTransaction() {
    console.log('🔍 Starting performance test...\n');
    
    // Enable profiling
    globalProfiler.enable();
    
    // Use a simple Uniswap transaction for testing
    const testTxHash = '0xb95343413e459a0f97461812111254163ae53467855c0d73e0f1e7c5b8442fa3';
    
    console.log(`📊 Testing transaction: ${testTxHash}`);
    console.log('⏱️  Starting analysis with profiling enabled...\n');
    
    const context: EvanescaContext = {
        tList: [testTxHash],
        fins: [],
        reports: [],
        analyzed: new Set<string>(),
        complexity: []
    };
    
    // Set environment for protocol verification mode
    process.env.PROTOCOL_VERIFICATION_MODE = 'true';
    process.env.DSL_FILE = 'src/DSL/ProtocolInvariants.dsl';
    process.env.ENABLE_PROFILING = 'true';
    
    const startTime = Date.now();
    
    try {
        const result = await run(testTxHash, context);
        const endTime = Date.now();
        
        console.log(`\n✅ Analysis completed in ${endTime - startTime}ms`);
        console.log(`📊 SFG Created: ${context.fins && context.fins.length > 0}`);
        console.log(`📊 Reports Generated: ${context.reports.length}`);
        
        // Print profiling report
        globalProfiler.printReport();
        
    } catch (error) {
        console.error(`❌ Error during analysis: ${error}`);
        globalProfiler.printReport();
    }
}

// Run the test
if (require.main === module) {
    testSingleTransaction().catch(console.error);
}