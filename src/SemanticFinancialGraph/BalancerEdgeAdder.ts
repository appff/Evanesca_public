import { DecodedEvent, LogEvent } from "./SemanticFinancialGraphUtils";
import { DEXEdgeAdder } from "./DEXEdgeAdder";
import { IDEXEdge } from "./Interfaces/IEdge";
import { IPairInfo } from "./Interfaces/IEdgeAdder";
import { getAddressWithNormalToken } from "./EdgeAdderUtils";
import { DebugLogger } from "../Utils/DebugLogger";

/**
 * BalancerEdgeAdder - Handles Balancer protocol swap events
 * 
 * Balancer uses a Vault-based architecture where all swaps go through a central Vault contract.
 * Events have a different structure from Uniswap:
 * - Swap(poolId, tokenIn, tokenOut, amountIn, amountOut)
 */
export class BalancerEdgeAdder extends DEXEdgeAdder {
  override async makeEdge(eLogs: DecodedEvent[], w: string, sKey: string, sAction: LogEvent): Promise<IDEXEdge> {
    DebugLogger.pattern(`🔧 [Balancer] Processing ${sKey} event for vault: ${w}`);
    DebugLogger.pattern(`   eLogs length: ${eLogs.length}`);
    
    // Debug log structure
    eLogs.forEach((log, idx) => {
      DebugLogger.pattern(`   eLogs[${idx}]: name=${log?.name || 'undefined'}, value=${log?.value || 'undefined'}, type=${log?.type || 'undefined'}`);
    });

    switch (sKey) {
      case "Swap":
        return this.handleSwapEvent(eLogs, sAction);
      case "LOG_SWAP":
        return this.handleLogSwapEvent(eLogs);
      case "FlashLoan":
        return this.handleFlashLoanEvent(eLogs, sAction);
      default:
        throw new Error(`Unsupported Balancer event: ${sKey}`);
    }
  }

  /**
   * Handle Balancer Swap events
   * Based on semanticModel.json, Balancer Swap has:
   * - poolId: 0
   * - tokenIn: 1
   * - tokenOut: 2
   * - amountIn: 3
   * - amountOut: 4
   */
  private async handleSwapEvent(eLogs: DecodedEvent[], sAction: LogEvent): Promise<IDEXEdge> {
    // Defensive check
    if (eLogs.length < 5) {
      DebugLogger.pattern(`⚠️ [Balancer] Insufficient eLogs for Swap event (${eLogs.length}), expected at least 5`);
      // Return minimal edge to prevent violation
      return this.dexEdge("Swap", "0", "UNKNOWN", "0", "UNKNOWN", "0x0", "0x0");
    }

    // Extract parameters based on semanticModel mapping
    const poolId = eLogs[0]?.value || "0x0";
    const tokenInAddr = eLogs[1]?.value || "0x0";
    const tokenOutAddr = eLogs[2]?.value || "0x0";
    const amountIn = eLogs[3]?.value || "0";
    const amountOut = eLogs[4]?.value || "0";

    // Get token symbols
    const tokenIn = await getAddressWithNormalToken(tokenInAddr);
    const tokenOut = await getAddressWithNormalToken(tokenOutAddr);

    DebugLogger.pattern(`   Balancer Swap: ${amountIn} ${tokenIn} → ${amountOut} ${tokenOut}`);
    DebugLogger.pattern(`   Pool ID: ${poolId}`);

    return this.dexEdge("Swap", amountIn, tokenIn, amountOut, tokenOut, tokenInAddr, tokenOutAddr);
  }

  /**
   * Handle Balancer V1 pool LOG_SWAP events.
   * Signature:
   *   LOG_SWAP(address caller, address tokenIn, address tokenOut, uint256 tokenAmountIn, uint256 tokenAmountOut)
   *
   * We normalize this to a standard DEX Swap edge.
   */
  private async handleLogSwapEvent(eLogs: DecodedEvent[]): Promise<IDEXEdge> {
    const getByName = (name: string): string | null => {
      const hit = eLogs.find((l) => l?.name === name);
      return hit?.value ?? null;
    };

    // Prefer named params (robust against decoder key ordering); fall back to positional.
    const tokenInAddr = getByName("tokenIn") || eLogs[1]?.value || "0x0";
    const tokenOutAddr = getByName("tokenOut") || eLogs[2]?.value || "0x0";
    const amountIn = getByName("tokenAmountIn") || eLogs[3]?.value || "0";
    const amountOut = getByName("tokenAmountOut") || eLogs[4]?.value || "0";

    const tokenIn = await getAddressWithNormalToken(tokenInAddr);
    const tokenOut = await getAddressWithNormalToken(tokenOutAddr);

    DebugLogger.pattern(`   Balancer LOG_SWAP: ${amountIn} ${tokenIn} → ${amountOut} ${tokenOut}`);
    return this.dexEdge("Swap", amountIn, tokenIn, amountOut, tokenOut, tokenInAddr, tokenOutAddr, "balancer");
  }

  /**
   * Handle Balancer FlashLoan events
   * Based on semanticModel.json, Balancer FlashLoan has:
   * - recipient: 0
   * - token: 1
   * - amount: 2
   * - feeAmount: 3
   */
  private async handleFlashLoanEvent(eLogs: DecodedEvent[], sAction: LogEvent): Promise<IDEXEdge> {
    // Defensive check
    if (eLogs.length < 4) {
      DebugLogger.pattern(`⚠️ [Balancer] Insufficient eLogs for FlashLoan event (${eLogs.length}), expected at least 4`);
      return this.dexEdge("FlashLoan", "0", "UNKNOWN", "0", "UNKNOWN", "0x0", "0x0");
    }

    const recipient = eLogs[0]?.value || "0x0";
    const tokenAddr = eLogs[1]?.value || "0x0";
    const amount = eLogs[2]?.value || "0";
    const feeAmount = eLogs[3]?.value || "0";

    const token = await getAddressWithNormalToken(tokenAddr);

    DebugLogger.pattern(`   Balancer FlashLoan: ${amount} ${token} (fee: ${feeAmount})`);
    DebugLogger.pattern(`   Recipient: ${recipient}`);

    // For flash loans, we treat it as a loan of the token with the fee as the "output"
    // This ensures proper graph edge creation for flash loan detection
    return this.dexEdge("FlashLoan", amount, token, feeAmount, token, tokenAddr, tokenAddr);
  }
}
