/**
 * Integration tests for Protocol Verification system
 * Tests StateTracker, InvariantChecker, and protocol-specific implementations
 */

import { expect } from 'chai';
import { StateTracker } from '../../ProtocolVerification/StateTracker';
import { InvariantChecker } from '../../ProtocolVerification/InvariantChecker';
import { UniswapV2Invariant } from '../../ProtocolVerification/protocols/UniswapV2Invariant';
import { BigNumber } from '../../DSL/MathematicalExtensions';

describe('Protocol Verification Integration', () => {
  let stateTracker: StateTracker;
  let invariantChecker: InvariantChecker;
  let uniswapV2: UniswapV2Invariant;
  
  beforeEach(() => {
    stateTracker = new StateTracker();
    invariantChecker = new InvariantChecker(stateTracker);
    uniswapV2 = new UniswapV2Invariant(stateTracker);
  });
  
  afterEach(() => {
    stateTracker.clearStates();
    invariantChecker.clearViolations();
  });
  
  describe('StateTracker', () => {
    
    it('should extract and store AMM state', async () => {
      const poolAddress = '0x1234567890abcdef';
      const state = await stateTracker.extractAMMState(
        poolAddress,
        'uniswapv2',
        {
          reserveA: '1000000000000000000000', // 1000 tokens
          reserveB: '2000000000000000000000'  // 2000 tokens
        },
        {
          tokenA: { address: '0xAAA', symbol: 'TOKENA', decimals: 18 },
          tokenB: { address: '0xBBB', symbol: 'TOKENB', decimals: 18 }
        },
        12345678
      );
      
      expect(state).to.exist;
      expect(state.poolAddress).to.equal(poolAddress);
      expect(state.protocol).to.equal('uniswapv2');
      expect(state.k.toFixed()).to.equal('2000000000000000000000000000000000000000000');
      expect(state.feeRate).to.equal(0.003);
      
      // Verify state is stored
      const storedState = stateTracker.getAMMState(poolAddress);
      expect(storedState).to.deep.equal(state);
    });
    
    it('should extract and store lending state', async () => {
      const marketAddress = '0xCompound123';
      const state = await stateTracker.extractLendingState(
        marketAddress,
        'compound',
        {
          totalSupply: '1000000000000000000000',
          totalBorrows: '800000000000000000000',
          totalReserves: '20000000000000000000',
          cash: '180000000000000000000',
          supplyRate: '0.02',
          borrowRate: '0.05',
          exchangeRate: '1.1'
        },
        { address: '0xDAI', symbol: 'DAI', decimals: 18 },
        12345678
      );
      
      expect(state).to.exist;
      expect(state.utilizationRate).to.be.closeTo(0.833, 0.01); // ~83.3% utilization
      expect(state.borrowRate).to.equal(0.05);
      
      // Verify state is stored
      const storedState = stateTracker.getLendingState(marketAddress);
      expect(storedState).to.deep.equal(state);
    });
    
    it('should track state transitions', () => {
      const stateBefore = {
        poolAddress: '0xPool',
        protocol: 'uniswapv2',
        blockNumber: 100,
        reserveA: new BigNumber(1000),
        reserveB: new BigNumber(2000),
        k: new BigNumber(2000000),
        tokenA: { address: '0xA', symbol: 'A', decimals: 18 },
        tokenB: { address: '0xB', symbol: 'B', decimals: 18 },
        totalSupply: new BigNumber(1000),
        feeRate: 0.003
      };
      
      const stateAfter = {
        ...stateBefore,
        blockNumber: 101,
        reserveA: new BigNumber(1010),
        reserveB: new BigNumber(1980),
        k: new BigNumber(1999800)
      };
      
      const transition = stateTracker.calculateStateTransition(
        'amm',
        '0xPool',
        stateBefore,
        stateAfter,
        '0xTxHash'
      );
      
      expect(transition).to.exist;
      expect(transition.type).to.equal('amm');
      expect(transition.changes.reserveA.delta.toString()).to.equal('10');
      expect(transition.changes.reserveB.delta.toString()).to.equal('-20');
      expect(transition.changes.k.percentageChange).to.be.closeTo(-0.01, 0.001);
    });
    
    it('should use cache for repeated queries', async () => {
      const poolAddress = '0xCached';
      
      // First extraction
      const state1 = await stateTracker.extractAMMState(
        poolAddress,
        'uniswapv2',
        { reserveA: '1000', reserveB: '2000' },
        {
          tokenA: { address: '0xA', symbol: 'A', decimals: 18 },
          tokenB: { address: '0xB', symbol: 'B', decimals: 18 }
        },
        100
      );
      
      // Second extraction (should use cache)
      const state2 = await stateTracker.extractAMMState(
        poolAddress,
        'uniswapv2',
        { reserveA: '1000', reserveB: '2000' },
        {
          tokenA: { address: '0xA', symbol: 'A', decimals: 18 },
          tokenB: { address: '0xB', symbol: 'B', decimals: 18 }
        },
        100
      );
      
      expect(state1).to.deep.equal(state2);
    });
  });
  
  describe('InvariantChecker', () => {
    
    it('should verify valid Uniswap V2 invariant', async () => {
      const stateBefore = await stateTracker.extractAMMState(
        '0xPool',
        'uniswapv2',
        { reserveA: '1000000', reserveB: '2000000' },
        {
          tokenA: { address: '0xA', symbol: 'A', decimals: 18 },
          tokenB: { address: '0xB', symbol: 'B', decimals: 18 }
        },
        100
      );
      
      // Simulate swap: 10 A for ~19.8 B (with 0.3% fee)
      const stateAfter = await stateTracker.extractAMMState(
        '0xPool',
        'uniswapv2',
        { reserveA: '1010000', reserveB: '1980198' },
        {
          tokenA: { address: '0xA', symbol: 'A', decimals: 18 },
          tokenB: { address: '0xB', symbol: 'B', decimals: 18 }
        },
        101
      );
      
      const result = await invariantChecker.verifyUniswapV2Invariant(
        '0xPool',
        stateBefore,
        stateAfter,
        '0xTxHash'
      );
      
      expect(result.valid).to.be.true;
      expect(result.invariantType).to.equal('constant_product');
      expect(result.deviation).to.be.lessThan(0.01); // Less than 1% deviation
    });
    
    it('should detect Uniswap V2 invariant violation', async () => {
      const stateBefore = await stateTracker.extractAMMState(
        '0xPool',
        'uniswapv2',
        { reserveA: '1000000', reserveB: '2000000' },
        {
          tokenA: { address: '0xA', symbol: 'A', decimals: 18 },
          tokenB: { address: '0xB', symbol: 'B', decimals: 18 }
        },
        100
      );
      
      // Invalid swap: reserves don't maintain k
      const stateAfter = await stateTracker.extractAMMState(
        '0xPool',
        'uniswapv2',
        { reserveA: '1010000', reserveB: '1900000' }, // Too much B removed
        {
          tokenA: { address: '0xA', symbol: 'A', decimals: 18 },
          tokenB: { address: '0xB', symbol: 'B', decimals: 18 }
        },
        101
      );
      
      const result = await invariantChecker.verifyUniswapV2Invariant(
        '0xPool',
        stateBefore,
        stateAfter,
        '0xTxHash'
      );
      
      expect(result.valid).to.be.false;
      expect(result.message).to.include('violated');
      expect(result.severity).to.exist;
      
      // Check violation was recorded
      const violations = invariantChecker.getViolations();
      expect(violations.length).to.equal(1);
      expect(violations[0].invariantType).to.equal('constant_product');
    });
    
    it('should verify Compound interest rate model', async () => {
      const state = await stateTracker.extractLendingState(
        '0xMarket',
        'compound',
        {
          totalSupply: '1000000',
          totalBorrows: '500000',
          totalReserves: '10000',
          cash: '490000',
          supplyRate: '0.02',
          borrowRate: '0.127', // Expected rate for ~51% utilization
          exchangeRate: '1.0'
        },
        { address: '0xDAI', symbol: 'DAI', decimals: 18 },
        100
      );
      
      const result = await invariantChecker.verifyCompoundInterestModel(
        '0xMarket',
        state,
        '0xTxHash'
      );
      
      expect(result.valid).to.be.true;
      expect(result.invariantType).to.equal('interest_rate_model');
    });
    
    it('should verify MakerDAO collateralization ratio', async () => {
      const collateralValue = new BigNumber(15000); // $15,000
      const debtValue = new BigNumber(10000); // $10,000
      const minRatio = 1.5; // 150%
      
      const result = await invariantChecker.verifyMakerDAOCollateralization(
        '0xVault',
        collateralValue,
        debtValue,
        minRatio,
        100,
        '0xTxHash'
      );
      
      expect(result.valid).to.be.true;
      expect(result.invariantType).to.equal('collateralization_ratio');
      expect(result.message).to.include('sufficient');
    });
    
    it('should detect under-collateralization', async () => {
      const collateralValue = new BigNumber(12000); // $12,000
      const debtValue = new BigNumber(10000); // $10,000
      const minRatio = 1.5; // 150%
      
      const result = await invariantChecker.verifyMakerDAOCollateralization(
        '0xVault',
        collateralValue,
        debtValue,
        minRatio,
        100,
        '0xTxHash'
      );
      
      expect(result.valid).to.be.false;
      expect(result.severity).to.equal('critical');
      expect(result.message).to.include('Under-collateralized');
    });
    
    it('should generate violation report', async () => {
      // Create some violations
      await invariantChecker.verifyMakerDAOCollateralization(
        '0xVault1',
        new BigNumber(12000),
        new BigNumber(10000),
        1.5,
        100,
        '0xTx1'
      );
      
      await invariantChecker.verifyMakerDAOCollateralization(
        '0xVault2',
        new BigNumber(11000),
        new BigNumber(10000),
        1.5,
        101,
        '0xTx2'
      );
      
      const report = invariantChecker.generateReport();
      
      expect(report.summary.totalViolations).to.equal(2);
      expect(report.summary.violationsByProtocol['MakerDAO']).to.equal(2);
      expect(report.statistics.criticalViolations).to.equal(2);
    });
  });
  
  describe('UniswapV2Invariant', () => {
    
    it('should verify swap maintains invariant', async () => {
      const edge = {
        Type: 'DEX',
        Service: 'uniswapv2',
        Action: 'Swap',
        Token0: '0xETH',
        Token1: '0xUSDC',
        AmountIn: '10000000000000000000', // 10 ETH
        AmountOut: '20000000000', // 20000 USDC
        From: '0xUser',
        To: '0xPool',
        BlockNumber: 100,
        TransactionHash: '0xTxHash'
      };
      
      const result = await uniswapV2.verifySwap(
        edge as any,
        '0xPool',
        100,
        '0xTxHash'
      );
      
      expect(result).to.exist;
      expect(result.protocol).to.equal('UniswapV2');
      expect(result.invariantType).to.equal('constant_product');
      expect(result.details).to.have.property('swap');
    });
    
    it('should verify liquidity operations', async () => {
      // First, set up pool state
      await stateTracker.extractAMMState(
        '0xPool',
        'uniswapv2',
        { reserveA: '1000000', reserveB: '2000000' },
        {
          tokenA: { address: '0xA', symbol: 'A', decimals: 18 },
          tokenB: { address: '0xB', symbol: 'B', decimals: 18 }
        },
        100,
        '1000' // Total LP supply
      );
      
      // Test adding liquidity (proportional)
      const addResult = await uniswapV2.verifyLiquidity(
        'add',
        '0xPool',
        { tokenA: '100000', tokenB: '200000' }, // Proportional to reserves
        '100', // LP tokens
        101,
        '0xTx1'
      );
      
      expect(addResult.valid).to.be.true;
      expect(addResult.message).to.include('maintains balance');
      
      // Test removing liquidity
      const removeResult = await uniswapV2.verifyLiquidity(
        'remove',
        '0xPool',
        { tokenA: '100000', tokenB: '200000' },
        '100', // LP tokens burned
        102,
        '0xTx2'
      );
      
      expect(removeResult.valid).to.be.true;
    });
  });
  
  describe('End-to-End Protocol Verification', () => {
    
    it('should verify complete transaction flow', async () => {
      // 1. Extract initial state
      const initialState = await stateTracker.extractAMMState(
        '0xUniswapPool',
        'uniswapv2',
        { reserveA: '5000000', reserveB: '10000000' },
        {
          tokenA: { address: '0xWETH', symbol: 'WETH', decimals: 18 },
          tokenB: { address: '0xUSDC', symbol: 'USDC', decimals: 6 }
        },
        1000
      );
      
      // 2. Simulate swap
      const swapState = await stateTracker.extractAMMState(
        '0xUniswapPool',
        'uniswapv2',
        { reserveA: '5050000', reserveB: '9900990' },
        {
          tokenA: { address: '0xWETH', symbol: 'WETH', decimals: 18 },
          tokenB: { address: '0xUSDC', symbol: 'USDC', decimals: 6 }
        },
        1001
      );
      
      // 3. Verify invariant
      const swapResult = await invariantChecker.verifyUniswapV2Invariant(
        '0xUniswapPool',
        initialState,
        swapState,
        '0xSwapTx'
      );
      
      // 4. Record transition
      const transition = stateTracker.calculateStateTransition(
        'amm',
        '0xUniswapPool',
        initialState,
        swapState,
        '0xSwapTx'
      );
      
      // 5. Verify complete flow
      expect(swapResult.valid).to.be.true;
      expect(transition.changes.k.percentageChange).to.be.lessThan(1); // k should change minimally
      
      // 6. Export state for analysis
      const exportedState = stateTracker.exportState();
      expect(exportedState.amm.size).to.equal(1);
      expect(exportedState.transitions.length).to.equal(1);
    });
  });
});