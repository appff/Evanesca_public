// Warp Finance lending vault ABI (LP-collateral attack, December 2020).
// Covers both LPWarpVault (CollateralProvided / CollateralWithdraw) and
// StableCoinWarpVault (StableCoinLent / LoanRepayed / StableCoinWithdraw)
// events; one shared ABI is sufficient because each address only emits the
// subset relevant to its vault role.

export const ABIWarpFinance = [
  // LPWarpVault events
  {
    "anonymous": false,
    "inputs": [
      { "indexed": false, "internalType": "address", "name": "user", "type": "address" },
      { "indexed": false, "internalType": "uint256", "name": "amount", "type": "uint256" }
    ],
    "name": "CollateralProvided",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": false, "internalType": "address", "name": "user", "type": "address" },
      { "indexed": false, "internalType": "uint256", "name": "amount", "type": "uint256" }
    ],
    "name": "CollateralWithdraw",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": false, "internalType": "address", "name": "borrower", "type": "address" },
      { "indexed": false, "internalType": "address", "name": "liquidator", "type": "address" },
      { "indexed": false, "internalType": "uint256", "name": "amount", "type": "uint256" }
    ],
    "name": "AccountLiquidated",
    "type": "event"
  },

  // StableCoinWarpVault events
  {
    "anonymous": false,
    "inputs": [
      { "indexed": false, "internalType": "address", "name": "borrower", "type": "address" },
      { "indexed": false, "internalType": "uint256", "name": "amount", "type": "uint256" },
      { "indexed": false, "internalType": "uint256", "name": "timestamp", "type": "uint256" }
    ],
    "name": "StableCoinLent",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": false, "internalType": "address", "name": "borrower", "type": "address" },
      { "indexed": false, "internalType": "uint256", "name": "amount", "type": "uint256" },
      { "indexed": false, "internalType": "uint256", "name": "interest", "type": "uint256" },
      { "indexed": false, "internalType": "uint256", "name": "timestamp", "type": "uint256" }
    ],
    "name": "LoanRepayed",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": false, "internalType": "address", "name": "user", "type": "address" },
      { "indexed": false, "internalType": "uint256", "name": "amount", "type": "uint256" },
      { "indexed": false, "internalType": "uint256", "name": "timestamp", "type": "uint256" }
    ],
    "name": "StableCoinWithdraw",
    "type": "event"
  },

  // WarpControl events
  {
    "anonymous": false,
    "inputs": [
      { "indexed": false, "internalType": "address", "name": "borrower", "type": "address" },
      { "indexed": false, "internalType": "address", "name": "vault", "type": "address" },
      { "indexed": false, "internalType": "uint256", "name": "amount", "type": "uint256" }
    ],
    "name": "NewBorrow",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": false, "internalType": "address", "name": "borrower", "type": "address" },
      { "indexed": false, "internalType": "address", "name": "liquidator", "type": "address" }
    ],
    "name": "Liquidation",
    "type": "event"
  },

  // Interest accounting events emitted by StableCoinWarpVault during a borrow
  // (declared so the decoder does not throw; not surfaced as SFG edges).
  {
    "anonymous": false,
    "inputs": [
      { "indexed": false, "internalType": "uint256", "name": "interest", "type": "uint256" },
      { "indexed": false, "internalType": "uint256", "name": "totalBorrows", "type": "uint256" },
      { "indexed": false, "internalType": "uint256", "name": "totalReserves", "type": "uint256" },
      { "indexed": false, "internalType": "uint256", "name": "borrowIndex", "type": "uint256" }
    ],
    "name": "InterestAccrued",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": false, "internalType": "uint256", "name": "blockDelta", "type": "uint256" }
    ],
    "name": "InterestShortCircuit",
    "type": "event"
  }
];
