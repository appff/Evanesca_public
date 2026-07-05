// Flash Loan Fee Analyzer - Extract fees from Borrow/Repay amount difference

import { DebugLogger } from '../Utils/DebugLogger';

export interface FlashLoanPair {
  borrowEdge: any;
  repayEdge: any;
  token: string;
  borrowAmount: number;
  repayAmount: number;
  feeAmount: number;
  feeRate: number;
  protocol: string;
  edgeDistance: number; // distance between two edges
}

export interface FlashLoanFeeResult {
  totalFeeUSD: number;
  flashLoanPairs: FlashLoanPair[];
  estimatedProtocols: string[];
}

export class FlashLoanFeeAnalyzer {
  
  constructor() {}

  // 🎯 Flash loan fee analysis
  async analyzeFlashLoanFees(edges: any[], blockNumber: number): Promise<FlashLoanFeeResult> {
    DebugLogger.flashloan(`💳 [FlashLoanFee] Analyzing flash loan fees for ${edges.length} edges...`);
    
    // 1. Extract Borrow and Repay edges
    const borrowEdges = this.extractBorrowEdges(edges);
    const repayEdges = this.extractRepayEdges(edges);
    
    if (borrowEdges.length === 0 || repayEdges.length === 0) {
      return { totalFeeUSD: 0, flashLoanPairs: [], estimatedProtocols: [] };
    }
    
    // 2. Match Borrow-Repay pairs
    const flashLoanPairs = this.matchBorrowRepayPairs(borrowEdges, repayEdges);
    
    if (flashLoanPairs.length === 0) {
      return { totalFeeUSD: 0, flashLoanPairs: [], estimatedProtocols: [] };
    }
    
    // 3. Calculate fees and convert to USD
    let totalFeeUSD = 0;
    const protocols = new Set<string>();
    
    for (const pair of flashLoanPairs) {
      const feeUSD = await this.convertToUSD(pair.feeAmount, pair.token, blockNumber);
      totalFeeUSD += feeUSD;
      protocols.add(pair.protocol);
      
    }
    
          DebugLogger.flashloan(`💳 [FlashLoanFee] Total flash loan fees: $${totalFeeUSD.toFixed(2)}`);
    
    return {
      totalFeeUSD,
      flashLoanPairs,
      estimatedProtocols: Array.from(protocols)
    };
  }

  // Extract Borrow edges
  private extractBorrowEdges(edges: any[]): Array<{edge: any, edgeData: any, index: number}> {
    const borrowEdges: Array<{edge: any, edgeData: any, index: number}> = [];
    
    for (let i = 0; i < edges.length; i++) {
      const edge = edges[i];
      const edgeData = JSON.parse(edge.name);
      
      if (this.isLendingEdge(edgeData) && edgeData.Action === 'Borrow') {
        // Only consider large Borrow amounts as flash loans (threshold: $10,000)
        const amount = parseFloat(edgeData.Amount);
        if (amount > this.getFlashLoanThreshold(edgeData.Token)) {
          borrowEdges.push({ edge, edgeData, index: i });
        }
      }
    }
    
    return borrowEdges;
  }

  // Extract Repay edges
  private extractRepayEdges(edges: any[]): Array<{edge: any, edgeData: any, index: number}> {
    const repayEdges: Array<{edge: any, edgeData: any, index: number}> = [];
    
    for (let i = 0; i < edges.length; i++) {
      const edge = edges[i];
      const edgeData = JSON.parse(edge.name);
      
      if (this.isLendingEdge(edgeData) && edgeData.Action === 'Repay') {
        const amount = parseFloat(edgeData.Amount);
        if (amount > this.getFlashLoanThreshold(edgeData.Token)) {
          repayEdges.push({ edge, edgeData, index: i });
        }
      }
    }
    
    return repayEdges;
  }

  // Match Borrow-Repay pairs
  private matchBorrowRepayPairs(
    borrowEdges: Array<{edge: any, edgeData: any, index: number}>,
    repayEdges: Array<{edge: any, edgeData: any, index: number}>
  ): FlashLoanPair[] {
    const pairs: FlashLoanPair[] = [];
    
    // Find the closest Repay with the same token for each Borrow
    for (const borrow of borrowEdges) {
      const matchingRepays = repayEdges.filter(repay => 
        repay.edgeData.Token === borrow.edgeData.Token &&
        repay.index > borrow.index && // Repay occurs after Borrow
        repay.index - borrow.index < 20 // Exclude if too far apart
      );
      
      if (matchingRepays.length > 0) {
        // Select the closest Repay
        const closestRepay = matchingRepays.reduce((closest, current) => 
          (current.index - borrow.index) < (closest.index - borrow.index) ? current : closest
        );
        
        const borrowAmount = parseFloat(borrow.edgeData.Amount);
        const repayAmount = parseFloat(closestRepay.edgeData.Amount);
        const feeAmount = repayAmount - borrowAmount;
        const feeRate = (feeAmount / borrowAmount) * 100;
        
        // Include only if fee is positive and within reasonable range
        if (feeAmount > 0 && feeRate > 0 && feeRate < 5) { // 5% or less
          pairs.push({
            borrowEdge: borrow.edge,
            repayEdge: closestRepay.edge,
            token: borrow.edgeData.Token,
            borrowAmount,
            repayAmount,
            feeAmount,
            feeRate,
            protocol: this.identifyProtocol(borrow.edge),
            edgeDistance: closestRepay.index - borrow.index
          });
        }
      }
    }
    
    return pairs;
  }

  // Identify protocol (based on contract address)
  private identifyProtocol(edge: any): string {
    const address = (typeof edge.w === 'string') ? edge.w.toLowerCase() : String(edge.w || '').toLowerCase();
    
    // Major flash loan protocols
    if (address.includes('dydx') || address === '0x1e0447b19bb6ecfdae1e4ae1694b0c3659614e4e') {
      return 'dYdX';
    } else if (address.includes('aave') || address === '0x7d2768de32b0b80b7a3454c06bdac94a69ddc7a9') {
      return 'Aave';
    } else if (address.includes('compound') || address.startsWith('0x3d9819210a31b4961b30ef54be2aed79b9c9cd3b')) {
      return 'Compound';
    } else if (address.includes('maker') || address.startsWith('0x35d1b3f3d7966a1dfe207aa4514c12a259a0492b')) {
      return 'MakerDAO';
    } else if (address.includes('balancer')) {
      return 'Balancer';
    } else if (address.includes('bzx') || address === '0xb0200b0677dd825bb32b93d055ebb9dc3521db9d' || 
               address === '0x8b3d70d628ebd30d4a2ea82db95ba2e906c71633' ||
               address === '0xb017c9936f9271daff23d4c9876651442958a80f') {
      return 'bZx';
    } else {
      return 'Unknown';
    }
  }

  // Flash loan 최소 임계값 (토큰별 다름)
  private getFlashLoanThreshold(token: string): number {
    const thresholds: { [key: string]: number } = {
      'USDC': 10000 * 1e6,    // $10,000 (6 decimals)
      'USDT': 10000 * 1e6,    // $10,000 (6 decimals)
      'DAI': 10000 * 1e18,    // $10,000 (18 decimals)
      'WETH': 5 * 1e18,       // 5 ETH (18 decimals)
      'ETH': 5 * 1e18,        // 5 ETH
      'WBTC': 1 * 1e8         // 1 BTC (8 decimals)
    };
    
    return thresholds[token] || 1000 * 1e18; // default value
  }

  // USD 변환
  private async convertToUSD(amount: number, token: string, blockNumber: number): Promise<number> {
    const priceMap: { [key: string]: number } = {
      'USDC': 1,
      'USDT': 1,
      'DAI': 1,
      'WETH': 380, // Harvest attack 시점
      'ETH': 380,
      'WBTC': 13000
    };
    
    const decimalsMap: { [key: string]: number } = {
      'USDC': 6,
      'USDT': 6,
      'DAI': 18,
      'WETH': 18,
      'ETH': 18,
      'WBTC': 8
    };
    
    const price = priceMap[token] || 1;
    const decimals = decimalsMap[token] || 18;
    const normalizedAmount = amount / Math.pow(10, decimals);
    
    return normalizedAmount * price;
  }

  // Lending Edge 판별
  private isLendingEdge(edgeData: any): boolean {
    return edgeData.Amount && edgeData.Token && 
           ['Deposit', 'Withdraw', 'Borrow', 'Repay'].includes(edgeData.Action);
  }
} 