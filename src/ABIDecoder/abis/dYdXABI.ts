export const ABIdYdX = [
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "accountOwner",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "accountNumber",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "market",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "address",
        "name": "autoTrader",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "int256",
        "name": "deltaWei",
        "type": "int256"
      },
      {
        "indexed": false,
        "internalType": "int256",
        "name": "newPar",
        "type": "int256"
      }
    ],
    "name": "LogMarginPositionOpened",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "accountOwner",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "accountNumber",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "market",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "address",
        "name": "autoTrader",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "int256",
        "name": "deltaWei",
        "type": "int256"
      },
      {
        "indexed": false,
        "internalType": "int256",
        "name": "newPar",
        "type": "int256"
      }
    ],
    "name": "LogMarginPositionClosed",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "accountOwner",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "accountNumber",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "market",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "int256",
        "name": "deltaWei",
        "type": "int256"
      },
      {
        "indexed": false,
        "internalType": "int256",
        "name": "newPar",
        "type": "int256"
      }
    ],
    "name": "LogDeposit",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "accountOwner",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "accountNumber",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "market",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "int256",
        "name": "deltaWei",
        "type": "int256"
      },
      {
        "indexed": false,
        "internalType": "int256",
        "name": "newPar",
        "type": "int256"
      }
    ],
    "name": "LogWithdraw",
    "type": "event"
  }
]; 