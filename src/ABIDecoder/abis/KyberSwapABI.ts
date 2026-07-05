// KyberSwap Elastic Protocol ABI
// Attack transaction: 0x485e08dc2b6a4b3aeadcb89c3d18a37666dc7d9424961a2091d6b3696792f0f3
// Based on KyberSwap Elastic concentrated liquidity pools

export const ABIKyberSwap = [
  // Swap event - KyberSwap Elastic concentrated liquidity swap
  {
    "anonymous": false,
    "inputs": [
      {"indexed": true, "internalType": "address", "name": "sender", "type": "address"},
      {"indexed": true, "internalType": "address", "name": "recipient", "type": "address"},
      {"indexed": false, "internalType": "int256", "name": "amount0", "type": "int256"},
      {"indexed": false, "internalType": "int256", "name": "amount1", "type": "int256"},
      {"indexed": false, "internalType": "uint160", "name": "sqrtPriceX96", "type": "uint160"},
      {"indexed": false, "internalType": "uint128", "name": "liquidity", "type": "uint128"},
      {"indexed": false, "internalType": "int24", "name": "tick", "type": "int24"}
    ],
    "name": "Swap",
    "type": "event"
  },
  // Mint event - Add liquidity to concentrated position
  {
    "anonymous": false,
    "inputs": [
      {"indexed": false, "internalType": "address", "name": "sender", "type": "address"},
      {"indexed": true, "internalType": "address", "name": "owner", "type": "address"},
      {"indexed": false, "internalType": "int24", "name": "tickLower", "type": "int24"},
      {"indexed": false, "internalType": "int24", "name": "tickUpper", "type": "int24"},
      {"indexed": false, "internalType": "uint128", "name": "amount", "type": "uint128"},
      {"indexed": false, "internalType": "uint256", "name": "amount0", "type": "uint256"},
      {"indexed": false, "internalType": "uint256", "name": "amount1", "type": "uint256"}
    ],
    "name": "Mint",
    "type": "event"
  },
  // Burn event - Remove liquidity from concentrated position
  {
    "anonymous": false,
    "inputs": [
      {"indexed": true, "internalType": "address", "name": "owner", "type": "address"},
      {"indexed": false, "internalType": "int24", "name": "tickLower", "type": "int24"},
      {"indexed": false, "internalType": "int24", "name": "tickUpper", "type": "int24"},
      {"indexed": false, "internalType": "uint128", "name": "amount", "type": "uint128"},
      {"indexed": false, "internalType": "uint256", "name": "amount0", "type": "uint256"},
      {"indexed": false, "internalType": "uint256", "name": "amount1", "type": "uint256"}
    ],
    "name": "Burn",
    "type": "event"
  },
  // Flash event - Flash loan/swap
  {
    "anonymous": false,
    "inputs": [
      {"indexed": true, "internalType": "address", "name": "sender", "type": "address"},
      {"indexed": true, "internalType": "address", "name": "recipient", "type": "address"},
      {"indexed": false, "internalType": "uint256", "name": "amount0", "type": "uint256"},
      {"indexed": false, "internalType": "uint256", "name": "amount1", "type": "uint256"},
      {"indexed": false, "internalType": "uint256", "name": "paid0", "type": "uint256"},
      {"indexed": false, "internalType": "uint256", "name": "paid1", "type": "uint256"}
    ],
    "name": "Flash",
    "type": "event"
  },
  // Collect event - Collect fees from position
  {
    "anonymous": false,
    "inputs": [
      {"indexed": true, "internalType": "address", "name": "owner", "type": "address"},
      {"indexed": false, "internalType": "address", "name": "recipient", "type": "address"},
      {"indexed": false, "internalType": "int24", "name": "tickLower", "type": "int24"},
      {"indexed": false, "internalType": "int24", "name": "tickUpper", "type": "int24"},
      {"indexed": false, "internalType": "uint128", "name": "amount0", "type": "uint128"},
      {"indexed": false, "internalType": "uint128", "name": "amount1", "type": "uint128"}
    ],
    "name": "Collect",
    "type": "event"
  },
  // CollectProtocol event - Collect protocol fees
  {
    "anonymous": false,
    "inputs": [
      {"indexed": true, "internalType": "address", "name": "sender", "type": "address"},
      {"indexed": true, "internalType": "address", "name": "recipient", "type": "address"},
      {"indexed": false, "internalType": "uint128", "name": "amount0", "type": "uint128"},
      {"indexed": false, "internalType": "uint128", "name": "amount1", "type": "uint128"}
    ],
    "name": "CollectProtocol",
    "type": "event"
  },
  // Transfer event for ERC20 tokens
  {
    "anonymous": false,
    "inputs": [
      {"indexed": true, "internalType": "address", "name": "from", "type": "address"},
      {"indexed": true, "internalType": "address", "name": "to", "type": "address"},
      {"indexed": false, "internalType": "uint256", "name": "value", "type": "uint256"}
    ],
    "name": "Transfer",
    "type": "event"
  },
  // Approval event for ERC20 tokens
  {
    "anonymous": false,
    "inputs": [
      {"indexed": true, "internalType": "address", "name": "owner", "type": "address"},
      {"indexed": true, "internalType": "address", "name": "spender", "type": "address"},
      {"indexed": false, "internalType": "uint256", "name": "value", "type": "uint256"}
    ],
    "name": "Approval",
    "type": "event"
  },
  // KyberSwap specific events - based on attack analysis
  // These signatures were found in the attack transaction
  {
    "anonymous": false,
    "inputs": [
      {"indexed": false, "internalType": "uint256", "name": "amount0", "type": "uint256"},
      {"indexed": false, "internalType": "uint256", "name": "amount1", "type": "uint256"},
      {"indexed": false, "internalType": "uint256", "name": "reinvestL", "type": "uint256"},
      {"indexed": false, "internalType": "uint256", "name": "reinvestLLast", "type": "uint256"}
    ],
    "name": "UpdateLiquidityAndCrossTick",
    "type": "event"
  }
];