/// <reference types="mocha" />

/**
 * bZx Attack Test
 * 
 * Test for detecting the famous bZx flash loan attack from February 15, 2020.
 * This attack is considered a classic example of flash loan price manipulation
 * and serves as a reference case for DeFi attack detection systems.
 * 
 * Attack Flow:
 * 1. Borrow 10,000 ETH via flash loan from dYdX
 * 2. Deposit 5,500 ETH to Compound as collateral
 * 3. Borrow 112 WBTC from Compound
 * 4. Deposit 1,300 ETH to bZx for margin trading (5x leverage)
 * 5. bZx executes: 5,637 ETH → 51 WBTC (price manipulation via Kyber)
 * 6. Attacker swaps: 112 WBTC → 6,871 ETH (exploiting manipulated price)
 * 7. Repay 10,000 ETH flash loan to dYdX
 * 
 * Expected Result:
 * - Attacker profit: ~71.412739 ETH (~$314K at 2020 prices)
 * - Detection: D2_ABNORMAL_SWAP violation (161.80% profit ratio)
 * - Victim: bZx Protocol (lost ~$618K)
 */

import { expect } from "chai";
import { initializeTestEnvironment, runAttackTest, cleanupAfterTests } from "../shared/testUtils";
import { ACTIVE_ATTACKS } from "../shared/attackConstants";

// Initialize test environment
initializeTestEnvironment();

describe('bZx Attack Detection', () => {
  
  after(cleanupAfterTests);

  describe('Classic Flash Loan Attack', () => {
    it('should detect D2_ABNORMAL_SWAP violation in bZx hack', async function() {
      await runAttackTest(ACTIVE_ATTACKS.BZX_HACK, this);
    });

    it('should verify attack involves expected protocols', function() {
      const attack = ACTIVE_ATTACKS.BZX_HACK;
      
      // Verify all expected protocols are involved
      const expectedProtocols = ['bZx', 'dYdX', 'Compound', 'Uniswap', 'Kyber'];
      expectedProtocols.forEach(protocol => {
        expect(attack.protocols).to.include(protocol);
      });
      
      // Verify attack characteristics
      expect(attack.attackType).to.equal('flash_loan');
      expect(attack.expectedViolation.type).to.equal('D2_ABNORMAL_SWAP');
      // The description doesn't include the percentage, it's a generic message
      expect(attack.expectedViolation.description).to.include('extreme profit ratio');
      
      console.log('✅ bZx attack metadata verification completed');
    });
  });

  describe('Expected Attack Results', () => {
    it('should document expected financial outcomes', function() {
      const attack = ACTIVE_ATTACKS.BZX_HACK;
      
      // Document the expected results from the academic paper
      const expectedResults = {
        attackerProfit: '71.412739 ETH',
        profitUSD: '$314K',
        victimLoss: '$618K',
        profitRatio: '161.80%'
      };
      
      console.log('📊 Expected bZx Attack Results:');
      console.log(`   💰 Attacker Profit: ${expectedResults.attackerProfit} (${expectedResults.profitUSD})`);
      console.log(`   💸 Victim Loss: ${expectedResults.victimLoss}`);
      console.log(`   📈 Profit Ratio: ${expectedResults.profitRatio}`);
      console.log(`   🎯 Detection Method: ${attack.expectedViolation.type}`);
      
      // These values are documented expectations, not assertions against actual results
      expect(attack.estimatedLoss).to.equal('$350K');
      expect(attack.date).to.equal('2020-02-15');
      
      console.log('✅ Attack documentation verification completed');
    });
  });
});