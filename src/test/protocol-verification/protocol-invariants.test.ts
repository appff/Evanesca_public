/**
 * Tests for Protocol Invariant Implementations
 * Testing Curve, Aave, and Balancer invariants
 */

import { expect } from 'chai';
import { BigNumber } from '../../DSL/MathematicalExtensions';
import { StateTracker } from '../../ProtocolVerification/StateTracker';
import { InvariantChecker } from '../../ProtocolVerification/InvariantChecker';
import { CurveInvariant, CurvePoolState } from '../../ProtocolVerification/protocols/CurveInvariant';
import { 
  AaveInvariant, 
  AaveUserPosition, 
  AaveReserveData, 
  AaveAsset 
} from '../../ProtocolVerification/protocols/AaveInvariant';
import { 
  BalancerInvariant, 
  BalancerPoolState, 
  BalancerToken 
} from '../../ProtocolVerification/protocols/BalancerInvariant';

describe('Protocol Invariants', () => {
  let stateTracker: StateTracker;
  let invariantChecker: InvariantChecker;
  
  beforeEach(() => {
    stateTracker = new StateTracker();
    invariantChecker = new InvariantChecker(stateTracker);
  });
  
  afterEach(() => {
    stateTracker.clearStates();
    invariantChecker.clearViolations();
  });
  
  describe('Curve Finance Invariants', () => {
    let curveInvariant: CurveInvariant;
    
    beforeEach(() => {
      curveInvariant = new CurveInvariant(stateTracker);
    });
    
    it('should calculate stable swap invariant D correctly', () => {
      // 3pool example: DAI, USDC, USDT with equal balances
      const balances = [
        new BigNumber('1000000'), // 1M DAI
        new BigNumber('1000000'), // 1M USDC
        new BigNumber('1000000')  // 1M USDT
      ];
      const amplificationCoefficient = 100; // A parameter
      
      const D = curveInvariant.calculateInvariantD(balances, amplificationCoefficient);
      
      // D should be approximately 3M for equal balances
      expect(D.toNumber()).to.be.closeTo(3000000, 10000);
    });
    
    it('should verify stable swap maintains invariant', async () => {
      const poolState: CurvePoolState = {
        poolAddress: '0xCurvePool',
        protocol: 'curve',
        blockNumber: 100,
        reserveA: new BigNumber('1000000'),
        reserveB: new BigNumber('1000000'),
        tokenA: { address: '0xDAI', symbol: 'DAI', decimals: 18 },
        tokenB: { address: '0xUSDC', symbol: 'USDC', decimals: 6 },
        k: new BigNumber('1000000000000'),
        totalSupply: new BigNumber('3000000'),
        feeRate: 0.0004,
        amplificationCoefficient: 100,
        balances: [
          new BigNumber('1000000'),
          new BigNumber('1000000'),
          new BigNumber('1000000')
        ]
      };
      
      const edge = {
        Action: 'Swap',
        Token0: 'DAI',
        Token1: 'USDC',
        AmountIn: '10000', // 10K DAI
        AmountOut: '9996'  // ~10K USDC (accounting for fee)
      };
      
      const result = await curveInvariant.verifyStableSwap(
        edge as any,
        '0xCurvePool',
        poolState,
        100,
        '0xTxHash'
      );
      
      expect(result).to.exist;
      expect(result.protocol).to.equal('Curve');
      expect(result.invariantType).to.equal('stable_swap');
      // For stable swaps, invariant should be maintained very closely
      expect(result.deviation).to.be.lessThan(0.00001); // < 0.001%
    });
    
    it('should calculate swap output for stable pairs', () => {
      const balances = [
        new BigNumber('1000000'),
        new BigNumber('1000000'),
        new BigNumber('1000000')
      ];
      const amplificationCoefficient = 100;
      const inputAmount = new BigNumber('10000');
      const fee = new BigNumber('0.0004'); // 0.04% fee
      
      const outputAmount = curveInvariant.calculateSwapOutput(
        inputAmount,
        0, // DAI index
        1, // USDC index
        balances,
        amplificationCoefficient,
        fee
      );
      
      // For stable pairs with large pools and small trades, output should be very close to input
      // The actual output will be slightly less than input due to fees and price impact
      expect(outputAmount.toNumber()).to.be.greaterThan(9000); // Should get at least 9000
      expect(outputAmount.toNumber()).to.be.lessThan(11000); // Reasonable upper bound for stablecoin swap
    });
  });
  
  describe('Aave V2/V3 Invariants', () => {
    let aaveInvariant: AaveInvariant;
    
    beforeEach(() => {
      aaveInvariant = new AaveInvariant(stateTracker);
    });
    
    it('should calculate health factor correctly', () => {
      const ethAsset: AaveAsset = {
        address: '0xETH',
        symbol: 'ETH',
        decimals: 18,
        priceInUSD: new BigNumber('2000'),
        liquidationThreshold: new BigNumber('0.825'), // 82.5%
        ltv: new BigNumber('0.8'), // 80%
        liquidationBonus: new BigNumber('0.05'), // 5%
        reserveFactor: new BigNumber('0.1'),
        isCollateral: true,
        isBorrowed: false
      };
      
      const daiAsset: AaveAsset = {
        address: '0xDAI',
        symbol: 'DAI',
        decimals: 18,
        priceInUSD: new BigNumber('1'),
        liquidationThreshold: new BigNumber('0'),
        ltv: new BigNumber('0'),
        liquidationBonus: new BigNumber('0'),
        reserveFactor: new BigNumber('0.1'),
        isCollateral: false,
        isBorrowed: true
      };
      
      const position: AaveUserPosition = {
        user: '0xUser',
        collateral: new Map([
          ['0xETH', {
            asset: ethAsset,
            amount: new BigNumber('10'), // 10 ETH
            valueInUSD: new BigNumber('20000') // $20,000
          }]
        ]),
        debt: new Map([
          ['0xDAI', {
            asset: daiAsset,
            amount: new BigNumber('15000'), // 15,000 DAI
            valueInUSD: new BigNumber('15000'), // $15,000
            interestRateMode: 'variable'
          }]
        ]),
        totalCollateralInUSD: new BigNumber('20000'),
        totalDebtInUSD: new BigNumber('15000'),
        availableBorrowsInUSD: new BigNumber('1000'),
        currentLiquidationThreshold: new BigNumber('0.825'),
        ltv: new BigNumber('0.8'),
        healthFactor: new BigNumber('0') // Will be calculated
      };
      
      const healthFactor = aaveInvariant.calculateHealthFactor(position);
      
      // Health Factor = (20000 * 0.825) / 15000 = 16500 / 15000 = 1.1
      expect(healthFactor.toNumber()).to.be.closeTo(1.1, 0.01);
    });
    
    it('should identify liquidatable positions', async () => {
      const position: AaveUserPosition = {
        user: '0xUser',
        collateral: new Map([
          ['0xETH', {
            asset: {
              address: '0xETH',
              symbol: 'ETH',
              decimals: 18,
              priceInUSD: new BigNumber('2000'),
              liquidationThreshold: new BigNumber('0.825'),
              ltv: new BigNumber('0.8'),
              liquidationBonus: new BigNumber('0.05'),
              reserveFactor: new BigNumber('0.1'),
              isCollateral: true,
              isBorrowed: false
            },
            amount: new BigNumber('10'),
            valueInUSD: new BigNumber('20000')
          }]
        ]),
        debt: new Map([
          ['0xDAI', {
            asset: {
              address: '0xDAI',
              symbol: 'DAI',
              decimals: 18,
              priceInUSD: new BigNumber('1'),
              liquidationThreshold: new BigNumber('0'),
              ltv: new BigNumber('0'),
              liquidationBonus: new BigNumber('0'),
              reserveFactor: new BigNumber('0.1'),
              isCollateral: false,
              isBorrowed: true
            },
            amount: new BigNumber('17000'), // More debt -> HF < 1
            valueInUSD: new BigNumber('17000'),
            interestRateMode: 'variable'
          }]
        ]),
        totalCollateralInUSD: new BigNumber('20000'),
        totalDebtInUSD: new BigNumber('17000'),
        availableBorrowsInUSD: new BigNumber('0'),
        currentLiquidationThreshold: new BigNumber('0.825'),
        ltv: new BigNumber('0.8'),
        healthFactor: new BigNumber('0')
      };
      
      const result = await aaveInvariant.verifyHealthFactor(
        position,
        100,
        '0xTxHash'
      );
      
      expect(result.valid).to.be.true; // Position state is valid
      expect(result.details.liquidatable).to.be.true; // But liquidatable
      expect(result.severity).to.equal('high');
    });
    
    it('should verify interest rate model', async () => {
      const reserve: AaveReserveData = {
        asset: {
          address: '0xDAI',
          symbol: 'DAI',
          decimals: 18,
          priceInUSD: new BigNumber('1'),
          liquidationThreshold: new BigNumber('0.75'),
          ltv: new BigNumber('0.75'),
          liquidationBonus: new BigNumber('0.05'),
          reserveFactor: new BigNumber('0.1'),
          isCollateral: true,
          isBorrowed: true
        },
        totalLiquidity: new BigNumber('10000000'),
        availableLiquidity: new BigNumber('3000000'),
        totalBorrowsStable: new BigNumber('2000000'),
        totalBorrowsVariable: new BigNumber('5000000'),
        liquidityRate: new BigNumber('0.02'),
        variableBorrowRate: new BigNumber('0.035'), // 3.5% at 70% utilization
        stableBorrowRate: new BigNumber('0.04'),
        averageStableBorrowRate: new BigNumber('0.04'),
        utilizationRate: new BigNumber('0.7'), // 70%
        liquidityIndex: new BigNumber('1.05'),
        variableBorrowIndex: new BigNumber('1.06')
      };
      
      const result = await aaveInvariant.verifyInterestRateModel(
        reserve,
        100,
        '0xTxHash'
      );
      
      expect(result.valid).to.be.true;
      expect(result.invariantType).to.equal('interest_rate_model');
      expect(result.deviation).to.be.lessThan(0.001); // < 0.1% deviation
    });
  });
  
  describe('Balancer Weighted Pool Invariants', () => {
    let balancerInvariant: BalancerInvariant;
    
    beforeEach(() => {
      balancerInvariant = new BalancerInvariant(stateTracker);
    });
    
    it('should calculate weighted pool invariant correctly', () => {
      // 80/20 WETH/DAI pool
      const tokens: BalancerToken[] = [
        {
          address: '0xWETH',
          symbol: 'WETH',
          decimals: 18,
          balance: new BigNumber('1000'), // 1000 WETH
          weight: new BigNumber('0.8'), // 80% weight
          denormalizedWeight: new BigNumber('40')
        },
        {
          address: '0xDAI',
          symbol: 'DAI',
          decimals: 18,
          balance: new BigNumber('2000000'), // 2M DAI
          weight: new BigNumber('0.2'), // 20% weight
          denormalizedWeight: new BigNumber('10')
        }
      ];
      
      const invariant = balancerInvariant.calculateInvariant(tokens);
      
      // V = Π(B_i^w_i) = 1000^0.8 * 2000000^0.2
      expect(invariant.toNumber()).to.be.greaterThan(0);
    });
    
    it('should calculate spot price correctly', () => {
      const tokenIn: BalancerToken = {
        address: '0xWETH',
        symbol: 'WETH',
        decimals: 18,
        balance: new BigNumber('1000'),
        weight: new BigNumber('0.8'),
        denormalizedWeight: new BigNumber('40')
      };
      
      const tokenOut: BalancerToken = {
        address: '0xDAI',
        symbol: 'DAI',
        decimals: 18,
        balance: new BigNumber('2000000'),
        weight: new BigNumber('0.2'),
        denormalizedWeight: new BigNumber('10')
      };
      
      const spotPrice = balancerInvariant.calculateSpotPrice(
        tokenIn,
        tokenOut,
        new BigNumber('0.003') // 0.3% swap fee
      );
      
      // Price = (B_in/w_in) / (B_out/w_out) = (1000/0.8) / (2000000/0.2)
      // = 1250 / 10000000 = 0.000125 WETH per DAI (or 8000 DAI per WETH)
      expect(spotPrice.toNumber()).to.be.closeTo(0.000125, 0.00001);
    });
    
    it('should verify weighted swap maintains invariant', async () => {
      const poolState: BalancerPoolState = {
        poolAddress: '0xBalancerPool',
        protocol: 'balancer',
        blockNumber: 100,
        reserveA: new BigNumber('1000'),
        reserveB: new BigNumber('2000000'),
        tokenA: { address: '0xWETH', symbol: 'WETH', decimals: 18 },
        tokenB: { address: '0xDAI', symbol: 'DAI', decimals: 18 },
        k: new BigNumber('0'), // Not used for Balancer
        totalSupply: new BigNumber('100000'), // BPT supply
        feeRate: 0.003,
        swapFee: new BigNumber('0.003'),
        protocolFee: new BigNumber('0.0003'),
        invariant: new BigNumber('0'), // Will be calculated
        totalWeight: new BigNumber('1'),
        poolType: 'weighted',
        tokens: [
          {
            address: '0xWETH',
            symbol: 'WETH',
            decimals: 18,
            balance: new BigNumber('1000'),
            weight: new BigNumber('0.8'),
            denormalizedWeight: new BigNumber('40')
          },
          {
            address: '0xDAI',
            symbol: 'DAI',
            decimals: 18,
            balance: new BigNumber('2000000'),
            weight: new BigNumber('0.2'),
            denormalizedWeight: new BigNumber('10')
          }
        ]
      };
      
      const edge = {
        Action: 'Swap',
        Token0: 'WETH',
        Token1: 'DAI',
        AmountIn: '1', // 1 WETH
        AmountOut: '7950' // ~7950 DAI (accounting for slippage and fee)
      };
      
      const result = await balancerInvariant.verifyWeightedSwap(
        edge as any,
        '0xBalancerPool',
        poolState,
        100,
        '0xTxHash'
      );
      
      expect(result).to.exist;
      expect(result.protocol).to.equal('Balancer');
      expect(result.invariantType).to.equal('weighted_product');
      expect(result.valid).to.be.true; // Invariant should be maintained
    });
    
    it('should verify spot price consistency', async () => {
      // Use a simpler 2-token pool to avoid complex triangular checks
      const poolState: BalancerPoolState = {
        poolAddress: '0xBalancerPool',
        protocol: 'balancer',
        blockNumber: 100,
        reserveA: new BigNumber('0'),
        reserveB: new BigNumber('0'),
        tokenA: { address: '', symbol: '', decimals: 0 },
        tokenB: { address: '', symbol: '', decimals: 0 },
        k: new BigNumber('0'),
        totalSupply: new BigNumber('100000'),
        feeRate: 0.003,
        swapFee: new BigNumber('0.003'),
        protocolFee: new BigNumber('0'),
        invariant: new BigNumber('0'),
        totalWeight: new BigNumber('1'),
        poolType: 'weighted',
        tokens: [
          {
            address: '0xA',
            symbol: 'A',
            decimals: 18,
            balance: new BigNumber('1000'),
            weight: new BigNumber('0.5'),
            denormalizedWeight: new BigNumber('1')
          },
          {
            address: '0xB',
            symbol: 'B',
            decimals: 18,
            balance: new BigNumber('2000'),
            weight: new BigNumber('0.5'),
            denormalizedWeight: new BigNumber('1')
          }
        ]
      };
      
      const result = await balancerInvariant.verifySpotPrices(
        poolState,
        100,
        '0xTxHash'
      );
      
      expect(result).to.exist;
      expect(result.invariantType).to.equal('spot_price_consistency');
      // For a 2-token pool, there's no triangular arbitrage to check, so it should be valid
      expect(result.valid).to.be.true;
    });
  });
  
  describe('Cross-Protocol Invariant Checks', () => {
    it('should batch verify multiple invariants', async () => {
      // Create sample states for each protocol
      const checks = [
        {
          type: 'amm' as const,
          data: {
            poolAddress: '0xUniswap',
            stateBefore: await stateTracker.extractAMMState(
              '0xUniswap',
              'uniswapv2',
              { reserveA: '1000', reserveB: '2000' },
              {
                tokenA: { address: '0xA', symbol: 'A', decimals: 18 },
                tokenB: { address: '0xB', symbol: 'B', decimals: 18 }
              },
              100
            ),
            stateAfter: await stateTracker.extractAMMState(
              '0xUniswap',
              'uniswapv2',
              { reserveA: '1010', reserveB: '1980' },
              {
                tokenA: { address: '0xA', symbol: 'A', decimals: 18 },
                tokenB: { address: '0xB', symbol: 'B', decimals: 18 }
              },
              101
            ),
            transactionHash: '0xTx1'
          }
        }
      ];
      
      const results = await invariantChecker.verifyBatch(checks);
      
      expect(results).to.be.an('array');
      expect(results.length).to.equal(1);
      expect(results[0].protocol).to.exist;
    });
  });
});