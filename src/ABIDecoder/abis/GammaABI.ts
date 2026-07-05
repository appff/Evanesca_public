export const ABIGammaHypervisor = [
  {
    "anonymous": false,
    "inputs": [
      {"indexed": true, "name": "sender", "type": "address"},
      {"indexed": false, "name": "amount0", "type": "uint256"},
      {"indexed": false, "name": "amount1", "type": "uint256"},
      {"indexed": true, "name": "to", "type": "address"}
    ],
    "name": "Deposit",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {"indexed": true, "name": "sender", "type": "address"},
      {"indexed": false, "name": "amount0", "type": "uint256"},
      {"indexed": false, "name": "amount1", "type": "uint256"},
      {"indexed": true, "name": "to", "type": "address"}
    ],
    "name": "Withdraw",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {"indexed": false, "name": "tick", "type": "int24"},
      {"indexed": false, "name": "totalAmount0", "type": "uint256"},
      {"indexed": false, "name": "totalAmount1", "type": "uint256"},
      {"indexed": false, "name": "feeAmount0", "type": "uint256"},
      {"indexed": false, "name": "feeAmount1", "type": "uint256"},
      {"indexed": false, "name": "totalSupply", "type": "uint256"}
    ],
    "name": "Rebalance",
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
  },
  {
    "anonymous": false,
    "inputs": [
      {"indexed": false, "name": "sqrtPriceX96", "type": "uint160"},
      {"indexed": false, "name": "tick", "type": "int24"}
    ],
    "name": "Initialize",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {"indexed": true, "name": "owner", "type": "address"},
      {"indexed": true, "name": "tickLower", "type": "int24"},
      {"indexed": true, "name": "tickUpper", "type": "int24"},
      {"indexed": false, "name": "amount", "type": "uint128"},
      {"indexed": false, "name": "amount0", "type": "uint256"},
      {"indexed": false, "name": "amount1", "type": "uint256"}
    ],
    "name": "Mint",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {"indexed": false, "name": "amount0", "type": "uint256"},
      {"indexed": false, "name": "amount1", "type": "uint256"}
    ],
    "name": "Collect",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {"indexed": true, "name": "owner", "type": "address"},
      {"indexed": false, "name": "tickLower", "type": "int24"},
      {"indexed": false, "name": "tickUpper", "type": "int24"},
      {"indexed": false, "name": "amount", "type": "uint128"},
      {"indexed": false, "name": "amount0", "type": "uint256"},
      {"indexed": false, "name": "amount1", "type": "uint256"}
    ],
    "name": "Burn",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {"indexed": true, "name": "sender", "type": "address"},
      {"indexed": true, "name": "recipient", "type": "address"},
      {"indexed": false, "name": "amount0", "type": "int256"},
      {"indexed": false, "name": "amount1", "type": "int256"},
      {"indexed": false, "name": "sqrtPriceX96", "type": "uint160"},
      {"indexed": false, "name": "liquidity", "type": "uint128"},
      {"indexed": false, "name": "tick", "type": "int24"}
    ],
    "name": "Swap",
    "type": "event"
  }
];