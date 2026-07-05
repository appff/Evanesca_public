/// <reference types="mocha" />

/**
 * Test for Prisma Finance Attack
 */

import { expect } from "chai";
import { 
  initializeTestEnvironment, 
  createTestContext,
  analyzeAttack,
  assertViolationDetected
} from "./shared/testUtils";

// Initialize test environment
initializeTestEnvironment();

describe('Prisma Finance Attack Test', () => {
  
  it('Should detect Prisma Finance reentrancy attack', async function() {
    this.timeout(60000);
    console.log('🔍 Testing Prisma Finance Attack (2024.03.28)');
    
    const attackData = {
      name: 'Prisma Finance 2024',
      description: 'Reentrancy via flash loan callback ($11.6M loss)',
      transactionHash: '0x8b74995d1d61579174220e07f0d6a6e089a35e88cf56209a86ab2622e7b5e041',
      date: '2024-03-28',
      expectedViolation: { index: 2, type: 'L1_REENTRANCY', description: 'Reentrancy via callback' },
      attackType: 'reentrancy',
      protocols: ['Prisma'],
      estimatedLoss: '$11.6M',
      timeout: 60000
    };
    
    try {
      const context = createTestContext();
      const reports = await analyzeAttack(attackData, context);
      assertViolationDetected(reports, attackData);
      console.log('✅ Prisma Finance attack DETECTED successfully');
    } catch (error: any) {
      console.error('❌ Detection failed:', error.message);
      throw error;
    }
  });
});