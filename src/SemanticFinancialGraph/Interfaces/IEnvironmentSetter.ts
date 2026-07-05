export interface tokenAmountInfo {
  tSymbol: string
  tAmount: number
  tDecimals: number
}

export abstract class IEnvionrmentSetter {
  public abstract getUserData(userAddr: string): Promise<Array<tokenAmountInfo>>;
  constructor() {
  }
}