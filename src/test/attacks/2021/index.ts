/**
 * 2021 DeFi Attack Tests
 * 
 * Collection of major DeFi attacks that occurred in 2021.
 * This year saw increased sophistication in attack vectors.
 */

export const ATTACKS_2021 = [
  {
    name: 'Yearn Finance Attack',
    date: '2021-02-05',
    file: 'yearnFi.test.ts',
    type: 'Flash Loan',
    loss: '$11M',
    description: 'DAI vault exploit via Curve pool manipulation'
  },
  {
    name: 'xToken Attack #2',
    date: '2021-05-12',
    file: 'xToken.test.ts',
    type: 'Flash Loan',
    loss: '$24.5M',
    description: 'Flash loan attack exploiting xSNXa and xBNTa contracts via oracle manipulation'
  }
];

// Total loss in 2021: ~$35.5M
export const TOTAL_LOSS_2021 = 35_500_000;