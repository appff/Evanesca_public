export class DEX {
  public K: number;
  public PoolAddr: string;
  public Fee: number;
  constructor(addr: string, inAmount: number, outAmount: number, fee: number){
    this.PoolAddr = addr;
    this.K = inAmount * outAmount;
  }
  calcFee(amountIn: string){
    return Number(amountIn) + (Number(amountIn) * this.Fee);
  }
}