// Vault-Specific Profit Analyzer - Vault 차익거래 수익만 정확히 계산
import { DynamicPriceTracker } from './DynamicPriceTracker';
import { DebugLogger } from '../Utils/DebugLogger';

export interface VaultTransaction {
  type: 'Deposit' | 'Withdraw';
  amount: number;
  token: string;
  tokenAddress: string;
  vaultAddress: string;
  edgeIndex: number;
}

export interface VaultCycle {
  deposits: VaultTransaction[];
  withdraws: VaultTransaction[];
  netProfitRaw: number;
  netProfitUSD: number;
  profitRatio: number;
  token: string;
}

export interface VaultProfitResult {
  cycles: VaultCycle[];
  totalNetProfitUSD: number;
  totalProfitRatio: number;
  isAttack: boolean;
  confidence: number;
  explanation: string;
}

export class VaultProfitAnalyzer {
  private profitThreshold: number;
  private priceTracker: DynamicPriceTracker;
  
  constructor(profitThreshold: number = 1.0) {  // 1% 기본값 (Vault는 더 낮은 임계값)
    this.profitThreshold = profitThreshold;
    this.priceTracker = new DynamicPriceTracker();
  }

  // 🎯 메인 분석 함수
  async analyzeVaultProfit(edges: any[], blockNumber: number): Promise<VaultProfitResult> {
    DebugLogger.profit(`🏦 [VaultAnalyzer] Analyzing vault-specific profit for ${edges.length} edges...`);
    
    // 0. 실시간 가격 추출 (핵심!)
    DebugLogger.profit(`🎯 [CRITICAL] Extracting dynamic prices from DEX swaps...`);
    this.priceTracker.extractDynamicPrices(edges);
    
    // 1. Vault 트랜잭션 추출
    const vaultTransactions = this.extractVaultTransactions(edges);
    
    if (vaultTransactions.length === 0) {
      return this.createEmptyResult();
    }
    
    // 2. Vault별로 그룹화
    const vaultGroups = this.groupByVault(vaultTransactions);
    
    // 3. 각 Vault의 차익 사이클 분석
    const cycles: VaultCycle[] = [];
    for (const [vaultAddress, transactions] of vaultGroups.entries()) {
      const vaultCycles = await this.analyzeVaultCycles(vaultAddress, transactions, blockNumber);
      cycles.push(...vaultCycles);
    }
    
    // 4. 총 수익 계산
    const totalNetProfitUSD = cycles.reduce((sum, cycle) => sum + cycle.netProfitUSD, 0);
    const totalInvestment = cycles.reduce((sum, cycle) => 
      sum + cycle.deposits.reduce((depSum, dep) => depSum + dep.amount, 0), 0
    );
    const totalWithdrawal = cycles.reduce((sum, cycle) => 
      sum + cycle.withdraws.reduce((withSum, wit) => withSum + wit.amount, 0), 0
    );
    
    const totalProfitRatio = totalInvestment > 0 ? (totalWithdrawal / totalInvestment) * 100 : 0;
    
    // 5. 공격 여부 판단
    const attackAnalysis = this.determineVaultAttack(totalNetProfitUSD, totalProfitRatio);
    
    DebugLogger.profit(`🏦 [VaultAnalyzer] Total Vault Profit: $${totalNetProfitUSD.toFixed(2)} (${totalProfitRatio.toFixed(2)}%)`);
    
    return {
      cycles,
      totalNetProfitUSD,
      totalProfitRatio,
      ...attackAnalysis
    };
  }

  // Vault 트랜잭션 추출
  private extractVaultTransactions(edges: any[]): VaultTransaction[] {
    const vaultTransactions: VaultTransaction[] = [];
    
    for (let i = 0; i < edges.length; i++) {
      const edge = edges[i];
      const edgeData = JSON.parse(edge.name);
      
      // Lending Edge만 처리 (Vault 트랜잭션)
      if (this.isLendingEdge(edgeData) && (edgeData.Action === 'Deposit' || edgeData.Action === 'Withdraw')) {
        const vaultTransaction: VaultTransaction = {
          type: edgeData.Action,
          amount: parseFloat(edgeData.Amount),
          token: edgeData.Token,
          tokenAddress: edgeData.TokenAddr,
          vaultAddress: edgeData.To || edge.w, // Vault contract address
          edgeIndex: i
        };
        
        vaultTransactions.push(vaultTransaction);
      }
    }
    
    return vaultTransactions;
  }

  // Vault별 그룹화
  private groupByVault(transactions: VaultTransaction[]): Map<string, VaultTransaction[]> {
    const groups = new Map<string, VaultTransaction[]>();
    
    for (const tx of transactions) {
      const key = `${tx.vaultAddress}_${tx.token}`; // Vault + Token으로 그룹화
      
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(tx);
    }
    
    return groups;
  }

  // Vault 사이클 분석
  private async analyzeVaultCycles(vaultAddress: string, transactions: VaultTransaction[], blockNumber: number): Promise<VaultCycle[]> {
    const deposits = transactions.filter(tx => tx.type === 'Deposit').sort((a, b) => a.edgeIndex - b.edgeIndex);
    const withdraws = transactions.filter(tx => tx.type === 'Withdraw').sort((a, b) => a.edgeIndex - b.edgeIndex);
    
    if (deposits.length === 0 || withdraws.length === 0) {
      return [];
    }
    
    // 🎯 새로운 방식: 개별 Deposit-Withdraw 사이클별 차익 계산
    const cycles: VaultCycle[] = [];
    const minPairs = Math.min(deposits.length, withdraws.length);
    
    for (let i = 0; i < minPairs; i++) {
      const deposit = deposits[i];
      const withdraw = withdraws[i];
      
      // 개별 사이클의 차익 계산
      const cycleDepositAmount = deposit.amount;
      const cycleWithdrawAmount = withdraw.amount;
      const netProfitRaw = cycleWithdrawAmount - cycleDepositAmount;
      
      // USD 변환 (동적 가격 사용)
      const token = deposit.token;
      const avgEdgeIndex = Math.floor((deposit.edgeIndex + withdraw.edgeIndex) / 2);
      const netProfitUSD = await this.convertToUSDWithDynamicPrice(netProfitRaw, token, blockNumber, avgEdgeIndex);
      const profitRatio = cycleDepositAmount > 0 ? (cycleWithdrawAmount / cycleDepositAmount) * 100 : 0;
      
      // 개별 사이클 결과 저장
      cycles.push({
        deposits: [deposit],
        withdraws: [withdraw],
        netProfitRaw,
        netProfitUSD,
        profitRatio,
        token
      });
    }
    
    return cycles;
  }

  // 공격 여부 판단
  private determineVaultAttack(totalNetProfitUSD: number, totalProfitRatio: number): {
    isAttack: boolean;
    confidence: number;
    explanation: string;
  } {
    // Vault 공격은 일반적으로 작은 차익이지만 절대금액이 클 수 있음
    const hasSignificantProfit = Math.abs(totalNetProfitUSD) > 1000; // $1,000 이상
    const exceedsThreshold = Math.abs(totalProfitRatio - 100) > this.profitThreshold; // 1% 이상 차이
    const isLargeProfit = Math.abs(totalNetProfitUSD) > 100000; // $100,000 이상
    
    let isAttack = false;
    let confidence = 0;
    let explanation = "";
    
    if (isLargeProfit && exceedsThreshold) {
      isAttack = true;
      confidence = 0.9;
      explanation = `High-confidence vault exploit: $${totalNetProfitUSD.toFixed(2)} profit with ${totalProfitRatio.toFixed(4)}% ratio`;
    } else if (hasSignificantProfit && exceedsThreshold) {
      isAttack = true;
      confidence = 0.7;
      explanation = `Moderate vault exploit: $${totalNetProfitUSD.toFixed(2)} profit exceeds ${this.profitThreshold}% threshold`;
    } else if (hasSignificantProfit) {
      isAttack = true;
      confidence = 0.5;
      explanation = `Low-confidence: Significant profit $${totalNetProfitUSD.toFixed(2)} but low ratio ${totalProfitRatio.toFixed(4)}%`;
    } else {
      isAttack = false;
      confidence = 0;
      explanation = `Normal vault activity: $${totalNetProfitUSD.toFixed(2)} profit within acceptable range`;
    }
    
    return { isAttack, confidence, explanation };
  }

  // USD 변환 (동적 가격 사용)
  private async convertToUSDWithDynamicPrice(amount: number, token: string, blockNumber: number, edgeIndex: number): Promise<number> {
    // 토큰별 decimal places
    const decimalsMap: { [key: string]: number } = {
      'USDC': 6,
      'USDT': 6,  
      'DAI': 18,
      'WETH': 18,
      'ETH': 18,
      'WBTC': 8
    };
    
    const decimals = decimalsMap[token] || 18;
    const normalizedAmount = amount / Math.pow(10, decimals);
    
    // 🎯 핵심: 동적 가격 사용 (DEX swap에서 추출한 실시간 가격)
    let price: number;
    
    if (token === 'USDC' || token === 'USDT') {
      // 스테이블코인의 경우 동적 가격 사용 (가장 중요!)
      price = this.priceTracker.getTokenPriceAtEdge(token, edgeIndex);
      DebugLogger.price(`   💱 [DYNAMIC] ${token} price at edge ${edgeIndex}: $${price.toFixed(8)} (vs fixed $1.00)`);
      
      // 가격이 1.0에서 크게 벗어나는 경우 알림
      const deviation = Math.abs(price - 1.0) * 100;
      if (deviation > 0.1) {
        DebugLogger.price(`   🚨 [DEPEG] ${token} depegged by ${deviation.toFixed(4)}% from $1.00!`);
      }
    } else {
      // 다른 토큰들은 기본 가격 사용
      const fallbackPrices: { [key: string]: number } = {
        'DAI': 1,
        'WETH': 380,
        'ETH': 380,
        'WBTC': 13000
      };
      price = fallbackPrices[token] || 1;
    }
    
    const usdValue = normalizedAmount * price;
    
    // 큰 금액의 경우 상세 로그 (제거됨)
    
    return usdValue;
  }

  // Lending Edge 판별
  private isLendingEdge(edgeData: any): boolean {
    return edgeData.Amount && edgeData.Token && 
           ['Deposit', 'Withdraw', 'Borrow', 'Repay'].includes(edgeData.Action);
  }

  // 빈 결과 생성
  private createEmptyResult(): VaultProfitResult {
    return {
      cycles: [],
      totalNetProfitUSD: 0,
      totalProfitRatio: 0,
      isAttack: false,
      confidence: 0,
      explanation: 'No vault transactions found'
    };
  }
} 