/**
 * 2020 DeFi Attack Tests
 * 
 * Collection of major DeFi attacks that occurred in 2020.
 * These attacks marked the beginning of significant DeFi vulnerabilities.
 */

export const ATTACKS_2020 = [
  {
    name: 'bZx Hack',
    date: '2020-02-15',
    file: 'bzxAttack.test.ts',
    type: 'Flash Loan',
    loss: '$1M',
    description: 'First major flash loan attack exploiting price oracle manipulation'
  },
  {
    name: 'Harvest Finance Attack #1',
    date: '2020-10-26',
    file: 'harvestAttack.test.ts',
    type: 'Flash Loan',
    loss: '$24M',
    description: 'Flash loan attack on Harvest Finance USDC/USDT vaults'
  },
  {
    name: 'Cheese Bank Attack',
    date: '2020-11-06',
    file: 'cheeseBank.test.ts',
    type: 'Oracle Manipulation',
    loss: '$3.3M',
    description: 'Oracle manipulation via flash loan + LP token collateral exploitation'
  },
  {
    name: 'Akropolis Attack',
    date: '2020-11-12',
    file: 'akropolis.test.ts',
    type: 'Reentrancy',
    loss: '$2M',
    description: 'Re-entrancy attack with flash loan exploiting savings pools'
  },
  {
    name: 'Value DeFi Attack',
    date: '2020-11-14',
    file: 'valueDeFi.test.ts',
    type: 'Flash Loan',
    loss: '$6M',
    description: 'Complex flash loan attack exploiting Curve pool manipulation'
  },
  {
    name: 'Origin Protocol Attack',
    date: '2020-11-17',
    file: 'originProtocol.test.ts',
    type: 'Reentrancy',
    loss: '$7M',
    description: 'Re-entrancy attack on OUSD stablecoin'
  },
  {
    name: 'Warp Finance Attack',
    date: '2020-12-17',
    file: 'warpFinance.test.ts',
    type: 'Price Manipulation',
    loss: '$7.7M',
    description: 'Flash loan attack manipulating LP token prices'
  },
  {
    name: 'Cream Finance Attack',
    date: '2020-10-27',
    file: 'creamFi.test.ts',
    type: 'Reentrancy',
    loss: '$130M',
    description: 'Flash loan + re-entrancy attack on Cream Finance'
  }
];

// Total loss in 2020: ~$185M
export const TOTAL_LOSS_2020 = 185_000_000;