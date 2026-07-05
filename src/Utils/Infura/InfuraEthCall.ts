import axios from "axios";
import { providerManager } from "../../PreTasks";

export async function ethCall(to: string, data: string, blockNo?: string) {
  const headers = { "Content-Type": "application/json" };
  const APIData = {
    "method": "eth_call", "id": 1, "jsonrpc": "2.0",
    "params": [{ "to": to, "data": data }, blockNo !== undefined ? blockNo : "latest"]
  };
  
  // Use the Web3 provider manager's executeWithFailover for reliability
  return await providerManager.executeWithFailover(async (web3) => {
    // Get the provider URL from the web3 instance
    const provider = web3.currentProvider as any;
    const providerUrl = provider.host || provider.url || provider.connection?.url;
    
    if (!providerUrl) {
      throw new Error('Unable to determine provider URL from Web3 instance');
    }
    
    return axios.post(providerUrl, APIData, { headers });
  }, 'ethCall', { chainId: 1 });
}
