// Euler Finance Protocol ABI
// Attack transaction: 0xc310a0affe2169d1f6feec1c63dbc7f7c62a887fa48795d327d4d2da2d6b111d
// Main contract: 0x27182842E098f60e3D576794A5bFFb0777E025d3

export const ABIEuler = [
  // Deposit event
  {
    "anonymous": false,
    "inputs": [
      {"indexed": true, "internalType": "address", "name": "underlying", "type": "address"},
      {"indexed": true, "internalType": "address", "name": "account", "type": "address"},
      {"indexed": false, "internalType": "uint256", "name": "amount", "type": "uint256"}
    ],
    "name": "Deposit",
    "type": "event"
  },
  // Withdraw event
  {
    "anonymous": false,
    "inputs": [
      {"indexed": true, "internalType": "address", "name": "underlying", "type": "address"},
      {"indexed": true, "internalType": "address", "name": "account", "type": "address"},
      {"indexed": false, "internalType": "uint256", "name": "amount", "type": "uint256"}
    ],
    "name": "Withdraw",
    "type": "event"
  },
  // Borrow event
  {
    "anonymous": false,
    "inputs": [
      {"indexed": true, "internalType": "address", "name": "underlying", "type": "address"},
      {"indexed": true, "internalType": "address", "name": "account", "type": "address"},
      {"indexed": false, "internalType": "uint256", "name": "amount", "type": "uint256"}
    ],
    "name": "Borrow",
    "type": "event"
  },
  // Repay event
  {
    "anonymous": false,
    "inputs": [
      {"indexed": true, "internalType": "address", "name": "underlying", "type": "address"},
      {"indexed": true, "internalType": "address", "name": "account", "type": "address"},
      {"indexed": false, "internalType": "uint256", "name": "amount", "type": "uint256"}
    ],
    "name": "Repay",
    "type": "event"
  },
  // RequestDonate event (critical for the attack)
  {
    "anonymous": false,
    "inputs": [
      {"indexed": true, "internalType": "address", "name": "account", "type": "address"},
      {"indexed": false, "internalType": "uint256", "name": "amount", "type": "uint256"}
    ],
    "name": "RequestDonate",
    "type": "event"
  },
  // Liquidation event (self-liquidation used in attack)
  {
    "anonymous": false,
    "inputs": [
      {"indexed": true, "internalType": "address", "name": "liquidator", "type": "address"},
      {"indexed": true, "internalType": "address", "name": "violator", "type": "address"},
      {"indexed": true, "internalType": "address", "name": "underlying", "type": "address"},
      {"indexed": false, "internalType": "address", "name": "collateral", "type": "address"},
      {"indexed": false, "internalType": "uint256", "name": "repay", "type": "uint256"},
      {"indexed": false, "internalType": "uint256", "name": "yield", "type": "uint256"},
      {"indexed": false, "internalType": "uint256", "name": "healthScore", "type": "uint256"},
      {"indexed": false, "internalType": "uint256", "name": "baseDiscount", "type": "uint256"},
      {"indexed": false, "internalType": "uint256", "name": "discount", "type": "uint256"}
    ],
    "name": "Liquidation",
    "type": "event"
  },
  // RequestMint event
  {
    "anonymous": false,
    "inputs": [
      {"indexed": true, "internalType": "address", "name": "account", "type": "address"},
      {"indexed": false, "internalType": "uint256", "name": "amount", "type": "uint256"}
    ],
    "name": "RequestMint",
    "type": "event"
  },
  // RequestBurn event
  {
    "anonymous": false,
    "inputs": [
      {"indexed": true, "internalType": "address", "name": "account", "type": "address"},
      {"indexed": false, "internalType": "uint256", "name": "amount", "type": "uint256"}
    ],
    "name": "RequestBurn",
    "type": "event"
  },
  // RequestTransferEToken event
  {
    "anonymous": false,
    "inputs": [
      {"indexed": true, "internalType": "address", "name": "from", "type": "address"},
      {"indexed": true, "internalType": "address", "name": "to", "type": "address"},
      {"indexed": false, "internalType": "uint256", "name": "amount", "type": "uint256"}
    ],
    "name": "RequestTransferEToken",
    "type": "event"
  },
  // Transfer event for eTokens (0xe025E3ca2bE02316033184551D4d3Aa22024D9DC)
  {
    "anonymous": false,
    "inputs": [
      {"indexed": true, "internalType": "address", "name": "from", "type": "address"},
      {"indexed": true, "internalType": "address", "name": "to", "type": "address"},
      {"indexed": false, "internalType": "uint256", "name": "value", "type": "uint256"}
    ],
    "name": "Transfer",
    "type": "event"
  }
];