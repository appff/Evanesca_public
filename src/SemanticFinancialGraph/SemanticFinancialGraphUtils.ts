import { CurveEdgeAdder, KyberEdgeAdder, KyberSwapEdgeAdder, SynthetixEdgeAdder, UniswapV1EdgeAdder, UniswapV2EdgeAdder, UniswapV3EdgeAdder, AllbridgeEdgeAdder } from "./DEXEdgeAdder";
import { BalancerEdgeAdder } from "./BalancerEdgeAdder";
import { AaveEdgeAdder, AkropolisEdgeAdder, BZxEdgeAdder, CompoundEdgeAdder, RariFinanceEdgeAdder, CreamEdgeAdder, HarvestEdgeAdder, DYdXEdgeAdder, RikkeiFinanceEdgeAdder, EGDFinanceEdgeAdder, CrosswiseMasterchefEdgeAdder, FortressLoansEdgeAdder, EulerEdgeAdder, HundredFinanceEdgeAdder, WarpFinanceEdgeAdder } from "./LendingEdgeAdder";
import { QubitBridgeEdgeAdder, MeterBridgeEdgeAdder } from "./BridgeEdgeAdder";
import { PlatypusPoolEdgeAdder, MasterPlatypusEdgeAdder, PlatypusTreasureEdgeAdder, PlatypusAssetEdgeAdder } from "./PlatypusEdgeAdder";

export const _modelHash = new Map<string, number>();
const _sCache = new Map<string, SemanticModel>();
const _dexKeys: Map<number,string> = new Map ([[0, "Swap"], [1, "EthPurchase"], [2, "TokenPurchase"]]);
const _lendingKeys: Map<number, string> = new Map ([[0, "Deposit"], [1, "Withdraw"], [2, "Borrow"], [3, "Repay"], [4, "liquiditySupply"], [5, "liquidityRemove"], [7, "Transfer"]]);
// Replaced libG with SimpleGraph to remove external dependency
import { SimpleGraph } from './SimpleGraph';
export const libG = SimpleGraph;

export interface LogEvent {
  eventName: string
  to: string
  from: string | number
  amount?: number
  token?: number
  amountIn?: number
  amountOut?: number
  token1?: number
  token2?: number
}

export interface SemanticModel {
  Service: string
  ServiceType: string
  Address: string[]
  Events: string[]
  Deposit: LogEvent
  Withdraw: LogEvent
  Borrow: LogEvent
  Repay: LogEvent
}

export interface DecodedEvent {
  name: string
  type: string
  value: string
}

export interface DecodedLog {
  name: string
  events: DecodedEvent[]
  address: string
}

const fs = require('fs');
const path = require('path');
export const sModels: SemanticModel[] = JSON.parse(fs.readFileSync(path.join(__dirname, '../jsons/semanticModel.json'), 'utf-8'));

export const SKeyPerType = {
  Lending: handleLendingSKey,
  DEX: handleDEXSKey,
  Bridge: handleBridgeSKey
}

// Normalize protocol-specific action keys to the five semantic primitives
// (swap, deposit, withdraw, borrow, repay) used throughout the paper.
// Per-protocol overrides can be specified via semanticModel.sActions.
// ServiceType gates the alias set so Bridge-specific actions (Mint/Burn/Bridge)
// retain their native vocabulary and do not collide with Lending Mint/Redeem.
const LENDING_ALIASES: Record<string, string> = {
  Mint: "Deposit",
  Redeem: "Withdraw",
  RedeemUnderlying: "Withdraw",
  RepayBorrow: "Repay",
  // LiquidateBorrow preserved separately: DSL constraints distinguish
  // liquidation from plain Repay (see ORACLE_MANIPULATION when-clause).
  LiquidateBorrow: "Liquidate",
  liquiditySupply: "Deposit",
  liquidityRemove: "Withdraw",
};

const DEX_ALIASES: Record<string, string> = {
  TokenExchange: "Swap",
  TokenPurchase: "Swap",
  EthPurchase: "Swap",
  // Allbridge bridge-pool DEX events normalised to Swap
  SwappedToVUsd: "Swap",
  SwappedFromVUsd: "Swap",
};

export function normalizeActionKey(semantic: SemanticModel, rawKey: string): string {
  if (!rawKey) return rawKey;
  // 1) Per-protocol override always wins (semanticModel.sActions)
  const sActions = (semantic as any)?.sActions as Record<string, string> | undefined;
  if (sActions && sActions[rawKey]) {
    return sActions[rawKey];
  }
  // 2) ServiceType-gated alias tables
  if (semantic?.ServiceType === "Lending" && LENDING_ALIASES[rawKey]) {
    return LENDING_ALIASES[rawKey];
  }
  if (semantic?.ServiceType === "DEX" && DEX_ALIASES[rawKey]) {
    return DEX_ALIASES[rawKey];
  }
  // 3) Bridge / Token / already-primitive — return unchanged
  return rawKey;
}

export function buildModelMap() {
  sModels.forEach((model,idx) => {
    model.Address.forEach(addr => 
      _modelHash.set((addr as string).toLowerCase(), idx));
  });
}

export function getServicefromMap(addr: string) {
  return _modelHash.get(addr.toLowerCase());
}

export function isCached(address: string) {
  return _sCache.has(address)
    && _sCache.get(address) !== undefined;
}

export function getSemantic({ address }: { address: string }) {
  if (isCached(address)) return _sCache.get(address);
  const modelIDX = getServicefromMap(address);
  if (modelIDX === undefined) return undefined;
  _sCache.set(address, sModels[modelIDX]);
  return (sModels[modelIDX]);
}

function handleDEXSKey(idx: number){
  return _dexKeys.get(idx);
}

function handleLendingSKey(idx: number) {
  return _lendingKeys.get(idx);
}

function handleBridgeSKey(idx: number) {
  // Bridge-specific event keys
  const _bridgeKeys: Map<number, string> = new Map([
    [0, "Deposit"], 
    [1, "depositETH"], 
    [2, "Mint"], 
    [3, "Withdraw"],
    [4, "Bridge"]
  ]);
  return _bridgeKeys.get(idx);
}

export function getEvent(Events: Array<string>, target: string) {
  return {key: Events.find(e => e === target), idx: Events.indexOf(target)};
}

export function dexEdge(action: string, amountIn: string | number,
  token1: string, amountOut: string | number, token2: string) {
  return {
    "Action": action, "amountIn": amountIn, "token1": token1,
    "amountOut": amountOut, "token2": token2
  };
}

export async function handleDEXEdge(semantic: SemanticModel, eLogs: DecodedEvent[], w: string, sKey: string, sAction: LogEvent) {
  let edgeData: any;
  
  switch (semantic.Service) {
    case "Uniswap":
      switch (sKey) {
        case "Swap": edgeData = await new UniswapV2EdgeAdder().makeEdge(eLogs, w, sKey, sAction); break;
        case "EthPurchase":
        case "TokenPurchase": edgeData = await new UniswapV1EdgeAdder().makeEdge(eLogs, w, sKey, sAction); break;
      }
      break;
    case "UniswapV3":
      edgeData = await new UniswapV3EdgeAdder().makeEdge(eLogs, w, sKey, sAction);
      break;
    case "Sushiswap":
      edgeData = await new UniswapV2EdgeAdder().makeEdge(eLogs, w, sKey, sAction);
      break;
    case "PancakeSwap":
      edgeData = await new UniswapV2EdgeAdder().makeEdge(eLogs, w, sKey, sAction);
      break;
    case "Crosswise":
      edgeData = await new UniswapV2EdgeAdder().makeEdge(eLogs, w, sKey, sAction);
      break;
    case "CurveFi":
    case "CurvePool":  // Add CurvePool support (same as CurveFi)
      edgeData = await new CurveEdgeAdder().makeEdge(eLogs, w, sKey, sAction);
      break;
    case "KyberNetwork":
      edgeData = await new KyberEdgeAdder().makeEdge(eLogs, w, sKey, sAction);
      break;
    case "KyberSwap":
      edgeData = await new KyberSwapEdgeAdder().makeEdge(eLogs, w, sKey, sAction);
      break;
    case "Synthetix": 
      edgeData = await new SynthetixEdgeAdder().makeEdge(eLogs, w, sKey, sAction);
      break;
    case "Platypus":
      edgeData = await new PlatypusPoolEdgeAdder().makeEdge(eLogs, w, sKey, sAction);
      break;
    case "PlatypusAsset":
      edgeData = await new PlatypusAssetEdgeAdder().makeEdge(eLogs, w, sKey, sAction);
      break;
    case "Allbridge":
      // Allbridge uses SwappedToVUsd and SwappedFromVUsd events normalized to Swap
      // Use specialized AllbridgeEdgeAdder to handle the unique event structure
      edgeData = await new AllbridgeEdgeAdder().makeEdge(eLogs, w, sKey, sAction);
      break;
    case "Balancer":
      // Balancer uses Vault-based architecture with poolId-based routing
      edgeData = await new BalancerEdgeAdder().makeEdge(eLogs, w, sKey, sAction);
      break;
    default:
      return undefined;
  }
  
  // Set the Service field to the semantic service name for protocol constraints
  if (edgeData) {
    edgeData.Service = semantic.Service;
  }
  
  return edgeData;
}

export function handleLendingEdge(semantic: SemanticModel, eLogs: DecodedEvent[], to: string, sKey: string, sAction: LogEvent, from: string) {
  // Skip Transfer events for ConcentricFinance - handled by ArbitrumEventHandler
  if (semantic.Service === "ConcentricFinance" && sKey === "Transfer") {
    return null; // Skip processing, handled by ArbitrumEventHandler
  }
  
  // NOTE: Removed skipEvents filter - attack detection needs to see all events
  // Edge adders should handle non-money-flow events gracefully instead
  
  switch (semantic.Service) {
    case "Harvest":
      return new HarvestEdgeAdder().makeEdge(eLogs, to, sKey, sAction, from);
    case "Compound":
      return new CompoundEdgeAdder().makeEdge(eLogs, to, sKey, sAction, from);
    case "RariFinance":
      return new RariFinanceEdgeAdder().makeEdge(eLogs, to, sKey, sAction, from);
    case "RikkeiFinance":
      return new RikkeiFinanceEdgeAdder().makeEdge(eLogs, to, sKey, sAction, from);
    case "EGDFinance":
      return new EGDFinanceEdgeAdder().makeEdge(eLogs, to, sKey, sAction, from);
    case "Aave":
      return new AaveEdgeAdder().makeEdge(eLogs, to, sKey, sAction, from);
    case "AaveV3Avalanche":
      // Handle AAVE V3 flash loans and lending operations
      if (sKey === "FlashLoan") {
        // Flash loan edge: treat as borrow followed by repay
        const asset = eLogs[2]?.value || "USDC";
        const amount = eLogs[3]?.value || "0";
        const initiator = eLogs[1]?.value || from;
        return {
          Action: "FlashLoan",
          From: to,  // Pool
          To: initiator,  // Borrower
          Amount: amount,
          Token: asset,
          TokenAddr: asset
        };
      } else {
        // Regular lending operations
        return new AaveEdgeAdder().makeEdge(eLogs, to, sKey, sAction, from);
      }
    case "Akropolis":
      return new AkropolisEdgeAdder().makeEdge(eLogs, to, sKey, sAction, from);
    case "CreamFinance":
      return new CreamEdgeAdder().makeEdge(eLogs, to, sKey, sAction, from);
    case "bZx":
      return new BZxEdgeAdder().makeEdge(eLogs, to, sKey, sAction, from);
    case "dYdX":
      return new DYdXEdgeAdder().makeEdge(eLogs, to, sKey, sAction, from);
    case "CrosswiseMasterchef":
      return new CrosswiseMasterchefEdgeAdder().makeEdge(eLogs, to, sKey, sAction, from);
    case "FortressLoans":
      return new FortressLoansEdgeAdder().makeEdge(eLogs, to, sKey, sAction, from);
    case "QubitBridge":
      return new QubitBridgeEdgeAdder().makeEdge(eLogs, to, sKey, sAction, from);
    case "MeterBridge":
      return new MeterBridgeEdgeAdder().makeEdge(eLogs, to, sKey, sAction, from);
    case "Euler":
      return new EulerEdgeAdder().makeEdge(eLogs, to, sKey, sAction, from);
    case "MasterPlatypus":
      return new MasterPlatypusEdgeAdder().makeEdge(eLogs, to, sKey, sAction, from);
    case "PlatypusTreasure":
      return new PlatypusTreasureEdgeAdder().makeEdge(eLogs, to, sKey, sAction, from);
    case "HundredFinance":
      // HundredFinance is a Compound V2 fork with its own pool configuration
      return new HundredFinanceEdgeAdder().makeEdge(eLogs, to, sKey, sAction, from);
    case "dForce":
      // dForce is also a Compound V2 fork
      return new CompoundEdgeAdder().makeEdge(eLogs, to, sKey, sAction, from);
    case "RadiantLendingPoolCore":
    case "RadiantLockZap":
    case "RadiantHelper":
      // Radiant Capital is an Aave V2 fork
      return new AaveEdgeAdder().makeEdge(eLogs, to, sKey, sAction, from);
    case "Warp Finance":
    case "Warp Finance_LP":
      return new WarpFinanceEdgeAdder().makeEdge(eLogs, to, sKey, sAction, from);
    default: throw new Error ("not supported service");
  }
}

export function updateDEXEdge(graph: any, { address }: { address: string }, { Service }: { Service: string }) {
  graph.setNode(address,
      { "Service": Service,"Type": "DEX", "amount0": 0,
        "amount1": 0,"amount0Type": "", "amount1Type": ""}
    );
}

export function updateLendingEdge(graph: any, { address }: { address: string }, { Service }: { Service: string }) {
  const node = {
    "Service": Service, "Type": "Lending",
    "collateralFactor": 100, "totalSupply": 0
  };
  graph.setNode(address, node);
}

export function compareAddrs(src: string, dst: string){
  return (src.toLocaleLowerCase() === dst.toLocaleLowerCase());
}

// Bridge-related functions
export async function handleBridgeEdge(semantic: SemanticModel, eLogs: DecodedEvent[], w: string, sKey: string, sAction: LogEvent, v?: string) {
  // Use specialized bridge edge adders based on protocol
  const bridgeProtocol = semantic.Service;
  
  try {
    // Select appropriate edge adder based on bridge protocol
    let edgeAdder;
    
    switch (bridgeProtocol) {
      case "QubitBridge":
        edgeAdder = new QubitBridgeEdgeAdder();
        break;
      case "MeterBridge":
        edgeAdder = new MeterBridgeEdgeAdder();
        break;
      default:
        // Fallback to QubitBridgeEdgeAdder for unknown bridge protocols
        edgeAdder = new QubitBridgeEdgeAdder();
        break;
    }
    
    // Generate bridge edge with enhanced validation
    const bridgeEdge = await edgeAdder.makeEdge(eLogs, w, sKey, sAction, v);
    
    // Log validation results if available
    if (bridgeEdge.validationResult && !bridgeEdge.validationResult.isValid) {
      console.log(`🚨 [Bridge] Validation failed for ${bridgeProtocol}: ${bridgeEdge.validationResult.issues.map(i => i.description).join(', ')}`);
    }
    
    return bridgeEdge;
    
  } catch (error) {
    console.error(`❌ [Bridge] Error processing ${bridgeProtocol} edge:`, error);
    
    // Fallback to basic bridge edge structure
    return {
      Action: sAction.eventName,
      Protocol: semantic.Service,
      Type: "Bridge",
      Amount: "0",
      Token: "ETH",
      TokenAddr: "0x0000000000000000000000000000000000000000",
      From: v || w,
      To: w,
      // Bridge-specific fields
      edgeType: sAction.eventName === "Mint" ? "BridgeMint" : "BridgeDeposit",
      bridgeProtocol: semantic.Service,
      sourceChain: "ethereum",
      targetChain: "bsc",
      validationResult: {
        isValid: false,
        score: 0,
        issues: [{
          severity: 'critical' as const,
          type: 'processing_error',
          description: `Failed to process bridge edge: ${error}`,
          evidence: { error: error instanceof Error ? error.toString() : String(error) }
        }],
        metadata: {
          protocol: semantic.Service,
          edgeType: sAction.eventName,
          timestamp: Date.now()
        }
      }
    };
  }
}

export function updateBridgeEdge(graph: any, { address }: { address: string }, { Service }: { Service: string }) {
  const node = {
    "Service": Service, 
    "Type": "Bridge",
    "bridgeType": "lock_mint" // Qubit uses lock-mint bridge pattern
  };
  graph.setNode(address, node);
}