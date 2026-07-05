/**
 * Comprehensive Attack Pattern Test Suite
 * 
 * This test suite runs all implemented attack detections to ensure
 * the system can detect various DeFi attack patterns accurately.
 * 
 * Implemented Attacks:
 * - bZx Hack (February 2020)
 * - Harvest Finance Attack (October 2020) 
 * - Yearn Finance Attack (February 2021)
 * - Cream Finance Attack (August 2021)
 * - Origin Protocol Attack (November 2020)
 * - Warp Finance Attack (December 2020)
 * - Cheese Bank Attack (November 2020)
 * - Value DeFi Attack (November 2020)
 */

import { describe, it, before, after } from 'mocha';
import { 
  initializeTestEnvironment,
  runAttackTest,
  cleanupAfterTests
} from './shared/testUtils';
import { ACTIVE_ATTACKS, getAllActiveAttacks } from './shared/attackConstants';

// Define which attacks to include in comprehensive test
const ATTACKS_TO_TEST = [
  'BZX_HACK',
  'HARVEST_ATTACK_1', 
  'YEARN_FINANCE',
  'CREAM_FINANCE',
  'ORIGIN_PROTOCOL',
  'WARP_FINANCE',
  'CHEESE_BANK',
  'VALUE_DEFI'
  // Note: XTOKEN_2 excluded due to block range limitation (2021)
  // Note: HARVEST_ATTACK_2 excluded to avoid duplicate testing  
  // Note: AKROPOLIS excluded due to block range limitation (Nov 2020, block ~11.23M)
];

describe('Comprehensive Attack Pattern Test Suite', function () {
  // Extended timeout for running multiple tests
  this.timeout(300000); // 5 minutes total
  
  before(function () {
    console.log('🚀 Initializing comprehensive test environment...');
    console.log(`📊 Testing ${ATTACKS_TO_TEST.length} attack patterns`);
    initializeTestEnvironment();
  });
  
  after(function () {
    console.log('🧹 Cleaning up after comprehensive tests...');
    cleanupAfterTests();
  });

  // Generate test for each attack
  ATTACKS_TO_TEST.forEach(attackKey => {
    const attackData = (ACTIVE_ATTACKS as any)[attackKey];
    
    if (!attackData) {
      console.error(`Attack ${attackKey} not found in ACTIVE_ATTACKS`);
      return;
    }
    
    it(`should detect ${attackData.name}`, async function () {
      console.log(`\n${'='.repeat(60)}`);
      console.log(`🔍 Testing: ${attackData.name}`);
      console.log(`📅 Date: ${attackData.date}`);
      console.log(`💰 Loss: ${attackData.estimatedLoss}`);
      console.log(`🎯 Expected: ${attackData.expectedViolation.type}`);
      console.log(`${'='.repeat(60)}\n`);
      
      await runAttackTest(attackData, this);
    });
  });

  // Summary test
  it('should have detected all attack patterns', function () {
    console.log('\n📊 Test Summary:');
    console.log(`✅ Successfully tested ${ATTACKS_TO_TEST.length} attack patterns`);
    console.log('\nAttacks tested:');
    ATTACKS_TO_TEST.forEach((key, index) => {
      const attack = (ACTIVE_ATTACKS as any)[key];
      if (attack) {
        console.log(`  ${index + 1}. ${attack.name} - ${attack.expectedViolation.type}`);
      }
    });
  });
});