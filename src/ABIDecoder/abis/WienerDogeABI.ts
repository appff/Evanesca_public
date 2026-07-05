// Wiener DOGE DEX ABI definitions
// Based on BSC transaction logs from attack analysis

const Transfer = {
  anonymous: false,
  inputs: [
    {
      indexed: true,
      internalType: "address",
      name: "from",
      type: "address"
    },
    {
      indexed: true,
      internalType: "address",
      name: "to",
      type: "address"
    },
    {
      indexed: false,
      internalType: "uint256",
      name: "value",
      type: "uint256"
    }
  ],
  name: "Transfer",
  type: "event"
};

const Swap = {
  anonymous: false,
  inputs: [
    {
      indexed: true,
      internalType: "address",
      name: "sender",
      type: "address"
    },
    {
      indexed: false,
      internalType: "uint256",
      name: "amount0In",
      type: "uint256"
    },
    {
      indexed: false,
      internalType: "uint256",
      name: "amount1In",
      type: "uint256"
    },
    {
      indexed: false,
      internalType: "uint256",
      name: "amount0Out",
      type: "uint256"
    },
    {
      indexed: false,
      internalType: "uint256",
      name: "amount1Out",
      type: "uint256"
    },
    {
      indexed: true,
      internalType: "address",
      name: "to",
      type: "address"
    }
  ],
  name: "Swap",
  type: "event"
};

const Sync = {
  anonymous: false,
  inputs: [
    {
      indexed: false,
      internalType: "uint112",
      name: "reserve0",
      type: "uint112"
    },
    {
      indexed: false,
      internalType: "uint112",
      name: "reserve1",
      type: "uint112"
    }
  ],
  name: "Sync",
  type: "event"
};

const WienerDogeABI = [
  Transfer,
  Swap,
  Sync
];

export default WienerDogeABI;