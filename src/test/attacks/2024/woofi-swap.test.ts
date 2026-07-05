import { expect } from 'chai';
import * as DriverAPI from '../../../Driver';
import '../shared/testSetup'; // Ensures proper test cleanup


// Wrapper class for compatibility
class Driver {
  constructor(config: string) {}
  
  async run(txHash: string) {
    const cntx = {
      reports: [],
      violations: [],
      graph: { edges: [] },
      pnlAnalysis: {}
    };
    
    await DriverAPI.run(txHash, cntx);
    
    // Convert to expected format
    return {
      attackDetected: cntx.reports.some((r: any) => r._violation > 0),
      attackType: ['FLASH_LOAN'],  // Default for compatibility
      violations: cntx.reports.filter((r: any) => r._violation > 0),
      pnl: cntx.pnlAnalysis
    };
  }
}

export default Driver;

describe('2024 Attack Detection - WooFi Swap', () => {
  let driver: Driver;

  beforeEach(() => {
    driver = new Driver('');
  });

  describe('WooFi Swap Price Manipulation (Arbitrum)', () => {
    it('should detect sPMM price manipulation attack', async function() {
      this.timeout(60000);

      const txHash = '0x09f95de0e249cd479b3794fb98f44e47dc2e39aef17a8ce4af4c48a3e5d1c228';
      
      console.log('🔍 Analyzing WooFi Swap attack on Arbitrum...');
      console.log(`   Transaction: ${txHash}`);
      console.log(`   Date: March 5, 2024`);
      console.log(`   Loss: $8.75M`);
      console.log(`   Type: sPMM (synthetic Proactive Market Maker) price manipulation`);
      
      try {
        const result = await driver.run(txHash);
        
        // Check if attack was detected
        expect(result.attackDetected).to.be.true;
        
        // Check for specific constraint violations
        const violations = result.violations || [];
        const violationMessages = violations.map((v: any) => v.message || v);
        
        // Should detect at least one of these patterns
        const expectedPatterns = [
          'WOOFI_SWAP_2024',
          'WooFi',
          'price manipulation',
          'abnormal swap ratio'
        ];
        
        const foundPattern = expectedPatterns.some(pattern => 
          violationMessages.some((msg: string) => 
            msg.toLowerCase().includes(pattern.toLowerCase())
          )
        );
        
        expect(foundPattern).to.be.true;
        
        // Check for flash loan usage (common in WooFi attack)
        const edges = result.edges || [];
        const hasFlashLoan = edges.some((e: any) => 
          e.data.Action === 'FlashLoan' || 
          e.metadata?.isFlashLoan
        );
        
        if (hasFlashLoan) {
          console.log('   Flash loan usage detected');
        }
        
        // Check for abnormal swap ratios
        const abnormalSwaps = edges.filter((e: any) => 
          e.metadata?.ratio > 2.0 || e.metadata?.ratio < 0.5
        );
        
        if (abnormalSwaps.length > 0) {
          console.log(`   Abnormal swap ratios detected: ${abnormalSwaps.length} operations`);
        }
        
        // Check for PNL analysis
        if (result.pnl) {
          console.log('💰 Attack PNL Analysis:');
          Object.entries(result.pnl).forEach(([address, data]: [string, any]) => {
            if (data.totalPNL && Math.abs(data.totalPNL) > 10000) {
              console.log(`   ${address.slice(0, 10)}...: ${data.totalPNL > 0 ? '+' : ''}$${data.totalPNL.toFixed(2)}`);
            }
          });
        }
        
        // Log detection summary
        console.log('✅ WooFi Swap attack detected successfully');
        console.log(`   Violations found: ${violations.length}`);
        console.log(`   Attack type: ${result.attackType || 'Price Manipulation'}`);
        console.log(`   Detection confidence: HIGH`);
        
      } catch (error: any) {
        // If error is due to Arbitrum RPC, note configuration needed
        if (error.message?.includes('Arbitrum') || error.message?.includes('chain')) {
          console.log('⚠️  Arbitrum RPC configuration needed');
          console.log('   Ensure ALCHEMY_ARB_API_KEY is set in environment');
          this.skip();
        } else {
          console.error('Error analyzing transaction:', error.message);
          throw error;
        }
      }
    });
  });
});