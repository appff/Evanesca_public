export const ABIWooPPV2 = [
  {
    "anonymous": false,
    "inputs": [
      {"indexed": true, "name": "fromToken", "type": "address"},
      {"indexed": true, "name": "toToken", "type": "address"},
      {"indexed": false, "name": "fromAmount", "type": "uint256"},
      {"indexed": false, "name": "toAmount", "type": "uint256"},
      {"indexed": false, "name": "from", "type": "address"},
      {"indexed": true, "name": "to", "type": "address"},
      {"indexed": false, "name": "rebateTo", "type": "address"},
      {"indexed": false, "name": "swapVol", "type": "uint256"},
      {"indexed": false, "name": "swapFee", "type": "uint256"}
    ],
    "name": "WooSwap",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {"indexed": true, "name": "from", "type": "address"},
      {"indexed": true, "name": "to", "type": "address"},
      {"indexed": false, "name": "value", "type": "uint256"}
    ],
    "name": "Transfer",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {"indexed": true, "name": "owner", "type": "address"},
      {"indexed": true, "name": "spender", "type": "address"},
      {"indexed": false, "name": "value", "type": "uint256"}
    ],
    "name": "Approval",
    "type": "event"
  }
];

export const ABIWooRouter = [
  {
    "anonymous": false,
    "inputs": [
      {"indexed": false, "name": "swapType", "type": "uint8"},
      {"indexed": true, "name": "from", "type": "address"},
      {"indexed": true, "name": "to", "type": "address"},
      {"indexed": false, "name": "fromToken", "type": "address"},
      {"indexed": false, "name": "toToken", "type": "address"},
      {"indexed": false, "name": "fromAmount", "type": "uint256"},
      {"indexed": false, "name": "toAmount", "type": "uint256"}
    ],
    "name": "WooRouterSwap",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {"indexed": true, "name": "from", "type": "address"},
      {"indexed": true, "name": "to", "type": "address"},
      {"indexed": false, "name": "value", "type": "uint256"}
    ],
    "name": "Transfer",
    "type": "event"
  }
];