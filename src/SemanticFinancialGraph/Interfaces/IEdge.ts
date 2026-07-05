export interface ISemanticFinancialEdge {
  Action: string
}

export interface IDEXEdge extends ISemanticFinancialEdge {
  AmountIn: string  // 🔧 [PRECISION-FIX] number → string for precision safety
  Token0: string
  Token0Addr?: string
  AmountOut: string // 🔧 [PRECISION-FIX] number → string for precision safety
  Token1: string
  Token1Addr?: string
  Type?: string
  Service?: string
  From?: string
  To?: string
  BlockNumber?: number
  TransactionHash?: string
}

export interface ILendingEdge extends ISemanticFinancialEdge {
  Amount: string    // 🔧 [PRECISION-FIX] number → string for precision safety
  From: string
  To: string
  Token: string
  TokenAddr: string
}