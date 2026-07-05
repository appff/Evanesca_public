// DODO Flash Loan ABI definitions
// Based on BSC transaction logs from WIENER DOGE attack

const DODOFlashLoan = {
  anonymous: false,
  inputs: [
    {
      indexed: false,
      internalType: "address",
      name: "borrower",
      type: "address"
    },
    {
      indexed: false,
      internalType: "address",
      name: "assetTo",
      type: "address"
    },
    {
      indexed: false,
      internalType: "uint256",
      name: "baseAmount",
      type: "uint256"
    },
    {
      indexed: false,
      internalType: "uint256",
      name: "quoteAmount",
      type: "uint256"
    }
  ],
  name: "DODOFlashLoan",
  type: "event"
};

const DODOFlashLoanABI = [
  DODOFlashLoan
];

export default DODOFlashLoanABI;