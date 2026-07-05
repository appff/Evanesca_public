import { PriceManagerBase } from "./BasePriceManager";
import { web3 } from "../../PreTasks";

export class UniswapPriceManager extends PriceManagerBase {
  private axios = require("axios");
  
  // 주요 토큰들의 WETH 풀 주소들 (실제 운영에서는 더 많은 풀 추가 필요)
  private poolAddresses: { [key: string]: string } = {
    "USDT": "0x0d4a11d5eeaac28ec3f61d100daf4d40471f1852", // USDT/WETH V2
    "USDC": "0xb4e16d0168e52d35cacd2c6185b44281ec28c9dc", // USDC/WETH V2
    "WBTC": "0xbb2b8038a1640196fbe3e38816f3e67cba72d940", // WBTC/WETH V2
    "DAI": "0xa478c2975ab1ea89e8196811f51a7b7ade33eb11",  // DAI/WETH V2
    "LINK": "0xa2107fa5b38d9bbd2c461d6edf11b11a50f6b974", // LINK/WETH V2
  };

  // WETH 주소
  private WETH_ADDRESS = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";

  override async getPrice(tokenSymbol: string, blockNo: number | string): Promise<number> {
    try {
      console.log(`🦄 [Uniswap] Getting price for ${tokenSymbol} at block ${blockNo}`);
      
      const poolAddress = this.poolAddresses[tokenSymbol];
      if (!poolAddress) {
        console.log(`⚠️ [Uniswap] No pool found for ${tokenSymbol}`);
        return 0;
      }

      // WETH 가격 먼저 가져오기 (USDC/WETH 풀 사용)
      const wethPrice = await this.getWETHPrice(blockNo);
      if (wethPrice === 0) {
        console.log(`❌ [Uniswap] Cannot get WETH price`);
        return 0;
      }

      // 토큰/WETH 풀에서 토큰 가격 계산
      const tokenPrice = await this.getTokenPriceFromPool(poolAddress, tokenSymbol, wethPrice, blockNo);
      
      console.log(`✅ [Uniswap] ${tokenSymbol} price: $${tokenPrice} USD`);
      return tokenPrice;
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.log(`❌ [Uniswap] Error: ${errorMessage}`);
      return 0;
    }
  }

  private async getWETHPrice(blockNo: number | string): Promise<number> {
    // USDC/WETH 풀에서 WETH 가격 계산
    const usdcPool = this.poolAddresses["USDC"];
    const usdcReserves = await this.getReserves(usdcPool, blockNo);
    
    if (Number(usdcReserves.reserve0) === 0 || Number(usdcReserves.reserve1) === 0) {
      return 0;
    }

    // USDC는 6 decimals, WETH는 18 decimals
    const usdcAmount = Number(usdcReserves.reserve0) / (10 ** 6);
    const wethAmount = Number(usdcReserves.reserve1) / (10 ** 18);
    
    // WETH 가격 = USDC 수량 / WETH 수량
    return usdcAmount / wethAmount;
  }

  private async getTokenPriceFromPool(poolAddress: string, tokenSymbol: string, wethPrice: number, blockNo: number | string): Promise<number> {
    const reserves = await this.getReserves(poolAddress, blockNo);
    
    if (Number(reserves.reserve0) === 0 || Number(reserves.reserve1) === 0) {
      return 0;
    }

    // 토큰 decimals 결정
    const tokenDecimals = this.getTokenDecimals(tokenSymbol);
    const wethDecimals = 18;

    const tokenAmount = Number(reserves.reserve0) / (10 ** tokenDecimals);
    const wethAmount = Number(reserves.reserve1) / (10 ** wethDecimals);

    // 토큰 가격 = (WETH 수량 * WETH 가격) / 토큰 수량
    const tokenPrice = (wethAmount * wethPrice) / tokenAmount;
    
    return tokenPrice;
  }

  private async getReserves(poolAddress: string, blockNo: number | string): Promise<{reserve0: string, reserve1: string}> {
    try {
      // Uniswap V2 getReserves 함수 호출
      const data = web3.eth.abi.encodeFunctionCall(
        { name: "getReserves", type: "function", inputs: [] }, 
        []
      );

      const response = await web3.eth.call({
        to: poolAddress,
        data: data
      }, web3.utils.numberToHex(blockNo));

      const decoded = web3.eth.abi.decodeParameters(
        ['uint112', 'uint112', 'uint32'],
        response
      );

      return {
        reserve0: decoded[0],
        reserve1: decoded[1]
      };
    } catch (error) {
      console.log(`❌ [Uniswap] Error getting reserves: ${error}`);
      return { reserve0: "0", reserve1: "0" };
    }
  }

  private getTokenDecimals(tokenSymbol: string): number {
    const decimals: { [key: string]: number } = {
      "USDT": 6,
      "USDC": 6,
      "WBTC": 8,
      "DAI": 18,
      "LINK": 18,
      "WETH": 18,
      "ETH": 18
    };
    return decimals[tokenSymbol] || 18; // 기본값 18
  }
} 