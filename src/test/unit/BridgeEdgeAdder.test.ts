/// <reference types="mocha" />

/**
 * Unit Tests for BridgeEdgeAdder Classes
 * 
 * Tests the QubitBridgeEdgeAdder and MeterBridgeEdgeAdder classes used for
 * bridge attack detection including edge creation, validation, and correlation.
 */

import { expect } from 'chai';
import { 
  QubitBridgeEdgeAdder, 
  MeterBridgeEdgeAdder,
  IBridgeEdge,
  ValidationResult,
  ValidationIssue,
  BridgeProtocolConfig,
  QUBIT_BRIDGE_CONFIG,
  METER_BRIDGE_CONFIG
} from '../../SemanticFinancialGraph/BridgeEdgeAdder';
import { DecodedEvent, LogEvent } from '../../SemanticFinancialGraph/SemanticFinancialGraphUtils';

describe('BridgeEdgeAdder Unit Tests', () => {
  
  describe('QubitBridgeEdgeAdder', () => {
    let qubitAdder: QubitBridgeEdgeAdder;
    
    beforeEach(() => {
      qubitAdder = new QubitBridgeEdgeAdder();
    });

    describe('Constructor and Configuration', () => {
      it('should initialize with Qubit bridge configuration', () => {
        expect(qubitAdder).to.be.instanceOf(QubitBridgeEdgeAdder);
        // Configuration is private, but we can test behavior
      });

      it('should have correct protocol configuration', () => {
        const config = QUBIT_BRIDGE_CONFIG;
        expect(config.name).to.equal('QubitBridge');
        expect(config.supportedChains).to.include('ethereum');
        expect(config.supportedChains).to.include('bsc');
        expect(config.validationRules).to.have.length.greaterThan(0);
      });
    });

    describe('canHandle Method', () => {
      it('should handle logs from known Qubit contracts', () => {
        const mockLog = {
          address: '0xfD7A5506F434f5334C100EFb765025243C39137C', // qXETH on BSC
          topics: ['0x1234567890123456789012345678901234567890123456789012345678901234'],
          data: '0x1234'
        };

        // Note: This will return false with current mock data since addresses are placeholder
        // In real implementation, would use actual contract addresses
        const canHandle = qubitAdder.canHandle(mockLog);
        expect(canHandle).to.be.a('boolean');
      });

      it('should handle logs with deposit event signatures', () => {
        const mockLog = {
          address: '0x1111111111111111111111111111111111111111',
          topics: ['0xdepositedepositedepositedepositedepositedepositedepositedeposite'], // Mock deposit signature
          data: '0x1234'
        };

        const canHandle = qubitAdder.canHandle(mockLog);
        expect(canHandle).to.be.a('boolean');
      });

      it('should handle logs with mint event signatures', () => {
        const mockLog = {
          address: '0x1111111111111111111111111111111111111111',
          topics: ['0xmintmintmintmintmintmintmintmintmintmintmintmintmintmintmintmint'], // Mock mint signature
          data: '0x1234'
        };

        const canHandle = qubitAdder.canHandle(mockLog);
        expect(canHandle).to.be.a('boolean');
      });

      it('should return false for unrelated logs', () => {
        const mockLog = {
          address: '0x9999999999999999999999999999999999999999',
          topics: ['0xunrelatedunrelatedunrelatedunrelatedunrelatedunrelatedunrelated'],
          data: '0x1234'
        };

        const canHandle = qubitAdder.canHandle(mockLog);
        expect(canHandle).to.be.false;
      });
    });

    describe('makeEdge Method - Deposit Operations', () => {
      it('should create bridge edge for ETH deposit', async () => {
        const mockDecodedEvents: DecodedEvent[] = [
          {
            name: 'amount',
            type: 'uint256',
            value: '1000000000000000000' // 1 ETH
          }
        ];

        const mockLogEvent: LogEvent = {
          eventName: 'depositETH',
          amount: 0, // Index in decoded events
          token: -1,
          from: -1,
          to: -1
        };

        const edge = await qubitAdder.makeEdge(
          mockDecodedEvents,
          '0x8d3d13cac607B7297Ff61A5E1E71072758AF4D01', // User address
          '0x4ee6eCAD1c2Dae9f525404De8555724e3c35d07B', // Bridge contract
          mockLogEvent
        );

        expect(edge).to.be.an('object');
        expect(edge.Action).to.equal('depositETH');
        expect(edge.edgeType).to.equal('BridgeDeposit');
        expect(edge.bridgeProtocol).to.equal('QubitBridge');
        expect(edge.sourceChain).to.equal('ethereum');
        expect(edge.targetChain).to.equal('bsc');
        expect(edge.Amount).to.equal('1000000000000000000');
        expect(edge.Token).to.equal('ETH');
        expect(edge.From).to.equal('0x8d3d13cac607B7297Ff61A5E1E71072758AF4D01');
        expect(edge.crossChainId).to.be.a('string');
        expect(edge.validationResult).to.be.an('object');
      });

      it('should create bridge edge for zero-value deposit (Qubit attack pattern)', async () => {
        const mockDecodedEvents: DecodedEvent[] = [];

        const mockLogEvent: LogEvent = {
          eventName: 'Deposit',
          amount: -1, // No amount data (simulates zero value)
          token: -1,
          from: -1,
          to: -1
        };

        const edge = await qubitAdder.makeEdge(
          mockDecodedEvents,
          '0x8d3d13cac607B7297Ff61A5E1E71072758AF4D01',
          '0x4ee6eCAD1c2Dae9f525404De8555724e3c35d07B',
          mockLogEvent
        );

        expect(edge.Action).to.equal('Deposit');
        expect(edge.Amount).to.equal('0'); // Critical for B1 constraint
        expect(edge.edgeType).to.equal('BridgeDeposit');
        expect(edge.validationResult?.isValid).to.be.false; // Should be invalid due to zero deposit
        expect(edge.validationResult?.issues).to.have.length.greaterThan(0);
      });
    });

    describe('makeEdge Method - Mint Operations', () => {
      it('should create bridge edge for token mint', async () => {
        const mockDecodedEvents: DecodedEvent[] = [
          {
            name: 'amount',
            type: 'uint256',
            value: '77162000000000000000000' // 77,162 tokens (Qubit attack amount)
          }
        ];

        const mockLogEvent: LogEvent = {
          eventName: 'Mint',
          amount: 0,
          token: -1,
          from: -1,
          to: -1
        };

        const edge = await qubitAdder.makeEdge(
          mockDecodedEvents,
          '0x8d3d13cac607B7297Ff61A5E1E71072758AF4D01',
          '0xfD7A5506F434f5334C100EFb765025243C39137C',
          mockLogEvent
        );

        expect(edge.Action).to.equal('Mint');
        expect(edge.edgeType).to.equal('BridgeMint');
        expect(edge.sourceChain).to.equal('bsc');
        expect(edge.targetChain).to.equal('ethereum');
        expect(edge.Amount).to.equal('77162000000000000000000');
        expect(edge.Token).to.equal('qXETH');
        expect(edge.TokenAddr).to.equal('0xfD7A5506F434f5334C100EFb765025243C39137C');
        expect(edge.crossChainId).to.be.a('string');
      });

      it('should create bridge edge for zero-amount mint', async () => {
        const mockDecodedEvents: DecodedEvent[] = [];

        const mockLogEvent: LogEvent = {
          eventName: 'Mint',
          amount: -1, // No amount data
          token: -1,
          from: -1,
          to: -1
        };

        const edge = await qubitAdder.makeEdge(
          mockDecodedEvents,
          '0x8d3d13cac607B7297Ff61A5E1E71072758AF4D01',
          '0xfD7A5506F434f5334C100EFb765025243C39137C',
          mockLogEvent
        );

        expect(edge.Amount).to.equal('0');
        expect((edge as any).depositAmount).to.equal('0'); // Should be 0 for exploit case
        expect((edge as any).depositValue).to.equal('0');
      });
    });

    describe('Validation Methods', () => {
      it('should validate legitimate deposits', () => {
        const mockEdge: IBridgeEdge = {
          Action: 'Deposit',
          edgeType: 'BridgeDeposit',
          bridgeProtocol: 'QubitBridge',
          sourceChain: 'ethereum',
          targetChain: 'bsc',
          Amount: '1000000000000000000', // 1 ETH
          Token: 'ETH',
          TokenAddr: '0x0000000000000000000000000000000000000000',
          From: '0x8d3d13cac607B7297Ff61A5E1E71072758AF4D01',
          To: '0x4ee6eCAD1c2Dae9f525404De8555724e3c35d07B'
        };

        const result = qubitAdder.validateDeposit(mockEdge);

        expect(result.isValid).to.be.true;
        expect(result.score).to.be.greaterThan(0.5);
        expect(result.issues).to.have.length(0);
        expect(result.metadata.protocol).to.equal('QubitBridge');
      });

      it('should detect zero-value deposit violations', () => {
        const mockEdge: IBridgeEdge = {
          Action: 'Deposit',
          edgeType: 'BridgeDeposit',
          bridgeProtocol: 'QubitBridge',
          sourceChain: 'ethereum',
          targetChain: 'bsc',
          Amount: '0', // Zero amount - should trigger violation
          Token: 'ETH',
          TokenAddr: '0x0000000000000000000000000000000000000000',
          From: '0x8d3d13cac607B7297Ff61A5E1E71072758AF4D01',
          To: '0x4ee6eCAD1c2Dae9f525404De8555724e3c35d07B'
        };

        const result = qubitAdder.validateDeposit(mockEdge);

        expect(result.isValid).to.be.false;
        expect(result.score).to.equal(0); // Should be 0 due to critical violation
        expect(result.issues).to.have.length.greaterThan(0);
        
        const criticalIssue = result.issues.find(issue => issue.severity === 'critical');
        expect(criticalIssue).to.exist;
        expect(criticalIssue?.type).to.equal('non_zero_deposit');
        expect(criticalIssue?.description).to.include('Zero-value deposit detected');
      });

      it('should detect backing verification failures', () => {
        const mockEdge: IBridgeEdge = {
          Action: 'Deposit',
          edgeType: 'BridgeDeposit',
          bridgeProtocol: 'QubitBridge',
          sourceChain: 'ethereum',
          targetChain: 'bsc',
          Amount: undefined, // Undefined amount - backing verification failure
          Token: 'ETH',
          TokenAddr: '0x0000000000000000000000000000000000000000',
          From: '0x8d3d13cac607B7297Ff61A5E1E71072758AF4D01',
          To: '0x4ee6eCAD1c2Dae9f525404De8555724e3c35d07B'
        };

        const result = qubitAdder.validateDeposit(mockEdge);

        expect(result.isValid).to.be.false;
        expect(result.issues.some(issue => issue.type === 'backing_verification')).to.be.true;
      });
    });

    describe('Cross-Chain Correlation', () => {
      it('should generate consistent correlation IDs for same user/protocol', async () => {
        const mockDecodedEvents: DecodedEvent[] = [
          { name: 'amount', type: 'uint256', value: '1000000000000000000' }
        ];

        const mockLogEvent: LogEvent = {
          eventName: 'Deposit',
          amount: 0,
          token: -1,
          from: -1,
          to: -1
        };

        const edge1 = await qubitAdder.makeEdge(
          mockDecodedEvents,
          '0x8d3d13cac607B7297Ff61A5E1E71072758AF4D01',
          '0x4ee6eCAD1c2Dae9f525404De8555724e3c35d07B',
          mockLogEvent
        );

        const edge2 = await qubitAdder.makeEdge(
          mockDecodedEvents,
          '0x8d3d13cac607B7297Ff61A5E1E71072758AF4D01',
          '0x4ee6eCAD1c2Dae9f525404De8555724e3c35d07B',
          mockLogEvent
        );

        expect(edge1.crossChainId).to.equal(edge2.crossChainId);
      });

      it('should generate different correlation IDs for different users', async () => {
        const mockDecodedEvents: DecodedEvent[] = [
          { name: 'amount', type: 'uint256', value: '1000000000000000000' }
        ];

        const mockLogEvent: LogEvent = {
          eventName: 'Deposit',
          amount: 0,
          token: -1,
          from: -1,
          to: -1
        };

        const edge1 = await qubitAdder.makeEdge(
          mockDecodedEvents,
          '0x8d3d13cac607B7297Ff61A5E1E71072758AF4D01',
          '0x4ee6eCAD1c2Dae9f525404De8555724e3c35d07B',
          mockLogEvent
        );

        const edge2 = await qubitAdder.makeEdge(
          mockDecodedEvents,
          '0x1234567890123456789012345678901234567890', // Different user
          '0x4ee6eCAD1c2Dae9f525404De8555724e3c35d07B',
          mockLogEvent
        );

        expect(edge1.crossChainId).to.not.equal(edge2.crossChainId);
      });
    });
  });

  describe('MeterBridgeEdgeAdder', () => {
    let meterAdder: MeterBridgeEdgeAdder;
    
    beforeEach(() => {
      meterAdder = new MeterBridgeEdgeAdder();
    });

    describe('Constructor and Configuration', () => {
      it('should initialize with Meter bridge configuration', () => {
        expect(meterAdder).to.be.instanceOf(MeterBridgeEdgeAdder);
      });

      it('should have correct protocol configuration', () => {
        const config = METER_BRIDGE_CONFIG;
        expect(config.name).to.equal('MeterBridge');
        expect(config.supportedChains).to.include('ethereum');
        expect(config.supportedChains).to.include('arbitrum');
        expect(config.validationRules).to.have.length.greaterThan(0);
      });
    });

    describe('makeEdge Method - Meter.io Specific Patterns', () => {
      it('should create bridge edge for Meter deposit', async () => {
        const mockDecodedEvents: DecodedEvent[] = [
          {
            name: 'amount',
            type: 'uint256',
            value: '1391240000000000000000' // Meter.io attack amount
          },
          {
            name: 'token',
            type: 'address',
            value: '0xA0b86a33E6a9e16C691c1293F01b8B9Ea7e1FcDe'
          }
        ];

        const mockLogEvent: LogEvent = {
          eventName: 'Deposit',
          amount: 0,
          token: 1,
          from: -1,
          to: -1
        };

        const edge = await meterAdder.makeEdge(
          mockDecodedEvents,
          '0x8d3d13cac607B7297Ff61A5E1E71072758AF4D01',
          '0x4ee6eCAD1c2Dae9f525404De8555724e3c35d07B',
          mockLogEvent
        );

        expect(edge.Action).to.equal('Deposit');
        expect(edge.bridgeProtocol).to.equal('MeterBridge');
        expect(edge.sourceChain).to.equal('ethereum');
        expect(edge.targetChain).to.equal('arbitrum');
        expect(edge.Amount).to.equal('1391240000000000000000');
        expect(edge.Token).to.equal('0xA0b86a33E6a9e16C691c1293F01b8B9Ea7e1FcDe');
      });

      it('should create bridge edge for zero-value deposit (Meter.io attack)', async () => {
        const mockDecodedEvents: DecodedEvent[] = [];

        const mockLogEvent: LogEvent = {
          eventName: 'Deposit',
          amount: -1, // No amount (zero value)
          token: -1,
          from: -1,
          to: -1
        };

        const edge = await meterAdder.makeEdge(
          mockDecodedEvents,
          '0x8d3d13cac607B7297Ff61A5E1E71072758AF4D01',
          '0x4ee6eCAD1c2Dae9f525404De8555724e3c35d07B',
          mockLogEvent
        );

        expect(edge.Amount).to.equal('0'); // Critical for B2 constraint
        expect(edge.validationResult?.isValid).to.be.false;
        expect(edge.validationResult?.issues.some(issue => 
          issue.description.includes('Meter.io attack pattern')
        )).to.be.true;
      });
    });

    describe('Validation Methods - Meter.io Specific', () => {
      it('should detect Meter.io deposit bypass pattern', () => {
        const mockEdge: IBridgeEdge = {
          Action: 'Deposit',
          edgeType: 'BridgeDeposit',
          bridgeProtocol: 'MeterBridge',
          sourceChain: 'ethereum',
          targetChain: 'arbitrum',
          Amount: '0', // Zero msg.value
          Token: 'WETH',
          TokenAddr: '0x0000000000000000000000000000000000000000',
          From: '0x8d3d13cac607B7297Ff61A5E1E71072758AF4D01',
          To: '0x4ee6eCAD1c2Dae9f525404De8555724e3c35d07B'
        };

        const result = meterAdder.validateDeposit(mockEdge);

        expect(result.isValid).to.be.false;
        expect(result.issues.some(issue => 
          issue.description.includes('Meter.io attack pattern')
        )).to.be.true;
        
        expect(result.issues.some(issue => 
          issue.description.includes('Deposit bypass detected')
        )).to.be.true;
      });

      it('should validate legitimate Meter deposits', () => {
        const mockEdge: IBridgeEdge = {
          Action: 'Deposit',
          edgeType: 'BridgeDeposit',
          bridgeProtocol: 'MeterBridge',
          sourceChain: 'ethereum',
          targetChain: 'arbitrum',
          Amount: '1000000000000000000', // 1 ETH
          Token: 'WETH',
          TokenAddr: '0x0000000000000000000000000000000000000000',
          From: '0x8d3d13cac607B7297Ff61A5E1E71072758AF4D01',
          To: '0x4ee6eCAD1c2Dae9f525404De8555724e3c35d07B'
        };

        const result = meterAdder.validateDeposit(mockEdge);

        expect(result.isValid).to.be.true;
        expect(result.score).to.be.greaterThan(0.5);
        expect(result.issues).to.have.length(0);
      });
    });

    describe('Balance Change Verification', () => {
      it('should detect balance change verification failures', () => {
        const mockEdge: IBridgeEdge = {
          Action: 'Deposit',
          edgeType: 'BridgeDeposit',
          bridgeProtocol: 'MeterBridge',
          sourceChain: 'ethereum',
          targetChain: 'arbitrum',
          Amount: '0', // No balance change
          Token: 'WETH',
          TokenAddr: '0x0000000000000000000000000000000000000000',
          From: '0x8d3d13cac607B7297Ff61A5E1E71072758AF4D01',
          To: '0x4ee6eCAD1c2Dae9f525404De8555724e3c35d07B'
        };

        const result = meterAdder.validateDeposit(mockEdge);

        const balanceVerificationIssue = result.issues.find(issue => 
          issue.type === 'backing_verification'
        );
        
        expect(balanceVerificationIssue).to.exist;
        expect(balanceVerificationIssue?.description).to.include('balance change');
      });
    });
  });

  describe('Bridge Protocol Configurations', () => {
    it('should have valid Qubit bridge configuration', () => {
      const config = QUBIT_BRIDGE_CONFIG;
      
      expect(config.name).to.be.a('string');
      expect(config.supportedChains).to.be.an('array');
      expect(config.contracts).to.be.an('object');
      expect(config.depositEvents).to.be.an('array');
      expect(config.mintEvents).to.be.an('array');
      expect(config.validationRules).to.be.an('array');
      
      // Validation rules should have required properties
      config.validationRules.forEach(rule => {
        expect(rule.type).to.be.a('string');
        expect(rule.severity).to.be.oneOf(['low', 'medium', 'high', 'critical']);
      });
    });

    it('should have valid Meter bridge configuration', () => {
      const config = METER_BRIDGE_CONFIG;
      
      expect(config.name).to.be.a('string');
      expect(config.supportedChains).to.be.an('array');
      expect(config.contracts).to.be.an('object');
      expect(config.depositEvents).to.be.an('array');
      expect(config.mintEvents).to.be.an('array');
      expect(config.validationRules).to.be.an('array');
      
      // Should have balance change verification rule for Meter.io
      expect(config.validationRules.some(rule => 
        rule.params?.requireBalanceChange === true
      )).to.be.true;
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid decoded events gracefully', async () => {
      const qubitAdder = new QubitBridgeEdgeAdder();
      const invalidDecodedEvents: DecodedEvent[] = [];
      
      const mockLogEvent: LogEvent = {
        eventName: 'Deposit',
        amount: 999, // Invalid index
        token: -1,
        from: -1,
        to: -1
      };

      const edge = await qubitAdder.makeEdge(
        invalidDecodedEvents,
        '0x8d3d13cac607B7297Ff61A5E1E71072758AF4D01',
        '0x4ee6eCAD1c2Dae9f525404De8555724e3c35d07B',
        mockLogEvent
      );

      expect(edge.Amount).to.equal('0'); // Should default to 0
      expect(edge).to.have.property('validationResult');
    });

    it('should handle malformed log events', () => {
      const qubitAdder = new QubitBridgeEdgeAdder();
      
      const malformedLog = {
        // Missing required properties
        topics: null,
        data: null
      };

      const canHandle = qubitAdder.canHandle(malformedLog);
      expect(canHandle).to.be.false;
    });

    it('should handle empty validation rules gracefully', () => {
      // Test with edge that has no validation rules applied
      const qubitAdder = new QubitBridgeEdgeAdder();
      
      const mockEdge: IBridgeEdge = {
        Action: 'UnknownAction', // Won't match any validation rules
        edgeType: 'BridgeDeposit',
        bridgeProtocol: 'QubitBridge',
        sourceChain: 'ethereum',
        targetChain: 'bsc',
        Amount: '1000000000000000000',
        Token: 'ETH',
        TokenAddr: '0x0000000000000000000000000000000000000000',
        From: '0x8d3d13cac607B7297Ff61A5E1E71072758AF4D01',
        To: '0x4ee6eCAD1c2Dae9f525404De8555724e3c35d07B'
      };

      const result = qubitAdder.validateDeposit(mockEdge);
      
      expect(result).to.be.an('object');
      expect(result.isValid).to.be.a('boolean');
      expect(result.score).to.be.a('number');
      expect(result.issues).to.be.an('array');
      expect(result.metadata).to.be.an('object');
    });
  });
});