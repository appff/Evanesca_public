import { PriceManagerBase } from "./BasePriceManager";
import { ABIaggregatorV3Interface } from "../../ABIDecoder/abis/ChainlinkAggregatorV3ABI";
import { web3 } from "../../PreTasks";
import { CONFIG } from "../../config/constants";

export class EtherscanPriceManager extends PriceManagerBase {
  private axios = require("axios");
  private apiKey = CONFIG.API_KEYS.ETHERSCAN; // Use centralized config
  private baseURL = "https://api.etherscan.io/api";

  override async getPrice(address: string, blockNo: number | string): Promise<number> {
    try {
      console.log(`🔍 [Etherscan] Querying price for ${address} at block ${blockNo}`);
      
      // Chainlink Aggregator의 latestAnswer 함수 호출
      const data = web3.eth.abi.encodeFunctionCall(
        { name: "latestAnswer", type: "function", inputs: [] }, 
        []
      );

      const params = {
        module: "proxy",
        action: "eth_call",
        to: address,
        data: data,
        block: web3.utils.numberToHex(blockNo),
        apikey: this.apiKey
      };

      const response = await this.axios.get(this.baseURL, { params });
      
      if (response.data.error) {
        console.log(`❌ [Etherscan] API error: ${response.data.error.message}`);
        return 0;
      }

      if (response.data.result === "0x") {
        console.log(`⚠️ [Etherscan] No data returned for block ${blockNo}`);
        return 0;
      }

      // 결과 파싱
      const hexValue = response.data.result;
      const decimalValue = web3.utils.hexToNumber(hexValue);
      
      // decimals 가져오기 (8 decimals for most Chainlink feeds)
      const decimals = 8; // USDT/USD는 8 decimals
      const price = Number(decimalValue) / (10 ** decimals);
      
      console.log(`✅ [Etherscan] Price: $${price} USD`);
      return price;
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.log(`❌ [Etherscan] Error: ${errorMessage}`);
      return 0;
    }
  }

  // 무료 API 키로도 사용 가능한 대안 메서드
  async getPriceWithoutKey(address: string, blockNo: number | string): Promise<number> {
    try {
      console.log(`🔍 [Etherscan] Querying price without API key for ${address} at block ${blockNo}`);
      
      const data = web3.eth.abi.encodeFunctionCall(
        { name: "latestAnswer", type: "function", inputs: [] }, 
        []
      );

      const params = {
        module: "proxy",
        action: "eth_call",
        to: address,
        data: data,
        block: web3.utils.numberToHex(blockNo)
        // API 키 없이 요청 (무료 티어)
      };

      const response = await this.axios.get(this.baseURL, { params });
      
      if (response.data.error) {
        console.log(`❌ [Etherscan] API error: ${response.data.error.message}`);
        return 0;
      }

      const hexValue = response.data.result;
      const decimalValue = web3.utils.hexToNumber(hexValue);
      const price = decimalValue / (10 ** 8);
      
      console.log(`✅ [Etherscan] Price without key: $${price} USD`);
      return price;
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.log(`❌ [Etherscan] Error without key: ${errorMessage}`);
      return 0;
    }
  }
} 