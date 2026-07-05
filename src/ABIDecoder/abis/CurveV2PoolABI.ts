// Curve V2 Pool ABI for 2-token pools (like pETH/ETH, alETH/ETH, msETH/ETH)
export const ABICurveV2Pool = [
  {
    "name": "TokenExchange",
    "inputs": [
      {"type": "address", "name": "buyer", "indexed": true},
      {"type": "int128", "name": "sold_id", "indexed": false},
      {"type": "uint256", "name": "tokens_sold", "indexed": false},
      {"type": "int128", "name": "bought_id", "indexed": false},
      {"type": "uint256", "name": "tokens_bought", "indexed": false}
    ],
    "anonymous": false,
    "type": "event"
  },
  {
    "name": "AddLiquidity",
    "inputs": [
      {"type": "address", "name": "provider", "indexed": true},
      {"type": "uint256[2]", "name": "token_amounts", "indexed": false},
      {"type": "uint256[2]", "name": "fees", "indexed": false},
      {"type": "uint256", "name": "invariant", "indexed": false},
      {"type": "uint256", "name": "token_supply", "indexed": false}
    ],
    "anonymous": false,
    "type": "event"
  },
  {
    "name": "RemoveLiquidity",
    "inputs": [
      {"type": "address", "name": "provider", "indexed": true},
      {"type": "uint256[2]", "name": "token_amounts", "indexed": false},
      {"type": "uint256[2]", "name": "fees", "indexed": false},
      {"type": "uint256", "name": "token_supply", "indexed": false}
    ],
    "anonymous": false,
    "type": "event"
  },
  {
    "name": "RemoveLiquidityOne",
    "inputs": [
      {"type": "address", "name": "provider", "indexed": true},
      {"type": "uint256", "name": "token_amount", "indexed": false},
      {"type": "uint256", "name": "coin_amount", "indexed": false}
    ],
    "anonymous": false,
    "type": "event"
  },
  {
    "name": "RemoveLiquidityImbalance",
    "inputs": [
      {"type": "address", "name": "provider", "indexed": true},
      {"type": "uint256[2]", "name": "token_amounts", "indexed": false},
      {"type": "uint256[2]", "name": "fees", "indexed": false},
      {"type": "uint256", "name": "invariant", "indexed": false},
      {"type": "uint256", "name": "token_supply", "indexed": false}
    ],
    "anonymous": false,
    "type": "event"
  },
  // Standard ERC20 events for LP tokens
  {
    "name": "Transfer",
    "inputs": [
      {"type": "address", "name": "sender", "indexed": true},
      {"type": "address", "name": "receiver", "indexed": true},
      {"type": "uint256", "name": "value", "indexed": false}
    ],
    "anonymous": false,
    "type": "event"
  },
  {
    "name": "Approval",
    "inputs": [
      {"type": "address", "name": "owner", "indexed": true},
      {"type": "address", "name": "spender", "indexed": true},
      {"type": "uint256", "name": "value", "indexed": false}
    ],
    "anonymous": false,
    "type": "event"
  },
  // Key methods for getting pool info
  {
    "name": "coins",
    "outputs": [{"type": "address", "name": ""}],
    "inputs": [{"type": "uint256", "name": "i"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "name": "balances",
    "outputs": [{"type": "uint256", "name": ""}],
    "inputs": [{"type": "uint256", "name": "i"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "name": "get_virtual_price",
    "outputs": [{"type": "uint256", "name": ""}],
    "inputs": [],
    "stateMutability": "view",
    "type": "function"
  }
];

// Export for backward compatibility
export const CurveV2PoolABI = ABICurveV2Pool;