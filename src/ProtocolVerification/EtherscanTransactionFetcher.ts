/**
 * EtherscanTransactionFetcher - Fetches real transaction hashes from major DeFi pools using Etherscan API
 * For academic research and verification purposes
 */

import axios from 'axios';

export interface PoolConfig {
  address: string;
  name: string;
  eventSignature?: string;
}

export interface FetchConfig {
  protocol: 'uniswap' | 'curve' | 'balancer' | 'aave';
  count: number;
  startBlock?: number;
  endBlock?: number;
}

export class EtherscanTransactionFetcher {
  private readonly apiKey: string;
  private readonly baseUrl = 'https://api.etherscan.io/api';
  private readonly rateLimitDelay = 200; // 5 calls/sec for free tier
  
  // Event signatures for each protocol
  private readonly eventSignatures = {
    uniswap: {
      swap_v2: '0xd78ad95fa46c994b6551d0da85fc275fe613ce37657fb8d5e3d130840159d822',
      swap_v3: '0xc42079f94a6350d7e6235f29174924f928cc2ac818eb64fed8004e115fbcca67',
      mint_v2: '0x4c209b5fc8ad50758f13e2e1088ba56a560dff690a1c6fef26394f4c03821c4f',
      burn_v2: '0xdccd412f0b1252819cb1fd330b93224ca42612892bb3f4f789976e6d81936496',
      mint_v3: '0x7a53080ba414158be7ec69b987b5fb7d07dee101bff02a3f1235e365f1b96efd',
      burn_v3: '0x0c396cd989a39f4459b5fa1aed6a9a8dcdbc45c6fbd4b2370029e3a2662026b9'
    },
    curve: {
      tokenExchange: '0x8b3e96f2b889fa771c53c981b40daf005f63f637f1869f707052d15a3dd97140',
      tokenExchangeUnderlying: '0xd013ca23e77a65003c2c659c5442c00c805371b7fc1ebd4c206c41d1536bd90b',
      addLiquidity: '0x26f55a85081d24974e85c6c00045d0f0453991e95873f52bff0d21af4079a768',
      removeLiquidity: '0x7c363854ccf79623411f8995b362bce5eddff18c927edc6f5dbbb5e05819a82c'
    },
    balancer: {
      swap: '0x2170c741c41531aec20e7c107c24eecfdd15e69c9bb0a8dd37b1840b9e0b207b',
      poolBalanceChanged: '0xe5ce249087ce04f05a957192435400fd97868dba0e6a4264c0407a8a5398c58e'
    },
    aave: {
      deposit: '0xde6857219544bb5b7746f48ed30be6386fefc61b2f864cacf559893bf50fd951',
      withdraw: '0x3115d1449a7b732c986cba18244e897a450f61e1bb8d589cd2e69e6c8924f9f7',
      borrow: '0xc6a898309e823ee50bac64e45ca8addb6ae6e5e6e62ce2ce7c077b2b123b9bb0',
      repay: '0x4cdde6e09bb755c9a5589ebaec640bbfedff1362d4b255ebf8339782b9942faa',
      flashLoan: '0x631042c832b07452973831137f2d73e395028b44b250dedc5abb0ee766e168ac'
    }
  };

  // Major pools for each protocol - Balanced mix of V2 and V3 for Uniswap
  private readonly pools = {
    uniswap: [
      // Uniswap V2 pools (most liquid pairs)
      { address: '0xb4e16d0168e52d35cacd2c6185b44281ec28c9dc', name: 'USDC/WETH V2' },
      { address: '0x0d4a11d5eeaac28ec3f61d100daf4d40471f1852', name: 'WETH/USDT V2' },
      { address: '0xa478c2975ab1ea89e8196811f51a7b7ade33eb11', name: 'DAI/WETH V2' },
      { address: '0xbb2b8038a1640196fbe3e38816f3e67cba72d940', name: 'WBTC/WETH V2' },
      { address: '0xd3d2e2692501a5c9ca623199d38826e513033a17', name: 'UNI/WETH V2' },
      // Uniswap V3 pools (top liquidity)
      { address: '0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640', name: 'USDC/ETH V3 0.05%' },
      { address: '0x8ad599c3a0ff1de082011efddc58f1908eb6e6d8', name: 'USDC/ETH V3 0.3%' },
      { address: '0x5777d92f208679db4b9778590fa3cab3ac9e2168', name: 'DAI/USDC V3 0.01%' }
    ],
    curve: [
      { address: '0xbEbc44782C7dB0a1A60Cb6fe97d0b483032FF1C7', name: '3pool (DAI/USDC/USDT)' },
      { address: '0xDC24316b9AE028F1497c275EB9192a3Ea0f67022', name: 'stETH/ETH' },
      { address: '0xa1F8A6807c402E4A15ef4EBa36528A3FED24E577', name: 'frxETH/ETH' },
      { address: '0xD51a44d3FaE010294C616388b506AcdA1bfAAE46', name: 'Tricrypto2' },
      { address: '0x828b154032950C8ff7CF8085D841723Db2696056', name: 'stETH concentrated' }
    ],
    balancer: [
      { address: '0x5c6Ee304399DBdB9C8Ef030aB642B10820DB8F56', name: 'BAL/WETH 80/20' },
      { address: '0x96646936b91d6B9D7D0c47C496AfBF3D6ec7B6f8', name: 'WETH/USDC 50/50' },
      { address: '0x32296969Ef14EB0c6d29669C550D4a0449130230', name: 'wstETH/WETH' },
      { address: '0xcfca23ca9ca720b6e98e3eb9b6aa0ffc4a5c08b9', name: 'wstETH/USDC/wETH' }
    ],
    aave: [
      { address: '0x7d2768dE32b0b80b7a3454c06BdAc94A69DDc7A9', name: 'Aave V2 LendingPool' },
      { address: '0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2', name: 'Aave V3 Pool' },
      { address: '0x7937D4799803FbBe595ed57278Bc4cA21f3bFfCB', name: 'Aave V2 USDT' },
      { address: '0xBcca60bB61934080951369a648Fb03DF4F96263C', name: 'Aave V2 USDC' }
    ]
  };

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.ETHERSCAN_API_KEY || '';
  }

  /**
   * Fetch transaction hashes from Etherscan for a specific pool
   */
  private async fetchLogsForPool(
    poolAddress: string,
    eventSignature: string,
    startBlock: number,
    endBlock: number
  ): Promise<string[]> {
    const url = `${this.baseUrl}?module=logs&action=getLogs` +
      `&address=${poolAddress}` +
      `&topic0=${eventSignature}` +
      `&fromBlock=${startBlock}` +
      `&toBlock=${endBlock}` +
      `&apikey=${this.apiKey}`;

    try {
      const response = await axios.get(url);
      const data: any = response.data;
      
      if (data.status === '1' && data.result) {
        // Extract unique transaction hashes
        const txHashes = [...new Set(data.result.map((log: any) => log.transactionHash))] as string[];
        return txHashes;
      } else if (data.status === '0' && data.message === 'No records found') {
        return [];
      } else {
        console.error(`Etherscan API error: ${data.message}`);
        return [];
      }
    } catch (error) {
      console.error(`Error fetching logs for pool ${poolAddress}:`, error);
      return [];
    }
  }

  /**
   * Fetch transactions for a protocol with batch processing
   */
  public async fetchTransactions(config: FetchConfig): Promise<string[]> {
    const { protocol, count, startBlock = 17000000, endBlock = 18900000 } = config;
    
    console.log(`[ETHERSCAN] Fetching ${count} transactions for ${protocol}...`);
    
    const protocolPools = this.pools[protocol];
    const protocolSignatures = this.eventSignatures[protocol];
    
    if (!protocolPools || !protocolSignatures) {
      throw new Error(`Unknown protocol: ${protocol}`);
    }

    const allTxHashes = new Set<string>();
    const batchSize = 1000; // Etherscan limit per query
    
    // Get appropriate event signatures based on protocol
    let eventSigs: string[] = [];
    switch (protocol) {
      case 'uniswap': {
        eventSigs = [this.eventSignatures.uniswap.swap_v2, this.eventSignatures.uniswap.swap_v3];
        break;
      }
      case 'curve': {
        eventSigs = [this.eventSignatures.curve.tokenExchange, this.eventSignatures.curve.tokenExchangeUnderlying];
        break;
      }
      case 'balancer': {
        eventSigs = [this.eventSignatures.balancer.swap];
        break;
      }
      case 'aave': {
        eventSigs = [this.eventSignatures.aave.deposit, this.eventSignatures.aave.borrow, this.eventSignatures.aave.withdraw];
        break;
      }
    }

    // Iterate through pools and event signatures
    for (const pool of protocolPools) {
      for (const eventSig of eventSigs) {
        // Skip V3 events for V2 pools and vice versa
        const uniswapSigs = this.eventSignatures.uniswap;
        if (protocol === 'uniswap') {
          if (pool.name.includes('V2') && eventSig === uniswapSigs.swap_v3) continue;
          if (pool.name.includes('V3') && eventSig === uniswapSigs.swap_v2) continue;
        }
        
        // Process in batches to respect block range limits
        for (let blockStart = startBlock; blockStart <= endBlock; blockStart += batchSize * 100) {
          const blockEnd = Math.min(blockStart + batchSize * 100 - 1, endBlock);
          
          console.log(`[ETHERSCAN] Fetching ${pool.name} events (blocks ${blockStart}-${blockEnd})...`);
          
          const txHashes = await this.fetchLogsForPool(
            pool.address,
            eventSig,
            blockStart,
            blockEnd
          );
          
          txHashes.forEach(hash => allTxHashes.add(hash));
          
          // Stop if we have enough transactions
          if (allTxHashes.size >= count) {
            break;
          }
          
          // Rate limiting
          await new Promise(resolve => setTimeout(resolve, this.rateLimitDelay));
        }
        
        if (allTxHashes.size >= count) {
          break;
        }
      }
      
      if (allTxHashes.size >= count) {
        break;
      }
    }
    
    console.log(`[ETHERSCAN] Found ${allTxHashes.size} unique transactions for ${protocol}`);
    
    // Return requested number of transactions
    return Array.from(allTxHashes).slice(0, count);
  }

  /**
   * Fetch transactions for all protocols
   */
  public async fetchAllProtocols(
    txPerProtocol: number = 2000
  ): Promise<Map<string, string[]>> {
    const results = new Map<string, string[]>();
    const protocols: FetchConfig['protocol'][] = ['uniswap', 'curve', 'balancer', 'aave'];
    
    for (const protocol of protocols) {
      const txHashes = await this.fetchTransactions({
        protocol,
        count: txPerProtocol,
        startBlock: 17000000, // 2023 data
        endBlock: 18900000    // Early 2024 data
      });
      
      results.set(protocol, txHashes);
      
      // Rate limiting between protocols
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    return results;
  }

  /**
   * Save fetched transactions to JSON files
   */
  public static saveTransactions(
    transactions: Map<string, string[]>,
    outputDir: string
  ): void {
    const fs = require('fs');
    const path = require('path');
    
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    transactions.forEach((txHashes, protocol) => {
      const filePath = path.join(outputDir, `${protocol}-transactions.json`);
      fs.writeFileSync(filePath, JSON.stringify(txHashes, null, 2));
      console.log(`[ETHERSCAN] Saved ${txHashes.length} transactions for ${protocol} to ${filePath}`);
    });
  }
}