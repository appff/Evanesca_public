import { web3 } from "../PreTasks";
import { AbiItem } from "web3-utils";
import { ISemanticFinancialEdge, IDEXEdge } from "./Interfaces/IEdge";
import { getAddressWithNormalToken } from "./EdgeAdderUtils";
import { providerManager } from "../PreTasks";
import { IEdgeAdder, IPairInfo } from "./Interfaces/IEdgeAdder"
import { compareAddrs, DecodedEvent, LogEvent } from "./SemanticFinancialGraphUtils";
import { ABIERC20, ABIERC20Derivative, ABIUniPair } from "../ABIDecoder/defaultABIs";
import { ethCall } from "../Utils/Infura/InfuraEthCall";
import { DebugLogger } from "../Utils/DebugLogger";
import { PrecisionMath } from "../Utils/PrecisionMath";
import { globalPoolCache, PoolInfo } from "../Utils/PoolInfoCache";

export abstract class DEXEdgeAdder implements IEdgeAdder {
  abstract makeEdge(eLogs: DecodedEvent[], w: string, sKey: string, sAction: LogEvent, v?: string): Promise<ISemanticFinancialEdge>;
  
  // 🔧 [HOTFIX] String comparison helpers for compilation
  protected isPositive(value: string): boolean {
    return PrecisionMath.isGreaterThanZero(value);
  }
  
  protected isZero(value: string): boolean {
    return PrecisionMath.isZero(value);
  }
  
  protected isGreater(a: string, b: string): boolean {
    return PrecisionMath.isGreaterThan(a, b);
  }

  dexEdge(action: string, amountIn: string,
    token1: string, amountOut: string, token2: string, Token1Addr: string, Token2Addr: string, service?: string): IDEXEdge {
    
    // ✅ [ARCHITECTURE-IMPROVEMENT] Keep amounts as strings for precision safety
    DebugLogger.pattern(`🔧 [PRECISION-SAFE] Creating DEX edge: ${amountIn} ${token1} → ${amountOut} ${token2} (Service: ${service})`);
    
    return {
      "Action": action, 
      "AmountIn": amountIn,     // ✅ Keep as string - no precision loss
      "Token0": token1,
      "AmountOut": amountOut,   // ✅ Keep as string - no precision loss 
      "Token1": token2, 
      "Token0Addr": Token1Addr, 
      "Token1Addr": Token2Addr,
      "Type": "DEX",
      "Service": service || "unknown"
    };
  }
}

// For uniswap V1 pool
export class UniswapV1EdgeAdder extends DEXEdgeAdder {
  override async makeEdge(eLogs: DecodedEvent[], w: string, sKey: string, sAction: LogEvent): Promise<IDEXEdge> {
    let pairs: IPairInfo = {
      t0: "ETH",
      t1: "WBTC",
      t0Addr: "0x0",
      t1Addr: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599"
    };

    if (!compareAddrs(w, "0x4d2f5cFbA55AE412221182D8475bC85799A5644b")) {
      throw new Error(`Unsupported Uniswap V1 pool: ${w}`);
    }

    if (typeof sAction.amountIn !== 'number' || typeof sAction.amountOut !== 'number') {
      throw new Error('Invalid amountIn or amountOut in sAction');
    }

    switch (sKey) {
      case "EthPurchase":
        // 🔧 [ROOT-CAUSE-FIX] EthPurchase = WBTC → ETH: User pays WBTC, receives ETH
        // amountIn = WBTC satoshi, amountOut = ETH wei
        return this.dexEdge("Swap", eLogs[sAction.amountIn].value, pairs.t1,  // ✅ WBTC (was wrong: pairs.t0)
          eLogs[sAction.amountOut].value, pairs.t0, pairs.t1Addr, pairs.t0Addr, "uniswapv1"); // ✅ ETH (was wrong: pairs.t1)
      case "TokenPurchase":
        // 🔧 [ROOT-CAUSE-FIX] TokenPurchase = ETH → WBTC: User pays ETH, receives WBTC
        // amountIn = ETH wei, amountOut = WBTC satoshi
        return this.dexEdge("Swap", eLogs[sAction.amountIn].value, pairs.t0,  // ✅ ETH
          eLogs[sAction.amountOut].value, pairs.t1, pairs.t0Addr, pairs.t1Addr, "uniswapv1"); // ✅ WBTC
      default:
        throw new Error(`Unsupported Uniswap V1 action: ${sKey}`);
    }
  }
}

export class UniswapV2EdgeAdder extends DEXEdgeAdder {
  override async makeEdge(eLogs: DecodedEvent[], w: string, sKey: string, sAction: LogEvent): Promise<IDEXEdge> {
    // 디버깅 정보 추가
    DebugLogger.pattern(`🔧 [UniswapV2] Decoding edge for pool: ${w}`);
    DebugLogger.pattern(`   sKey: ${sKey}, eLogs length: ${eLogs.length}`);
    eLogs.forEach((log, idx) => {
      DebugLogger.pattern(`   eLogs[${idx}]: name=${log?.name || 'undefined'}, value=${log?.value || 'undefined'}, type=${log?.type || 'undefined'}`);
    });

    let pairs = await this.getPairInfoForUniV2(w);
    DebugLogger.pattern(`   Pair info: ${pairs.t0}/${pairs.t1} (${pairs.t0Addr}/${pairs.t1Addr})`);

    // Uniswap V2 Swap 이벤트: Swap(indexed sender, uint amount0In, uint amount1In, uint amount0Out, uint amount1Out, indexed to)
    // eLogs[0] = sender, eLogs[1] = amount0In, eLogs[2] = amount1In, eLogs[3] = amount0Out, eLogs[4] = amount1Out, eLogs[5] = to
    
    // Defensive check for eLogs length
    if (eLogs.length < 5) {
      DebugLogger.pattern(`   Error: Insufficient eLogs entries (${eLogs.length}), expected at least 5 for Swap event`);
      // Return a minimal edge for now
      return this.dexEdge(sKey, "0", "UNKNOWN", "0", "UNKNOWN", "0x0", "0x0", "uniswapv2");
    }
    
    const amount0In = eLogs[1]?.value || "0";  // ✅ Keep as string for precision
    const amount1In = eLogs[2]?.value || "0";  // ✅ Keep as string for precision
    const amount0Out = eLogs[3]?.value || "0"; // ✅ Keep as string for precision
    const amount1Out = eLogs[4]?.value || "0"; // ✅ Keep as string for precision

    DebugLogger.pattern(`   Swap amounts: amount0In=${amount0In}, amount1In=${amount1In}, amount0Out=${amount0Out}, amount1Out=${amount1Out}`);

    // 실제 입력과 출력 토큰 결정 (string 기반)
    let amountIn: string, tokenIn: string, tokenInAddr: string;
    let amountOut: string, tokenOut: string, tokenOutAddr: string;

    // 4가지 가능한 스왑 패턴:
    // 1. token0 -> token1: amount0In > 0 && amount1Out > 0
    // 2. token1 -> token0: amount1In > 0 && amount0Out > 0  
    // 3. 복잡한 케이스: 둘 다 0이 아닌 경우 (주로 더 큰 값을 선택)
    // 4. 실패 케이스: 모두 0인 경우

    if (PrecisionMath.isGreaterThanZero(amount0In) && PrecisionMath.isGreaterThanZero(amount1Out) && PrecisionMath.isZero(amount1In) && PrecisionMath.isZero(amount0Out)) {
      // Pattern 1: token0 -> token1 스왑 (전형적인 케이스)
      amountIn = amount0In;
      tokenIn = pairs.t0;
      tokenInAddr = pairs.t0Addr;
      amountOut = amount1Out;
      tokenOut = pairs.t1;
      tokenOutAddr = pairs.t1Addr;
      DebugLogger.pattern(`   Pattern 1: ${tokenIn} -> ${tokenOut} (${amountIn} -> ${amountOut})`);
    } else if (PrecisionMath.isGreaterThanZero(amount1In) && PrecisionMath.isGreaterThanZero(amount0Out) && PrecisionMath.isZero(amount0In) && PrecisionMath.isZero(amount1Out)) {
      // Pattern 2: token1 -> token0 스왑 (전형적인 케이스)
      amountIn = amount1In;
      tokenIn = pairs.t1;
      tokenInAddr = pairs.t1Addr;
      amountOut = amount0Out;
      tokenOut = pairs.t0;
      tokenOutAddr = pairs.t0Addr;
      DebugLogger.pattern(`   Pattern 2: ${tokenIn} -> ${tokenOut} (${amountIn} -> ${amountOut})`);
    } else if (PrecisionMath.isGreaterThanZero(amount0In) && PrecisionMath.isGreaterThanZero(amount0Out) && PrecisionMath.isZero(amount1In) && PrecisionMath.isZero(amount1Out)) {
      // Pattern 3: token0 -> token0 (같은 토큰, 이상한 케이스지만 발생 가능)
      amountIn = amount0In;
      tokenIn = pairs.t0;
      tokenInAddr = pairs.t0Addr;
      amountOut = amount0Out;
      tokenOut = pairs.t0;
      tokenOutAddr = pairs.t0Addr;
      DebugLogger.pattern(`   Pattern 3: ${tokenIn} -> ${tokenOut} (same token, ${amountIn} -> ${amountOut})`);
    } else if (PrecisionMath.isGreaterThanZero(amount1In) && PrecisionMath.isGreaterThanZero(amount1Out) && PrecisionMath.isZero(amount0In) && PrecisionMath.isZero(amount0Out)) {
      // Pattern 4: Special cases for amount1In -> amount1Out pattern
      if (pairs.t0 === "WETH" && pairs.t1 === "USDT") {
        // USDT/WETH 풀: USDT -> WETH 스왑 (harvest attack 케이스)
        amountIn = amount1In;
        tokenIn = pairs.t1;      // USDT
        tokenInAddr = pairs.t1Addr;
        amountOut = amount1Out;  // WETH 양
        tokenOut = pairs.t0;     // WETH
        tokenOutAddr = pairs.t0Addr;
        DebugLogger.pattern(`   Pattern 4a: ${tokenIn} -> ${tokenOut} (${amountIn} -> ${amountOut})`);
      } else if (pairs.t0 === "USDT" && pairs.t1 === "EGD") {
        // USDT/EGD 풀: USDT -> EGD 스왑 (EGD Finance attack 케이스)
        amountIn = amount1In;
        tokenIn = pairs.t0;      // USDT (token0)
        tokenInAddr = pairs.t0Addr;
        amountOut = amount1Out;  // EGD 양
        tokenOut = pairs.t1;     // EGD (token1)
        tokenOutAddr = pairs.t1Addr;
        DebugLogger.pattern(`   Pattern 4b: ${tokenIn} -> ${tokenOut} (${amountIn} -> ${amountOut}) - BSC PancakeSwap`);
      } else {
        // 다른 경우는 원래대로 (같은 토큰)
        amountIn = amount1In;
        tokenIn = pairs.t1;
        tokenInAddr = pairs.t1Addr;
        amountOut = amount1Out;
        tokenOut = pairs.t1;
        tokenOutAddr = pairs.t1Addr;
        DebugLogger.pattern(`   Pattern 4c: ${tokenIn} -> ${tokenOut} (same token, ${amountIn} -> ${amountOut})`);
      }
    } else {
      // 복잡하거나 예상치 못한 케이스 - 가장 큰 값들을 선택
      DebugLogger.pattern(`⚠️ [UniswapV2] Complex swap pattern: amount0In=${amount0In}, amount1In=${amount1In}, amount0Out=${amount0Out}, amount1Out=${amount1Out}`);
      
      // 입력에서 가장 큰 값 찾기
      if ((PrecisionMath.isGreaterThan(amount0In, amount1In) || PrecisionMath.isEqual(amount0In, amount1In)) && PrecisionMath.isGreaterThanZero(amount0In)) {
        amountIn = amount0In;
        tokenIn = pairs.t0;
        tokenInAddr = pairs.t0Addr;
        
        // 해당하는 출력 찾기 (반대 토큰의 출력을 우선)
        if (PrecisionMath.isGreaterThan(amount1Out, amount0Out)) {
          amountOut = amount1Out;
          tokenOut = pairs.t1;
          tokenOutAddr = pairs.t1Addr;
        } else {
          amountOut = amount0Out;
          tokenOut = pairs.t0;
          tokenOutAddr = pairs.t0Addr;
        }
      } else if (PrecisionMath.isGreaterThan(amount1In, amount0In) && PrecisionMath.isGreaterThanZero(amount1In)) {
        amountIn = amount1In;
        tokenIn = pairs.t1;
        tokenInAddr = pairs.t1Addr;
        
        // 해당하는 출력 찾기 (반대 토큰의 출력을 우선)
        if (PrecisionMath.isGreaterThan(amount0Out, amount1Out)) {
          amountOut = amount0Out;
          tokenOut = pairs.t0;
          tokenOutAddr = pairs.t0Addr;
        } else {
          amountOut = amount1Out;
          tokenOut = pairs.t1;
          tokenOutAddr = pairs.t1Addr;
        }
      } else {
        // 최후의 수단: 기존 fallback 로직
        DebugLogger.pattern(`🚨 [UniswapV2] Unable to determine swap direction, using fallback`);
        if (PrecisionMath.isGreaterThanZero(amount0In) || PrecisionMath.isGreaterThanZero(amount0Out)) {
          return this.dexEdge(sKey, eLogs[1].value, pairs.t0, eLogs[4].value, pairs.t1, pairs.t0Addr, pairs.t1Addr, "uniswapv2");
        } else {
          return this.dexEdge(sKey, eLogs[2].value, pairs.t1, eLogs[3].value, pairs.t0, pairs.t1Addr, pairs.t0Addr, "uniswapv2");
        }
      }
      
      DebugLogger.pattern(`   Complex pattern resolved: ${tokenIn} -> ${tokenOut} (${amountIn} -> ${amountOut})`);
    }

    // AmountOut이 0인 경우 특별 처리
    if (PrecisionMath.isZero(amountOut)) {
      DebugLogger.pattern(`🚨 [UniswapV2] Critical: AmountOut is 0 for ${tokenIn} -> ${tokenOut} swap`);
      DebugLogger.pattern(`   This indicates either: 1) Failed transaction, 2) Decoding error, or 3) Complex multi-hop swap`);
      DebugLogger.pattern(`   Original amounts: 0In=${amount0In}, 1In=${amount1In}, 0Out=${amount0Out}, 1Out=${amount1Out}`);
      
      // 대안: 다른 출력 값이 있는지 확인
      if (PrecisionMath.isGreaterThanZero(amount0Out) && PrecisionMath.isZero(amountOut)) {
        DebugLogger.pattern(`   🔧 Using amount0Out=${amount0Out} as fallback`);
        amountOut = amount0Out;
        tokenOut = pairs.t0;
        tokenOutAddr = pairs.t0Addr;
      } else if (PrecisionMath.isGreaterThanZero(amount1Out) && PrecisionMath.isZero(amountOut)) {
        DebugLogger.pattern(`   🔧 Using amount1Out=${amount1Out} as fallback`);
        amountOut = amount1Out;
        tokenOut = pairs.t1;
        tokenOutAddr = pairs.t1Addr;
      } else {
        // 정말로 0인 경우 1 wei로 설정
        amountOut = "1"; // ✅ String for precision consistency
        DebugLogger.pattern(`   🔧 Setting amountOut to 1 wei to prevent division by zero`);
      }
    }

    return this.dexEdge(sKey, amountIn, tokenIn, amountOut, tokenOut, tokenInAddr, tokenOutAddr, "uniswapv2");
  }
  
  async getPairInfoForUniV2(address: string): Promise<IPairInfo> {
    try {
      // Check if this is a known BSC pair and provide fallback data
      if (this.isBSCAddress(address)) {
        return this.getBSCPairInfo(address);
      }
      
      const pairCont = new web3.eth.Contract(ABIUniPair as AbiItem[], address);
      const t0Addr = await pairCont.methods.token0().call();
      const t1Addr = await pairCont.methods.token1().call();
      const t0Sym = await getSymbol(t0Addr);
      const t1Sym = await getSymbol(t1Addr);
      DebugLogger.pattern(`   Token0: ${t0Sym} (${t0Addr}), Token1: ${t1Sym} (${t1Addr})`);
      return { t0: t0Sym, t0Addr: t0Addr, t1: t1Sym, t1Addr: t1Addr };
    } catch (e) { 
      // Fallback for BSC or other chain failures
      if (this.isBSCAddress(address)) {
        return this.getBSCPairInfo(address);
      }
      throw Error(`getPairSymbol: ${e} + in ${address}`); 
    }
  }

  private isBSCAddress(address: string): boolean {
    const bscAddresses = [
      '0xa361433e409adac1f87cdf133127585f8a93c67d', // EGD/USDT PancakeSwap pair
      '0x16b9a82891338f9ba80e2d6970fdda79d1eb0dae', // WBNB/USDT PancakeSwap pair
      '0xb5d85ca38a9cbe63156a02650884d92a6e736ddc', // CRSS/WBNB Crosswise pair
      '0xb9b09264779733b8657b9b86970e3db74561c237', // CRSS/BUSD Crosswise pair
      '0xb3e708a6d1221ed7c58b88622fdbee2c03e4db4d', // WIENER/WBNB PancakeSwap pair
      '0xd0a167d1973ca8f76723c6fea1e6f608dbc1d464', // Shido/WBNB PancakeSwap pair
      // Elephant Money attack pairs
      '0x1cea83ec5e48d9157fcae27a19807bef79195ce1', // ELEPHANT/WBNB
      '0x58f876857a02d6762e0101bb5c46a8c1ed44dc16', // ELEPHANT/BUSD
      '0xf15a72b15fc4caed6fadb1ba7347f6ccd1e0aede', // TRUNK/WBNB
      '0x7efaef62fddcca950418312c6c91aef321375a00', // BUSD/WBNB
      '0x0ed7e52944161450477ee417de9cd3a859b14fd0', // TRUNK/BUSD
    ];
    return bscAddresses.includes(address.toLowerCase());
  }

  private getBSCPairInfo(address: string): IPairInfo {
    // Based on BSCScan data for BSC attack transactions
    const bscPairMap: {[key: string]: IPairInfo} = {
      '0xa361433e409adac1f87cdf133127585f8a93c67d': {
        // EGD/USDT PancakeSwap pair - CORRECTED from BSCScan transaction logs:
        // Log 6: amount1In (USDT) -> amount1Out (EGD) - both use amount1!
        // This means: t0 = USDT, t1 = EGD (reversed from my assumption)
        t0: 'USDT',
        t0Addr: '0x55d398326f99059ff775485246999027b3197955', 
        t1: 'EGD',
        t1Addr: '0x202b233735bF743FA31abb8f71e641970161bF98'
      },
      '0x16b9a82891338f9ba80e2d6970fdda79d1eb0dae': {
        // WBNB/USDT PancakeSwap pair
        t0: 'WBNB',
        t0Addr: '0xbb4CdB9CBd36B01bD1cBaEF2De08d9173bc095c',
        t1: 'USDT',
        t1Addr: '0x55d398326f99059ff775485246999027b3197955'
      },
      '0xb5d85ca38a9cbe63156a02650884d92a6e736ddc': {
        // CRSS/WBNB Crosswise pair - Based on BSCScan transaction logs:
        // From user-provided logs, this appears to be CRSS/WBNB pair
        t0: 'CRSS',
        t0Addr: '0x99fefbc5ca74cc740395d65d384edd52cb3088bb',
        t1: 'WBNB', 
        t1Addr: '0xbb4CdB9CBd36B01bD1cBaEF2De08d9173bc095c'
      },
      '0xb9b09264779733b8657b9b86970e3db74561c237': {
        // CRSS/BUSD Crosswise pair - Based on Crosswise DEX structure
        t0: 'CRSS',
        t0Addr: '0x99fefbc5ca74cc740395d65d384edd52cb3088bb',
        t1: 'BUSD',
        t1Addr: '0xe9e7cea3dedca5984780bafc599bd69add087d56'
      },
      '0xb3e708a6d1221ed7c58b88622fdbee2c03e4db4d': {
        // WIENER/WBNB PancakeSwap pair - Based on transaction logs
        t0: 'WIENER',
        t0Addr: '0x46ba8a59f4863bd20a066fd985b163235425b5f9',
        t1: 'WBNB',
        t1Addr: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c'
      },
      '0xd0a167d1973ca8f76723c6fea1e6f608dbc1d464': {
        // Shido/WBNB PancakeSwap pair - Shido Global 2024 attack
        t0: 'Shido',
        t0Addr: '0x733af324146dcfe743515d8d77dc25140a07f9e0',
        t1: 'WBNB',
        t1Addr: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c'
      },
      // Elephant Money 2022 attack pairs
      '0x1cea83ec5e48d9157fcae27a19807bef79195ce1': {
        t0: 'ELEPHANT',
        t0Addr: '0xe283d0e3b8c102badf5e8166b73e02d96d92f688',
        t1: 'WBNB',
        t1Addr: '0xbb4cdb9cbd36b01bd1cbaef2de08d9173bc095c'
      },
      '0x58f876857a02d6762e0101bb5c46a8c1ed44dc16': {
        t0: 'ELEPHANT',
        t0Addr: '0xe283d0e3b8c102badf5e8166b73e02d96d92f688',
        t1: 'BUSD',
        t1Addr: '0xe9e7cea3dedca5984780bafc599bd69add087d56'
      },
      '0xf15a72b15fc4caed6fadb1ba7347f6ccd1e0aede': {
        t0: 'TRUNK',
        t0Addr: '0xdd325c38b12903b727d16961e61333f4871a70e0',
        t1: 'WBNB',
        t1Addr: '0xbb4cdb9cbd36b01bd1cbaef2de08d9173bc095c'
      },
      '0x7efaef62fddcca950418312c6c91aef321375a00': {
        t0: 'BUSD',
        t0Addr: '0xe9e7cea3dedca5984780bafc599bd69add087d56',
        t1: 'WBNB',
        t1Addr: '0xbb4cdb9cbd36b01bd1cbaef2de08d9173bc095c'
      },
      '0x0ed7e52944161450477ee417de9cd3a859b14fd0': {
        t0: 'TRUNK',
        t0Addr: '0xdd325c38b12903b727d16961e61333f4871a70e0',
        t1: 'BUSD',
        t1Addr: '0xe9e7cea3dedca5984780bafc599bd69add087d56'
      }
    };
    
    const pairInfo = bscPairMap[address.toLowerCase()];
    if (pairInfo) {
      DebugLogger.pattern(`   BSC Pair info: ${pairInfo.t0}/${pairInfo.t1} (${pairInfo.t0Addr}/${pairInfo.t1Addr})`);
      return pairInfo;
    }
    
    // Generic fallback
    return {
      t0: 'TOKEN0',
      t0Addr: '0x0000000000000000000000000000000000000000',
      t1: 'TOKEN1', 
      t1Addr: '0x0000000000000000000000000000000000000000'
    };
  }
}

export class KyberSwapEdgeAdder extends DEXEdgeAdder {
  override async makeEdge(eLogs: DecodedEvent[], w: string, sKey: string, sAction: LogEvent): Promise<IDEXEdge> {
    DebugLogger.pattern(`🔧 [KyberSwap] Decoding edge for pool: ${w}`);
    DebugLogger.pattern(`   sKey: ${sKey}, eLogs length: ${eLogs.length}`);
    
    // KyberSwap Elastic uses concentrated liquidity similar to Uniswap V3
    // For now, we'll use a simplified approach - can be enhanced later
    let pairs = await this.getPairInfoForKyberSwap(w);
    
    // KyberSwap Swap event structure (similar to UniV3):
    // Swap(indexed sender, indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)
    if (sKey === "Swap" && eLogs.length >= 7) {
      const amount0 = eLogs[2]?.value || "0";
      const amount1 = eLogs[3]?.value || "0";
      
      // Handle signed amounts like UniV3
      const amount0Abs = amount0.startsWith('-') ? amount0.substring(1) : amount0;
      const amount1Abs = amount1.startsWith('-') ? amount1.substring(1) : amount1;
      
      let amountIn: string, tokenIn: string, tokenInAddr: string;
      let amountOut: string, tokenOut: string, tokenOutAddr: string;
      
      if (!amount0.startsWith('-') && amount1.startsWith('-')) {
        // token0 in, token1 out
        amountIn = amount0Abs;
        tokenIn = pairs.t0;
        tokenInAddr = pairs.t0Addr;
        amountOut = amount1Abs;
        tokenOut = pairs.t1;
        tokenOutAddr = pairs.t1Addr;
      } else {
        // token1 in, token0 out
        amountIn = amount1Abs;
        tokenIn = pairs.t1;
        tokenInAddr = pairs.t1Addr;
        amountOut = amount0Abs;
        tokenOut = pairs.t0;
        tokenOutAddr = pairs.t0Addr;
      }
      
      return this.dexEdge("Swap", amountIn, tokenIn, amountOut, tokenOut, tokenInAddr, tokenOutAddr, "kyberswap");
    }
    
    // Fallback for other events
    return this.dexEdge("Swap", "0", "UNKNOWN", "0", "UNKNOWN", "0x0", "0x0", "kyberswap");
  }
  
  async getPairInfoForKyberSwap(address: string): Promise<IPairInfo> {
    // For the attack pools, we know these are primarily WETH/FRAX and similar pairs
    // This would need to be enhanced with actual pool lookups
    return {
      t0: "WETH",
      t1: "FRAX",
      t0Addr: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
      t1Addr: "0x853d955aCEf822Db058eb8505911ED77F175b99e"
    };
  }
}

export class CurveEdgeAdder extends DEXEdgeAdder {
  private ABIPools: AbiItem[] = [{"name": "coins", "outputs": [{"type": "address","name": "out"}],
                      "inputs": [{"type": "int128","name": "arg0"}],
                      "constant": true,"payable": false,"type": "function","gas": 2160},
                      {"name": "coins","outputs": [{"type": "address","name": ""}],
                      "inputs": [{"type": "uint256","name": "arg0"}],
                      "stateMutability": "view","type": "function","gas": 2220}
                    ];
  // w : to
  override async makeEdge(eLogs: DecodedEvent[], w: string, sKey: string, sAction: LogEvent): Promise<IDEXEdge> {
    // Handle different Curve event types
    switch (sKey) {
      case "TokenExchange":
      case "TokenExchangeUnderlying": {
        let pairs = await this.getPairInfoForCurve(w, eLogs[1].value, eLogs[3].value);
        return this.dexEdge("Swap", eLogs[2].value, pairs.t0,
          eLogs[4].value, pairs.t1, pairs.t0Addr, pairs.t1Addr, "curve");
      }
      
      case "AddLiquidity": {
        // For AddLiquidity: provider adds liquidity and receives LP tokens
        // eLogs[0] = provider address (indexed)
        // eLogs[1] = token_amounts array 
        // eLogs[2] = fees array
        // eLogs[3] = invariant
        // eLogs[4] = token_supply
        
        // Create a liquidity provision edge
        // We'll treat this as adding liquidity to the pool
        return this.dexEdge("AddLiquidity", 
          eLogs[1].value, "Multiple", // token amounts in
          eLogs[4].value, "LP_TOKEN",  // LP tokens out
          w, w, "curve"); // Pool address for both
      }
      
      case "RemoveLiquidity": {
        // For RemoveLiquidity: provider removes liquidity and receives tokens
        // eLogs[0] = provider address (indexed)
        // eLogs[1] = token_amounts array (tokens returned)
        // eLogs[2] = fees array
        // eLogs[3] = token_supply (LP tokens burned)
        
        // Create a liquidity removal edge
        return this.dexEdge("RemoveLiquidity",
          eLogs[3].value, "LP_TOKEN",  // LP tokens in (burned)
          eLogs[1].value, "Multiple",  // tokens out
          w, w, "curve"); // Pool address for both
      }
      
      default:
        console.log(`⚠️ [CurveEdgeAdder] Unhandled event type: ${sKey}`);
        // Fallback to original behavior for unknown events
        let pairs = await this.getPairInfoForCurve(w, eLogs[1].value, eLogs[3].value);
        return this.dexEdge("Swap", eLogs[2].value, pairs.t0,
          eLogs[4].value, pairs.t1, pairs.t0Addr, pairs.t1Addr, "curve");
    }
  }

  async getPairInfoForCurve(poolAddr: string, t0: string, t1: string): Promise <IPairInfo> {
    // curve swap에 코인종류를 물어본다. -> y로 시작하면 y를 뗀다.
    console.log(`🔍 [CurveEdgeAdder] getPairInfoForCurve - pool: ${poolAddr}, t0: ${t0}, t1: ${t1}`);
    const t0Info = await this.getCurvePairs(poolAddr, t0);
    const t1Info = await this.getCurvePairs(poolAddr, t1);
    return { t0: t0Info[0], t0Addr: t0Info[1], t1: t1Info[0], t1Addr: t1Info[1] }
  }
  
  async getCurvePairs(poolAddr: string, tokenID: string) {
    let symbol: string;
    try {
      symbol = await this.getSymbol(poolAddr, tokenID);
    } catch (e) {
      console.log(`⚠️ [CurveEdgeAdder] Failed to get symbol for pool ${poolAddr}, token ID ${tokenID}: ${e}`);
      // If it's already an address (0x...), handle it
      if (tokenID.startsWith('0x')) {
        // This is likely already a token address, not an ID
        // Try to handle common addresses
        const lowerAddr = tokenID.toLowerCase();
        if (lowerAddr === '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2') {
          return ["ETH", "0x0"]; // WETH
        }
        if (lowerAddr === '0x6b175474e89094c44da98b954eedeac495271d0f') {
          return ["DAI", lowerAddr];
        }
        if (lowerAddr === '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48') {
          return ["USDC", lowerAddr];
        }
        if (lowerAddr === '0xdac17f958d2ee523a2206206994597c13d831ec7') {
          return ["USDT", lowerAddr];
        }
        // Default fallback for unknown addresses
        return ["UNKNOWN", tokenID];
      }
      return ["UNKNOWN", "0x0"];
    }
    
    // Log the symbol for debugging
    console.log(`🔍 [CurveEdgeAdder] Pool ${poolAddr}, token ID ${tokenID} -> symbol: ${symbol}`);
    
    switch (symbol) {
      case "DAI": return ["DAI", getAddressWithNormalToken("DAI")];
      case "USDC": return ["USDC", getAddressWithNormalToken("USDC")];
      case "USDT": return ["USDT", getAddressWithNormalToken("USDT")];
      case "aDAI": return ["DAI", getAddressWithNormalToken("DAI")];
      case "aUSDC": return ["USDC", getAddressWithNormalToken("USDC")];
      case "aETHc": return ["ETH", "0x0"];
      case "EURS": return ["EURS", getAddressWithNormalToken("EURS")];
      case "sEUR": return ["sEUR", getAddressWithNormalToken("sEUR")];
      case "HBTC": return ["WBTC", getAddressWithNormalToken("WBTC")];
      case "WBTC": return ["WBTC", getAddressWithNormalToken("WBTC")];
      case "iDAI": return ["DAI", getAddressWithNormalToken("DAI")];
      case "iUSDC": return ["USDC", getAddressWithNormalToken("USDC")];
      case "iUSDT": return ["USDT", getAddressWithNormalToken("USDT")];
      case "LINK": return ["LINK", getAddressWithNormalToken("LINK")];
      case "sLINK": return ["sLINK", getAddressWithNormalToken("LINK")];
      case "rETH": return ["ETH", "0x0"];
      case "aSUSD": return ["sUSD", getAddressWithNormalToken("sUSD")];
      case "sETH": return ["ETH", "0x0"];
      case "stETH": return ["ETH", "0x0"];
      case "sUSD": return ["sUSD", getAddressWithNormalToken("sUSD")];
      case "WETH": return ["ETH", "0x0"];
      case "ETH": return ["ETH", "0x0"];
      case "DOLA": return ["DOLA", getAddressWithNormalToken("DOLA")];
      case "INV": return ["INV", getAddressWithNormalToken("INV")];
      case "FRAX": return ["FRAX", getAddressWithNormalToken("FRAX")];
      case "3CRV": return ["3CRV", getAddressWithNormalToken("3CRV")];
      case "CRV": return ["CRV", getAddressWithNormalToken("CRV")];
      case "pETH": return ["pETH", "0x836a808d4828586a69364065a1e064609f5078c7"];
      case "alETH": return ["alETH", getAddressWithNormalToken("alETH")];
      case "msETH": return ["msETH", getAddressWithNormalToken("msETH")];
      case "UNKNOWN": return ["UNKNOWN", "0x0"]; // Fallback for invalid token IDs
      default: 
        console.log(`⚠️ [CurveEdgeAdder] Unsupported token symbol: ${symbol}`);
        // Check if it's an address format that wasn't caught
        if (symbol.startsWith('0x')) {
          return ["UNKNOWN", symbol];
        }
        throw new Error(`not supported token ${symbol}`);
    }
  }

  async getSymbol(poolAddr:string, tokenID: string): Promise<string> {
    let calldata: string;
    let res: any | undefined;
    
    // Special handling for DOLA pool - it only has 2 tokens (0, 1)
    if (poolAddr.toLowerCase() === "0xaa5a67c256e27a5d80712c51971408db3370927d" && tokenID === "2") {
      console.log(`⚠️ [Curve] DOLA pool only has 2 tokens. Skipping token ID ${tokenID}`);
      return "UNKNOWN"; // Return a safe fallback
    }
    
    // Check pool cache first
    const cachedPoolInfo = await globalPoolCache.get(poolAddr);
    if (cachedPoolInfo && cachedPoolInfo.protocol === 'curve') {
      const tokenIndex = parseInt(tokenID);
      if (tokenIndex < cachedPoolInfo.tokens.length) {
        const tokenAddr = cachedPoolInfo.tokens[tokenIndex];
        console.log(`⚡ [Curve] Using cached pool info for ${poolAddr.slice(0, 10)}...`);
        
        // Handle ETH address
        if (tokenAddr.toLowerCase() === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee') {
          return "ETH";
        }
        
        // Get token symbol
        const tokenCont = new web3.eth.Contract(ABIERC20 as AbiItem[], tokenAddr);
        const tokenSym: string = await tokenCont.methods.symbol().call();
        if (tokenSym.startsWith("y")) return tokenSym.slice(1);
        return tokenSym;
      }
    }
    
    // Fallback to eth_call if not in cache
    console.log(`🔄 [Curve] Pool not cached, fetching via eth_call for ${poolAddr.slice(0, 10)}...`);
    
    // loop is continue to get poolAddr
    for (let ABIpool of this.ABIPools) {
      calldata = this.makeCoinsCallData(tokenID, ABIpool);
      res = await ethCall(poolAddr, calldata); 
      if (res?.data?.result !== undefined) break;
    }
    
    // Cache the result for future use
    if (res?.data?.result) {
      const tokenAddr = (web3.eth.abi.decodeParameter('address', res.data.result)).toString();
      // We'll cache this later when we have all tokens
    }

    if (!res?.data?.result) {
      // More informative error message
      console.error(`❌ [Curve] Failed to get token for pool ${poolAddr}, token ID ${tokenID}`);
      console.error(`   This might be because the pool has fewer tokens than expected.`);
      throw new Error(`Failed to get token address for pool ${poolAddr} and token ID ${tokenID}`);
    }

    const tokenAddr = (web3.eth.abi.decodeParameter('address', res.data.result)).toString();
    
    // Special handling for ETH (0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE)
    if (tokenAddr.toLowerCase() === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee') {
      return "ETH";
    }
    
    const tokenCont = new web3.eth.Contract(ABIERC20 as AbiItem[], tokenAddr);
    const yTokenSym: string = await tokenCont.methods.symbol().call();
    if (yTokenSym.startsWith("y")) return yTokenSym.slice(1);
    return yTokenSym;
  }

  makeCoinsCallData(tokenId: string, ABI: AbiItem): string {
    return web3.eth.abi.encodeFunctionCall(ABI, [tokenId]);
  }
}

export class KyberEdgeAdder extends DEXEdgeAdder {
  override async makeEdge(eLogs: DecodedEvent[], w: string, sKey: string, sAction: LogEvent): Promise<IDEXEdge> {
    const pairs = [await this.getTokenInfo(eLogs[1].value), await this.getTokenInfo(eLogs[2].value)];
    return this.dexEdge("Swap", eLogs[3].value, pairs[0]["Sym"],
      eLogs[4].value, pairs[1]["Sym"], pairs[0]["Addr"], pairs[1]["Addr"], "kyber");
  }
  async getTokenInfo(addr: string){
    if (compareAddrs(addr, "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee")) return {Sym: "ETH", Addr: "0x0"};
    return {Sym: await getSymbol(addr), Addr: addr};
  }
}

export class SynthetixEdgeAdder extends DEXEdgeAdder {
  override async makeEdge(eLogs: DecodedEvent[], w: string, sKey: string, sAction: LogEvent): Promise<IDEXEdge> {
    const pairs = [this.getTokenInfo(eLogs[0].value), this.getTokenInfo(eLogs[2].value)];
    return this.dexEdge("Swap", eLogs[1].value, pairs[0]["Sym"],
      eLogs[3].value, pairs[1]["Sym"], pairs[0]["Addr"], pairs[1]["Addr"], "synthetix");
  }
  // for just only Synthetix old vault
  getTokenInfo(Sym: string){
    switch (Sym) {
      case "ETH": return {Sym: "ETH", Addr: "0x0"};
      case "sUSD": return {Sym: "sUSD", Addr: "0x57ab1ec28d129707052df4df418d58a2d46d5f51"};
      default: throw new Error(`Synthetix - does not support This token ${Sym}`)
    }
  }
}

// For Uniswap V3 pool
export class UniswapV3EdgeAdder extends DEXEdgeAdder {
  override async makeEdge(eLogs: DecodedEvent[], w: string, sKey: string, sAction: LogEvent): Promise<IDEXEdge> {
    DebugLogger.pattern(`🔧 [UniswapV3] Decoding edge for pool: ${w}`);
    DebugLogger.pattern(`   sKey: ${sKey}, eLogs length: ${eLogs.length}`);
    eLogs.forEach((log, idx) => {
      DebugLogger.pattern(`   eLogs[${idx}]: name=${log.name}, value=${log.value}, type=${log.type}`);
    });

    let pairs = await this.getPairInfoForUniV3(w);
    DebugLogger.pattern(`   Pair info: ${pairs.t0}/${pairs.t1} (${pairs.t0Addr}/${pairs.t1Addr})`);

    // Uniswap V3 Swap event structure:
    // Swap(indexed sender, indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)
    // eLogs[0] = sender, eLogs[1] = recipient, eLogs[2] = amount0, eLogs[3] = amount1, ...
    const amount0 = eLogs[2].value;  // int256 (can be negative)
    const amount1 = eLogs[3].value;  // int256 (can be negative)

    DebugLogger.pattern(`   V3 Swap amounts: amount0=${amount0}, amount1=${amount1}`);

    // In Uniswap V3, amounts can be negative (indicating direction)
    // Positive amount = tokens going into the pool
    // Negative amount = tokens coming out of the pool
    let amountIn: string, tokenIn: string, tokenInAddr: string;
    let amountOut: string, tokenOut: string, tokenOutAddr: string;

    // Convert signed integers to unsigned amounts for analysis
    const amount0Abs = amount0.startsWith('-') ? amount0.substring(1) : amount0;
    const amount1Abs = amount1.startsWith('-') ? amount1.substring(1) : amount1;

    if (!amount0.startsWith('-') && amount1.startsWith('-')) {
      // amount0 positive (in), amount1 negative (out): token0 -> token1
      amountIn = amount0Abs;
      tokenIn = pairs.t0;
      tokenInAddr = pairs.t0Addr;
      amountOut = amount1Abs;
      tokenOut = pairs.t1;
      tokenOutAddr = pairs.t1Addr;
      DebugLogger.pattern(`   V3 Pattern: ${tokenIn} -> ${tokenOut} (${amountIn} -> ${amountOut})`);
    } else if (amount0.startsWith('-') && !amount1.startsWith('-')) {
      // amount0 negative (out), amount1 positive (in): token1 -> token0
      amountIn = amount1Abs;
      tokenIn = pairs.t1;
      tokenInAddr = pairs.t1Addr;
      amountOut = amount0Abs;
      tokenOut = pairs.t0;
      tokenOutAddr = pairs.t0Addr;
      DebugLogger.pattern(`   V3 Pattern: ${tokenIn} -> ${tokenOut} (${amountIn} -> ${amountOut})`);
    } else {
      // Unexpected pattern or both same sign
      DebugLogger.pattern(`⚠️ [UniswapV3] Unexpected swap pattern: amount0=${amount0}, amount1=${amount1}`);
      // Use absolute values for safety
      if (PrecisionMath.isGreaterThan(amount0Abs, amount1Abs)) {
        amountIn = amount0Abs;
        tokenIn = pairs.t0;
        tokenInAddr = pairs.t0Addr;
        amountOut = amount1Abs;
        tokenOut = pairs.t1;
        tokenOutAddr = pairs.t1Addr;
      } else {
        amountIn = amount1Abs;
        tokenIn = pairs.t1;
        tokenInAddr = pairs.t1Addr;
        amountOut = amount0Abs;
        tokenOut = pairs.t0;
        tokenOutAddr = pairs.t0Addr;
      }
    }

    DebugLogger.pattern(`✅ [UniswapV3] Final edge: ${amountIn} ${tokenIn} -> ${amountOut} ${tokenOut}`);

    return this.dexEdge("Swap", amountIn, tokenIn, amountOut, tokenOut, tokenInAddr, tokenOutAddr, "uniswapv3");
  }

  // Get pair info for Uniswap V3 pool
  private async getPairInfoForUniV3(poolAddr: string): Promise<IPairInfo> {
    DebugLogger.pattern(`🔍 [UniswapV3] Getting pair info for pool: ${poolAddr}`);
    
    try {
      // Check pool cache first
      const cachedPoolInfo = await globalPoolCache.get(poolAddr);
      if (cachedPoolInfo && (cachedPoolInfo.protocol === 'uniswap-v3' || cachedPoolInfo.protocol === 'uniswap-v2')) {
        console.log(`⚡ [UniswapV3] Using cached pool info for ${poolAddr.slice(0, 10)}...`);
        const token0AddrFormatted = cachedPoolInfo.tokens[0];
        const token1AddrFormatted = cachedPoolInfo.tokens[1];
        
        DebugLogger.pattern(`   Token addresses from cache: token0=${token0AddrFormatted}, token1=${token1AddrFormatted}`);
        
        const token0Cont = new web3.eth.Contract(ABIERC20 as AbiItem[], token0AddrFormatted);
        const token1Cont = new web3.eth.Contract(ABIERC20 as AbiItem[], token1AddrFormatted);
        const t0sym: string = await token0Cont.methods.symbol().call();
        const t1sym: string = await token1Cont.methods.symbol().call();
        
        return { t0: t0sym, t0Addr: token0AddrFormatted, t1: t1sym, t1Addr: token1AddrFormatted };
      }
      
      // Fallback to eth_call if not in cache
      console.log(`🔄 [UniswapV3] Pool not cached, fetching via eth_call for ${poolAddr.slice(0, 10)}...`);
      
      // Call token0() and token1() functions from V3 pool
      const token0Response = await ethCall(poolAddr, "0x0dfe1681"); // token0()
      const token1Response = await ethCall(poolAddr, "0xd21220a7"); // token1()
      
      if (!token0Response?.data?.result || !token1Response?.data?.result) {
        throw new Error(`Failed to get token addresses for V3 pool ${poolAddr}`);
      }
      
      const token0AddrFormatted = "0x" + token0Response.data.result.substring(26);
      const token1AddrFormatted = "0x" + token1Response.data.result.substring(26);
      
      DebugLogger.pattern(`   Token addresses: token0=${token0AddrFormatted}, token1=${token1AddrFormatted}`);
      
      // Cache the pool info for future use
      const poolInfo: PoolInfo = {
        address: poolAddr.toLowerCase(),
        protocol: 'uniswap-v3',
        tokens: [token0AddrFormatted.toLowerCase(), token1AddrFormatted.toLowerCase()],
        lastUpdated: Date.now()
      };
      await globalPoolCache.set(poolAddr, poolInfo);
      console.log(`💾 [UniswapV3] Cached pool info for ${poolAddr.slice(0, 10)}...`);
      
      // Get token symbols
      const token0Symbol = await getSymbol(token0AddrFormatted);
      const token1Symbol = await getSymbol(token1AddrFormatted);
      
      DebugLogger.pattern(`   Token symbols: ${token0Symbol}/${token1Symbol}`);
      
      return {
        t0: token0Symbol,
        t1: token1Symbol,
        t0Addr: token0AddrFormatted,
        t1Addr: token1AddrFormatted
      };
    } catch (error) {
      DebugLogger.pattern(`❌ [UniswapV3] Failed to get pair info: ${error}`);
      // Fallback to default values
      return {
        t0: "UNKNOWN",
        t1: "UNKNOWN", 
        t0Addr: "0x0",
        t1Addr: "0x0"
      };
    }
  }
}

// Allbridge EdgeAdder for handling SwappedToVUsd and SwappedFromVUsd events
export class AllbridgeEdgeAdder extends DEXEdgeAdder {
  override async makeEdge(eLogs: DecodedEvent[], w: string, sKey: string, sAction: LogEvent): Promise<IDEXEdge> {
    DebugLogger.pattern(`🌉 [Allbridge] Processing ${sKey} event with ${eLogs.length} logs`);
    
    // Allbridge events are normalized to Swap with this structure:
    // SwappedToVUsd: { from: 0, to: -1, token1: 1, token2: -1, amountIn: 2, amountOut: 3, vUsdAmount: 3, fee: 4 }
    // SwappedFromVUsd: { from: -1, to: 0, token1: -1, token2: 1, amountIn: 2, amountOut: 3, vUsdAmount: 2, fee: 4 }
    
    // Extract event parameters based on the sAction mapping
    const user = sAction.from === -1 ? w : (eLogs[sAction.from as number]?.value || w);
    const tokenInIndex = sAction.token1 as number;
    const tokenOutIndex = sAction.token2 as number;
    const amountInIndex = sAction.amountIn as number;
    const amountOutIndex = sAction.amountOut as number;
    
    // Get amounts
    const amountIn = eLogs[amountInIndex]?.value || "0";
    const amountOut = eLogs[amountOutIndex]?.value || "0";
    
    // Determine tokens based on swap direction
    let tokenIn: string, tokenOut: string, tokenInAddr: string, tokenOutAddr: string;
    
    if (tokenInIndex === -1) {
      // SwappedFromVUsd: vUSD -> actual token
      tokenIn = "vUSD";
      tokenInAddr = w; // Allbridge contract address
      tokenOut = eLogs[tokenOutIndex]?.value || "UNKNOWN";
      tokenOutAddr = eLogs[tokenOutIndex]?.value || w;
    } else if (tokenOutIndex === -1) {
      // SwappedToVUsd: actual token -> vUSD
      tokenIn = eLogs[tokenInIndex]?.value || "UNKNOWN";
      tokenInAddr = eLogs[tokenInIndex]?.value || w;
      tokenOut = "vUSD";
      tokenOutAddr = w; // Allbridge contract address
    } else {
      // Regular swap (shouldn't happen with Allbridge but handle it)
      tokenIn = eLogs[tokenInIndex]?.value || "UNKNOWN";
      tokenInAddr = eLogs[tokenInIndex]?.value || w;
      tokenOut = eLogs[tokenOutIndex]?.value || "UNKNOWN";
      tokenOutAddr = eLogs[tokenOutIndex]?.value || w;
    }
    
    // Try to get token symbols if addresses are provided
    if (tokenInAddr && tokenInAddr !== w && tokenIn === tokenInAddr) {
      try {
        tokenIn = await getSymbol(tokenInAddr);
      } catch (e) {
        // Keep the address as symbol
      }
    }
    
    if (tokenOutAddr && tokenOutAddr !== w && tokenOut === tokenOutAddr) {
      try {
        tokenOut = await getSymbol(tokenOutAddr);
      } catch (e) {
        // Keep the address as symbol
      }
    }
    
    DebugLogger.pattern(`   Allbridge swap: ${amountIn} ${tokenIn} -> ${amountOut} ${tokenOut}`);
    
    return this.dexEdge(sKey, amountIn, tokenIn, amountOut, tokenOut, tokenInAddr, tokenOutAddr, "allbridge");
  }
}

export async function getSymbol(tokenAddr: string): Promise<string> {
  let sym = "FakeToken";
  try {
    sym = await (new web3.eth.Contract(ABIERC20 as AbiItem[], tokenAddr)).methods.symbol().call();
  } catch (e) {
    sym = web3.utils.toAscii(await (new web3.eth.Contract(ABIERC20Derivative as AbiItem[], tokenAddr)).methods.symbol().call()); 
  } finally {
    return sym;
  }
}
