import { getDecimals } from "./PriceUtils";
import { web3 } from "../../PreTasks";
import { ethCall } from "../Infura/InfuraEthCall";
import { PriceManagerBase } from "./BasePriceManager";

export class ChainlinkPriceManager extends PriceManagerBase {
  override async getPrice(address: string, blockNo: number | string): Promise<number> {
    const res = await ethCall(address, this.reqChainlinkPriceOracle(), web3.utils.numberToHex(blockNo));
    const decimals = Number(await getDecimals(address));
    try {
      const hexValue = web3.utils.hexToNumber(res.data.result);
      const r = Number(hexValue) / (10 ** decimals);
      return r;
    } catch (e) { throw new Error("getPriceFromchainlink" + e); }
  }

  reqChainlinkPriceOracle() {
    return web3.eth.abi.encodeFunctionCall(
      { name: "latestAnswer", type: "function",
        inputs: [] }, []);
  }
}