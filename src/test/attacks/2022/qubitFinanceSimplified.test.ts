/// <reference types="mocha" />

/**
 * Simplified Qubit Finance Bridge Attack Test
 * 
 * This test simulates the core vulnerability: zero-value deposit with token minting
 */

import { expect } from "chai";
import { DSLConstraintSolver } from "../../../ConstraintSolver/DSLConstraintSolver";
import { AnalysisResult } from "../../../ConstraintSolver/Interfaces/AnalysisResult";
import { SemanticFinancialGraph, EdgeSequence } from "../../../SemanticFinancialGraph/Types";
import '../shared/testSetup'; // Ensures proper test cleanup


describe('Qubit Finance B1 Constraint Detection', () => {
  
  it('should detect zero-value deposit with token minting via B1 constraint', async function() {
    console.log('🔍 Testing B1 constraint for bridge exploit detection...');
    
    // Create a mock behavior graph simulating the attack
    const mockGraph = {
      nodes: () => ['attacker', 'bridge'],
      edges: () => [{
        v: 'attacker',
        w: 'bridge',
        name: [JSON.stringify({
          Action: 'Deposit',
          Protocol: 'QubitBridge',
          AmountIn: '0', // Zero ETH deposited
          TokenIn: 'ETH',
          TokenInAddr: '0x0000000000000000000000000000000000000000',
          Type: 'Bridge'
        })]
      }],
      node: (id: string) => ({
        Service: 'QubitBridge',
        ServiceType: 'Bridge',
        Type: 'Bridge'
      })
    };
    
    // Create mock edge sequence with bridge minting
    const mockEdgeSeq: EdgeSequence = [
      {
        v: 'attacker',
        w: 'bridge',
        name: [JSON.stringify({
          Action: 'Deposit',
          Protocol: 'QubitBridge',
          AmountIn: '0', // Zero value deposit
          Amount: '0', // DSL constraint field
          action: 'Deposit', // lowercase for DSL
          type: 'Bridge', // lowercase for DSL
          TokenIn: 'ETH',
          Type: 'Bridge'
        })]
      },
      {
        v: 'bridge',
        w: 'attacker',
        name: [JSON.stringify({
          Action: 'Mint',
          Protocol: 'QubitBridge',
          AmountOut: '77162000000000000000000', // 77,162 qXETH minted
          TokenOut: 'qXETH',
          TokenOutAddr: '0x8e852e6bb88d21a9f971eb47eb8fe88a8cce1fac',
          Type: 'Bridge'
        })]
      }
    ];
    
    // Create DSL solver with B1 constraint
    const solver = new DSLConstraintSolver(14301254);
    
    // Use the standard DSL rules that include bridge constraints
    const { DEFAULT_DSL_RULES } = require('../../config/constants');
    solver.loadDSLRules(DEFAULT_DSL_RULES);
    
    // Run analysis
    const result = await solver.solve(mockGraph as any, mockEdgeSeq);
    
    console.log('📊 Analysis Result:');
    console.log('Violations:', result._violation);
    console.log('Comment:', result._comment);
    
    // Check for B1 violation at index 4 (BRIDGE_ABNORMAL_MINTING)
    expect(result._violation[4]).to.be.true;
    
    console.log('\n✅ B1 constraint successfully detected zero-value deposit with minting!');
  });

  it('should not trigger B1 for legitimate bridge deposits', async function() {
    console.log('\n🔍 Testing B1 constraint for legitimate bridge usage...');
    
    // Create mock edge sequence with legitimate deposit and mint
    const legitimateEdgeSeq: EdgeSequence = [
      {
        v: 'user',
        w: 'bridge',
        name: [JSON.stringify({
          Action: 'Deposit',
          Protocol: 'QubitBridge',
          AmountIn: '1000000000000000000', // 1 ETH deposited
          Amount: '1000000000000000000', // DSL constraint field
          action: 'Deposit', // lowercase for DSL
          type: 'Bridge', // lowercase for DSL
          TokenIn: 'ETH',
          Type: 'Bridge'
        })]
      },
      {
        v: 'bridge',
        w: 'user',
        name: [JSON.stringify({
          Action: 'Mint',
          Protocol: 'QubitBridge',
          AmountOut: '1000000000000000000', // 1 qXETH minted (1:1 ratio)
          TokenOut: 'qXETH',
          Type: 'Bridge'
        })]
      }
    ];
    
    const solver = new DSLConstraintSolver(14301254);
    const { DEFAULT_DSL_RULES } = require('../../config/constants');
    solver.loadDSLRules(DEFAULT_DSL_RULES);
    
    const mockGraph = {
      nodes: () => ['user', 'bridge'],
      edges: () => legitimateEdgeSeq,
      node: (id: string) => ({
        Service: 'QubitBridge',
        ServiceType: 'Bridge',
        Type: 'Bridge'
      })
    };
    
    const result = await solver.solve(mockGraph as any, legitimateEdgeSeq);
    
    console.log('📊 Analysis Result:');
    console.log('Violations:', result._violation);
    console.log('Comment:', result._comment);
    
    // Should NOT trigger B1 for legitimate usage
    expect(result._violation[4]).to.be.false;
    
    console.log('\n✅ B1 constraint correctly ignored legitimate bridge usage!');
  });
});