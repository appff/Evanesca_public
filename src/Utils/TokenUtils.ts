import { web3 } from "../PreTasks";
import { AbiItem } from "web3-utils";
import { ABIERC20 } from "../ABIDecoder/defaultABIs";

export async function applyDecimals(amount: number, tokenAddr: string) {
  if (tokenAddr == "0x0")
    return amount / (10 ** 18);
  else
    return amount / Number(10 ** await (new web3.eth.Contract(ABIERC20 as AbiItem[], tokenAddr)).methods.decimals().call());
}
