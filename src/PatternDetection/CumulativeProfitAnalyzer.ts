// Cumulative Profit Analyzer - 전체 트랜잭션의 누적 수익 분석

import { DebugLogger } from "../Utils/DebugLogger";

export interface TokenFlow {
  token: string;
  tokenAddress: string;
  amountIn: number;    // 들어온 양 (positive)
  amountOut: number;   // 나간 양 (positive) 
  netFlow: number;     // net = amountIn - amountOut
}

export interface CumulativeProfitResult {
  totalInUSD: number;
  totalOutUSD: number;
  netProfitUSD: number;
  profitRatio: number;           // (totalOut / totalIn) * 100
  tokenFlows: TokenFlow[];
  isAttack: boolean;
  confidence: number;            // 0-1
  explanation: string;
}

export class CumulativeProfitAnalyzer {
  private profitThreshold: number;
  
  constructor(profitThreshold: number = 5.0) {  // 5% 기본값
    this.profitThreshold = profitThreshold;
  }

  // 🎯 메인 분석 함수
  async analyzeCumulativeProfit(edges: any[], blockNumber: number): Promise<CumulativeProfitResult> {
    DebugLogger.profit(`💰 [ProfitAnalyzer] Analyzing cumulative profit for ${edges.length} edges...`);
    
    // 1. 토큰 플로우 계산
    const tokenFlows = await this.calculateTokenFlows(edges, blockNumber);
    
    // 2. USD 값으로 변환
    const usdAnalysis = await this.calculateUSDValues(tokenFlows, blockNumber);
    
    // 3. 수익률 계산
    const profitAnalysis = this.calculateProfitMetrics(usdAnalysis);
    
    // 4. 공격 여부 판단
    const attackAnalysis = this.determineAttack(profitAnalysis);
    
    const result: CumulativeProfitResult = {
      ...usdAnalysis,
      ...profitAnalysis,
      ...attackAnalysis,
      tokenFlows
    };
    
    DebugLogger.profit(`💰 [ProfitAnalyzer] Net Profit: $${result.netProfitUSD.toFixed(2)} (${result.profitRatio.toFixed(2)}%)`);
    DebugLogger.profit(`💰 [ProfitAnalyzer] Attack detected: ${result.isAttack} (confidence: ${(result.confidence * 100).toFixed(1)}%)`);
    
    return result;
  }

  // 토큰 플로우 계산 - 각 토큰별 입출금 추적
  private async calculateTokenFlows(edges: any[], blockNumber: number): Promise<TokenFlow[]> {
    const tokenFlowMap = new Map<string, TokenFlow>();
    
    DebugLogger.profit(`🔍 [TokenFlow] Analyzing ${edges.length} edges for token flows...`);
    
    for (let i = 0; i < edges.length; i++) {
      const edge = edges[i];
      const edgeData = JSON.parse(edge.name);
      
      DebugLogger.profit(`   📍 Edge ${i+1}: ${edgeData.Action || 'DEX'} - ${JSON.stringify(edgeData).substring(0, 100)}...`);
      
      if (this.isDEXEdge(edgeData)) {
        // DEX Edge: AmountIn을 지불하고 AmountOut을 받음
        DebugLogger.profit(`   🔄 DEX: Pay ${edgeData.AmountIn} ${edgeData.Token0}, Receive ${edgeData.AmountOut} ${edgeData.Token1}`);
        
        // Token0을 지불 (Out)
        this.addTokenFlow(tokenFlowMap, edgeData.Token0, edgeData.Token0Addr, 0, parseFloat(edgeData.AmountIn));
        // Token1을 수령 (In)  
        this.addTokenFlow(tokenFlowMap, edgeData.Token1, edgeData.Token1Addr, parseFloat(edgeData.AmountOut), 0);
        
      } else if (this.isLendingEdge(edgeData)) {
        DebugLogger.profit(`   🏦 Lending: ${edgeData.Action} ${edgeData.Amount} ${edgeData.Token}`);
        
        if (edgeData.Action === "Deposit") {
          // Deposit: 원본 토큰을 지불하고 vault 토큰(fUSDC 등)을 받음
          // 여기서는 원본 토큰 플로우만 추적 (vault 토큰은 별도)
          this.addTokenFlow(tokenFlowMap, edgeData.Token, edgeData.TokenAddr, 0, parseFloat(edgeData.Amount));
          DebugLogger.profit(`     → Pay ${edgeData.Amount} ${edgeData.Token} to vault`);
          
        } else if (edgeData.Action === "Withdraw") {
          // Withdraw: vault 토큰을 지불하고 원본 토큰을 받음
          // 받는 원본 토큰만 추적
          this.addTokenFlow(tokenFlowMap, edgeData.Token, edgeData.TokenAddr, parseFloat(edgeData.Amount), 0);
          DebugLogger.profit(`     → Receive ${edgeData.Amount} ${edgeData.Token} from vault`);
          
        } else if (edgeData.Action === "Borrow") {
          // Borrow: 토큰을 대출로 받음 (In)
          this.addTokenFlow(tokenFlowMap, edgeData.Token, edgeData.TokenAddr, parseFloat(edgeData.Amount), 0);
          
        } else if (edgeData.Action === "Repay") {
          // Repay: 토큰을 상환으로 지불 (Out)
          this.addTokenFlow(tokenFlowMap, edgeData.Token, edgeData.TokenAddr, 0, parseFloat(edgeData.Amount));
        }
      }
    }
    
    // Net flow 계산
    const tokenFlows = Array.from(tokenFlowMap.values());
    DebugLogger.profit(`🔍 [TokenFlow] Final calculation for ${tokenFlows.length} tokens:`);
    tokenFlows.forEach(flow => {
      const calculatedNet = flow.amountIn - flow.amountOut;
      flow.netFlow = calculatedNet;
      DebugLogger.profit(`   💰 ${flow.token}: In=${flow.amountIn.toFixed(2)}, Out=${flow.amountOut.toFixed(2)}, Net=${flow.netFlow.toFixed(2)} (calculated: ${calculatedNet.toFixed(2)})`);
      
      // 대량 거래 디버깅
      if (Math.abs(flow.amountIn) > 1000000000000 || Math.abs(flow.amountOut) > 1000000000000) {
        DebugLogger.profit(`   🚨 [DEBUG] Large amount detected: ${flow.token}`);
        DebugLogger.profit(`      Raw In: ${flow.amountIn}, Raw Out: ${flow.amountOut}`);
      }
    });
    
    return tokenFlows;
  }

  // 토큰 플로우 맵에 추가
  private addTokenFlow(flowMap: Map<string, TokenFlow>, token: string, tokenAddr: string, amountIn: number, amountOut: number) {
    const key = `${token}_${tokenAddr}`;
    
    if (flowMap.has(key)) {
      const existing = flowMap.get(key)!;
      existing.amountIn += amountIn || 0;
      existing.amountOut += amountOut || 0;
    } else {
      flowMap.set(key, {
        token,
        tokenAddress: tokenAddr,
        amountIn: amountIn || 0,
        amountOut: amountOut || 0,
        netFlow: 0
      });
    }
  }

  // USD 값 계산
  private async calculateUSDValues(tokenFlows: TokenFlow[], blockNumber: number): Promise<{
    totalInUSD: number;
    totalOutUSD: number;
  }> {
    let totalInUSD = 0;
    let totalOutUSD = 0;
    
    for (const flow of tokenFlows) {
      const inUSD = await this.convertToUSD(flow.amountIn, flow.token, blockNumber);
      const outUSD = await this.convertToUSD(flow.amountOut, flow.token, blockNumber);
      
      totalInUSD += inUSD;
      totalOutUSD += outUSD;
      
      DebugLogger.profit(`   ${flow.token}: In=$${inUSD.toFixed(2)}, Out=$${outUSD.toFixed(2)}, Net=$${(inUSD - outUSD).toFixed(2)}`);
    }
    
    return { totalInUSD, totalOutUSD };
  }

  // 수익률 메트릭 계산
  private calculateProfitMetrics(usdValues: { totalInUSD: number; totalOutUSD: number }): {
    netProfitUSD: number;
    profitRatio: number;
  } {
    const netProfitUSD = usdValues.totalOutUSD - usdValues.totalInUSD;
    const profitRatio = usdValues.totalInUSD > 0 
      ? (usdValues.totalOutUSD / usdValues.totalInUSD) * 100 
      : 0;
    
    return { netProfitUSD, profitRatio };
  }

  // 공격 여부 판단
  private determineAttack(profitData: { netProfitUSD: number; profitRatio: number }): {
    isAttack: boolean;
    confidence: number;
    explanation: string;
  } {
    const { netProfitUSD, profitRatio } = profitData;
    
    // 기본 조건들
    const hasSignificantProfit = netProfitUSD > 1000; // $1,000 이상
    const exceedsThreshold = profitRatio > (100 + this.profitThreshold); // 105% 이상
    const hasUnrealisticProfit = profitRatio > 110; // 110% 이상은 매우 의심
    
    let isAttack = false;
    let confidence = 0;
    let explanation = "";
    
    if (hasUnrealisticProfit && hasSignificantProfit) {
      isAttack = true;
      confidence = 0.9;
      explanation = `Highly suspicious: ${profitRatio.toFixed(2)}% profit ratio with $${netProfitUSD.toFixed(2)} net profit`;
    } else if (exceedsThreshold && hasSignificantProfit) {
      isAttack = true;
      confidence = 0.7;
      explanation = `Suspicious: ${profitRatio.toFixed(2)}% profit ratio exceeds ${100 + this.profitThreshold}% threshold`;
    } else if (exceedsThreshold) {
      isAttack = true;
      confidence = 0.5;
      explanation = `Moderate: ${profitRatio.toFixed(2)}% profit ratio exceeds threshold but low absolute profit`;
    } else {
      isAttack = false;
      confidence = 0;
      explanation = `Normal: ${profitRatio.toFixed(2)}% profit ratio within acceptable range`;
    }
    
    return { isAttack, confidence, explanation };
  }

  // USD 변환 (토큰별 decimal 고려)
  private async convertToUSD(amount: number, token: string, blockNumber: number): Promise<number> {
    // 토큰별 가격 (Harvest attack 시점 2020년 10월)
    const priceMap: { [key: string]: number } = {
      'USDC': 1,
      'USDT': 1, 
      'DAI': 1,
      'WETH': 380, // Harvest attack 시점 가격
      'ETH': 380,
      'WBTC': 13000
    };
    
    // 토큰별 decimal places
    const decimalsMap: { [key: string]: number } = {
      'USDC': 6,   // USDC는 6 decimals
      'USDT': 6,   // USDT는 6 decimals  
      'DAI': 18,   // DAI는 18 decimals
      'WETH': 18,  // WETH는 18 decimals
      'ETH': 18,
      'WBTC': 8    // WBTC는 8 decimals
    };
    
    const price = priceMap[token] || 1;
    const decimals = decimalsMap[token] || 18;
    const normalizedAmount = amount / Math.pow(10, decimals);
    
    // 🛡️ 극단값 필터링: 현실적이지 않은 값들 제한
    const maxReasonableAmount: { [key: string]: number } = {
      'WETH': 1000000,    // 100만 WETH ($380M) 이상은 비현실적
      'ETH': 1000000,     // 100만 ETH 이상은 비현실적
      'USDC': 1000000000, // 10억 USDC 이상은 비현실적  
      'USDT': 1000000000, // 10억 USDT 이상은 비현실적
      'DAI': 1000000000,  // 10억 DAI 이상은 비현실적
      'WBTC': 100000      // 10만 WBTC ($1.3T) 이상은 비현실적
    };
    
    const maxAmount = maxReasonableAmount[token] || 1000000000;
    
    if (Math.abs(normalizedAmount) > maxAmount) {
      DebugLogger.profit(`   ⚠️ [FILTER] Extreme value detected for ${token}: ${normalizedAmount.toFixed(2)} > ${maxAmount}`);
      DebugLogger.profit(`      Original amount: ${amount}, might be encoding error`);
      // 극단값을 reasonable 범위로 제한
      const clampedAmount = Math.sign(normalizedAmount) * Math.min(Math.abs(normalizedAmount), maxAmount);
      DebugLogger.profit(`      Clamped to: ${clampedAmount.toFixed(2)}`);
      return clampedAmount * price;
    }
    
    const usdValue = normalizedAmount * price;
    
    // 디버깅용 로그 (큰 금액만)
    if (usdValue > 1000) {
      DebugLogger.profit(`   💲 ${token}: ${amount} (raw) → ${normalizedAmount.toFixed(6)} (normalized) → $${usdValue.toFixed(2)} (USD)`);
    }
    
    return usdValue;
  }

  // Edge 타입 판별
  private isDEXEdge(edgeData: any): boolean {
    return edgeData.AmountIn && edgeData.AmountOut && edgeData.Token0 && edgeData.Token1;
  }

  private isLendingEdge(edgeData: any): boolean {
    return edgeData.Amount && edgeData.Token && 
           ['Deposit', 'Withdraw', 'Borrow', 'Repay'].includes(edgeData.Action);
  }

  // 임계값 설정
  setProfitThreshold(threshold: number): void {
    this.profitThreshold = threshold;
  }
} 