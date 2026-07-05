import { AbiItem } from "web3-utils";
import { web3 } from "../../PreTasks";
import { ABIERC20 } from "../../ABIDecoder/defaultABIs";
import { IPriceManager } from "./Interfaces/IPriceManager";

export abstract class PriceManagerBase implements IPriceManager {
  async applyDecimals(amount: number, tokenAddr: string): Promise<number> {
    if (tokenAddr == "0x0") return amount / (10 ** 18);
    else
      return amount / Number(10 ** await (new web3.eth.Contract(ABIERC20 as AbiItem[], tokenAddr)).methods.decimals().call());
  }
  getPrice(symbol: string, blockDate: string): Promise<number>;
  getPrice(address: string, blockNo: number): Promise<number>;
  getPrice(address: unknown, blockNo: unknown): Promise<number> {
    throw new Error("Method not implemented.");
  }
}