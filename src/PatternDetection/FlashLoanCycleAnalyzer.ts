// Flash Loan Cycle Analyzer - 전체 트랜잭션의 시작과 끝 상태를 비교하여 실제 이득 계산

import { DebugLogger } from '../Utils/DebugLogger';
import { ParticipantPNLAnalyzer, ParticipantPNLResult } from './ParticipantPNLAnalyzer';
import { SequenceEdge } from '../SemanticFinancialGraph/Types';

export interface FlashLoanCycleResult {
  netProfitUSD: number;
  netProfitTokens: { [token: string]: number }; // 각 토큰별 순 변화량
  flashLoanAmount: { [token: string]: number }; // Flash loan으로 받은 금액
  finalRepayAmount: { [token: string]: number }; // 최종 상환 금액
  isAttack: boolean;
  confidence: number;
  explanation: string;
  participantResults?: ParticipantPNLResult; // 참가자별 분석 결과
}

export class FlashLoanCycleAnalyzer {
  private profitThreshold: number;
  
  constructor(profitThreshold: number = 1000) { // $1000 이상
    this.profitThreshold = profitThreshold;
  }

  // 🎯 전체 트랜잭션의 Flash Loan Cycle 분석 - 참가자별 PNL 추적
  async analyzeFlashLoanCycle(edges: SequenceEdge[], blockNumber: number): Promise<FlashLoanCycleResult> {
    DebugLogger.flashloan(`⚡ [FlashLoanCycle] Analyzing complete transaction cycle for ${edges.length} edges...`);
    
    // 🔄 NEW: Use participant-specific PNL analysis
    const participantAnalyzer = new ParticipantPNLAnalyzer();
    
    // Process each edge through participant analyzer
    console.log(`   📊 Processing ${edges.length} edges for participant-specific balance tracking...`);
    edges.forEach(edge => {
      participantAnalyzer.processEdge(edge);
    });
    
    // Get participant PNL results
    const pnlResults = await participantAnalyzer.getPNLResults(blockNumber);
    
    console.log('\n' + pnlResults.summary);
    
    // 3. Flash loan 정보 추출 (기존 로직 유지 for comparison)
    const flashLoanInfo = this.extractFlashLoanInfo(edges);
    
    // 4. 공격자의 실제 이득 계산
    const attackerProfitUSD = pnlResults.attacker ? 
      pnlResults.netChangesUSD[pnlResults.attacker.address] || 0 : 0;
    
    // 5. 공격 판단 - 참가자별 분석 기반
    const attackAnalysis = this.determineParticipantBasedAttack(pnlResults);
    
    DebugLogger.flashloan(`⚡ [FlashLoanCycle] Attacker Profit (Participant-based): $${attackerProfitUSD.toFixed(2)}`);
    
    return {
      netProfitUSD: attackerProfitUSD,
      netProfitTokens: this.convertPNLResultsToTokens(pnlResults),
      flashLoanAmount: flashLoanInfo.borrowed,
      finalRepayAmount: flashLoanInfo.repaid,
      ...attackAnalysis,
      participantResults: pnlResults // 추가 정보
    };
  }

  // 초기 상태: 보통 공격자는 빈 손으로 시작
  private getInitialState(edges: SequenceEdge[]): { [token: string]: number } {
    // 일반적으로 공격자는 처음에 아무것도 가지고 있지 않음
    // 첫 번째 대규모 입금이 flash loan일 가능성이 높음
    console.log(`   📍 Assuming attacker starts with zero assets (typical for flash loan attacks)`);
    return {};
  }

  // 최종 상태: 모든 edge를 거친 후 순 자산 변화
  private getFinalState(edges: SequenceEdge[]): { [token: string]: number } {
    const tokenBalance: { [token: string]: number } = {};
    
    console.log(`   📊 Calculating final state from all ${edges.length} edges...`);
    
    for (let i = 0; i < edges.length; i++) {
      const edge = edges[i];
      const edgeData = JSON.parse(edge.name[0]);
      
      if (this.isDEXEdge(edgeData)) {
        // DEX: Token0을 지불하고 Token1을 받음
        const amountIn = parseFloat(edgeData.AmountIn) || 0;
        const amountOut = parseFloat(edgeData.AmountOut) || 0;
        
        this.updateTokenBalance(tokenBalance, edgeData.Token0, -amountIn); // 지불
        this.updateTokenBalance(tokenBalance, edgeData.Token1, amountOut);  // 수령
        
      } else if (this.isLendingEdge(edgeData)) {
        const amount = parseFloat(edgeData.Amount) || 0;
        
        if (edgeData.Action === "Deposit") {
          // Deposit: 토큰을 지불
          this.updateTokenBalance(tokenBalance, edgeData.Token, -amount);
        } else if (edgeData.Action === "Withdraw") {
          // Withdraw: 토큰을 수령
          this.updateTokenBalance(tokenBalance, edgeData.Token, amount);
        } else if (edgeData.Action === "Borrow") {
          // Borrow: 토큰을 수령
          this.updateTokenBalance(tokenBalance, edgeData.Token, amount);
        } else if (edgeData.Action === "Repay") {
          // Repay: 토큰을 지불
          this.updateTokenBalance(tokenBalance, edgeData.Token, -amount);
        }
      }
    }
    
    // 큰 변화량만 로깅
    Object.entries(tokenBalance).forEach(([token, balance]) => {
      if (Math.abs(balance) > 1000000) { // 100만 wei 이상
        const normalized = this.normalizeAmount(balance, token);
        console.log(`     💰 Final ${token}: ${normalized.toFixed(6)} (raw: ${balance.toFixed(0)})`);
      }
    });
    
    return tokenBalance;
  }

  // Flash loan 정보 추출 - Lending edges에서 Borrow/Repay 감지
  private extractFlashLoanInfo(edges: SequenceEdge[]): { borrowed: { [token: string]: number }, repaid: { [token: string]: number } } {
    const borrowed: { [token: string]: number } = {};
    const repaid: { [token: string]: number } = {};
    
    console.log(`   🔍 Extracting flash loan patterns...`);
    
    // 모든 edges를 검토하여 flash loan 패턴 찾기
    edges.forEach((edge, idx) => {
      try {
        const edgeData = JSON.parse(edge.name[0]);
        
        if (this.isLendingEdge(edgeData)) {
          const amount = parseFloat(edgeData.Amount) || 0;
          
          if (edgeData.Action === "Borrow" && amount > 1000000000000) { // 1M wei 이상의 대규모 borrowing
            borrowed[edgeData.Token] = (borrowed[edgeData.Token] || 0) + amount;
            console.log(`     💳 Flash loan borrow detected: ${this.normalizeAmount(amount, edgeData.Token).toFixed(2)} ${edgeData.Token}`);
          } else if (edgeData.Action === "Repay" && amount > 1000000000000) { // 1M wei 이상의 대규모 repayment
            repaid[edgeData.Token] = (repaid[edgeData.Token] || 0) + amount;
            console.log(`     💸 Flash loan repay detected: ${this.normalizeAmount(amount, edgeData.Token).toFixed(2)} ${edgeData.Token}`);
          }
        }
      } catch (error) {
        // 파싱 에러 무시
      }
    });
    
    return { borrowed, repaid };
  }

  // 순 자산 변화 계산 - Flash loan 효과 제거한 실제 이득 계산
  private calculateNetAssetChange(
    initialState: { [token: string]: number },
    finalState: { [token: string]: number },
    flashLoanInfo: { borrowed: { [token: string]: number }, repaid: { [token: string]: number } }
  ): { [token: string]: number } {
    
    const netChanges: { [token: string]: number } = {};
    
    console.log(`   🧮 Calculating net asset changes...`);
    
    // 모든 토큰에 대해 순 변화 계산
    const allTokens = new Set([
      ...Object.keys(finalState),
      ...Object.keys(initialState),
      ...Object.keys(flashLoanInfo.borrowed),
      ...Object.keys(flashLoanInfo.repaid)
    ]);
    
    allTokens.forEach(token => {
      const initial = initialState[token] || 0;
      const final = finalState[token] || 0;
      const borrowed = flashLoanInfo.borrowed[token] || 0;
      const repaid = flashLoanInfo.repaid[token] || 0;
      
      // 🔥 KEY FIX: Flash loan의 순 비용 계산 (fee)
      const flashLoanCost = repaid - borrowed; // 대부분 0 또는 작은 수수료
      
      // 실제 순 이득 = 현재 자산 - 초기 자산 - Flash loan 비용
      // 하지만 final state는 이미 flash loan repay 효과를 포함하므로
      // 실제로는 Flash loan을 중성화해야 함
      let actualNetChange = final - initial;
      
      // Flash loan이 있는 경우, flash loan의 순 효과를 제거
      if (borrowed > 0 && repaid > 0) {
        // Flash loan이 완전히 상환된 경우, 실제 이득은 fee만 차감
        actualNetChange = final - initial + borrowed - repaid;
      }
      
      if (Math.abs(actualNetChange) > 1000000 || Math.abs(final) > 1000000) { // 상당한 변화만 기록
        netChanges[token] = actualNetChange;
        const normalizedChange = this.normalizeAmount(actualNetChange, token);
        console.log(`     📈 Net ${token} change: ${normalizedChange.toFixed(6)} (raw: ${actualNetChange.toFixed(0)})`);
        
        // Flash loan 상세 정보
        if (borrowed > 0 || repaid > 0) {
          const normalizedBorrowed = this.normalizeAmount(borrowed, token);
          const normalizedRepaid = this.normalizeAmount(repaid, token);
          const normalizedCost = this.normalizeAmount(flashLoanCost, token);
          console.log(`        💳 Flash loan: borrowed ${normalizedBorrowed.toFixed(2)}, repaid ${normalizedRepaid.toFixed(2)}, cost ${normalizedCost.toFixed(6)}`);
        }
      }
    });
    
    return netChanges;
  }

  // USD 변환
  private async convertNetChangesToUSD(netChanges: { [token: string]: number }, blockNumber: number): Promise<number> {
    let totalUSD = 0;
    
    const priceMap: { [key: string]: number } = {
      'USDC': 1,
      'USDT': 1,
      'DAI': 1,
      'WETH': 380, // Harvest attack 시점
      'ETH': 380,
      'WBTC': 13000
    };
    
    for (const [token, rawChange] of Object.entries(netChanges)) {
      const normalizedChange = this.normalizeAmount(rawChange, token);
      const price = priceMap[token] || 1;
      const usdValue = normalizedChange * price;
      
      totalUSD += usdValue;
      
      if (Math.abs(usdValue) > 100) { // $100 이상만 로깅
        console.log(`     💲 ${token}: ${normalizedChange.toFixed(6)} × $${price} = $${usdValue.toFixed(2)}`);
      }
    }
    
    return totalUSD;
  }

  // 참가자별 분석 기반 공격 판단
  private determineParticipantBasedAttack(pnlResults: ParticipantPNLResult): {
    isAttack: boolean;
    confidence: number;
    explanation: string;
  } {
    
    const attackerProfit = pnlResults.attacker ? 
      pnlResults.netChangesUSD[pnlResults.attacker.address] || 0 : 0;
    const victimLoss = pnlResults.victim ? 
      Math.abs(pnlResults.netChangesUSD[pnlResults.victim.address] || 0) : 0;
    
    const hasSignificantProfit = Math.abs(attackerProfit) > this.profitThreshold;
    const hasSignificantVictimLoss = victimLoss > this.profitThreshold;
    const isProfitable = attackerProfit > 0;
    
    let isAttack = false;
    let confidence = 0;
    let explanation = "";
    
    if (isProfitable && hasSignificantProfit && hasSignificantVictimLoss && pnlResults.attacker && pnlResults.victim) {
      isAttack = true;
      confidence = 0.95;
      explanation = `High-confidence attack: ${pnlResults.attacker.name} gained $${attackerProfit.toFixed(0)}, ${pnlResults.victim.name} lost $${victimLoss.toFixed(0)}`;
    } else if (isProfitable && hasSignificantProfit) {
      isAttack = true;
      confidence = 0.7;
      explanation = `Moderate attack: $${attackerProfit.toFixed(2)} profit detected`;
    } else if (hasSignificantProfit) {
      isAttack = true;
      confidence = 0.5;
      explanation = `Low-confidence: Significant value change $${attackerProfit.toFixed(2)}`;
    } else {
      isAttack = false;
      confidence = 0;
      explanation = `Normal transaction: $${attackerProfit.toFixed(2)} net change within threshold`;
    }
    
    return { isAttack, confidence, explanation };
  }

  // 공격 여부 판단 (기존 방식 - 호환성 유지)
  private determineFlashLoanAttack(netProfitUSD: number, netChanges: { [token: string]: number }): {
    isAttack: boolean;
    confidence: number;
    explanation: string;
  } {
    
    const hasSignificantProfit = Math.abs(netProfitUSD) > this.profitThreshold;
    const hasMultipleTokenChanges = Object.keys(netChanges).length > 2;
    const isProfitable = netProfitUSD > 0;
    
    let isAttack = false;
    let confidence = 0;
    let explanation = "";
    
    if (isProfitable && hasSignificantProfit && hasMultipleTokenChanges) {
      isAttack = true;
      confidence = 0.9;
      explanation = `High-confidence flash loan attack: $${netProfitUSD.toFixed(2)} profit with complex token flows`;
    } else if (isProfitable && hasSignificantProfit) {
      isAttack = true;
      confidence = 0.7;
      explanation = `Moderate flash loan attack: $${netProfitUSD.toFixed(2)} profit`;
    } else if (hasSignificantProfit) {
      isAttack = true;
      confidence = 0.5;
      explanation = `Low-confidence: Significant value change $${netProfitUSD.toFixed(2)}`;
    } else {
      isAttack = false;
      confidence = 0;
      explanation = `Normal transaction: $${netProfitUSD.toFixed(2)} net change within threshold`;
    }
    
    return { isAttack, confidence, explanation };
  }

  // PNL 결과를 토큰별 변화량으로 변환
  private convertPNLResultsToTokens(pnlResults: ParticipantPNLResult): { [token: string]: number } {
    const tokenChanges: { [token: string]: number } = {};
    
    // 공격자의 토큰 변화량만 반환 (기존 인터페이스 호환성)
    if (pnlResults.attacker) {
      const attackerBalances = pnlResults.balances[pnlResults.attacker.address] || {};
      Object.entries(attackerBalances).forEach(([token, balance]) => {
        if (Math.abs(balance) > 1000000) { // 유의미한 변화만
          tokenChanges[token] = balance;
        }
      });
    }
    
    return tokenChanges;
  }

  // 헬퍼 함수들
  private updateTokenBalance(tokenBalance: { [token: string]: number }, token: string, amount: number) {
    tokenBalance[token] = (tokenBalance[token] || 0) + amount;
  }

  private normalizeAmount(amount: number, token: string): number {
    const decimalsMap: { [key: string]: number } = {
      'USDC': 6, 'USDT': 6, 'DAI': 18, 'WETH': 18, 'ETH': 18, 'WBTC': 8
    };
    const decimals = decimalsMap[token] || 18;
    return amount / Math.pow(10, decimals);
  }

  private isDEXEdge(edgeData: unknown): boolean {
    const data = edgeData as Record<string, unknown>;
    return data.AmountIn !== undefined && data.AmountOut !== undefined;
  }

  private isLendingEdge(edgeData: unknown): boolean {
    const data = edgeData as Record<string, unknown>;
    return !!(data.Amount && data.Token && 
           data.Action && ['Deposit', 'Withdraw', 'Borrow', 'Repay'].includes(data.Action as string));
  }
} 