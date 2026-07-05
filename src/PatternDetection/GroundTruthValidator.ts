// Ground Truth Validator - $619K 재현을 위한 정확한 계산

import { DebugLogger } from '../Utils/DebugLogger';

export interface GroundTruthResult {
  totalDepositUSD: number;
  totalWithdrawUSD: number;
  netProfitUSD: number;
  profitPerCycle: number[];
  groundTruthDiff: number; // Ground Truth와의 차이
  explanation: string;
}

export class GroundTruthValidator {
  private groundTruth: number = 619408; // Ground Truth $619,408
  
  // October 28, 2020 고정 가격 (Ground Truth 기준)
  private fixedPrices: { [key: string]: number } = {
    'USDC': 1.00, // 2020년 10월 28일
    'USDT': 1.00, // 2020년 10월 28일
    'DAI': 1.00,
    'WETH': 380, // 2020년 10월 28일 ETH 가격
    'ETH': 380,
    'WBTC': 13000
  };
  
  constructor() {}

  // 🎯 Ground Truth 재현 시도
  async validateGroundTruth(edges: any[]): Promise<GroundTruthResult> {
    DebugLogger.groundtruth(`🔍 [GroundTruth] Validating against Ground Truth: $${this.groundTruth.toLocaleString()}`);
    
    // 1. Harvest Finance Vault 트랜잭션만 추출
    const vaultTransactions = this.extractHarvestVaultTransactions(edges);
    
    if (vaultTransactions.deposits.length === 0 || vaultTransactions.withdraws.length === 0) {
      return this.createEmptyResult("No Harvest vault transactions found");
    }
    
    // 2. October 28, 2020 고정 가격으로 계산
    const depositResults = await this.calculateTotalDeposits(vaultTransactions.deposits);
    const withdrawResults = await this.calculateTotalWithdraws(vaultTransactions.withdraws);
    
    // 3. 순이익 계산 (Ground Truth 방식)
    const netProfitUSD = withdrawResults.totalUSD - depositResults.totalUSD;
    const groundTruthDiff = netProfitUSD - this.groundTruth;
    
    DebugLogger.groundtruth(`🏦 [GroundTruth] Harvest Finance Calculation:`);
          DebugLogger.groundtruth(`   💰 Total Deposits: $${depositResults.totalUSD.toLocaleString()}`);
      DebugLogger.groundtruth(`   💰 Total Withdraws: $${withdrawResults.totalUSD.toLocaleString()}`);
      DebugLogger.groundtruth(`   📈 Net Profit: $${netProfitUSD.toLocaleString()}`);
      DebugLogger.groundtruth(`   🎯 Ground Truth: $${this.groundTruth.toLocaleString()}`);
      DebugLogger.groundtruth(`   📊 Difference: $${groundTruthDiff.toLocaleString()} (${((groundTruthDiff/this.groundTruth)*100).toFixed(1)}%)`);
    
    return {
      totalDepositUSD: depositResults.totalUSD,
      totalWithdrawUSD: withdrawResults.totalUSD,
      netProfitUSD,
      profitPerCycle: this.calculateCycleProfits(vaultTransactions.deposits, vaultTransactions.withdraws),
      groundTruthDiff,
      explanation: `Calculated $${netProfitUSD.toLocaleString()} vs Ground Truth $${this.groundTruth.toLocaleString()}`
    };
  }

  // Harvest Finance Vault 트랜잭션 추출
  private extractHarvestVaultTransactions(edges: any[]): {
    deposits: any[],
    withdraws: any[]
  } {
    const deposits: any[] = [];
    const withdraws: any[] = [];
    
    for (let i = 0; i < edges.length; i++) {
      const edge = edges[i];
      const edgeData = JSON.parse(edge.name);
      
      // Lending Edge (Harvest Finance 관련)
      if (this.isHarvestVaultEdge(edgeData)) {
        const transaction = {
          amount: parseFloat(edgeData.Amount),
          token: edgeData.Token,
          tokenAddress: edgeData.TokenAddr,
          vaultAddress: edgeData.To || edge.w,
          edgeIndex: i,
          action: edgeData.Action
        };
        
        if (edgeData.Action === "Deposit") {
          deposits.push(transaction);
        } else if (edgeData.Action === "Withdraw") {
          withdraws.push(transaction);
        }
      }
    }
    return { deposits, withdraws };
  }

  // 총 예치금액 계산 (October 28, 2020 가격)
  private async calculateTotalDeposits(deposits: any[]): Promise<{
    totalUSD: number,
    breakdown: Array<{token: string, amount: number, usd: number}>
  }> {
    let totalUSD = 0;
    const breakdown: Array<{token: string, amount: number, usd: number}> = [];
    
    for (const deposit of deposits) {
      const normalizedAmount = this.normalizeAmount(deposit.amount, deposit.token);
      const price = this.fixedPrices[deposit.token] || 1;
      const usdValue = normalizedAmount * price;
      
      totalUSD += usdValue;
      breakdown.push({
        token: deposit.token,
        amount: normalizedAmount,
        usd: usdValue
      });
      
      console.log(`     💳 Deposit: ${normalizedAmount.toFixed(2)} ${deposit.token} × $${price} = $${usdValue.toFixed(2)}`);
    }
    
    return { totalUSD, breakdown };
  }

  // 총 인출금액 계산 (October 28, 2020 가격)
  private async calculateTotalWithdraws(withdraws: any[]): Promise<{
    totalUSD: number,
    breakdown: Array<{token: string, amount: number, usd: number}>
  }> {
    let totalUSD = 0;
    const breakdown: Array<{token: string, amount: number, usd: number}> = [];
    
    for (const withdraw of withdraws) {
      const normalizedAmount = this.normalizeAmount(withdraw.amount, withdraw.token);
      const price = this.fixedPrices[withdraw.token] || 1;
      const usdValue = normalizedAmount * price;
      
      totalUSD += usdValue;
      breakdown.push({
        token: withdraw.token,
        amount: normalizedAmount,
        usd: usdValue
      });
      
              DebugLogger.groundtruth(`     💰 Withdraw: ${normalizedAmount.toFixed(2)} ${withdraw.token} × $${price} = $${usdValue.toFixed(2)}`);
    }
    
    return { totalUSD, breakdown };
  }

  // 사이클별 이익 계산 (참고용)
  private calculateCycleProfits(deposits: any[], withdraws: any[]): number[] {
    const profits: number[] = [];
    const minLength = Math.min(deposits.length, withdraws.length);
    
    for (let i = 0; i < minLength; i++) {
      const deposit = deposits[i];
      const withdraw = withdraws[i];
      
      if (deposit.token === withdraw.token) {
        const depositNormalized = this.normalizeAmount(deposit.amount, deposit.token);
        const withdrawNormalized = this.normalizeAmount(withdraw.amount, withdraw.token);
        const price = this.fixedPrices[deposit.token] || 1;
        
        const cycleProfit = (withdrawNormalized - depositNormalized) * price;
        profits.push(cycleProfit);
        
        DebugLogger.groundtruth(`     🔄 Cycle ${i+1}: $${cycleProfit.toFixed(2)} (${deposit.token})`);
      }
    }
    
    return profits;
  }

  // Harvest Finance Vault Edge 판별
  private isHarvestVaultEdge(edgeData: any): boolean {
    return edgeData.Amount && edgeData.Token && 
           ['Deposit', 'Withdraw'].includes(edgeData.Action) &&
           (edgeData.Token === 'USDC' || edgeData.Token === 'USDT') &&
           // Harvest Finance vault 주소들 (대략적 패턴)
           (edgeData.To?.startsWith('0xf0358e8c') || edgeData.To?.startsWith('0x053c80eA'));
  }

  // 토큰 양 정규화
  private normalizeAmount(amount: number, token: string): number {
    const decimalsMap: { [key: string]: number } = {
      'USDC': 6, 'USDT': 6, 'DAI': 18, 'WETH': 18, 'ETH': 18, 'WBTC': 8
    };
    const decimals = decimalsMap[token] || 18;
    return amount / Math.pow(10, decimals);
  }

  // 빈 결과 생성
  private createEmptyResult(explanation: string): GroundTruthResult {
    return {
      totalDepositUSD: 0,
      totalWithdrawUSD: 0,
      netProfitUSD: 0,
      profitPerCycle: [],
      groundTruthDiff: -this.groundTruth,
      explanation
    };
  }
} 