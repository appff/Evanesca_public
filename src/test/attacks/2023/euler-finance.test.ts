import * as DriverAPI from '../../../Driver';
import { expect } from 'chai';
import 'mocha';
import '../shared/testSetup'; // Ensures proper test cleanup

// Wrapper class for compatibility
class Driver {
  async init() {}
  
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
      pnl: {
        attackerProfit: 0,
        totalLoss: 0
      },
      victims: []
    };
  }
  
  async processTransaction(txHash: string) {
    return this.run(txHash);
  }
  
  async processTransactionData(txData: any) {
    // For mock data, just return a default result
    return {
      attackDetected: false,
      attackType: [],
      violations: [],
      pnl: {
        attackerProfit: 0,
        totalLoss: 0
      },
      victims: []
    };
  }
  
  async cleanup() {
    // No-op for compatibility
  }
}

describe('Euler Finance Attack Detection (March 2023)', () => {
  let driver: Driver;

  before(async function() {
    this.timeout(60000);
    driver = new Driver();
    await driver.init();
  });

  describe('Attack Transaction Analysis', () => {
    // Main attack transactions on Ethereum mainnet
    const ATTACK_TRANSACTIONS = [
      {
        hash: '0x71a908be0e3a1fb3f3bd091ccafe8357633bdff273c865523659faee993e12ed',
        description: 'Euler Finance attack - DAI/USDC manipulation',
        expectedViolations: [
          'EULER_DONATION_INFLATION',
          'EULER_SELF_LIQUIDATION',
          'EULER_EXCESSIVE_BORROWING',
          'L2_EXCESSIVE_BORROWING'
        ]
      },
      {
        hash: '0x62bd3d31a7b75c098ccf28bc4aa3b7e7b7b715af7d4a6bb7e367c3d7e275b532',
        description: 'Euler Finance attack - wstETH manipulation',
        expectedViolations: [
          'EULER_FLASH_LOAN_DONATION_COMBO',
          'EULER_ABNORMAL_LIQUIDATION_PROFIT'
        ]
      }
    ];

    ATTACK_TRANSACTIONS.forEach(({ hash, description, expectedViolations }) => {
      it(`should detect ${description}`, async function() {
        this.timeout(120000);
        
        try {
          console.log(`\n🔍 Analyzing transaction: ${hash}`);
          console.log(`   Description: ${description}`);
          
          const result = await driver.processTransaction(hash);
          
          expect(result).to.not.be.null;
          expect(result.violations).to.be.an('array');
          
          // Check for expected violations
          expectedViolations.forEach(violation => {
            const found = result.violations.some(v => 
              v.constraint === violation || 
              v.type === violation
            );
            expect(found, `Expected violation ${violation} not found`).to.be.true;
          });
          
          // Log detection results
          console.log(`✅ Detected ${result.violations.length} violations:`);
          result.violations.forEach(v => {
            console.log(`   - ${v.constraint || v.type}: ${v.message || 'Constraint violated'}`);
          });
          
          // Check for victim identification
          if (result.victims && Object.keys(result.victims).length > 0) {
            console.log(`\n💰 Victims identified:`);
            Object.entries(result.victims).forEach(([address, loss]) => {
              console.log(`   - ${address}: ${loss} USD`);
            });
          }
          
          // Check PNL analysis
          if (result.pnl) {
            console.log(`\n📊 PNL Analysis:`);
            console.log(`   - Attacker profit: ${result.pnl.attackerProfit || 0} USD`);
            console.log(`   - Total loss: ${result.pnl.totalLoss || 0} USD`);
          }
          
        } catch (error) {
          console.error(`Failed to analyze transaction ${hash}:`, error);
          throw error;
        }
      });
    });
  });

  describe('Specific Attack Patterns', () => {
    it('should detect donation-based inflation', async function() {
      this.timeout(60000);
      
      // Mock transaction with donation pattern
      const mockTx = {
        hash: '0xmock_donation',
        blockNumber: 16817996,
        edges: [
          {
            type: 'DonateToReserves',
            service: 'Euler',
            from: '0xattacker',
            to: '0xeuler',
            amount: 10000000, // Large donation
            metadata: {
              exchangeRateBefore: 1.0,
              exchangeRateAfter: 3.5 // 350% increase
            }
          }
        ]
      };
      
      // Process mock transaction
      const result = await driver.processTransactionData(mockTx);
      
      expect(result.violations).to.include.deep.members([
        { constraint: 'EULER_DONATION_INFLATION', severity: 'CRITICAL' }
      ]);
    });

    it('should detect self-liquidation pattern', async function() {
      this.timeout(60000);
      
      // Mock transaction with self-liquidation
      const mockTx = {
        hash: '0xmock_self_liquidation',
        blockNumber: 16817996,
        edges: [
          {
            type: 'Liquidate',
            service: 'Euler',
            from: '0xattacker',
            to: '0xeuler',
            amount: 5000000,
            metadata: {
              liquidator: '0xattacker',
              violator: '0xattacker', // Same as liquidator
              repay: 1000000,
              yield: 5000000
            }
          }
        ]
      };
      
      const result = await driver.processTransactionData(mockTx);
      
      expect(result.violations).to.include.deep.members([
        { constraint: 'EULER_SELF_LIQUIDATION', severity: 'CRITICAL' }
      ]);
    });

    it('should detect excessive borrowing without collateral', async function() {
      this.timeout(60000);
      
      // Mock transaction with excessive borrowing
      const mockTx = {
        hash: '0xmock_excessive_borrow',
        blockNumber: 16817996,
        edges: [
          {
            type: 'Borrow',
            service: 'Euler',
            from: '0xattacker',
            to: '0xeuler',
            amount: 10000000, // $10M borrow
            metadata: {
              collateralValue: 1000000, // Only $1M collateral
              healthFactor: 0.1 // Very unhealthy
            }
          }
        ]
      };
      
      const result = await driver.processTransactionData(mockTx);
      
      expect(result.violations).to.include.deep.members([
        { constraint: 'EULER_EXCESSIVE_BORROWING', severity: 'HIGH' }
      ]);
    });
  });

  describe('Attack Impact Analysis', () => {
    it('should calculate total attack impact', async function() {
      this.timeout(120000);
      
      const attackTx = '0x71a908be0e3a1fb3f3bd091ccafe8357633bdff273c865523659faee993e12ed';
      const result = await driver.processTransaction(attackTx);
      
      expect(result).to.not.be.null;
      
      // Check if attack was detected
      expect(result.violations.length).to.be.greaterThan(0);
      
      // Verify loss amount is significant (Euler lost ~$200M)
      if (result.pnl && result.pnl.totalLoss) {
        expect(result.pnl.totalLoss).to.be.greaterThan(100000000); // > $100M
        console.log(`\n💸 Total loss detected: $${result.pnl.totalLoss.toLocaleString()}`);
      }
      
      // Check attack classification
      expect(result.attackType).to.include.oneOf([
        'DONATION_INFLATION',
        'SELF_LIQUIDATION',
        'BUSINESS_LOGIC_FLAW'
      ]);
    });
  });

  after(() => {
    if (driver) {
      driver.cleanup();
    }
  });
});

// Additional test utilities for Euler attack patterns
export function isEulerAttack(violations: any[]): boolean {
  const eulerPatterns = [
    'EULER_DONATION_INFLATION',
    'EULER_SELF_LIQUIDATION',
    'EULER_EXCESSIVE_BORROWING',
    'EULER_FLASH_LOAN_DONATION_COMBO',
    'EULER_ABNORMAL_LIQUIDATION_PROFIT'
  ];
  
  return violations.some(v => 
    eulerPatterns.includes(v.constraint || v.type)
  );
}

export function calculateEulerLoss(pnl: any): number {
  // Euler specific loss calculation
  if (!pnl) return 0;
  
  let totalLoss = 0;
  
  // Sum up losses from different token types
  ['DAI', 'USDC', 'WETH', 'wstETH'].forEach(token => {
    if (pnl[token]) {
      totalLoss += Math.abs(pnl[token]);
    }
  });
  
  return totalLoss;
}