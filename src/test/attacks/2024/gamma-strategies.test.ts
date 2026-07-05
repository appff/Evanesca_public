import { expect } from 'chai';
import * as DriverAPI from '../../../Driver';
import '../shared/testSetup'; // Ensures proper test cleanup


// Wrapper class for compatibility
class Driver {
  constructor(config: string) {}
  
  async run(txHash: string) {
    const cntx = {
      tList: [],
      analyzed: new Set<string>(),
      reports: [],
      fins: [],
      complexity: []
    };
    
    const result = await DriverAPI.run(txHash, cntx);
    
    // Convert to expected format
    return {
      attackDetected: result.reports.some((r: any) => r._violation && r._violation.some((v: boolean) => v === true)),
      attackType: ['FLASH_LOAN'],  // Default for compatibility
      violations: result.reports.filter((r: any) => r._violation && r._violation.some((v: boolean) => v === true)),
      pnl: {}
    };
  }
}

export default Driver;

describe('2024 Attack Detection - Gamma Strategies', () => {
  let driver: Driver;

  beforeEach(() => {
    driver = new Driver('');
  });

  describe('Gamma Strategies Price Manipulation (Arbitrum)', () => {
    it('should detect vault price manipulation attack', async function() {
      this.timeout(60000);

      const txHash = '0x7c36696e5f50632ce82dd5f5fbcc9007ce8dd39c4de6c1dba93e8f638da0bbf1';
      
      console.log('🔍 Analyzing Gamma Strategies attack on Arbitrum...');
      console.log(`   Transaction: ${txHash}`);
      console.log(`   Date: January 4, 2024`);
      console.log(`   Loss: $3.4M`);
      console.log(`   Type: Price manipulation of Uniswap V3 vaults`);
      
      try {
        const result = await driver.run(txHash);
        
        // Check if attack was detected
        expect(result.attackDetected).to.be.true;
        
        // Check for specific constraint violations
        const violations = result.violations || [];
        const violationMessages = violations.map((v: any) => v.message || v);
        
        // Should detect at least one of these patterns
        const expectedPatterns = [
          'GAMMA_STRATEGIES_2024',
          'Price manipulation',
          'Vault manipulation',
          'price impact'
        ];
        
        const foundPattern = expectedPatterns.some(pattern => 
          violationMessages.some((msg: string) => 
            msg.toLowerCase().includes(pattern.toLowerCase())
          )
        );
        
        expect(foundPattern).to.be.true;
        
        // Check for high price impact
        const edges = result.edges || [];
        const highImpactEdges = edges.filter((e: any) => 
          e.metadata?.priceImpact > 50
        );
        
        if (highImpactEdges.length > 0) {
          console.log(`   High price impact detected: ${highImpactEdges.length} operations`);
        }
        
        // Check for PNL analysis
        if (result.pnl) {
          console.log('💰 Attack PNL Analysis:');
          Object.entries(result.pnl).forEach(([address, data]: [string, any]) => {
            if (data.totalPNL && Math.abs(data.totalPNL) > 1000) {
              console.log(`   ${address.slice(0, 10)}...: ${data.totalPNL > 0 ? '+' : ''}$${data.totalPNL.toFixed(2)}`);
            }
          });
        }
        
        // Log detection summary
        console.log('✅ Gamma Strategies attack detected successfully');
        console.log(`   Violations found: ${violations.length}`);
        console.log(`   Attack type: ${result.attackType || 'Price Manipulation'}`);
        
      } catch (error: any) {
        // If error is due to Arbitrum RPC, note configuration needed
        if (error.message?.includes('Arbitrum') || error.message?.includes('chain')) {
          console.log('⚠️  Arbitrum RPC configuration needed');
          console.log('   Add Arbitrum provider to Web3ProviderManager');
          this.skip();
        } else {
          throw error;
        }
      }
    });
  });
});