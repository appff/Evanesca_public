import { PriceManagerBase } from "./BasePriceManager";

export class OneInchPriceManager extends PriceManagerBase {
  private axios = require("axios");
  private baseURL = "https://api.1inch.dev/price/v1.1";

  override async getPrice(tokenSymbol: string, blockNo: number | string): Promise<number> {
    try {
      console.log(`🔗 [1inch] Getting price for ${tokenSymbol} at block ${blockNo}`);
      
      // 토큰 주소 매핑 (실제 운영에서는 더 많은 토큰 추가)
      const tokenAddress = this.getTokenAddress(tokenSymbol);
      if (!tokenAddress) {
        console.log(`⚠️ [1inch] No address found for ${tokenSymbol}`);
        return 0;
      }

      const params = {
        tokenAddress: tokenAddress,
        chainId: 1, // Ethereum mainnet
        blockNumber: blockNo
      };

      const response = await this.axios.get(this.baseURL, { 
        params,
        headers: {
          'Authorization': 'Bearer YOUR_API_KEY', // 1inch API 키 필요
          'Accept': 'application/json'
        }
      });

      if (response.data && response.data.price) {
        const price = response.data.price;
        console.log(`✅ [1inch] ${tokenSymbol} price: $${price} USD`);
        return price;
      }

      return 0;
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.log(`❌ [1inch] Error: ${errorMessage}`);
      return 0;
    }
  }

  private getTokenAddress(symbol: string): string {
    const addresses: { [key: string]: string } = {
      "USDT": "0xdAC17F958D2ee523a2206206994597C13D831ec7",
      "USDC": "0xA0b86a33E6441b8C4C8C8C8C8C8C8C8C8C8C8C8C8",
      "WBTC": "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599",
      "DAI": "0x6B175474E89094C44Da98b954EedeAC495271d0F",
      "LINK": "0x514910771AF9Ca656af840dff83E8264EcF986CA",
      "WETH": "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"
    };
    return addresses[symbol] || "";
  }
} 