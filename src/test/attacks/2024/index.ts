/**
 * 2024 DeFi Attack Tests
 * 
 * Collection of major DeFi attacks that occurred in 2024.
 * Continuing trends of cross-chain and sophisticated attacks.
 */

export const ATTACKS_2024 = [
  {
    name: 'Radiant Capital Attack',
    date: '2024-01-02',
    file: 'radiant-capital.test.ts',
    chain: 'Arbitrum',
    type: 'Flash Loan',
    loss: '$4.5M',
    description: 'Flash loan + oracle manipulation on Arbitrum'
  },
  {
    name: 'Gamma Strategies Attack',
    date: '2024-01-04',
    file: 'gamma-strategies.test.ts',
    chain: 'Arbitrum',
    type: 'Price Manipulation',
    loss: '$3.4M',
    description: 'Vault price manipulation on Arbitrum'
  },
  {
    name: 'Concentric Finance Attack',
    date: '2024-01-21',
    file: 'concentric-finance.test.ts',
    chain: 'Arbitrum',
    type: 'Oracle Manipulation',
    loss: '$1.8M',
    description: 'Oracle manipulation on Arbitrum'
  },
  {
    name: 'MIM Spell Attack',
    date: '2024-01-30',
    file: 'mim-spell.test.ts',
    chain: 'Ethereum',
    type: 'Flash Loan',
    loss: '$6.5M',
    description: 'Flash loan exploit on Ethereum'
  },
  {
    name: 'Shido Global Attack',
    date: '2024-02-15',
    file: 'shido-global.test.ts',
    chain: 'BSC',
    type: 'Liquidity Exploit',
    loss: '$3.3M',
    description: 'Liquidity exploit on BSC'
  },
  {
    name: 'BlueberryFDN Attack',
    date: '2024-02-23',
    file: 'blueberry-fdn.test.ts',
    chain: 'Ethereum',
    type: 'Logic Vulnerability',
    loss: '$1.4M',
    description: 'Logic vulnerability on Ethereum'
  },
  {
    name: 'WooFi Swap Attack',
    date: '2024-03-05',
    file: 'woofi-swap.test.ts',
    chain: 'Arbitrum',
    type: 'sPMM Manipulation',
    loss: '$8.75M',
    description: 'sPMM price manipulation on Arbitrum'
  },
  {
    name: 'Prisma Finance Attack',
    date: '2024-03-28',
    file: 'prisma-finance.test.ts',
    chain: 'Ethereum',
    type: 'Reentrancy',
    loss: '$11.6M',
    description: 'Reentrancy via flash loan callback in MigrateTroveZap'
  },
  {
    name: 'Pike Finance Attack',
    date: '2024-04-30',
    file: 'pike-finance.test.ts',
    chain: 'Ethereum',
    type: 'Cross-chain Validation',
    loss: '$1.4M',
    description: 'Cross-chain validation failure on Ethereum'
  }
];

// Total loss in 2024 (so far): ~$42.65M
export const TOTAL_LOSS_2024 = 42_650_000;