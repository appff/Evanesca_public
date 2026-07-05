/// <reference types="mocha" />

/**
 * Harvest Finance Attack Tests
 * 
 * Tests for detecting the Harvest Finance flash loan attacks from October 26, 2020.
 * These attacks exploited price manipulation in Curve pools using flash loans to
 * drain approximately $34M from Harvest vaults.
 * 
 * Attack Details:
 * - Date: October 26, 2020
 * - Method: Flash loan + Curve pool price manipulation
 * - Loss: ~$34M total across multiple vaults
 * - Detection: D2_ABNORMAL_SWAP violations due to extreme profit ratios
 */

import { expect } from "chai";
import { initializeTestEnvironment, runAttackTest, cleanupAfterTests } from "../shared/testUtils";
import { ACTIVE_ATTACKS } from "../shared/attackConstants";

// Initialize test environment
initializeTestEnvironment();

describe('Harvest Finance Attack Detection', () => {
  
  after(cleanupAfterTests);

  describe('Attack #1 - Main Harvest Attack', () => {
    it('should detect D2_ABNORMAL_SWAP violation in first Harvest attack', async function() {
      await runAttackTest(ACTIVE_ATTACKS.HARVEST_ATTACK_1, this);
    });
  });

  describe('Attack #2 - USDT Vault Attack', () => {
    it('should detect D2_ABNORMAL_SWAP violation in USDT vault attack', async function() {
      await runAttackTest(ACTIVE_ATTACKS.HARVEST_ATTACK_2, this);
    });
  });

  describe('Attack Pattern Analysis', () => {
    it('should verify both attacks follow similar flash loan patterns', async function() {
      // This test could be expanded to verify specific attack characteristics
      // such as flash loan amounts, manipulation ratios, etc.
      this.timeout(5000);
      
      const attack1 = ACTIVE_ATTACKS.HARVEST_ATTACK_1;
      const attack2 = ACTIVE_ATTACKS.HARVEST_ATTACK_2;
      
      // Verify both attacks target the same type of violation
      expect(attack1.expectedViolation.type).to.equal(attack2.expectedViolation.type);
      expect(attack1.attackType).to.equal(attack2.attackType);
      
      // Verify both involve Harvest and Curve protocols
      expect(attack1.protocols).to.include('Harvest');
      expect(attack1.protocols).to.include('Curve');
      expect(attack2.protocols).to.include('Harvest');
      expect(attack2.protocols).to.include('Curve');
      
      console.log('✅ Attack pattern analysis completed');
    });
  });
});