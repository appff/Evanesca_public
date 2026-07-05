export const ABIRikkeiFinance = [
  {
    "anonymous": false,
    "inputs": [
      {"indexed": false, "internalType": "uint256", "name": "cashPrior", "type": "uint256"},
      {"indexed": false, "internalType": "uint256", "name": "interestAccumulated", "type": "uint256"},
      {"indexed": false, "internalType": "uint256", "name": "borrowIndex", "type": "uint256"},
      {"indexed": false, "internalType": "uint256", "name": "totalBorrows", "type": "uint256"}
    ],
    "name": "AccrueInterest",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {"indexed": false, "internalType": "address", "name": "borrower", "type": "address"},
      {"indexed": false, "internalType": "uint256", "name": "borrowAmount", "type": "uint256"},
      {"indexed": false, "internalType": "uint256", "name": "accountBorrows", "type": "uint256"},
      {"indexed": false, "internalType": "uint256", "name": "totalBorrows", "type": "uint256"}
    ],
    "name": "Borrow",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {"indexed": false, "internalType": "address", "name": "minter", "type": "address"},
      {"indexed": false, "internalType": "uint256", "name": "mintAmount", "type": "uint256"},
      {"indexed": false, "internalType": "uint256", "name": "mintTokens", "type": "uint256"}
    ],
    "name": "Mint",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {"indexed": false, "internalType": "address", "name": "account", "type": "address"},
      {"indexed": false, "internalType": "address", "name": "cToken", "type": "address"}
    ],
    "name": "MarketEntered",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {"indexed": false, "internalType": "address", "name": "payer", "type": "address"},
      {"indexed": false, "internalType": "address", "name": "borrower", "type": "address"},
      {"indexed": false, "internalType": "uint256", "name": "repayAmount", "type": "uint256"},
      {"indexed": false, "internalType": "uint256", "name": "accountBorrows", "type": "uint256"},
      {"indexed": false, "internalType": "uint256", "name": "totalBorrows", "type": "uint256"}
    ],
    "name": "RepayBorrow",
    "type": "event"
  },
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