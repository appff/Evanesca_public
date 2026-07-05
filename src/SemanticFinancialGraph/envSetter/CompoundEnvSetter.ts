import { web3 } from "../../PreTasks";
import { ABIassetsIn, ABIbalanceOfUnderlying, ABIsymbol, rtnStrsymbol, rtnStrAssetsIn, rtnStrbalanceOfUnderlying, ABIdemicals, rtnStrdecimals } from "./CompoundEnvInfo";
import { ethCall } from "../../Utils/Infura/InfuraEthCall";
import { IEnvionrmentSetter, tokenAmountInfo } from "../Interfaces/IEnvironmentSetter";

export class CompoundEnvSetter extends IEnvionrmentSetter {
  constructor() {
    super();
  }

  public async getUserData(userAddr: string, blockNo?: number): Promise<Array<tokenAmountInfo>> {
    const proxyAddr = "0x3d9819210A31b4961b30EF54bE2aeD79B9c9Cd3B";
    const calldata = web3.eth.abi.encodeFunctionCall(ABIassetsIn, [userAddr]);
    const res = await ethCall(proxyAddr, calldata, blockNo !== undefined ? web3.utils.numberToHex(blockNo) : undefined); 
    const decodedRes = web3.eth.abi.decodeParameter(rtnStrAssetsIn, res.data.result);
    const rtnArray = new Array<tokenAmountInfo>();

    for (let cTokenAddr of (decodedRes as string[])) {
      // get Token symbol
      const callSymbol = web3.eth.abi.encodeFunctionCall(ABIsymbol, []);
      const resSymbol = await ethCall(cTokenAddr, callSymbol, blockNo !== undefined ? web3.utils.numberToHex(blockNo) : undefined);
      const tokenSymbol = String(web3.eth.abi.decodeParameter(rtnStrsymbol, resSymbol.data.result));

      // get token Decimal
      const calldecimals = web3.eth.abi.encodeFunctionCall(ABIdemicals, []);
      const resdecimals = await ethCall(cTokenAddr, calldecimals, blockNo !== undefined ? web3.utils.numberToHex(blockNo) : undefined);
      const tokendecimals = Number(web3.eth.abi.decodeParameter(rtnStrdecimals, resdecimals.data.result));
      
      // get Token Amount
      const callbalanceOf = web3.eth.abi.encodeFunctionCall(ABIbalanceOfUnderlying, [userAddr]);
      const resbalanceOf = await ethCall(cTokenAddr, callbalanceOf, blockNo !== undefined ? web3.utils.numberToHex(blockNo) : undefined);
      const decodedbalanceOf = web3.eth.abi.decodeParameters(rtnStrbalanceOfUnderlying, resbalanceOf.data.result);

      // calc tokenAmount applying decimals
      const tokenAmount = (decodedbalanceOf[0] / (10 ** tokendecimals));

      rtnArray.push({tSymbol: tokenSymbol, tAmount: tokenAmount, tDecimals: tokendecimals});
    }
    return rtnArray;
  }
}