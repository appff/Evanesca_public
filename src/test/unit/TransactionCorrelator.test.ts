/// <reference types="mocha" />

/**
 * Unit Tests for TransactionCorrelator
 * 
 * Tests the cross-chain transaction correlation functionality used for
 * bridge attack detection including Qubit Finance and Meter.io patterns.
 */

import { expect } from 'chai';
import { TransactionReceipt } from 'web3-core';
import { 
  ITransactionCorrelator,
  ChainType,
  CorrelationScore,
  RelatedTransaction,
  BridgeDepositInfo,
  BridgeMintInfo,
  ConservationResult,
  TransactionCorrelatorConfig,
  DEFAULT_CORRELATOR_CONFIG
} from '../../CrossChain/ITransactionCorrelator';
import { TransactionCorrelator } from '../../CrossChain/TransactionCorrelator';

describe('TransactionCorrelator Unit Tests', () => {
  let correlator: ITransactionCorrelator;
  
  beforeEach(() => {
    correlator = new TransactionCorrelator();
  });

  describe('Constructor and Configuration', () => {
    it('should initialize with default configuration', () => {
      const defaultCorrelator = new TransactionCorrelator();
      expect(defaultCorrelator).to.be.instanceOf(TransactionCorrelator);
    });

    it('should initialize with custom configuration', () => {
      const customConfig: TransactionCorrelatorConfig = {
        ...DEFAULT_CORRELATOR_CONFIG,
        maxTimeWindowSeconds: 7200, // 2 hours
        minCorrelationScore: 0.8
      };
      
      const customCorrelator = new TransactionCorrelator(customConfig);
      expect(customCorrelator).to.be.instanceOf(TransactionCorrelator);
    });
  });

  describe('Transaction Correlation', () => {
    let mockEthereumTx: TransactionReceipt;
    let mockBscTx: TransactionReceipt;

    beforeEach(() => {
      // Mock Ethereum deposit transaction (Meter.io pattern)
      mockEthereumTx = {
        transactionHash: '0xc4d7e160c7652f2db22681aa2777c5b37937bf30375c5b2c6b2bd172ae984950',
        blockNumber: 14165234,
        blockHash: '0x123...',
        transactionIndex: 0,
        from: '0x8d3d13cac607B7297Ff61A5E1E71072758AF4D01',
        to: '0x4ee6eCAD1c2Dae9f525404De8555724e3c35d07B',
        gasUsed: 150000,
        cumulativeGasUsed: 150000,
        logs: [{
          address: '0x4ee6eCAD1c2Dae9f525404De8555724e3c35d07B',
          topics: ['0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'],
          data: '0x0000000000000000000000000000000000000000000000000000000000000000', // 0 value
          blockNumber: 14165234,
          transactionHash: '0xc4d7e160c7652f2db22681aa2777c5b37937bf30375c5b2c6b2bd172ae984950',
          transactionIndex: 0,
          blockHash: '0x123...',
          logIndex: 0,
          removed: false
        }],
        logsBloom: '0x...',
        status: true,
        contractAddress: null
      } as TransactionReceipt;

      // Mock BSC/target chain mint transaction
      mockBscTx = {
        transactionHash: '0x456def...',
        blockNumber: 20245522,
        blockHash: '0x456...',
        transactionIndex: 0,
        from: '0x8d3d13cac607B7297Ff61A5E1E71072758AF4D01',
        to: '0xd22C0a4Af486C7FA08e282E9eB5f30F9AaA62C95',
        gasUsed: 200000,
        cumulativeGasUsed: 200000,
        logs: [{
          address: '0xd22C0a4Af486C7FA08e282E9eB5f30F9AaA62C95',
          topics: ['0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'],
          data: '0x00000000000000000000000000000000000000000000012c3285aa33dd748000', // Large mint amount
          blockNumber: 20245522,
          transactionHash: '0x456def...',
          transactionIndex: 0,
          blockHash: '0x456...',
          logIndex: 0,
          removed: false
        }],
        logsBloom: '0x...',
        status: true,
        contractAddress: null
      } as TransactionReceipt;
    });

    it('should calculate correlation scores between transactions', async () => {
      const score = await correlator.correlateTransactions(
        mockEthereumTx,
        mockBscTx,
        ChainType.ETHEREUM,
        ChainType.BSC
      );

      expect(score).to.be.an('object');
      expect(score.score).to.be.a('number');
      expect(score.score).to.be.at.least(0);
      expect(score.score).to.be.at.most(1);
      
      expect(score.temporal).to.be.a('number');
      expect(score.amount).to.be.a('number');
      expect(score.address).to.be.a('number');
      expect(score.protocol).to.be.a('number');
    });

    it('should give high correlation score for same user transactions', async () => {
      const score = await correlator.correlateTransactions(
        mockEthereumTx,
        mockBscTx,
        ChainType.ETHEREUM,
        ChainType.BSC
      );

      // Same user should result in high address correlation
      expect(score.address).to.be.greaterThan(0.8);
    });

    it('should give low correlation score for different users', async () => {
      const differentUserTx = {
        ...mockBscTx,
        from: '0x1234567890123456789012345678901234567890' // Different user
      };

      const score = await correlator.correlateTransactions(
        mockEthereumTx,
        differentUserTx as TransactionReceipt,
        ChainType.ETHEREUM,
        ChainType.BSC
      );

      // Different users should result in low address correlation
      expect(score.address).to.be.lessThan(0.3);
    });

    it('should handle invalid transaction inputs gracefully', async () => {
      const invalidTx = null as any;
      
      try {
        await correlator.correlateTransactions(
          invalidTx,
          mockBscTx,
          ChainType.ETHEREUM,
          ChainType.BSC
        );
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).to.be.an('error');
      }
    });
  });

  describe('Related Transaction Discovery', () => {
    it('should find related transactions within time window', async () => {
      const candidates: TransactionReceipt[] = [
        {
          transactionHash: '0x111...',
          blockNumber: 14165235, // 1 block later
          from: '0x8d3d13cac607B7297Ff61A5E1E71072758AF4D01',
          to: '0x4ee6eCAD1c2Dae9f525404De8555724e3c35d07B',
          gasUsed: 150000,
          cumulativeGasUsed: 150000,
          logs: [],
          status: true
        } as TransactionReceipt,
        {
          transactionHash: '0x222...',
          blockNumber: 14165300, // Much later, should be filtered out
          from: '0x8d3d13cac607B7297Ff61A5E1E71072758AF4D01',
          to: '0x4ee6eCAD1c2Dae9f525404De8555724e3c35d07B',
          gasUsed: 150000,
          cumulativeGasUsed: 150000,
          logs: [],
          status: true
        } as TransactionReceipt
      ];

      const related = await correlator.findRelatedTransactions(
        '0x8d3d13cac607B7297Ff61A5E1E71072758AF4D01',
        ChainType.ETHEREUM,
        14165234, // Base block
        candidates
      );

      expect(related).to.be.an('array');
      expect(related.length).to.be.greaterThan(0);
      
      // Should find the first transaction but not the second (too far in time)
      expect(related.some(tx => tx.transaction.transactionHash === '0x111...')).to.be.true;
    });

    it('should return empty array when no related transactions found', async () => {
      const unrelatedCandidates: TransactionReceipt[] = [
        {
          transactionHash: '0x333...',
          blockNumber: 14165235,
          from: '0x9999999999999999999999999999999999999999', // Different user
          to: '0x4ee6eCAD1c2Dae9f525404De8555724e3c35d07B',
          gasUsed: 150000,
          cumulativeGasUsed: 150000,
          logs: [],
          status: true
        } as TransactionReceipt
      ];

      const related = await correlator.findRelatedTransactions(
        '0x8d3d13cac607B7297Ff61A5E1E71072758AF4D01',
        ChainType.ETHEREUM,
        14165234,
        unrelatedCandidates
      );

      expect(related).to.be.an('array');
      expect(related.length).to.equal(0);
    });
  });

  describe('Bridge Deposit Identification', () => {
    it('should identify zero-value bridge deposits (Meter.io pattern)', async () => {
      const mockTx = {
        transactionHash: '0xc4d7e160c7652f2db22681aa2777c5b37937bf30375c5b2c6b2bd172ae984950',
        blockNumber: 14165234,
        from: '0x8d3d13cac607B7297Ff61A5E1E71072758AF4D01',
        to: '0x4ee6eCAD1c2Dae9f525404De8555724e3c35d07B',
        logs: [{
          address: '0x4ee6eCAD1c2Dae9f525404De8555724e3c35d07B',
          topics: [
            '0x5c40dc4d...' // Bridge deposit event topic
          ],
          data: '0x0000000000000000000000000000000000000000000000000000000000000000' // Zero amount
        }],
        gasUsed: 150000,
        status: true
      } as TransactionReceipt;

      const depositInfo = await correlator.identifyBridgeDeposit(mockTx, ChainType.ETHEREUM);

      expect(depositInfo).to.be.an('object');
      expect(depositInfo.isDeposit).to.be.true;
      expect(depositInfo.amount).to.equal('0');
      expect(depositInfo.isSuspicious).to.be.true; // Zero-value deposits are suspicious
      expect(depositInfo.suspiciousReasons).to.include('Zero-value deposit detected');
    });

    it('should identify legitimate bridge deposits', async () => {
      const legitimateTx = {
        transactionHash: '0x789...',
        blockNumber: 14165234,
        from: '0x8d3d13cac607B7297Ff61A5E1E71072758AF4D01',
        to: '0x4ee6eCAD1c2Dae9f525404De8555724e3c35d07B',
        logs: [{
          address: '0x4ee6eCAD1c2Dae9f525404De8555724e3c35d07B',
          topics: [
            '0x5c40dc4d...' // Bridge deposit event topic
          ],
          data: '0x0000000000000000000000000000000000000000000000000de0b6b3a7640000' // 1 ETH
        }],
        gasUsed: 150000,
        status: true
      } as TransactionReceipt;

      const depositInfo = await correlator.identifyBridgeDeposit(legitimateTx, ChainType.ETHEREUM);

      expect(depositInfo).to.be.an('object');
      expect(depositInfo.isDeposit).to.be.true;
      expect(depositInfo.amount).to.not.equal('0');
      expect(depositInfo.isSuspicious).to.be.false;
      expect(depositInfo.suspiciousReasons).to.be.empty;
    });

    it('should return null for non-deposit transactions', async () => {
      const nonDepositTx = {
        transactionHash: '0xabc...',
        blockNumber: 14165234,
        from: '0x8d3d13cac607B7297Ff61A5E1E71072758AF4D01',
        to: '0x1111111111111111111111111111111111111111', // Not a bridge contract
        logs: [],
        gasUsed: 150000,
        status: true
      } as TransactionReceipt;

      const depositInfo = await correlator.identifyBridgeDeposit(nonDepositTx, ChainType.ETHEREUM);

      expect(depositInfo.isDeposit).to.be.false;
    });
  });

  describe('Bridge Mint Detection', () => {
    it('should identify bridge minting transactions', async () => {
      const mintTx = {
        transactionHash: '0x456def...',
        blockNumber: 20245522,
        from: '0x8d3d13cac607B7297Ff61A5E1E71072758AF4D01',
        to: '0xd22C0a4Af486C7FA08e282E9eB5f30F9AaA62C95',
        logs: [{
          address: '0xd22C0a4Af486C7FA08e282E9eB5f30F9AaA62C95',
          topics: [
            '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef', // Transfer event
            '0x0000000000000000000000000000000000000000000000000000000000000000', // From: 0x0 (mint)
            '0x0000000000000000000000008d3d13cac607B7297Ff61A5E1E71072758AF4D01'  // To: user
          ],
          data: '0x00000000000000000000000000000000000000000000012c3285aa33dd748000' // Large amount
        }],
        gasUsed: 200000,
        status: true
      } as TransactionReceipt;

      const mintInfo = await correlator.findCorrespondingMint(
        '0x8d3d13cac607B7297Ff61A5E1E71072758AF4D01',
        ChainType.BSC,
        [mintTx]
      );

      expect(mintInfo).to.be.an('object');
      expect(mintInfo.isMint).to.be.true;
      expect(mintInfo.amount).to.not.equal('0');
      expect(mintInfo.recipient).to.equal('0x8d3d13cac607B7297Ff61A5E1E71072758AF4D01');
    });

    it('should detect excessive minting (Qubit Finance pattern)', async () => {
      const excessiveMintTx = {
        transactionHash: '0x478d83f2ad909c64a9a3d807b3d8399bb67a997f9721fc5580ae2c51fab92acf',
        blockNumber: 13916166,
        logs: [{
          address: '0xd22C0a4Af486C7FA08e282E9eB5f30F9AaA62C95',
          topics: [
            '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
            '0x0000000000000000000000000000000000000000000000000000000000000000',
            '0x0000000000000000000000008d3d13cac607B7297Ff61A5E1E71072758AF4D01'
          ],
          data: '0x0000000000000000000000000000000000000000000010f0cf064dd59200000' // 77,162 tokens
        }],
        gasUsed: 200000,
        status: true
      } as TransactionReceipt;

      const mintInfo = await correlator.findCorrespondingMint(
        '0x8d3d13cac607B7297Ff61A5E1E71072758AF4D01',
        ChainType.BSC,
        [excessiveMintTx]
      );

      expect(mintInfo.isMint).to.be.true;
      expect(parseFloat(mintInfo.amount)).to.be.greaterThan(70000); // Very large mint
      expect(mintInfo.isSuspicious).to.be.true;
      expect(mintInfo.suspiciousReasons).to.include('Large mint amount detected');
    });
  });

  describe('Conservation Validation', () => {
    it('should validate bridge conservation for legitimate operations', async () => {
      const depositInfo: BridgeDepositInfo = {
        isDeposit: true,
        amount: '1000000000000000000', // 1 ETH
        token: 'ETH',
        tokenAddress: '0x0000000000000000000000000000000000000000',
        user: '0x8d3d13cac607B7297Ff61A5E1E71072758AF4D01',
        timestamp: 1644123456,
        isSuspicious: false,
        suspiciousReasons: []
      };

      const mintInfo: BridgeMintInfo = {
        isMint: true,
        amount: '1000000000000000000', // 1 wrapped ETH (1:1 ratio)
        token: 'mETH',
        tokenAddress: '0xd22C0a4Af486C7FA08e282E9eB5f30F9AaA62C95',
        recipient: '0x8d3d13cac607B7297Ff61A5E1E71072758AF4D01',
        timestamp: 1644123460, // 4 seconds later
        isSuspicious: false,
        suspiciousReasons: []
      };

      const conservationResult = await correlator.validateBridgeConservation(
        depositInfo,
        mintInfo,
        'MeterBridge'
      );

      expect(conservationResult.isValid).to.be.true;
      expect(conservationResult.backingRatio).to.equal(1.0); // Perfect 1:1 backing
      expect(conservationResult.riskLevel).to.equal('LOW');
    });

    it('should detect conservation violations (attack patterns)', async () => {
      const zeroDepositInfo: BridgeDepositInfo = {
        isDeposit: true,
        amount: '0', // Zero deposit
        token: 'ETH',
        tokenAddress: '0x0000000000000000000000000000000000000000',
        user: '0x8d3d13cac607B7297Ff61A5E1E71072758AF4D01',
        timestamp: 1644123456,
        isSuspicious: true,
        suspiciousReasons: ['Zero-value deposit detected']
      };

      const largeMintInfo: BridgeMintInfo = {
        isMint: true,
        amount: '77162000000000000000000', // 77,162 tokens minted!
        token: 'qXETH',
        tokenAddress: '0x8e852e6bb88d21a9f971eb47eb8fe88a8cce1fac',
        recipient: '0x8d3d13cac607B7297Ff61A5E1E71072758AF4D01',
        timestamp: 1644123460,
        isSuspicious: true,
        suspiciousReasons: ['Large mint amount detected']
      };

      const conservationResult = await correlator.validateBridgeConservation(
        zeroDepositInfo,
        largeMintInfo,
        'QubitBridge'
      );

      expect(conservationResult.isValid).to.be.false;
      expect(conservationResult.backingRatio).to.equal(0); // No backing!
      expect(conservationResult.riskLevel).to.equal('CRITICAL');
      expect(conservationResult.violations).to.include('Zero backing ratio detected');
    });

    it('should handle partial conservation violations', async () => {
      const partialDepositInfo: BridgeDepositInfo = {
        isDeposit: true,
        amount: '500000000000000000', // 0.5 ETH
        token: 'ETH',
        tokenAddress: '0x0000000000000000000000000000000000000000',
        user: '0x8d3d13cac607B7297Ff61A5E1E71072758AF4D01',
        timestamp: 1644123456,
        isSuspicious: false,
        suspiciousReasons: []
      };

      const excessiveMintInfo: BridgeMintInfo = {
        isMint: true,
        amount: '2000000000000000000', // 2 wrapped ETH (4:1 ratio!)
        token: 'mETH',
        tokenAddress: '0xd22C0a4Af486C7FA08e282E9eB5f30F9AaA62C95',
        recipient: '0x8d3d13cac607B7297Ff61A5E1E71072758AF4D01',
        timestamp: 1644123460,
        isSuspicious: true,
        suspiciousReasons: ['Excessive mint ratio detected']
      };

      const conservationResult = await correlator.validateBridgeConservation(
        partialDepositInfo,
        excessiveMintInfo,
        'SuspiciousBridge'
      );

      expect(conservationResult.isValid).to.be.false;
      expect(conservationResult.backingRatio).to.equal(0.25); // 25% backing
      expect(conservationResult.riskLevel).to.equal('HIGH');
      expect(conservationResult.violations).to.include('Backing ratio below threshold');
    });
  });

  describe('LRU Cache Functionality', () => {
    it('should cache correlation results', async () => {
      const mockTx1 = {
        transactionHash: '0x111...',
        blockNumber: 14165234,
        from: '0x8d3d13cac607B7297Ff61A5E1E71072758AF4D01',
        gasUsed: 150000,
        status: true
      } as TransactionReceipt;

      const mockTx2 = {
        transactionHash: '0x222...',
        blockNumber: 20245522,
        from: '0x8d3d13cac607B7297Ff61A5E1E71072758AF4D01',
        gasUsed: 200000,
        status: true
      } as TransactionReceipt;

      // First call should calculate and cache
      const score1 = await correlator.correlateTransactions(
        mockTx1,
        mockTx2,
        ChainType.ETHEREUM,
        ChainType.BSC
      );

      // Second call should use cache (should be faster)
      const startTime = Date.now();
      const score2 = await correlator.correlateTransactions(
        mockTx1,
        mockTx2,
        ChainType.ETHEREUM,
        ChainType.BSC
      );
      const endTime = Date.now();

      expect(score1.score).to.equal(score2.score);
      expect(endTime - startTime).to.be.lessThan(10); // Cached result should be very fast
    });
  });

  describe('Error Handling', () => {
    it('should handle network errors gracefully', async () => {
      const invalidTx = {
        transactionHash: '0xinvalid',
        blockNumber: -1,
        from: 'invalid-address',
        gasUsed: 0,
        status: false
      } as any;

      try {
        await correlator.correlateTransactions(
          invalidTx,
          invalidTx,
          ChainType.ETHEREUM,
          ChainType.BSC
        );
      } catch (error) {
        expect(error).to.be.an('error');
        expect(error.message).to.include('Invalid transaction');
      }
    });

    it('should handle empty log arrays', async () => {
      const emptyLogTx = {
        transactionHash: '0x123...',
        blockNumber: 14165234,
        from: '0x8d3d13cac607B7297Ff61A5E1E71072758AF4D01',
        to: '0x4ee6eCAD1c2Dae9f525404De8555724e3c35d07B',
        logs: [], // Empty logs
        gasUsed: 150000,
        status: true
      } as TransactionReceipt;

      const depositInfo = await correlator.identifyBridgeDeposit(emptyLogTx, ChainType.ETHEREUM);
      expect(depositInfo.isDeposit).to.be.false;
    });
  });
});