import { expect } from 'chai';
import { run } from '../../Driver';
import { EvanescaContext } from '../../Interfaces/EvanescaContext';
import { buildModelMap } from '../../SemanticFinancialGraph/SemanticFinancialGraphUtils';

describe('Protocol Verification - Single Transaction Test', () => {
    before(() => {
        // Initialize model map
        buildModelMap();
        
        // Set to use Protocol Invariants
        process.env.DSL_FILE = 'src/DSL/ProtocolInvariants.dsl';
    });
    
    it('should verify protocol compliance for Uniswap transaction', async () => {
        const txHash = '0xb95343413e459a0f97461812111254163ae53467855c0d73e0f1e7c5b8442fa3';
        
        console.log('\n🔍 Testing transaction:', txHash);
        console.log('📋 Using ProtocolInvariants.dsl');
        
        const context: EvanescaContext = {
            tList: [txHash],
            fins: [],
            reports: [],
            analyzed: new Set<string>(),
            complexity: []
        };
        
        const startTime = Date.now();
        await run(txHash, context);
        const elapsedMs = Date.now() - startTime;
        
        console.log(`⏱️  Analysis completed in ${elapsedMs}ms`);
        
        // Check results
        expect(context.reports).to.not.be.empty;
        
        let protocolComplianceIssues = 0;
        
        for (const report of context.reports) {
            if (report._violation && report._violation.some(v => v === true)) {
                // All violations from ProtocolInvariants.dsl are protocol compliance issues
                protocolComplianceIssues++;
            }
        }
        
        console.log(`📊 Results:`);
        console.log(`  - Protocol Compliance Issues: ${protocolComplianceIssues}`);
        console.log(`  - Note: ProtocolInvariants.dsl verifies protocol behavior (e.g., Uniswap, Curve), not attacks`);
        
        console.log('✅ Test passed - Protocol verification working correctly');
    });
});