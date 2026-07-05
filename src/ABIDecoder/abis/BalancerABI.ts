// Balancer Vault ABI for Flash Loan and Swap operations
// Used in Curve Finance attack (July 30, 2023)

export const ABIBalancer = [
  // Balancer V1 pool swap event (LOG_SWAP)
  // Example tx: 0x48785cd3515f8558109f78b7cfe86a21df5dc6a35238cd20c4aa04a7ed831199
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "caller",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "tokenIn",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "tokenOut",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "tokenAmountIn",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "tokenAmountOut",
        "type": "uint256"
      }
    ],
    "name": "LOG_SWAP",
    "type": "event"
  },
  // FlashLoan event - signature: 0x0d7d75e01ab95780d3cd1c8ec0dd6c2ce19e3a20427eec8bf53283b6fb8e95f0
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "contract IFlashLoanRecipient",
        "name": "recipient",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "contract IERC20",
        "name": "token",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "amount",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "feeAmount",
        "type": "uint256"
      }
    ],
    "name": "FlashLoan",
    "type": "event"
  },
  // Swap event
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "poolId",
        "type": "bytes32"
      },
      {
        "indexed": true,
        "internalType": "contract IERC20",
        "name": "tokenIn",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "contract IERC20",
        "name": "tokenOut",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "amountIn",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "amountOut",
        "type": "uint256"
      }
    ],
    "name": "Swap",
    "type": "event"
  },
  // PoolBalanceChanged event
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "poolId",
        "type": "bytes32"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "liquidityProvider",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "contract IERC20[]",
        "name": "tokens",
        "type": "address[]"
      },
      {
        "indexed": false,
        "internalType": "int256[]",
        "name": "deltas",
        "type": "int256[]"
      },
      {
        "indexed": false,
        "internalType": "uint256[]",
        "name": "protocolFeeAmounts",
        "type": "uint256[]"
      }
    ],
    "name": "PoolBalanceChanged",
    "type": "event"
  },
  // InternalBalanceChanged event
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "user",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "contract IERC20",
        "name": "token",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "int256",
        "name": "delta",
        "type": "int256"
      }
    ],
    "name": "InternalBalanceChanged",
    "type": "event"
  }
];
