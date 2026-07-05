type OracleAddress = string;
type TokenSymbol = string;

export interface IPriceManager {
  applyDecimals(amount: number, tokenAddr: string): Promise<number>;
  getPrice(symbol: TokenSymbol, blockDate: string): Promise<number>;
  getPrice(address: OracleAddress, blockNo: number): Promise<number>;
}