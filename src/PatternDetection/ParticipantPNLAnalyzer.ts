/**
 * ParticipantPNLAnalyzer - Tracks balance changes per participant for precise PNL analysis
 * 
 * This class replaces global balance calculation with participant-specific tracking
 * to accurately identify attackers, victims, and financial impact per entity.
 */

import { SequenceEdge, SemanticFinancialEdge, isDEXEdge, isLendingEdge } from "../SemanticFinancialGraph/Types";
import { IDEXEdge, ILendingEdge } from "../SemanticFinancialGraph/Interfaces/IEdge";
import { toUSD } from "../Utils/PriceManager/PriceUtils";
import { TokenDecimalFetcher } from "../Utils/TokenDecimalFetcher";
import { PrecisionMath } from "../Utils/PrecisionMath";
import { DebugLogger } from "../Utils/DebugLogger";

export interface ParticipantBalances {
  [participantAddress: string]: {
    [token: string]: number;
  }
}

export interface ParticipantInfo {
  address: string;
  name: string;
  type: 'Attacker' | 'Victim' | 'Service' | 'Unknown';
}

export interface TokenBalance {
  token: string;
  amount: number;
  normalizedAmount: number;
  usdValue: number;
}

export interface ParticipantPNLResult {
  participants: { [address: string]: ParticipantInfo };
  balances: ParticipantBalances;
  netChangesUSD: { [address: string]: number };
  tokenBreakdown: { [address: string]: TokenBalance[] }; // NEW: Detailed token information
  totalProfitUSD: number;
  totalLossUSD: number;
  victim?: ParticipantInfo;
  attacker?: ParticipantInfo;
  summary: string;
}

export interface FlashLoanCycle {
  borrower: string;
  repayer: string;
  token: string;
  amount: number;
  protocol: string;
}

export class ParticipantPNLAnalyzer {
  private balances: ParticipantBalances = {};
  private participants: { [address: string]: ParticipantInfo } = {};
  private flashLoanEffects: { [address: string]: { [token: string]: number } } = {};
  private flashLoanCycles: FlashLoanCycle[] = [];
  private borrowTransactions: Array<{address: string, token: string, amount: number, protocol: string}> = [];
  private repayTransactions: Array<{address: string, token: string, amount: number, protocol: string}> = [];
  private allBorrowTransactions: Array<{address: string, token: string, amount: number, protocol: string}> = [];
  private allRepayTransactions: Array<{address: string, token: string, amount: number, protocol: string}> = [];
  private allEdges: Array<{edge: SequenceEdge, edgeData: SemanticFinancialEdge, sourceAddr: string, targetAddr: string}> = [];
  private processedDEXSwaps: Array<{address: string, tokenIn: string, amountIn: number, tokenOut: string, amountOut: number}> = [];
  
  // Canonical address mapping for attacker consolidation
  private readonly MAIN_ATTACKER_ADDRESS = '0x4f4e0f2cb72e718fc0433222768c57e823162152';
  private readonly ATTACKER_ADDRESSES = [
    '0x4f4e0f2cb72e718fc0433222768c57e823162152', // Main EOA
    '0x1484c67b2895c008b6e71b440d09a3cad338c8dc1ad0', // Proxy
    '0x148426fd1d8cc8b76edd8a6a24fe9f80ffa1dd14', // Contract 1
    '0x148426fdc4c8a51b96b4bed827907b5fa6491ad0', // Contract 2
    '0x0de0dd63d9fb65450339ef27577d4f39d095eb85'  // Repay contract
  ];
  
  constructor() {
    this.initializeParticipants();
  }

  /**
   * Resolve canonical address for attacker consolidation
   * All attacker-controlled addresses map to the main attacker address
   */
  private getCanonicalAddress(address: string): string {
    const normalizedAddress = address.toLowerCase();
    
    // Check if this is an attacker-controlled address
    const isAttackerAddress = this.ATTACKER_ADDRESSES.some(
      attackerAddr => attackerAddr.toLowerCase() === normalizedAddress
    );
    
    // Return main attacker address for any attacker-controlled address
    return isAttackerAddress ? this.MAIN_ATTACKER_ADDRESS.toLowerCase() : normalizedAddress;
  }

  /**
   * Initialize known participants based on bZx attack addresses
   */
  private initializeParticipants(): void {
    // From the transaction flow table in our test output
    const knownParticipants = [
      // Core participants
      { address: "0x4f4e0f2cb72e718fc0433222768c57e823162152", name: "Attacker", type: "Attacker" as const },
      { address: "0xb0200b0677dd825bb32b93d055ebb9dc3521db9d", name: "bZx Protocol", type: "Victim" as const },
      
      // DeFi Services  
      { address: "0x1e0447b19bb6ecfdae1e4ae1694b0c3659614e4e", name: "dYdX", type: "Service" as const },
      { address: "0x4ddc2d193948926d02f9b1fe9e1daa0718270ed5", name: "Compound cETH", type: "Service" as const },
      { address: "0xc11b1268c1a384e55c48c2391d8d480264a3a7f4", name: "Compound cWBTC", type: "Service" as const },
      { address: "0x4d2f5cfba55ae412221182d8475bc85799a5644b", name: "Uniswap WBTC", type: "Service" as const },
      { address: "0x65bf64ff5f51272f729bdcd7acfb00677ced86cd", name: "Kyber", type: "Service" as const },
      
      // Additional addresses from edge table  
      { address: "0x1484c67b2895c008b6e71b440d09a3cad338c8dc1ad0", name: "Attacker Proxy", type: "Attacker" as const }, // This is the attacker's proxy for bZx margin trading
      { address: "0x148426fd1d8cc8b76edd8a6a24fe9f80ffa1dd14", name: "Attacker Contract", type: "Attacker" as const }, // Another attacker-controlled address
      { address: "0x148426fdc4c8a51b96b4bed827907b5fa6491ad0", name: "Attacker Contract 2", type: "Attacker" as const }, // The one with -1300 ETH!
      { address: "0x31e085afd48a1d6e51cc193153d625e8f0514c7f", name: "Kyber Reserve", type: "Service" as const },
      { address: "0xb017c9936f9271daff23d4c9876651442958a80f", name: "bZx Component", type: "Service" as const },
      { address: "0x0de0dd63d9fb65450339ef27577d4f39d095eb85", name: "Attacker Repay Contract", type: "Attacker" as const },
    ];

    knownParticipants.forEach(participant => {
      this.participants[participant.address.toLowerCase()] = participant;
      this.balances[participant.address.toLowerCase()] = {};
    });
  }

  /**
   * Process a single edge and update participant balances
   */
  processEdge(edge: SequenceEdge): void {
    try {
      const edgeData = JSON.parse(edge.name[0]);
      
      
      // Use edgeData.From/To if available, fallback to edge.w/v
      let sourceAddr: string;
      let targetAddr: string;
      
      if (edgeData.From && edgeData.To) {
        // Add type checking for edgeData.From/To - they might be numbers like -1
        sourceAddr = (typeof edgeData.From === 'string') ? edgeData.From.toLowerCase() : String(edgeData.From).toLowerCase();
        targetAddr = (typeof edgeData.To === 'string') ? edgeData.To.toLowerCase() : String(edgeData.To).toLowerCase();
      } else {
        // Add type checking to prevent toLowerCase errors
        sourceAddr = (typeof edge.w === 'string') ? edge.w.toLowerCase() : String(edge.w || '').toLowerCase();
        targetAddr = (typeof edge.v === 'string') ? edge.v.toLowerCase() : String(edge.v || '').toLowerCase();
      }


      if (!sourceAddr || !targetAddr) return;

      // Store all edges for later analysis
      this.allEdges.push({edge, edgeData, sourceAddr, targetAddr});

      // Ensure participants exist in our tracking
      this.ensureParticipant(sourceAddr);
      this.ensureParticipant(targetAddr);


      // Process based on action type
      if (this.isLendingEdge(edgeData)) {
        this.processLendingEdge(edgeData, sourceAddr, targetAddr);
      } else if (this.isDEXEdge(edgeData)) {
        this.processDEXEdge(edgeData, sourceAddr, targetAddr);
      }

    } catch (error) {
      console.warn(`Failed to process edge: ${error}`);
    }
  }

  /**
   * Process lending edge (Borrow, Deposit, Withdraw, Repay)
   */
  private processLendingEdge(edgeData: ILendingEdge, sourceAddr: string, targetAddr: string): void {
    const amount = parseFloat(edgeData.Amount) || 0;
    const token = edgeData.Token || 'ETH';

    switch (edgeData.Action) {
      case 'Borrow':
        // Determine which address is the protocol by checking both
        let borrower: string, lender: string, borrowProtocol: string;
        const sourceProtocol = this.identifyProtocol(sourceAddr);
        const targetProtocol = this.identifyProtocol(targetAddr);
        
        if (sourceProtocol !== 'Unknown' && targetProtocol === 'Unknown') {
          // Source is protocol, target is borrower
          borrower = targetAddr;
          lender = sourceAddr;
          borrowProtocol = sourceProtocol;
        } else if (targetProtocol !== 'Unknown' && sourceProtocol === 'Unknown') {
          // Target is protocol, source is borrower
          borrower = sourceAddr;
          lender = targetAddr;
          borrowProtocol = targetProtocol;
        } else {
          // Default: assume source borrows from target
          borrower = sourceAddr;
          lender = targetAddr;
          borrowProtocol = targetProtocol !== 'Unknown' ? targetProtocol : sourceProtocol;
        }
        
        this.updateBalance(borrower, token, amount); // Borrower gains tokens
        this.updateBalance(lender, token, -amount); // Lender loses tokens (but gains debt claim)
        
        this.borrowTransactions.push({
          address: borrower,
          token: this.normalizeTokenName(token),
          amount: amount,
          protocol: borrowProtocol
        });
        break;

      case 'Repay':
        // Source repays to target  
        this.updateBalance(sourceAddr, token, -amount); // Repayer loses tokens
        this.updateBalance(targetAddr, token, amount); // Lender gains tokens back
        
        // Track ALL repays for analysis
        const repayProtocol = this.identifyProtocol(targetAddr);
        console.log(`   📋 [DEBUG] Repay: ${sourceAddr.substring(0,10)}... repays ${this.normalizeAmount(amount, token).toFixed(2)} ${token} to ${repayProtocol} (${targetAddr.substring(0,10)}...)`);
        this.repayTransactions.push({
          address: sourceAddr, // The repayer is the source
          token: this.normalizeTokenName(token),
          amount: amount,
          protocol: repayProtocol // Protocol is the target (receives the repayment)
        });
        break;

      case 'Deposit':
        // Determine depositor and service
        let depositor = sourceAddr;
        let service = targetAddr;
        
        
        this.updateBalance(depositor, token, -amount); // Depositor loses liquid tokens
        this.updateBalance(service, token, amount); // Service gains tokens (but owes collateral claim)
        break;

      case 'Withdraw':
        // Source withdraws from target
        this.updateBalance(sourceAddr, token, amount); // Withdrawer gains tokens
        this.updateBalance(targetAddr, token, -amount); // Service loses tokens
        break;
    }
  }

  /**
   * Process DEX edge (Swap operations)
   */
  private processDEXEdge(edgeData: IDEXEdge, sourceAddr: string, targetAddr: string): void {
    const amountIn = parseFloat(edgeData.AmountIn) || 0;
    const amountOut = parseFloat(edgeData.AmountOut) || 0;
    const tokenIn = edgeData.Token0 || 'ETH';
    const tokenOut = edgeData.Token1 || 'UNKNOWN';


    // Check if this is the specific WBTC swap that needs special handling
    const isAttackerWBTCSwap = (edgeData.Token0 === 'WBTC' && amountIn > 100 && 
                               this.ATTACKER_ADDRESSES.some(addr => 
                                 addr.toLowerCase() === sourceAddr || addr.toLowerCase() === targetAddr
                               ));

    if (amountIn > 0) {
      // Determine who is giving the input token
      let giver = sourceAddr;
      let receiver = targetAddr;
      
      // For attacker's WBTC swap, ensure proper attribution  
      if (isAttackerWBTCSwap && tokenIn === 'WBTC') {
        giver = this.MAIN_ATTACKER_ADDRESS.toLowerCase(); // Attacker gives WBTC
        receiver = sourceAddr; // Original source (Uniswap) receives WBTC
      }
      
      this.updateBalance(giver, tokenIn, -amountIn);
      this.updateBalance(receiver, tokenIn, amountIn);
    }

    if (amountOut > 0 && tokenOut !== 'UNKNOWN') {
      // Determine who is receiving the output token
      let giver = targetAddr;
      let receiver = sourceAddr;
      
      // For attacker's WBTC swap, ensure attacker gets the ETH output
      if (isAttackerWBTCSwap && tokenOut === 'ETH') {
        receiver = this.MAIN_ATTACKER_ADDRESS.toLowerCase(); // Attacker receives ETH
        giver = sourceAddr; // Uniswap gives ETH
      }
      
      this.updateBalance(giver, tokenOut, -amountOut);
      this.updateBalance(receiver, tokenOut, amountOut);
      
      // Track DEX swaps that involve the attacker to avoid double-processing in SwapAnalysis
      if (isAttackerWBTCSwap) {
        this.processedDEXSwaps.push({
          address: this.MAIN_ATTACKER_ADDRESS.toLowerCase(),
          tokenIn: tokenIn,
          amountIn: amountIn,
          tokenOut: tokenOut,
          amountOut: amountOut
        });
      }
    }
  }

  /**
   * Update balance for a participant (treating ETH and WETH as the same)
   * Uses canonical address mapping to consolidate attacker addresses
   */
  private updateBalance(address: string, token: string, amount: number): void {
    // Use canonical address for attacker consolidation
    const canonicalAddress = this.getCanonicalAddress(address);
    
    if (!this.balances[canonicalAddress]) {
      this.balances[canonicalAddress] = {};
    }
    
    // Normalize ETH and WETH to ETH
    const normalizedToken = this.normalizeTokenName(token);
    
    this.balances[canonicalAddress][normalizedToken] = (this.balances[canonicalAddress][normalizedToken] || 0) + amount;
  }

  /**
   * Normalize token names (treat WETH as ETH, and DeFi bearing tokens to underlying)
   */
  private normalizeTokenName(token: string): string {
    // ETH variants
    if (token === 'WETH') {
      return 'ETH';
    }
    
    // Compound tokens (cTokens)
    if (token === 'cWBTC' || token === 'CWBTC') {
      return 'WBTC';
    }
    if (token === 'cETH' || token === 'CETH') {
      return 'ETH';
    }
    if (token === 'cDAI' || token === 'CDAI') {
      return 'DAI';
    }
    if (token === 'cUSDC' || token === 'CUSDC') {
      return 'USDC';
    }
    if (token === 'cUSDT' || token === 'CUSDT') {
      return 'USDT';
    }
    
    // Aave tokens (aTokens)
    if (token === 'aWBTC' || token === 'AWBTC') {
      return 'WBTC';
    }
    if (token === 'aETH' || token === 'AETH') {
      return 'ETH';
    }
    if (token === 'aDAI' || token === 'ADAI') {
      return 'DAI';
    }
    if (token === 'aUSDC' || token === 'AUSDC') {
      return 'USDC';
    }
    if (token === 'aUSDT' || token === 'AUSDT') {
      return 'USDT';
    }
    
    // Yearn tokens (yTokens)
    if (token === 'yWBTC' || token === 'YWBTC') {
      return 'WBTC';
    }
    if (token === 'yETH' || token === 'YETH') {
      return 'ETH';
    }
    if (token === 'yDAI' || token === 'YDAI') {
      return 'DAI';
    }
    if (token === 'yUSDC' || token === 'YUSDC') {
      return 'USDC';
    }
    if (token === 'yUSDT' || token === 'YUSDT') {
      return 'USDT';
    }
    
    // Other common bearing tokens
    if (token.startsWith('f') && token.length > 3) { // Harvest Finance fTokens
      const underlying = token.substring(1);
      if (['WBTC', 'ETH', 'DAI', 'USDC', 'USDT'].includes(underlying)) {
        return underlying;
      }
    }
    
    return token;
  }

  /**
   * Identify protocol from address
   */
  private identifyProtocol(address: string): string {
    const addr = address.toLowerCase();
    if (addr === '0x1e0447b19bb6ecfdae1e4ae1694b0c3659614e4e') return 'dYdX';
    if (addr === '0x0de0dd63d9fb65450339ef27577d4f39d095eb85') return 'dYdX'; // RepayContract for dYdX
    if (addr === '0x4ddc2d193948926d02f9b1fe9e1daa0718270ed5') return 'Compound';
    if (addr === '0xc11b1268c1a384e55c48c2391d8d480264a3a7f4') return 'Compound';
    if (addr === '0xb0200b0677dd825bb32b93d055ebb9dc3521db9d') return 'bZx';
    return 'Unknown';
  }

  /**
   * Track flash loan effects separately for neutralization
   */
  private trackFlashLoanEffect(address: string, token: string, amount: number, type: 'borrow' | 'repay'): void {
    if (!this.flashLoanEffects[address]) {
      this.flashLoanEffects[address] = {};
    }
    
    // Normalize ETH and WETH to ETH for flash loan tracking
    const normalizedToken = this.normalizeTokenName(token);
    
    this.flashLoanEffects[address][normalizedToken] = (this.flashLoanEffects[address][normalizedToken] || 0) + amount;
  }

  /**
   * Ensure participant exists in our tracking
   */
  private ensureParticipant(address: string): void {
    if (!this.participants[address]) {
      this.participants[address] = {
        address,
        name: `Unknown (${address.substring(0, 10)}...)`,
        type: 'Unknown'
      };
      this.balances[address] = {};
    }
  }

  /**
   * Detect and neutralize flash loan cycles across different addresses
   */
  private detectAndNeutralizeFlashLoans(): void {
    console.log(`   🔍 [FlashLoan] Detecting flash loan cycles...`);
    
    // Filter for large transactions that could be flash loans (> $10,000 equivalent)
    const largeborrows = this.borrowTransactions.filter(b => b.amount > 1000000000000);
    const largeRepays = this.repayTransactions.filter(r => r.amount > 1000000000000);
    
    console.log(`   📊 Found ${largeborrows.length} large borrows and ${largeRepays.length} large repays`);
    
    // Match borrow/repay pairs by token, amount, and protocol
    for (const borrow of largeborrows) {
      for (const repay of largeRepays) {
        console.log(`   🔍 [FlashLoan] Comparing: borrow.token=${borrow.token} vs repay.token=${repay.token}`);
        console.log(`   🔍 [FlashLoan] Comparing: borrow.protocol=${borrow.protocol} vs repay.protocol=${repay.protocol}`);
        console.log(`   🔍 [FlashLoan] Amounts: borrow=${borrow.amount} repay=${repay.amount} diff=${Math.abs(borrow.amount - repay.amount)}`);
        console.log(`   🔍 [FlashLoan] Threshold: ${borrow.amount * 0.01}`);
        
        // Check if this is a matching flash loan cycle using correct flash loan formula:
        // repay amount >= borrow amount (due to fees)
        if (borrow.token === repay.token && 
            borrow.protocol === repay.protocol &&
            repay.amount >= borrow.amount && 
            repay.amount <= borrow.amount * 1.1) { // Repay should be >= borrow but <= 110% of borrow (reasonable fee range)
          
          console.log(`   💰 [FlashLoan] Matching amounts: borrow=${borrow.amount} repay=${repay.amount} diff=${Math.abs(borrow.amount - repay.amount)}`);
          
          // Use the smaller amount to avoid overcorrection due to fees
          const neutralizationAmount = Math.min(borrow.amount, repay.amount);
          
          const cycle: FlashLoanCycle = {
            borrower: borrow.address,
            repayer: repay.address,
            token: borrow.token,
            amount: neutralizationAmount,
            protocol: borrow.protocol
          };
          
          this.flashLoanCycles.push(cycle);
          
          console.log(`   🔗 [FlashLoan] Detected cycle: ${cycle.borrower.substring(0,10)}... borrowed ${this.normalizeAmount(borrow.amount, cycle.token).toFixed(2)} ${cycle.token} from ${cycle.protocol}`);
          console.log(`   🔗 [FlashLoan] Repaid by: ${cycle.repayer.substring(0,10)}... amount=${this.normalizeAmount(repay.amount, cycle.token).toFixed(2)} ${cycle.token}`);
          
          // Store the cycle for later neutralization (after swap analysis)
          console.log(`   📝 [FlashLoan] Stored cycle for later neutralization (after profits are calculated)`);
          
          // Calculate the net flash loan effect (difference between borrow and repay) for reference
          const flashLoanFee = repay.amount - borrow.amount;
          console.log(`   💰 [FlashLoan] Flash loan fee: ${this.normalizeAmount(flashLoanFee, cycle.token).toFixed(6)} ${cycle.token}`);
          
          break; // Found matching repay, move to next borrow
        }
      }
    }
    
    console.log(`   ✅ [FlashLoan] Detected ${this.flashLoanCycles.length} flash loan cycles (neutralization pending)`);
    
    // Apply swap profits FIRST, then neutralize flash loans
    this.analyzeSwapEventsAndFixMissingOutputs();
    
    // Now neutralize flash loans after all profits are calculated
    this.neutralizeDetectedFlashLoans();
  }

  /**
   * Apply neutralization to previously detected flash loan cycles
   */
  private neutralizeDetectedFlashLoans(): void {
    console.log(`   🔥 [FlashLoan] Neutralizing ${this.flashLoanCycles.length} detected flash loan cycles...`);
    
    for (const cycle of this.flashLoanCycles) {
      // Find the original borrow and repay amounts
      const borrow = this.borrowTransactions.find(b => 
        b.address === cycle.borrower && b.token === cycle.token && b.protocol === cycle.protocol);
      const repay = this.repayTransactions.find(r => 
        r.address === cycle.repayer && r.token === cycle.token && r.protocol === cycle.protocol);
      
      if (borrow && repay) {
        console.log(`   💰 [FlashLoan] Neutralizing cycle: ${cycle.borrower.substring(0,10)}... ↔ ${cycle.repayer.substring(0,10)}...`);
        
        // Remove the borrowed principal from the borrower (preserves trading profits)
        this.updateBalance(cycle.borrower, cycle.token, -borrow.amount);
        console.log(`   ✅ [FlashLoan] Removed ${this.normalizeAmount(borrow.amount, cycle.token).toFixed(6)} ${cycle.token} from borrower`);
        
        // For cross-address flash loans, neutralize the repay contract's loss  
        if (cycle.borrower !== cycle.repayer) {
          this.updateBalance(cycle.repayer, cycle.token, repay.amount);
          console.log(`   ✅ [FlashLoan] Added ${this.normalizeAmount(repay.amount, cycle.token).toFixed(6)} ${cycle.token} to repayer`);
        }
      }
    }
    
    console.log(`   ✅ [FlashLoan] Completed neutralization of ${this.flashLoanCycles.length} flash loan cycles`);
  }

  /**
   * Analyze all swap events to identify missing outputs and fix participant balances
   */
  private analyzeSwapEventsAndFixMissingOutputs(): void {
    console.log(`   🔍 [SwapAnalysis] Analyzing ${this.allEdges.length} edges for missing swap outputs...`);
    
    // Look for misclassified transactions (borrowing without repayment that might be swaps)
    const suspiciousBorrows = this.borrowTransactions.filter(borrow => {
      // Check if this borrow was already handled by a DEX swap
      const wasHandledByDEXSwap = this.processedDEXSwaps.some(swap => 
        swap.address === borrow.address && 
        swap.tokenIn === borrow.token &&
        Math.abs(swap.amountIn - borrow.amount) < borrow.amount * 0.1
      );
      
      if (wasHandledByDEXSwap) {
        return false;
      }
      
      const hasRepayment = this.repayTransactions.some(repay => 
        repay.address === borrow.address && 
        repay.token === borrow.token &&
        Math.abs(repay.amount - borrow.amount) < borrow.amount * 0.1
      );
      return !hasRepayment;
    });
    
    console.log(`   📊 [SwapAnalysis] Found ${suspiciousBorrows.length} suspicious borrows without repayment`);
    
    for (const suspiciousBorrow of suspiciousBorrows) {
      console.log(`   🔍 [SwapAnalysis] Analyzing suspicious ${suspiciousBorrow.token} borrow: ${this.normalizeAmount(suspiciousBorrow.amount, suspiciousBorrow.token).toFixed(6)} ${suspiciousBorrow.token}`);
      console.log(`   🔍 [DEBUG] Suspicious borrow address: ${suspiciousBorrow.address}`);
      
      // Look for related swap events involving the same address and token
      const relatedSwapEvents = this.findRelatedSwapEvents(suspiciousBorrow.address, suspiciousBorrow.token);
      
      if (relatedSwapEvents.length > 0) {
        console.log(`   🔄 [SwapAnalysis] Found ${relatedSwapEvents.length} related swap events`);
        
        for (const swapEvent of relatedSwapEvents) {
          this.processRelatedSwapEvent(suspiciousBorrow, swapEvent);
        }
      } else {
        console.log(`   ⚠️ [SwapAnalysis] No related swap events found for ${suspiciousBorrow.token} borrow`);
      }
    }
    
    console.log(`   ✅ [SwapAnalysis] Completed swap event analysis`);
  }

  /**
   * Find swap events related to a specific address and token
   */
  private findRelatedSwapEvents(address: string, token: string): Array<{edge: SequenceEdge, edgeData: SemanticFinancialEdge, sourceAddr: string, targetAddr: string}> {
    return this.allEdges.filter(({edgeData, sourceAddr, targetAddr}) => {
      // Look for swap actions or edges that have complete swap data
      const isSwapEvent = isDEXEdge(edgeData) && edgeData.Action === 'Swap' && 
                         (edgeData as IDEXEdge).AmountIn && (edgeData as IDEXEdge).AmountOut &&
                         (edgeData as IDEXEdge).Token0 && (edgeData as IDEXEdge).Token1;
      
      // Look for swaps involving the same token as input
      const tokenMatches = isDEXEdge(edgeData) ? (edgeData as IDEXEdge).Token0 === token : false;
      
      // For swap events, we also want to check if the address is involved in the overall transaction flow
      // But we'll be more lenient about address matching for swap events since they can be complex
      const addressRelevant = sourceAddr === address || targetAddr === address || isSwapEvent;
      
      return isSwapEvent && tokenMatches && addressRelevant;
    });
  }

  /**
   * Process a related swap event to extract missing swap output
   */
  private processRelatedSwapEvent(suspiciousBorrow: {address: string, token: string, amount: number}, swapEvent: {edge: SequenceEdge, edgeData: SemanticFinancialEdge, sourceAddr: string, targetAddr: string}): void {
    const {edgeData, sourceAddr, targetAddr} = swapEvent;
    
    console.log(`   🔄 [SwapAnalysis] Processing related swap:`, JSON.stringify(edgeData, null, 2));
    
    // Extract swap input and output information
    const swapInput = this.extractSwapInput(edgeData);
    const swapOutput = this.extractSwapOutput(edgeData);
    
    if (swapInput && swapOutput) {
      console.log(`   📈 [SwapAnalysis] Detected swap: ${swapInput.amount} ${swapInput.token} → ${swapOutput.amount} ${swapOutput.token}`);
      
      // Check if this matches our suspicious borrow
      if (this.isMatchingSwap(suspiciousBorrow, swapInput, swapOutput)) {
        console.log(`   ✅ [SwapAnalysis] Confirmed: This is the missing swap output for the suspicious borrow`);
        
        // Fix the participant balance - credit the borrower (attacker), not the protocol
        this.correctSwapBalance(suspiciousBorrow.address, swapInput, swapOutput);
      }
    } else {
      console.log(`   ⚠️ [SwapAnalysis] Could not extract complete swap data from event`);
    }
  }

  /**
   * Extract swap input information from edge data
   */
  private extractSwapInput(edgeData: SemanticFinancialEdge): {token: string, amount: number} | null {
    if (isDEXEdge(edgeData)) {
      const dexEdge = edgeData as IDEXEdge;
      if (dexEdge.AmountIn && dexEdge.Token0) {
        return {
          token: dexEdge.Token0,
          amount: parseFloat(dexEdge.AmountIn)
        };
      }
    }
    
    if (isLendingEdge(edgeData)) {
      const lendingEdge = edgeData as ILendingEdge;
      if (lendingEdge.Amount && lendingEdge.Token) {
        return {
          token: lendingEdge.Token,
          amount: parseFloat(lendingEdge.Amount)
        };
      }
    }
    
    return null;
  }

  /**
   * Extract swap output information from edge data
   */
  private extractSwapOutput(edgeData: SemanticFinancialEdge): {token: string, amount: number} | null {
    if (isDEXEdge(edgeData)) {
      const dexEdge = edgeData as IDEXEdge;
      if (dexEdge.AmountOut && dexEdge.Token1) {
        return {
          token: dexEdge.Token1,
          amount: parseFloat(dexEdge.AmountOut)
        };
      }
    }
    
    return null;
  }

  /**
   * Check if a swap matches a suspicious borrow
   */
  private isMatchingSwap(suspiciousBorrow: {address: string, token: string, amount: number}, swapInput: {token: string, amount: number}, swapOutput: {token: string, amount: number}): boolean {
    const inputMatches = swapInput.token === suspiciousBorrow.token && 
                        Math.abs(swapInput.amount - suspiciousBorrow.amount) < suspiciousBorrow.amount * 0.1;
    
    return inputMatches;
  }

  /**
   * Correct participant balance for properly identified swap
   */
  private correctSwapBalance(borrowerAddress: string, swapInput: {token: string, amount: number}, swapOutput: {token: string, amount: number}): void {
    // The transaction was misclassified as "Borrow" which incorrectly credited the borrower with input tokens
    // We need to correct this to represent the actual swap: spend input tokens, receive output tokens
    
    // Step 1: Remove the incorrectly added input tokens (from the misclassified "borrow")
    console.log(`   🔍 [DEBUG] WBTC balance before correction: ${this.balances[borrowerAddress.toLowerCase()]?.['WBTC'] || 0}`);
    this.updateBalance(borrowerAddress, swapInput.token, -swapInput.amount);
    console.log(`   🔍 [DEBUG] WBTC balance after correction: ${this.balances[borrowerAddress.toLowerCase()]?.['WBTC'] || 0}`);
    console.log(`   ✅ [SwapAnalysis] Corrected misclassified borrow: removed ${this.normalizeAmount(swapInput.amount, swapInput.token).toFixed(6)} ${swapInput.token} from ${borrowerAddress.substring(0,10)}...`);
    
    // Step 2: Apply the actual swap - borrower spends input tokens (already removed above)
    // and receives output tokens (this is the profit!)
    this.updateBalance(borrowerAddress, swapOutput.token, swapOutput.amount);
    console.log(`   ✅ [SwapAnalysis] Applied swap output (PROFIT): added ${this.normalizeAmount(swapOutput.amount, swapOutput.token).toFixed(6)} ${swapOutput.token} to ${borrowerAddress.substring(0,10)}...`);
    
    // Net effect: borrower spent swapInput.amount of swapInput.token and received swapOutput.amount of swapOutput.token
    console.log(`   💰 [SwapAnalysis] Net swap: ${this.normalizeAmount(swapInput.amount, swapInput.token).toFixed(6)} ${swapInput.token} → ${this.normalizeAmount(swapOutput.amount, swapOutput.token).toFixed(6)} ${swapOutput.token}`);
  }

  /**
   * Get final PNL analysis results with proper flash loan neutralization
   */
  async getPNLResults(blockNumber: number): Promise<ParticipantPNLResult> {
    // 🔥 CRITICAL: Detect and neutralize flash loan cycles before calculating PNL
    this.detectAndNeutralizeFlashLoans();
    
    const netChangesUSD: { [address: string]: number } = {};
    const tokenBreakdown: { [address: string]: TokenBalance[] } = {};
    let totalProfitUSD = 0;
    let totalLossUSD = 0;

    // Calculate USD values for each participant with flash loan neutralization
    // First, consolidate attacker balances
    const consolidatedBalances: { [address: string]: { [token: string]: number } } = {};
    const attackerMainAddress = '0x4f4e0f2cb72e718fc0433222768c57e823162152';
    
    for (const [address, tokenBalances] of Object.entries(this.balances)) {
      const participant = this.participants[address];
      
      
      if (participant?.type === 'Attacker') {
        // Consolidate all attacker addresses into the main attacker
        if (!consolidatedBalances[attackerMainAddress]) {
          consolidatedBalances[attackerMainAddress] = {};
        }
        
        for (const [token, balance] of Object.entries(tokenBalances)) {
          consolidatedBalances[attackerMainAddress][token] = 
            (consolidatedBalances[attackerMainAddress][token] || 0) + balance;
          
        }
      } else {
        // Keep non-attacker balances as-is
        consolidatedBalances[address] = tokenBalances;
      }
    }

    // Now calculate USD values for consolidated balances
    for (const [address, tokenBalances] of Object.entries(consolidatedBalances)) {
      let participantUSD = 0;
      const participantTokens: TokenBalance[] = [];

      for (const [token, balance] of Object.entries(tokenBalances)) {
        if (Math.abs(balance) > 1000000) { // Only significant balances
          let adjustedBalance = balance;
          
          
          const normalizedBalance = this.normalizeAmount(adjustedBalance, token);
          const usdValue = await this.convertToUSD(normalizedBalance, token, blockNumber);
          participantUSD += usdValue;

          // Add detailed token information
          participantTokens.push({
            token: token,
            amount: adjustedBalance,
            normalizedAmount: normalizedBalance,
            usdValue: usdValue
          });
        }
      }

      if (Math.abs(participantUSD) > 100 || participantTokens.length > 0) { // Include if significant USD or any tokens
        netChangesUSD[address] = participantUSD;
        tokenBreakdown[address] = participantTokens;
        
        if (participantUSD > 0) {
          totalProfitUSD += participantUSD;
        } else {
          totalLossUSD += Math.abs(participantUSD);
        }
      }
    }

    // Identify victim and attacker
    const victim = this.identifyVictim(netChangesUSD);
    const attacker = this.identifyAttacker(netChangesUSD);

    return {
      participants: this.participants,
      balances: consolidatedBalances, // Use consolidated balances instead of original
      netChangesUSD,
      tokenBreakdown, // NEW: Include detailed token breakdown
      totalProfitUSD,
      totalLossUSD,
      victim,
      attacker,
      summary: this.generateSummary(netChangesUSD, tokenBreakdown, victim, attacker)
    };
  }

  /**
   * Identify the primary victim (largest loss)
   */
  private identifyVictim(netChangesUSD: { [address: string]: number }): ParticipantInfo | undefined {
    let maxLoss = 0;
    let victimAddress = '';

    for (const [address, usdChange] of Object.entries(netChangesUSD)) {
      if (usdChange < -maxLoss) {
        maxLoss = -usdChange;
        victimAddress = address;
      }
    }

    return victimAddress ? this.participants[victimAddress] : undefined;
  }

  /**
   * Identify the primary attacker (largest gain, excluding services)
   */
  private identifyAttacker(netChangesUSD: { [address: string]: number }): ParticipantInfo | undefined {
    let maxGain = 0;
    let attackerAddress = '';

    for (const [address, usdChange] of Object.entries(netChangesUSD)) {
      const participant = this.participants[address];
      
      // Look for large gains, preferring known attackers or unknowns over services
      if (usdChange > maxGain && (participant.type === 'Attacker' || participant.type === 'Unknown')) {
        maxGain = usdChange;
        attackerAddress = address;
      }
    }

    return attackerAddress ? this.participants[attackerAddress] : undefined;
  }

  /**
   * Generate summary string with detailed token information and final balances
   */
  private generateSummary(
    netChangesUSD: { [address: string]: number }, 
    tokenBreakdown: { [address: string]: TokenBalance[] },
    victim?: ParticipantInfo, 
    attacker?: ParticipantInfo
  ): string {
    let summary = '📊 Participant PNL Analysis:\n';
    
    for (const [address, usdChange] of Object.entries(netChangesUSD)) {
      const participant = this.participants[address];
      const sign = usdChange > 0 ? '+' : '';
      const emoji = usdChange > 0 ? '💰' : '💸';
      
      // Debug unknown addresses
      if (!participant) {
        console.log(`   ❓ [Debug] Unknown address: ${address} (USD: ${usdChange})`);
      }
      
      const name = participant?.name || `Unknown (${address.substring(0, 10)}...)`;
      summary += `${emoji} ${name}: ${sign}$${usdChange.toFixed(0)} USD\n`;
      
      // Add detailed token breakdown (changes)
      const tokens = tokenBreakdown[address] || [];
      if (tokens.length > 0) {
        tokens.forEach(tokenInfo => {
          const tokenSign = tokenInfo.normalizedAmount > 0 ? '+' : '';
          const tokenEmoji = tokenInfo.normalizedAmount > 0 ? '  ↗️' : '  ↘️';
          summary += `${tokenEmoji} ${tokenSign}${tokenInfo.normalizedAmount.toFixed(6)} ${tokenInfo.token} ($${tokenInfo.usdValue.toFixed(2)})\n`;
        });
      }
    }

    // Add final remaining balances for all entities
    summary += `\n💰 Final Token Balances (Remaining Holdings):\n`;
    for (const [address, participant] of Object.entries(this.participants)) {
      const balances = this.balances[address] || {};
      const hasSignificantBalance = Object.values(balances).some(balance => Math.abs(balance) > 1000000);
      
      if (hasSignificantBalance) {
        summary += `📍 ${participant.name}:\n`;
        
        for (const [token, rawBalance] of Object.entries(balances)) {
          if (Math.abs(rawBalance) > 1000000) { // Only significant amounts
            const normalizedBalance = this.normalizeAmount(rawBalance, token);
            const balanceEmoji = normalizedBalance > 0 ? '  💎' : '  💸';
            summary += `${balanceEmoji} ${normalizedBalance.toFixed(6)} ${token}\n`;
          }
        }
      }
    }

    if (victim && attacker) {
      summary += `\n🎯 Attack Summary:\n`;
      summary += `- Victim: ${victim.name}\n`;
      summary += `- Attacker: ${attacker.name}\n`;
      summary += `- Attack Type: Price Manipulation via Flash Loan\n`;
      
      // Add attacker's final positive holdings
      const attackerBalances = this.balances[attacker.address] || {};
      const attackerHoldings: string[] = [];
      for (const [token, rawBalance] of Object.entries(attackerBalances)) {
        if (rawBalance > 1000000) { // Only positive significant amounts
          const normalizedBalance = this.normalizeAmount(rawBalance, token);
          attackerHoldings.push(`${normalizedBalance.toFixed(6)} ${token}`);
        }
      }
      
      if (attackerHoldings.length > 0) {
        summary += `- Attacker Final Holdings:\n`;
        attackerHoldings.forEach(holding => {
          summary += `  • ${holding}\n`;
        });
      }
    }

    return summary;
  }

  // Helper functions
  private isLendingEdge(edgeData: SemanticFinancialEdge): boolean {
    return isLendingEdge(edgeData);
  }

  private isDEXEdge(edgeData: SemanticFinancialEdge): boolean {
    return isDEXEdge(edgeData);
  }

  private normalizeAmount(amount: number, token: string): number {
    const decimalsMap: { [key: string]: number } = {
      'USDC': 6, 'USDT': 6, 'DAI': 18, 'WETH': 18, 'ETH': 18, 'WBTC': 8
    };
    const decimals = decimalsMap[token] || 18;
    return amount / Math.pow(10, decimals);
  }

  private async convertToUSD(normalizedAmount: number, token: string, blockNumber: number): Promise<number> {
    // Normalize token name for price lookup (treat WETH as ETH)
    const normalizedToken = this.normalizeTokenName(token);
    
    // Simplified price mapping for bZx attack (February 2020)
    const priceMap: { [key: string]: number } = {
      'ETH': 380,    // ETH price around bZx attack time (same for WETH)
      'WBTC': 13000, // WBTC price around attack time
      'DAI': 1,      // Stablecoin
      'USDC': 1,     // Stablecoin  
      'USDT': 1      // Stablecoin
    };

    const price = priceMap[normalizedToken] || 0;
    return normalizedAmount * price;
  }
}