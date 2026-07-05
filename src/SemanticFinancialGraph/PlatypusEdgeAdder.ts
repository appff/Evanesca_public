/**
 * Platypus Finance EdgeAdder
 * Handles events from Platypus protocol on Avalanche
 */

import { DecodedEvent, LogEvent } from './SemanticFinancialGraphUtils';
import { ISemanticFinancialEdge, IDEXEdge, ILendingEdge } from './Interfaces/IEdge';
import { DEXEdgeAdder } from './DEXEdgeAdder';
import { LendingEdgeAdder } from './LendingEdgeAdder';

// PlatypusPoolEdgeAdder for main pool events
export class PlatypusPoolEdgeAdder extends DEXEdgeAdder {
  override async makeEdge(
    eLogs: DecodedEvent[],
    w: string,
    sKey: string,
    sAction: LogEvent
  ): Promise<IDEXEdge> {
    switch (sKey) {
      case "Deposit": {
        // Deposit event: user adds liquidity
        const sender = eLogs[0].value;
        const token = eLogs[1].value;
        const amount = eLogs[2].value;
        const liquidity = eLogs[3].value;
        const to = eLogs[4].value;
        
        return this.dexEdge(
          "AddLiquidity",
          amount,
          token,
          liquidity,
          "LP-" + token,
          sender,
          to
        );
      }
      
      case "Withdraw": {
        // Withdraw event: user removes liquidity
        const sender = eLogs[0].value;
        const token = eLogs[1].value;
        const amount = eLogs[2].value;
        const liquidity = eLogs[3].value;
        const to = eLogs[4].value;
        
        return this.dexEdge(
          "RemoveLiquidity",
          liquidity,
          "LP-" + token,
          amount,
          token,
          sender,
          to
        );
      }
      
      case "Swap": {
        // Swap event: token exchange
        const sender = eLogs[0].value;
        const fromToken = eLogs[1].value;
        const toToken = eLogs[2].value;
        const fromAmount = eLogs[3].value;
        const toAmount = eLogs[4].value;
        const to = eLogs[5].value;
        
        return this.dexEdge(
          "Swap",
          fromAmount,
          fromToken,
          toAmount,
          toToken,
          sender,
          to
        );
      }
      
      default:
        return this.dexEdge(sKey, "0", "Unknown", "0", "Unknown", w, w);
    }
  }
}

// MasterPlatypusEdgeAdder for staking events
export class MasterPlatypusEdgeAdder extends LendingEdgeAdder {
  override async makeEdge(
    eLogs: DecodedEvent[],
    w: string,
    sKey: string,
    sAction: LogEvent,
    v: string = ""
  ): Promise<ILendingEdge> {
    switch (sKey) {
      case "Deposit": {
        // Stake LP tokens
        const user = eLogs[0].value;
        const pid = eLogs[1].value;
        const amount = eLogs[2].value;
        
        return {
          Action: "Stake",
          From: user,
          To: w,
          Amount: amount,
          Token: "LP-USDC",
          TokenAddr: "0xaef735b769a3b883a6173129d616be8aee977b17"
        };
      }
      
      case "Withdraw": {
        // Unstake LP tokens
        const user = eLogs[0].value;
        const pid = eLogs[1].value;
        const amount = eLogs[2].value;
        
        return {
          Action: "Unstake",
          From: w,
          To: user,
          Amount: amount,
          Token: "LP-USDC",
          TokenAddr: "0xaef735b769a3b883a6173129d616be8aee977b17"
        };
      }
      
      case "EmergencyWithdraw": {
        // Emergency withdrawal (the exploit)
        const user = eLogs[0].value;
        const pid = eLogs[1].value;
        const amount = eLogs[2].value;
        
        const edge: ILendingEdge = {
          Action: "EmergencyWithdraw",
          From: w,
          To: user,
          Amount: amount,
          Token: "LP-USDC",
          TokenAddr: "0xaef735b769a3b883a6173129d616be8aee977b17"
        };
        
        // Add metadata to indicate this is an emergency withdrawal
        (edge as any).metadata = {
          isEmergency: true,
          pid: pid
        };
        
        return edge;
      }
      
      default:
        return {
          Action: sKey,
          From: w,
          To: w,
          Amount: "0",
          Token: "Unknown",
          TokenAddr: w
        };
    }
  }
}

// PlatypusTreasureEdgeAdder for USP borrowing
export class PlatypusTreasureEdgeAdder extends LendingEdgeAdder {
  override async makeEdge(
    eLogs: DecodedEvent[],
    w: string,
    sKey: string,
    sAction: LogEvent,
    v: string = ""
  ): Promise<ILendingEdge> {
    switch (sKey) {
      case "Borrow": {
        // USP minting/borrowing
        const borrower = eLogs[0].value;
        const borrowAmount = eLogs[1].value;
        const collateralAmount = eLogs[2].value;
        
        const edge: ILendingEdge = {
          Action: "Borrow",
          From: w,
          To: borrower,
          Amount: borrowAmount,
          Token: "USP",
          TokenAddr: "0xdaCDe03d7Ab4D81fEDdc3a20fAA89aBAc9072CE2"
        };
        
        (edge as any).metadata = {
          token: "USP",
          collateral: "LP-USDC",
          collateralValue: collateralAmount
        };
        
        return edge;
      }
      
      case "Repay": {
        // USP repayment
        const borrower = eLogs[0].value;
        const repayAmount = eLogs[1].value;
        const collateralReleased = eLogs[2].value;
        
        return {
          Action: "Repay",
          From: borrower,
          To: w,
          Amount: repayAmount,
          Token: "USP",
          TokenAddr: "0xdaCDe03d7Ab4D81fEDdc3a20fAA89aBAc9072CE2"
        };
      }
      
      case "PositionUpdated": {
        // Position update event
        const user = eLogs[0].value;
        const collateral = eLogs[1].value;
        const debt = eLogs[2].value;
        
        const edge: ILendingEdge = {
          Action: "PositionUpdate",
          From: w,
          To: user,
          Amount: debt,
          Token: "USP",
          TokenAddr: "0xdaCDe03d7Ab4D81fEDdc3a20fAA89aBAc9072CE2"
        };
        
        (edge as any).metadata = {
          collateralAmount: collateral,
          debtAmount: debt
        };
        
        return edge;
      }
      
      default:
        return {
          Action: sKey,
          From: w,
          To: w,
          Amount: "0",
          Token: "Unknown",
          TokenAddr: w
        };
    }
  }
}

// PlatypusAssetEdgeAdder for asset cash/liability events
export class PlatypusAssetEdgeAdder extends DEXEdgeAdder {
  override async makeEdge(
    eLogs: DecodedEvent[],
    w: string,
    sKey: string,
    sAction: LogEvent
  ): Promise<IDEXEdge> {
    // These are mainly tracking events, create minimal edges for graph completeness
    switch (sKey) {
      case "CashAdded":
      case "CashRemoved":
      case "LiabilityAdded":
      case "LiabilityRemoved": {
        const previousValue = eLogs[0].value;
        const changeValue = eLogs[1].value;
        
        return this.dexEdge(
          sKey,
          changeValue,
          "USDC",
          "0",
          "USDC",
          w,
          w
        );
      }
      
      default:
        return this.dexEdge(sKey, "0", "Unknown", "0", "Unknown", w, w);
    }
  }
}