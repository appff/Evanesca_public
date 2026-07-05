// Dynamic Price Tracker - DEX swap 데이터에서 실시간 토큰 가격 추출

import { DebugLogger } from '../Utils/DebugLogger';

export interface PriceSnapshot {
  token0: string;
  token1: string;
  price0in1: number;  // token0를 token1으로 바꾸는 비율
  price1in0: number;  // token1을 token0으로 바꾸는 비율
  blockNumber: number;
  edgeIndex: number;
  timestamp: number;
}

export interface TokenPriceHistory {
  token: string;
  priceHistory: Array<{
    price: number;
    timestamp: number;
    edgeIndex: number;
    referenceToken: string; // 기준 토큰 (보통 USDC 또는 USDT)
  }>;
  currentPrice: number;
}

export class DynamicPriceTracker {
  private priceSnapshots: PriceSnapshot[] = [];
  private tokenPrices: Map<string, TokenPriceHistory> = new Map();
  private basePrices: Map<string, number> = new Map(); // 기본 가격 테이블
  
  constructor() {
    // 기본 가격 설정 (fallback용)
    this.basePrices.set('USDC', 1.0);
    this.basePrices.set('USDT', 1.0);
    this.basePrices.set('DAI', 1.0);
    this.basePrices.set('WETH', 380); // Harvest attack 시점
    this.basePrices.set('ETH', 380);
    this.basePrices.set('WBTC', 13000);
  }

  // 🎯 메인 함수: edges에서 실시간 가격 추출
  extractDynamicPrices(edges: any[]): void {
    DebugLogger.price(`📈 [PriceTracker] Extracting dynamic prices from ${edges.length} edges...`);
    
    this.priceSnapshots = [];
    this.tokenPrices.clear();
    
    for (let i = 0; i < edges.length; i++) {
      const edge = edges[i];
      const edgeData = JSON.parse(edge.name);
      
      if (this.isDEXEdge(edgeData)) {
        const snapshot = this.extractPriceFromDEXSwap(edgeData, i);
        if (snapshot) {
          this.priceSnapshots.push(snapshot);
          this.updateTokenPrices(snapshot);
        }
      }
    }
    
          DebugLogger.price(`📈 [PriceTracker] Extracted ${this.priceSnapshots.length} price snapshots`);
    this.logPriceHistory();
  }

  // DEX swap에서 가격 정보 추출
  private extractPriceFromDEXSwap(edgeData: any, edgeIndex: number): PriceSnapshot | null {
    const { Token0, Token1, AmountIn, AmountOut } = edgeData;
    
    if (!Token0 || !Token1 || !AmountIn || !AmountOut) {
      return null;
    }
    
    const amountIn = parseFloat(AmountIn);
    const amountOut = parseFloat(AmountOut);
    
    if (amountIn <= 0 || amountOut <= 0) {
      return null;
    }
    
    // 정규화된 금액 계산 (decimals 고려)
    const normalizedAmountIn = this.normalizeAmount(amountIn, Token0);
    const normalizedAmountOut = this.normalizeAmount(amountOut, Token1);
    
    // 가격 비율 계산
    const price0in1 = normalizedAmountOut / normalizedAmountIn; // Token0 1개 = ? Token1
    const price1in0 = normalizedAmountIn / normalizedAmountOut; // Token1 1개 = ? Token0
    
    const snapshot: PriceSnapshot = {
      token0: Token0,
      token1: Token1, 
      price0in1,
      price1in0,
      blockNumber: 11129474, // Harvest attack block
      edgeIndex,
      timestamp: Date.now()
    };
    
            DebugLogger.price(`   💱 Edge ${edgeIndex}: ${Token0}/${Token1} = ${price0in1.toFixed(6)} (1 ${Token0} = ${price0in1.toFixed(6)} ${Token1})`);
    
    return snapshot;
  }

  // 토큰 가격 히스토리 업데이트
  private updateTokenPrices(snapshot: PriceSnapshot): void {
    const { token0, token1, price0in1, price1in0, edgeIndex } = snapshot;
    
    // Token0의 Token1 기준 가격
    if (this.isStablecoin(token1)) {
      this.updateTokenPrice(token0, price0in1, edgeIndex, token1);
    }
    
    // Token1의 Token0 기준 가격  
    if (this.isStablecoin(token0)) {
      this.updateTokenPrice(token1, price1in0, edgeIndex, token0);
    }
    
    // USDC/USDT 간 상호 가격 (핵심!)
    if ((token0 === 'USDC' && token1 === 'USDT') || (token0 === 'USDT' && token1 === 'USDC')) {
      DebugLogger.price(`   🎯 [CRITICAL] Stablecoin pair detected: ${token0}/${token1} = ${price0in1.toFixed(8)}`);
      
      if (token0 === 'USDC') {
        // 1 USDC = ? USDT
        this.updateTokenPrice('USDC', price0in1, edgeIndex, 'USDT');
        this.updateTokenPrice('USDT', price1in0, edgeIndex, 'USDC'); 
      } else {
        // 1 USDT = ? USDC
        this.updateTokenPrice('USDT', price0in1, edgeIndex, 'USDC');
        this.updateTokenPrice('USDC', price1in0, edgeIndex, 'USDT');
      }
    }
  }

  // 개별 토큰 가격 업데이트
  private updateTokenPrice(token: string, price: number, edgeIndex: number, referenceToken: string): void {
    if (!this.tokenPrices.has(token)) {
      this.tokenPrices.set(token, {
        token,
        priceHistory: [],
        currentPrice: price
      });
    }
    
    const tokenPrice = this.tokenPrices.get(token)!;
    tokenPrice.priceHistory.push({
      price,
      timestamp: Date.now(),
      edgeIndex,
      referenceToken
    });
    tokenPrice.currentPrice = price; // 최신 가격으로 업데이트
  }

  // 특정 edge 시점의 토큰 가격 조회
  getTokenPriceAtEdge(token: string, edgeIndex: number): number {
    const tokenPrice = this.tokenPrices.get(token);
    if (!tokenPrice) {
      return this.basePrices.get(token) || 1.0;
    }
    
    // 해당 edge 이전의 가장 최근 가격 찾기
    const relevantPrices = tokenPrice.priceHistory
      .filter(p => p.edgeIndex <= edgeIndex)
      .sort((a, b) => b.edgeIndex - a.edgeIndex);
    
    if (relevantPrices.length > 0) {
      const price = relevantPrices[0].price;
      console.log(`   💲 ${token} price at edge ${edgeIndex}: ${price.toFixed(8)} (ref: ${relevantPrices[0].referenceToken})`);
      return price;
    }
    
    return this.basePrices.get(token) || 1.0;
  }

  // 현재 토큰 가격 조회
  getCurrentTokenPrice(token: string): number {
    const tokenPrice = this.tokenPrices.get(token);
    if (tokenPrice) {
      return tokenPrice.currentPrice;
    }
    return this.basePrices.get(token) || 1.0;
  }

  // 가격 히스토리 로깅
  private logPriceHistory(): void {
    DebugLogger.price(`📊 [PriceTracker] Token Price Summary:`);
    
    for (const [token, priceInfo] of this.tokenPrices.entries()) {
      const minPrice = Math.min(...priceInfo.priceHistory.map(p => p.price));
      const maxPrice = Math.max(...priceInfo.priceHistory.map(p => p.price));
      const volatility = ((maxPrice - minPrice) / minPrice) * 100;
      
      console.log(`   💰 ${token}: ${minPrice.toFixed(8)} - ${maxPrice.toFixed(8)} (volatility: ${volatility.toFixed(4)}%)`);
      
      // 가격 변동이 큰 경우 상세 로그
      if (volatility > 0.1) { // 0.1% 이상 변동
        console.log(`     🔥 High volatility detected for ${token}:`);
        priceInfo.priceHistory.forEach(p => {
          console.log(`       Edge ${p.edgeIndex}: ${p.price.toFixed(8)} ${p.referenceToken}`);
        });
      }
    }
  }

  // 토큰 정규화 (decimals 고려)
  private normalizeAmount(amount: number, token: string): number {
    const decimalsMap: { [key: string]: number } = {
      'USDC': 6,
      'USDT': 6,  
      'DAI': 18,
      'WETH': 18,
      'ETH': 18,
      'WBTC': 8
    };
    
    const decimals = decimalsMap[token] || 18;
    return amount / Math.pow(10, decimals);
  }

  // DEX Edge 판별
  private isDEXEdge(edgeData: any): boolean {
    return edgeData.AmountIn && edgeData.AmountOut && edgeData.Token0 && edgeData.Token1;
  }

  // 스테이블코인 판별
  private isStablecoin(token: string): boolean {
    return ['USDC', 'USDT', 'DAI'].includes(token);
  }
} 