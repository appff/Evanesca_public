import { run } from '../../Driver';
import { EvanescaContext } from '../../Interfaces/EvanescaContext';

describe("Balancer Transaction Analysis", function() {
    this.timeout(120000); // 2 minutes timeout
    
    it("should analyze Balancer transaction and show constraint violations", async function() {
        // Sample Balancer transaction from verification (should have no edges created)
        const balancerTxHash = "0x404f0f1d49aa3aa8aff972c8d740a1300a843f00c077a8cbe4a14ed6153f3641";
        
        console.log(`🔍 Analyzing Balancer transaction: ${balancerTxHash}`);
        
        // Create EvanescaContext
        const cntx: EvanescaContext = {
            reports: [],
            analyzed: new Set<string>(),
            tList: [],
            fins: [],
            complexity: []
        };
        
        try {
            const results = await run(balancerTxHash, cntx);
            
            console.log('📊 Analysis Results:');
            console.log(`  Reports: ${results.reports.length}`);
            console.log(`  Fins: ${results.fins}`);
            
            if (results.reports.length > 0) {
                results.reports.forEach((report, idx) => {
                    console.log(`  Report[${idx}]: ${report._comment}`);
                    if (report._violation) {
                        console.log(`    Violations: ${JSON.stringify(report._violation)}`);
                    }
                });
            }
            
            // Check if any violations were found
            const hasViolations = results.reports.some(report => 
                report._violation && Array.isArray(report._violation) && 
                report._violation.some(v => v === true)
            );
            
            console.log(`🎯 Violations detected: ${hasViolations}`);
            
        } catch (error) {
            console.error(`❌ Error analyzing Balancer transaction: ${error.message}`);
            throw error;
        }
    });
});