/**
 * 2023 DeFi Attack Tests
 * 
 * Collection of major DeFi attacks that occurred in 2023.
 * Notable for large-scale attacks like Euler Finance and KyberSwap.
 */

export const ATTACKS_2023 = [
  {
    name: 'dForce Attack',
    date: '2023-02-10',
    file: 'dforce.test.ts',
    chain: 'Arbitrum',
    type: 'Reentrancy',
    loss: '$3.65M',
    description: 'Read-only reentrancy oracle manipulation'
  },
  {
    name: 'Platypus Finance Attack',
    date: '2023-02-16',
    file: 'platypus-finance.test.ts',
    chain: 'Avalanche',
    type: 'Flash Loan',
    loss: '$8.5M',
    description: 'Flash loan + coverage ratio gaming'
  },
  {
    name: 'Euler Finance Attack',
    date: '2023-03-13',
    file: 'eulerFinance.test.ts',
    chain: 'Ethereum',
    type: 'Donation Attack',
    loss: '$197M',
    description: 'Donation-based inflation + self-liquidation'
  },
  {
    name: 'ParaSpace NFT Attack',
    date: '2023-03-17',
    file: 'paraspace-nft.test.ts',
    chain: 'Ethereum',
    type: 'NFT Collateral',
    loss: '$0.293M',
    description: 'NFT collateral manipulation (prevented by BlockSec)'
  },
  {
    name: 'Allbridge Attack',
    date: '2023-04-01',
    file: 'allbridge.test.ts',
    chain: 'BSC',
    type: 'Bridge Exploit',
    loss: '$0.573M',
    description: 'Flash loan + bridge pool price manipulation'
  },
  {
    name: 'Hundred Finance Attack',
    date: '2023-04-15',
    file: 'hundred-finance.test.ts',
    chain: 'Optimism',
    type: 'Exchange Rate',
    loss: '$7M',
    description: 'Donation-based exchange rate manipulation'
  },
  {
    name: 'Curve Finance Attack',
    date: '2023-07-30',
    file: 'curveFinance.test.ts',
    chain: 'Ethereum',
    type: 'Vyper Bug',
    loss: '$41M',
    description: 'Vyper compiler bug reentrancy'
  },
  {
    name: 'KyberSwap Attack',
    date: '2023-11-22',
    file: 'kyberSwap.test.ts',
    chain: 'Multiple',
    type: 'Tick Manipulation',
    loss: '$48.8M',
    description: 'Concentrated liquidity tick manipulation'
  }
];

// Total loss in 2023: ~$306.8M
export const TOTAL_LOSS_2023 = 306_800_000;