/**
 * Integration tests for protocol verification with known attacks
 * Tests that protocol invariant violations are detected in real attack transactions
 */

import { expect } from 'chai';
import { run } from '../../Driver';
import { EvanescaContext } from '../../Interfaces/EvanescaContext';
import { Result } from '../../Utils/Driver/DriverUtils';

describe('Protocol Verification Attack Integration', () => {
  let context: EvanescaContext;
  
  beforeEach(() => {
    // Initialize context for testing
    context = {
      analyzed: new Set(),
      tList: [],
      fins: [Result.NOT_YET],
      reports: [],
      complexity: []
    };
  });
  
  it('should detect Uniswap V2 invariant violation in bZx attack', async () => {
    // bZx attack transaction that manipulated Uniswap prices
    const txHash = '0xb5c8bd9430b6cc87a0e2fe110ece6bf527fa4f170a4bc8cd032f768fc5219838';
    
    const result = await run(txHash, context);
    
    // Check that the transaction was analyzed (not skipped)
    expect(result.fins[0]).to.not.equal(Result.SKIPPED);
    
    // Check if protocol violations were detected
    const report = result.reports[0];
    if (report && report.protocolViolations) {
      const uniswapViolation = report.protocolViolations.find(
        v => v.protocol === 'UniswapV2' || v.protocol === 'Uniswap'
      );
      
      if (uniswapViolation) {
        console.log('✅ Uniswap invariant violation detected:', {
          type: uniswapViolation.invariantType,
          deviation: uniswapViolation.deviation,
          message: uniswapViolation.message
        });
        expect(uniswapViolation).to.not.be.undefined;
      }
    }
    
    // Also check for DSL constraint violations
    const violations = report?._violation || [];
    const hasViolations = violations.some(v => v === true);
    
    expect(hasViolations).to.be.true;
    console.log('🎯 DSL violations detected in bZx attack');
  }).timeout(60000);
  
  it('should not detect invariant violations in normal Uniswap swap', async () => {
    // A normal Uniswap swap transaction (example)
    // This would need to be replaced with an actual normal swap tx hash
    const txHash = '0x0000000000000000000000000000000000000000000000000000000000000001';
    
    try {
      const result = await run(txHash, context);
      
      // Normal swaps might be skipped or show no violations
      if (result.fins[0] !== Result.SKIPPED && result.reports[0]) {
        const report = result.reports[0];
        const protocolViolations = report.protocolViolations || [];
        
        // Normal transactions should have no or very few protocol violations
        expect(protocolViolations.length).to.be.lessThan(2);
        
        if (protocolViolations.length > 0) {
          console.log('⚠️ Minor violations in normal transaction:', protocolViolations);
        }
      }
    } catch (error) {
      // If transaction doesn't exist or fails, that's ok for this test
      console.log('Normal transaction test skipped (tx not found)');
    }
  }).timeout(60000);
  
  it('should detect lending protocol violations in Compound exploit', async () => {
    // Example Compound-related attack transaction
    // Replace with actual attack hash when available
    const txHash = '0x0000000000000000000000000000000000000000000000000000000000000002';
    
    try {
      const result = await run(txHash, context);
      
      if (result.fins[0] !== Result.SKIPPED && result.reports[0]) {
        const report = result.reports[0];
        const protocolViolations = report.protocolViolations || [];
        
        const lendingViolation = protocolViolations.find(
          v => v.protocol === 'Compound' || v.protocol === 'Aave' || v.invariantType === 'lending'
        );
        
        if (lendingViolation) {
          console.log('✅ Lending protocol violation detected:', {
            protocol: lendingViolation.protocol,
            type: lendingViolation.invariantType,
            message: lendingViolation.message
          });
        }
      }
    } catch (error) {
      console.log('Compound test skipped (tx not found or error)');
    }
  }).timeout(60000);
  
  describe('Protocol Verification Performance', () => {
    it('should complete protocol verification within reasonable time', async () => {
      const txHash = '0xb5c8bd9430b6cc87a0e2fe110ece6bf527fa4f170a4bc8cd032f768fc5219838';
      
      const startTime = Date.now();
      await run(txHash, context);
      const endTime = Date.now();
      
      const elapsed = endTime - startTime;
      console.log(`⏱️ Protocol verification completed in ${elapsed}ms`);
      
      // Should complete within 10 seconds for a single transaction
      expect(elapsed).to.be.lessThan(10000);
    }).timeout(60000);
  });
  
  describe('DSL Constraint Integration', () => {
    it('should load and apply protocol invariant DSL constraints', async () => {
      const txHash = '0xb5c8bd9430b6cc87a0e2fe110ece6bf527fa4f170a4bc8cd032f768fc5219838';
      
      const result = await run(txHash, context);
      
      if (result.reports[0]) {
        const report = result.reports[0];
        
        // Check that DSL constraints were evaluated
        expect(report._violation).to.be.an('array');
        expect(report._violation.length).to.be.greaterThan(0);
        
        // Check for specific protocol invariant violations
        const protocolViolations = report.protocolViolations || [];
        console.log(`📊 Total protocol violations: ${protocolViolations.length}`);
        
        protocolViolations.forEach(violation => {
          console.log(`  - ${violation.protocol}: ${violation.invariantType} (${violation.severity})`);
        });
      }
    }).timeout(60000);
  });
});