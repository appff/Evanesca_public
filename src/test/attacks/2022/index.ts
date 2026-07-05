/**
 * 2022 DeFi Attack Tests
 * 
 * Collection of major DeFi attacks that occurred in 2022.
 * This year saw massive losses with bridge attacks and governance exploits.
 */

export const ATTACKS_2022 = [
  // Ethereum Attacks
  {
    name: 'Float Protocol Attack',
    date: '2022-01-15',
    file: 'floatProtocol.test.ts',
    chain: 'Ethereum',
    type: 'Oracle Manipulation',
    loss: '$1.44M',
    description: 'Oracle manipulation via Uniswap V3 TWAP'
  },
  {
    name: 'Inverse Finance Attack',
    date: '2022-04-02',
    file: 'inverseFinance.test.ts',
    chain: 'Ethereum',
    type: 'Flash Loan',
    loss: '$15.6M',
    description: 'Flash loan + oracle manipulation'
  },
  {
    name: 'BeanstalkFarms Attack',
    date: '2022-04-17',
    file: 'beanstalkFarms.test.ts',
    chain: 'Ethereum',
    type: 'Governance',
    loss: '$182M',
    description: 'Governance exploit via flash loan manipulation'
  },
  {
    name: 'Saddle Finance Attack',
    date: '2022-04-30',
    file: 'saddleFinance.test.ts',
    chain: 'Ethereum',
    type: 'Price Manipulation',
    loss: '$10M',
    description: 'Metapool swap manipulation exploit'
  },
  {
    name: 'Rari Capital Attack',
    date: '2022-04-30',
    file: 'rariCapital.test.ts',
    chain: 'Ethereum',
    type: 'Reentrancy',
    loss: '$80M',
    description: 'Reentrancy exploit on Fuse lending protocol'
  },
  
  // BSC Attacks
  {
    name: 'Crosswise Attack',
    date: '2022-01-18',
    file: 'crosswise.test.ts',
    chain: 'BSC',
    type: 'Reentrancy',
    loss: '$0.88M',
    description: 'Reentrancy exploit via trust forwarder manipulation'
  },
  {
    name: 'Elephant Money Attack',
    date: '2022-04-12',
    file: 'elephantMoney.test.ts',
    chain: 'BSC',
    type: 'Flash Loan',
    loss: '$11.2M',
    description: 'Complex price manipulation + ponzi scheme exploitation'
  },
  {
    name: 'Rikkei Finance Attack',
    date: '2022-04-15',
    file: 'rikkeiFinance.test.ts',
    chain: 'BSC',
    type: 'Oracle Manipulation',
    loss: '$1.1M',
    description: 'Oracle manipulation via PancakeSwap low-liquidity pools'
  },
  {
    name: 'Fortress Loans Attack',
    date: '2022-05-08',
    file: 'fortressLoans.test.ts',
    chain: 'BSC',
    type: 'Flash Loan',
    loss: '$3M',
    description: 'Flash loan attack exploiting lending protocol vulnerability'
  },
  {
    name: 'Wiener DOGE Attack',
    date: '2022-06-18',
    file: 'wienerDoge.test.ts',
    chain: 'BSC',
    type: 'Price Manipulation',
    loss: '$0.074M',
    description: 'DEX manipulation via meme token exploitation'
  },
  {
    name: 'EGD Finance Attack',
    date: '2022-08-07',
    file: 'egdFinance.test.ts',
    chain: 'BSC',
    type: 'Price Manipulation',
    loss: '$36M',
    description: 'Price manipulation via flash loan + LP token exploitation'
  },
  
  // Bridge Attacks
  {
    name: 'Qubit Finance Attack',
    date: '2022-01-28',
    file: 'qubitFinance.test.ts',
    chain: 'Ethereum',
    type: 'Bridge Exploit',
    loss: '$80M',
    description: 'Zero-value deposit vulnerability in bridge'
  },
  {
    name: 'Meter.io Bridge Attack',
    date: '2022-02-05',
    file: 'meterIO.test.ts',
    chain: 'Moonriver',
    type: 'Bridge Exploit',
    loss: '$4.4M',
    description: 'Bridge deposit bypass via WETH transfer bypass'
  }
];

// Total loss in 2022: ~$426.5M (largest year for losses)
export const TOTAL_LOSS_2022 = 426_500_000;