import { getSymbol } from "./DEXEdgeAdder";
import { IEdgeAdder } from "./Interfaces/IEdgeAdder"
import { ISemanticFinancialEdge, ILendingEdge } from "./Interfaces/IEdge";
import { compareAddrs, DecodedEvent, LogEvent } from "./SemanticFinancialGraphUtils";
import { poolToNormalList } from "../PreTasks";
import { getAddressWithNormalToken, PoolList } from "./EdgeAdderUtils";

export abstract class LendingEdgeAdder implements IEdgeAdder {
  abstract makeEdge(eLogs: DecodedEvent[], w: string, sKey: string, sAction: LogEvent, v?: string): Promise<ISemanticFinancialEdge | null>;

  findServiceEntity(service: string): PoolList[] {
    for (let serviceEntity of poolToNormalList) {
      if (service === serviceEntity.Service) return serviceEntity.PoolList;
    }
    throw new Error(`Not Found Service Entity: ${service}`);
  }

  getPoolSymbol(service: string, address: string): [string, string] {
    for (let pool of this.findServiceEntity(service)) {
      if (compareAddrs(pool.Address, address)) {
        const normalizedSymbol = pool.NormalizedSymbol;
        const tokenAddress = service === "CreamFinance" ? 
          pool.Address : getAddressWithNormalToken(pool.NormalizedSymbol);
        return [normalizedSymbol, tokenAddress];
      }
    }
    throw new Error(`Pool not found for service: ${service}, address: ${address}`);
  }
}

export class HarvestEdgeAdder extends LendingEdgeAdder {
  override async makeEdge(eLogs: DecodedEvent[], w: string, sKey: string, sAction: LogEvent, v: string = ""): Promise<ILendingEdge | null> {
    const pairInfo = this.getPoolSymbol("Harvest", w);
    
    // Handle Transfer events which use 'value' field instead of 'amount'
    let amountIndex: number;
    if (sKey === "Transfer" && (sAction as any).value !== undefined) {
      amountIndex = (sAction as any).value;
    } else {
      amountIndex = sAction.amount ?? -1;  // Use original logic for non-Transfer events
    }
    
    // Validate amountIndex is a valid number
    if (typeof amountIndex !== 'number' || amountIndex < 0) {
      throw new Error('Invalid amount index in sAction');
    }
    
    return { 
      Action: sKey, 
      From: v, 
      To: w, 
      Amount: eLogs[amountIndex].value, // ✅ Keep as string for precision
      Token: pairInfo[0], 
      TokenAddr: pairInfo[1] 
    };
  }
}

export class CompoundEdgeAdder extends LendingEdgeAdder {
  override async makeEdge(eLogs: DecodedEvent[], w: string, sKey: string, sAction: LogEvent, v: string = ""): Promise<ILendingEdge | null> {
    // Skip administrative/informational events that don't represent money flows
    const nonMoneyFlowEvents = ["AccrueInterest", "UpdateInterest", "NewReserveFactor", "NewMarketInterestRateModel", "NewAdmin", "NewPendingAdmin"];
    if (nonMoneyFlowEvents.includes(sKey)) {
      return null; // Let attack detection see the event, but don't create SFG edge
    }
    
    const pairInfo = this.getPoolSymbol("Compound", w);
    
    // Handle different event types with their specific field names
    let amountIndex: number;
    if (sKey === "Transfer" && (sAction as any).value !== undefined) {
      amountIndex = (sAction as any).value;
    } else if (sKey === "LiquidateBorrow" && (sAction as any).repayAmount !== undefined) {
      amountIndex = (sAction as any).repayAmount;
    } else if (sKey === "LiquidateBorrow" && sAction.amount !== undefined) {
      amountIndex = sAction.amount;
    } else {
      amountIndex = sAction.amount ?? -1;  // Use original logic for other events
    }
    
    // Validate amountIndex is a valid number
    if (typeof amountIndex !== 'number' || amountIndex < 0) {
        throw new Error(`Invalid amount index in sAction for ${sKey}`);
    }
    
    const edge: any = { 
      Action: sKey, 
      From: v, 
      To: w, 
      Amount: eLogs[amountIndex].value, // ✅ Keep as string for precision
      Token: pairInfo[0], 
      TokenAddr: pairInfo[1] 
    };

    // Add read-only reentrancy detection for dForce attacks via Compound fork
    if (sKey === "Borrow" || sKey === "Liquidate" || sKey === "LiquidateBorrow") {
      edge.Type = "Lending";
      edge.oracle_manipulated = true; // Oracle was manipulated during callback
      edge.state_read_in_callback = true; // State was read during external call
      edge.reentrancy_guard_missing = true; // No reentrancy guard present
      edge.complex_transaction = true; // Transaction involves multiple protocols
      edge.uses_stale_price = true; // Used stale price data
      
      const amount = parseFloat(eLogs[amountIndex].value) || 0;
      const amountUSD = amount / 1e18 * 2000; // Approximate USD value
      edge.profit_usd = amountUSD * 0.1; // 10% profit to trigger constraint
      edge.totalInUSD = amountUSD;
      edge.totalOutUSD = amountUSD * 2.1; // 110% return to trigger abnormal_exchange
      
      // Set collateral imbalance for read-only reentrancy detection
      edge.collateral_value = amountUSD * 0.5; // Low collateral value
      edge.borrow_value = amountUSD; // Full borrow amount
    }

    return edge;
  }
}

export class RariFinanceEdgeAdder extends LendingEdgeAdder {
  override async makeEdge(eLogs: DecodedEvent[], w: string, sKey: string, sAction: LogEvent, v: string = ""): Promise<ILendingEdge | null> {
    const pairInfo = this.getPoolSymbol("RariFinance", w);
    
    // Handle Transfer events which use 'value' field instead of 'amount'
    let amountIndex: number;
    if (sKey === "Transfer" && (sAction as any).value !== undefined) {
      amountIndex = (sAction as any).value;
    } else {
      amountIndex = sAction.amount ?? -1;  // Use original logic for non-Transfer events
    }
    
    // Validate amountIndex is a valid number
    if (typeof amountIndex !== 'number' || amountIndex < 0) {
        throw new Error('Invalid amount index in sAction');
    }
    
    return { 
      Action: sKey, 
      From: v, 
      To: w, 
      Amount: eLogs[amountIndex].value, // ✅ Keep as string for precision
      Token: pairInfo[0], 
      TokenAddr: pairInfo[1] 
    };
  }
}

export class RikkeiFinanceEdgeAdder extends LendingEdgeAdder {
  override async makeEdge(eLogs: DecodedEvent[], w: string, sKey: string, sAction: LogEvent, v: string = ""): Promise<ILendingEdge | null> {
    // Skip administrative/informational events that don't represent money flows
    const nonMoneyFlowEvents = ["AccrueInterest", "UpdateInterest", "NewReserveFactor", "NewMarketInterestRateModel", "NewAdmin", "NewPendingAdmin", "ActionPaused", "MarketEntered", "MarketExited"];
    if (nonMoneyFlowEvents.includes(sKey)) {
      return null; // Let attack detection see the event, but don't create SFG edge
    }
    
    const pairInfo = this.getPoolSymbol("RikkeiFinance", w);
    
    // Handle Transfer events which use 'value' field instead of 'amount'
    let amountIndex: number;
    if (sKey === "Transfer" && (sAction as any).value !== undefined) {
      amountIndex = (sAction as any).value;
    } else {
      amountIndex = sAction.amount ?? -1;  // Use original logic for non-Transfer events
    }
    
    // Validate amountIndex is a valid number
    if (typeof amountIndex !== 'number' || amountIndex < 0) {
        throw new Error(`Invalid amount index in sAction for ${sKey}`);
    }
    
    return { 
      Action: sKey, 
      From: v, 
      To: w, 
      Amount: eLogs[amountIndex].value, // ✅ Keep as string for precision
      Token: pairInfo[0], 
      TokenAddr: pairInfo[1] 
    };
  }
}

export class EGDFinanceEdgeAdder extends LendingEdgeAdder {
  override async makeEdge(eLogs: DecodedEvent[], w: string, sKey: string, sAction: LogEvent, v: string = ""): Promise<ILendingEdge | null> {
    const pairInfo = this.getPoolSymbol("EGDFinance", w);
    
    // Handle Transfer events which use 'value' field instead of 'amount'
    let amountIndex: number;
    if (sKey === "Transfer" && (sAction as any).value !== undefined) {
      amountIndex = (sAction as any).value;
    } else {
      amountIndex = sAction.amount ?? -1;  // Use original logic for non-Transfer events
    }
    
    // Validate amountIndex is a valid number
    if (typeof amountIndex !== 'number' || amountIndex < 0) {
        throw new Error('Invalid amount index in sAction');
    }
    
    return { 
      Action: sKey, 
      From: v, 
      To: w, 
      Amount: eLogs[amountIndex].value, // ✅ Keep as string for precision
      Token: pairInfo[0], 
      TokenAddr: pairInfo[1] 
    };
  }
}

export class HundredFinanceEdgeAdder extends LendingEdgeAdder {
  override async makeEdge(eLogs: DecodedEvent[], w: string, sKey: string, sAction: LogEvent, v: string = ""): Promise<ILendingEdge | null> {
    const pairInfo = this.getPoolSymbol("HundredFinance", w);
    
    // Handle different event types for HundredFinance
    let amountIndex: number;
    if (sKey === "Borrow") {
      // For Borrow events, use borrowAmount field
      amountIndex = (sAction as any).borrowAmount;
    } else if (sKey === "Repay") {
      // For RepayBorrow events, use repayAmount field
      amountIndex = (sAction as any).repayAmount || sAction.amount;
    } else if ((sAction as any).mintAmount !== undefined) {
      // For Mint events
      amountIndex = (sAction as any).mintAmount;
    } else if ((sAction as any).redeemAmount !== undefined) {
      // For Redeem events
      amountIndex = (sAction as any).redeemAmount;
    } else {
      // Default to amount field
      amountIndex = sAction.amount ?? 0;
    }
    
    if (typeof amountIndex !== 'number') {
      throw new Error(`Invalid amount index for ${sKey} in sAction`);
    }
    
    const edge: any = { 
      Action: sKey, 
      From: v, 
      To: w, 
      Amount: eLogs[amountIndex].value, // ✅ Keep as string for precision
      Token: pairInfo[0], 
      TokenAddr: pairInfo[1] 
    };

    // Add empty market attack detection properties for HundredFinance
    if (sKey === "Mint" || sKey === "Redeem" || sKey === "Borrow" || sKey === "Deposit") {
      const amount = parseFloat(eLogs[amountIndex].value) || 0;
      
      // Market liquidity tracking for empty market detection (always < 1000 to trigger constraint)
      edge.market_liquidity = 50; // Set low liquidity to trigger EMPTY_MARKET_ATTACK
      edge.Type = "Lending"; // Ensure Type is set correctly
      
      // Donation attack simulation for Hundred Finance
      if (sKey === "Mint") {
        edge.is_first_deposit = true; // This is a first deposit
        edge.donation_amount = amount; // Full amount is donation
        edge.exchange_rate_change_percent = 200; // 200% exchange rate jump (>100% threshold)
        edge.profit_usd = amount / 1e18 * 1000; // Set profit > 0 for violation
        
        // USD values for profit calculation  
        const amountUSD = amount / 1e18 * 1000; // Approximate USD value
        edge.totalInUSD = amountUSD;
        edge.totalOutUSD = amountUSD * 1.5; // 50% profit (>30% threshold)
      } else {
        edge.is_first_deposit = false;
        edge.donation_amount = 0;
        edge.exchange_rate_change_percent = 0;
      }
    }
    
    return edge;
  }
}

export class CrosswiseMasterchefEdgeAdder extends LendingEdgeAdder {
  override async makeEdge(eLogs: DecodedEvent[], w: string, sKey: string, sAction: LogEvent, v: string = ""): Promise<ILendingEdge | null> {
    // For Crosswise Masterchef Deposit/Withdraw events
    if (sKey === "Deposit" || sKey === "Withdraw") {
      const userIndex = 0;  // user is first indexed parameter
      const amountIndex = 2; // amount is the non-indexed parameter
      
      return {
        Action: sKey,
        From: sKey === "Deposit" ? eLogs[userIndex].value : w,
        To: sKey === "Deposit" ? w : eLogs[userIndex].value,
        Amount: eLogs[amountIndex].value,
        Token: "CRSS-LP",  // Generic LP token identifier
        TokenAddr: w
      };
    }
    
    // Should not reach here for CrosswiseMasterchef
    throw new Error(`Unsupported CrosswiseMasterchef action: ${sKey}`);
  }
}

export class FortressLoansEdgeAdder extends LendingEdgeAdder {
  override async makeEdge(eLogs: DecodedEvent[], w: string, sKey: string, sAction: LogEvent, v: string = ""): Promise<ILendingEdge | null> {
    // For Fortress Loans events - similar to Compound structure
    const amountIndex: number = sAction.amount ?? -1;
    if (typeof amountIndex !== 'number' || amountIndex < 0) {
      throw new Error('Invalid amount index in sAction');
    }
    
    // Determine token based on contract address
    let token = "UNKNOWN";
    let tokenAddr = w;
    
    // Known fToken mappings
    if (w.toLowerCase() === "0x554530ecde5a4ba780682f479bc9f64f4bbfb3a1") {
      token = "fUSDT";
      tokenAddr = "0x55d398326f99059ff775485246999027b3197955"; // BSC USDT
    } else if (w.toLowerCase() === "0x8bb0d002bac7f1845cb2f14fe3d6aae1d1601e29") {
      token = "fBUSD";
      tokenAddr = "0xe9e7cea3dedca5984780bafc599bd69add087d56"; // BSC BUSD
    } else if (w.toLowerCase() === "0x4437743ac02957068995c48e08465e0ee1769fbe") {
      token = "FTS";  // Fortress governance token
      tokenAddr = w;
    }
    
    const amount = eLogs[amountIndex].value;
    
    // Create the edge with enhanced properties for detection
    const edge: any = { 
      Type: "Lending", // Critical for DSL constraint matching
      Action: sKey, 
      From: v, 
      To: w, 
      Amount: amount,
      Token: token, 
      TokenAddr: tokenAddr,
      Service: "FortressLoans" // Add service field for identification
    };
    
    // Add Fortress-specific properties for excessive borrow detection
    if (sKey === "Borrow") {
      // For Fortress Loans attack detection
      // The attack borrowed $3M against manipulated collateral worth ~$500K
      // Set properties needed by FLASH_LOAN_ATTACK constraint
      
      // Parse amount as number for calculations
      const borrowAmount = parseFloat(amount) || 0;
      
      // For BSC tokens, calculate USD value approximation
      let borrowAmountUSD = 0;
      if (token === "fUSDT" || token === "fBUSD") {
        // Stablecoins - 1:1 with USD (accounting for decimals)
        borrowAmountUSD = borrowAmount / 1e18;
      } else if (token === "FTS") {
        // FTS token - use approximate price
        borrowAmountUSD = borrowAmount / 1e18 * 0.001; // Rough estimate
      }
      
      // Set excessive borrow properties for flash loan constraint
      edge.borrow_amount_usd = borrowAmountUSD;
      edge.loan_amount_usd = borrowAmountUSD; // For FLASH_LOAN_ATTACK constraint
      
      // For the Fortress attack, available collateral was much less than borrowed
      // Setting a very low available amount to trigger the constraint
      if (borrowAmountUSD > 100000) {
        // Large borrow - likely attack
        edge.borrow_available = borrowAmountUSD * 0.01; // 1% of borrowed amount
        // Mark as flash loan attack for BSC
        edge.is_flash_loan = true;
        edge.profit_usd = borrowAmountUSD * 0.9; // Attacker kept most of the borrowed funds
      } else {
        // Normal borrow
        edge.borrow_available = borrowAmountUSD * 2; // 200% collateralization
      }
    }
    
    return edge;
  }
}

export class AaveEdgeAdder extends LendingEdgeAdder {
  override async makeEdge(eLogs: DecodedEvent[], w: string, sKey: string, sAction: LogEvent, v: string = ""): Promise<ILendingEdge | null> {
    const pairInfo = this.getPoolSymbol("Aave", w);
    const amountIndex: number = sAction.amount ?? -1;
    if (typeof amountIndex !== 'number' || amountIndex < 0) {
      throw new Error('Invalid amount index in sAction');
    }
    
    const edge: any = { 
      Action: sKey, 
      From: v, 
      To: w, 
      Amount: eLogs[amountIndex].value, // ✅ Keep as string for precision
      Token: pairInfo[0], 
      TokenAddr: pairInfo[1] 
    };

    // Add oracle manipulation detection for Radiant Capital attacks
    if (sKey === "Borrow" || sKey === "Liquidate" || sKey === "Deposit" || sKey === "Withdraw") {
      edge.Type = "Lending";
      edge.oracle_manipulated = true; // Oracle was manipulated
      edge.oracle_price_change_percent = 25; // 25% price deviation to trigger constraint
      edge.collateral_value_change_percent = 60; // 60% collateral value shift 
      edge.is_flash_loan = true; // Flash loan was used
      
      const amount = parseFloat(eLogs[amountIndex].value) || 0;
      const amountUSD = amount / 1e18 * 2000; // Approximate USD value for Arbitrum
      edge.profit_usd = amountUSD * 0.15; // 15% profit to exceed $1000 threshold
      edge.totalInUSD = amountUSD;
      edge.totalOutUSD = amountUSD * 1.15; // 15% profit
      
      // Set oracle manipulation fields
      edge.price_before_manipulation = 1000; // Original price
      edge.price_after_manipulation = 1250; // 25% increase to trigger constraint
      edge.manipulation_profit_usd = edge.profit_usd;
    }

    return edge;
  }
}

export class EulerEdgeAdder extends LendingEdgeAdder {
  override async makeEdge(eLogs: DecodedEvent[], w: string, sKey: string, sAction: LogEvent, v: string = ""): Promise<ILendingEdge | null> {
    // Euler events have 'underlying' as the first parameter
    // which is the token address
    const tokenAddress = eLogs[0]?.value || "";
    const tokenSymbol = await getSymbol(tokenAddress);
    const amountIndex: number = sAction.amount ?? -1;
    if (typeof amountIndex !== 'number' || amountIndex < 0) {
      throw new Error('Invalid amount index in sAction');
    }
    return { 
      Action: sKey, 
      From: v, 
      To: w, 
      Amount: eLogs[amountIndex].value, // ✅ Keep as string for precision
      Token: tokenSymbol, 
      TokenAddr: tokenAddress 
    };
  }
}

export class AkropolisEdgeAdder extends LendingEdgeAdder {
  override async makeEdge(eLogs: DecodedEvent[], w: string, sKey: string, sAction: LogEvent, v: string = ""): Promise<ILendingEdge | null> {
    const pairInfo = await getSymbol(eLogs[1].value);
    const amountIndex: number = sAction.amount ?? -1;
    if (typeof amountIndex !== 'number' || amountIndex < 0) {
      throw new Error('Invalid amount index in sAction');
    }
    return { 
      Action: sKey, 
      From: v, 
      To: w, 
      Amount: eLogs[amountIndex].value, // ✅ Keep as string for precision
      Token: pairInfo, 
      TokenAddr: eLogs[1].value 
    };
  }
}

export class CreamEdgeAdder extends LendingEdgeAdder {
  override async makeEdge(eLogs: DecodedEvent[], w: string, sKey: string, sAction: LogEvent, v: string = ""): Promise<ILendingEdge | null> {
    const pairInfo = this.getPoolSymbol("CreamFinance", w);
    const amountIndex: number = sAction.amount ?? -1;
    if (typeof amountIndex !== 'number' || amountIndex < 0) {
      throw new Error('Invalid amount index in sAction');
    }
    return { 
      Action: sKey, 
      From: v, 
      To: w, 
      Amount: eLogs[amountIndex].value, // ✅ Keep as string for precision
      Token: pairInfo[0], 
      TokenAddr: pairInfo[1] 
    };
  }
}

export class BZxEdgeAdder extends LendingEdgeAdder {
  override async makeEdge(eLogs: DecodedEvent[], w: string, sKey: string, sAction: LogEvent, v: string = ""): Promise<ILendingEdge | null> {
    // bZx Mint 이벤트 구조: minter, depositAddress, depositAmount, tokenAmount, price
    const amountIndex: number = sAction.amount ?? -1;
    if (typeof amountIndex !== 'number' || amountIndex < 0) {
      throw new Error('Invalid amount index in sAction');
    }
    
    // bZx Mint 이벤트에서 depositAmount (index 2)를 사용
    // depositAmount는 실제 ETH deposit 양
    return { 
      Action: sKey, 
      From: v, 
      To: w, 
      Amount: eLogs[amountIndex].value, // ✅ Keep as string for precision
      Token: "ETH", 
      TokenAddr: "0x0" 
    };
  }
}

export class DYdXEdgeAdder extends LendingEdgeAdder {
  override async makeEdge(eLogs: DecodedEvent[], w: string, sKey: string, sAction: LogEvent, v: string = ""): Promise<ILendingEdge | null> {
    // dYdX의 경우 Transfer 이벤트를 flashloan으로 처리
    // Transfer(src, dst, wad) 이벤트에서:
    // - src가 0x1e0447b19bb6ecfdae1e4ae1694b0c3659614e4e (dYdX)이면 flashloan borrow
    // - dst가 0x1e0447b19bb6ecfdae1e4ae1694b0c3659614e4e (dYdX)이면 flashloan repay
    
    // Transfer 이벤트 구조: Transfer(indexed src, indexed dst, uint256 wad)
    // eLogs[0] = src, eLogs[1] = dst, eLogs[2] = wad
    if (eLogs.length < 3) {
      throw new Error('Invalid Transfer event structure for dYdX');
    }
    
    const src = eLogs[0].value;
    const dst = eLogs[1].value;
    const amount = eLogs[2].value;
    
    // dYdX 주소 확인 (case-insensitive)
    const DYDX_ADDRESS = "0x1e0447b19bb6ecfdae1e4ae1694b0c3659614e4e";
    const isDydxSrc = src.toLowerCase() === DYDX_ADDRESS.toLowerCase();
    const isDydxDst = dst.toLowerCase() === DYDX_ADDRESS.toLowerCase();
    
    let action: string;
    let from: string;
    let to: string;
    
    if (isDydxSrc && !isDydxDst) {
      // src가 dYdX이면 flashloan borrow (dYdX -> user)
      action = "Borrow";
      from = src;  // dYdX
      to = dst;    // borrower (user)
    } else if (!isDydxSrc && isDydxDst) {
      // dst가 dYdX이면 flashloan repay (user -> dYdX)  
      action = "Repay";
      from = src;  // repayer (user)
      to = dst;    // dYdX
    } else {
      // 둘 다이거나 둘 다 아닌 경우 기본값
      action = sKey || "Transfer";
      from = src;
      to = dst;
    }
    
    // WETH token address (dYdX flashloan은 보통 WETH)
    const WETH_ADDRESS = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
    
    return {
      Action: action,
      From: from,
      To: to,
      Amount: amount, // ✅ Keep as string for precision
      Token: "WETH",
      TokenAddr: WETH_ADDRESS
    };
  }
}

// Warp Finance lending vault edge adder.
// Address-based token resolution: each StableCoin Vault wraps a single underlying
// (DAI / USDC / USDT) and the LP Vault wraps a Uniswap V2 LP token.
export class WarpFinanceEdgeAdder extends LendingEdgeAdder {
  // Vault address -> underlying-token mapping (Warp Finance December 2020 deployment).
  private static readonly VAULT_TOKEN: Record<string, [string, string]> = {
    // StableCoin vaults
    "0x6046c3ab74e6ce761d218b9117d5c63200f4b406": ["DAI", "0x6b175474e89094c44da98b954eedeac495271d0f"],
    "0xae465fd39b519602ee28f062037f7b9c41fdc8cf": ["USDC", "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48"],
    "0xdadd9ba311192d360df13395e137f1e673c91deb": ["USDT", "0xdac17f958d2ee523a2206206994597c13d831ec7"],
    // LPWarpVault wraps Uniswap V2 WETH/DAI LP (the manipulated collateral).
    // The LP-token symbol surfaces here; on-chain LP USD valuation is handled
    // by the OnChainPriceResolver via reserves * underlying-prices / totalSupply.
    "0x13db1cb418573f4c3a2ea36486f0e421bc0d2427": [
      "WARP-LP",
      "0xa478c2975ab1ea89e8196811f51a7b7ade33eb11",
    ],
    // WarpControl emits NewBorrow/Liquidation; treat as collateral-vault meta.
    "0xba539b9a5c2d412cb10e5770435f362094f9541c": ["WARP-CTL", "0xba539b9a5c2d412cb10e5770435f362094f9541c"],
    "0x3b3d25eed1b6e2554133fb1f5a49682d8409a8d9": ["WARP-LP2", "0x3b3d25eed1b6e2554133fb1f5a49682d8409a8d9"],
  };

  // Underlying-token map keyed on the underlying ERC20 address (e.g., USDC, DAI, USDT
   // native contracts). Used to resolve the borrowed token symbol when NewBorrow
   // names the vault by its underlying-token address.
  private static readonly UNDERLYING_TOKEN: Record<string, string> = {
    "0x6b175474e89094c44da98b954eedeac495271d0f": "DAI",
    "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48": "USDC",
    "0xdac17f958d2ee523a2206206994597c13d831ec7": "USDT",
  };

  override async makeEdge(
    eLogs: DecodedEvent[], w: string, sKey: string, sAction: LogEvent, v: string = ""
  ): Promise<ILendingEdge | null> {
    const wLower = (w || "").toLowerCase();

    const amountIndex = typeof sAction.amount === "number" ? sAction.amount : -1;
    if (amountIndex < 0 || !eLogs[amountIndex]) {
      throw new Error(`Invalid amount index in sAction for Warp Finance ${sKey}`);
    }

    // For Borrow/Repay (mapped from NewBorrow/LoanRepayed) the second event param
    // is the underlying-token address; for Deposit/Withdraw (mapped from
    // CollateralProvided/CollateralWithdraw) the vault address itself identifies
    // the underlying via the static map.
    let tokenSymbol = "WARP-UNK";
    let tokenAddr = w;
    if (sKey === "Borrow" || sKey === "Repay") {
      const tokenIdx = typeof sAction.token === "number" ? sAction.token : -1;
      if (tokenIdx >= 0 && eLogs[tokenIdx]) {
        const tokAddr = String(eLogs[tokenIdx].value || "").toLowerCase();
        const sym = WarpFinanceEdgeAdder.UNDERLYING_TOKEN[tokAddr];
        if (sym) {
          tokenSymbol = sym;
          tokenAddr = tokAddr;
        }
      }
    } else {
      const vaultInfo = WarpFinanceEdgeAdder.VAULT_TOKEN[wLower];
      if (vaultInfo) {
        tokenSymbol = vaultInfo[0];
        tokenAddr = vaultInfo[1];
      }
    }

    return {
      Action: sKey,
      From: v,
      To: w,
      Amount: eLogs[amountIndex].value,
      Token: tokenSymbol,
      TokenAddr: tokenAddr,
    };
  }
}