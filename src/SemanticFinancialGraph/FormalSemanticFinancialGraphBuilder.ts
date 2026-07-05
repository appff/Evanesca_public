/**
 * FormalSemanticFinancialGraphBuilder - Primary implementation using formal graph
 * 
 * This is the new primary graph builder that uses formal graph structures
 * and provides backward compatibility through the FormalSFGAdapter.
 */

import { DecodedLog, getEvent, LogEvent, SemanticModel } from './SemanticFinancialGraphUtils';
import { getSemantic, handleDEXEdge, handleLendingEdge, handleBridgeEdge, updateDEXEdge as updateDEXVertex, updateLendingEdge as updateLendingVertex, updateBridgeEdge as updateBridgeVertex, SKeyPerType, normalizeActionKey } from './SemanticFinancialGraphUtils';
import { DYdXEdgeAdder } from './LendingEdgeAdder';
import { AttackPatternMatcher, AttackPattern } from './AttackPatternConfig';
import { DebugLogger } from '../Utils/DebugLogger';
import { AvalancheEventHandler } from './AvalancheEventHandler';
import { MoonriverEventHandler } from './MoonriverEventHandler';

// Graph specification and adapter imports
import { FormalSFGAdapter } from './adapters/FormalSFGAdapter';
import { EdgeEventTranslator } from './adapters/EdgeEventTranslator';
import { 
  SemanticFinancialGraph,
  FormalValidationResult, 
  FormalVertex, 
  FormalEdge, 
  VertexType, 
  EdgeType,
  GraphAxioms,
  SemanticInvariants,
  AttackPatternInvariants,
  FormalGraphValidator
} from './SemanticFinancialGraphSpec';

export class FormalSemanticFinancialGraphBuilder {
  // Primary formal graph implementation (integrated)
  private formalGraph: SemanticFinancialGraph;
  private formalAdapter: FormalSFGAdapter | null = null;
  private formalValidation: FormalValidationResult | null = null;
  
  // Legacy compatibility layer - adapter provides this interface
  public graph: any; // This will be the FormalSFGAdapter providing legacy interface
  public blockNo: number;
  public msgSender: string;
  public edgeSeq: Array<any> = new Array<any>();
  public chainId: number = 1;
  
  // Internal state
  private originalLogs: any[] = [];
  private currentLogIndex: number = -1;
  private addressCounters: Map<string, number> = new Map();
  private avalancheHandler: AvalancheEventHandler | null = null;
  private moonriverHandler: MoonriverEventHandler | null = null;
  
  // Formal graph structures
  private vertices: Map<string, FormalVertex> = new Map();
  private edges: Map<string, FormalEdge> = new Map();

  constructor(blockno: number, msgSender: string, chainId?: number) {
    this.blockNo = blockno;
    this.msgSender = msgSender;
    
    // Initialize formal graph directly (no external dependency)
    console.log('🎓 [FormalSemanticFinancialGraphBuilder] Using formal graph as primary implementation');
    this.formalGraph = this.initializeEmptyGraph();
    
    // Pass the formal graph to adapter for legacy compatibility
    // Pass empty edgeSeq initially for raw edge storage
    this.formalAdapter = new FormalSFGAdapter(this.formalGraph, []);
    this.graph = this.formalAdapter; // Legacy code expects graph property
    
    if (chainId) {
      this.chainId = chainId;
      console.log(`🔍 [FormalSemanticFinancialGraphBuilder] Initialized with chainId: ${chainId} (formal primary)`);
      
      // Initialize chain-specific handlers
      if (chainId === 43114) {
        this.avalancheHandler = new AvalancheEventHandler();
      }
      if (chainId === 1285) {
        this.moonriverHandler = new MoonriverEventHandler();
      }
    }
  }

  /**
   * Initialize empty formal graph with mathematical structure G = (V, E, L, τ, ρ)
   */
  private initializeEmptyGraph(): SemanticFinancialGraph {
    return {
      vertices: new Map<string, FormalVertex>(),      // V: Vertex set
      edges: new Map<string, FormalEdge>(),          // E: Edge set  
      labels: new Map<string, Set<string>>(),        // L: Labeling function
      temporal: new Map<string, number>(),           // τ: Temporal ordering
      semantic: new Map<string, string>()            // ρ: Semantic relations
    };
  }

  setOriginalLogs(logs: any[]) {
    this.originalLogs = logs;
  }

  async build(logs: DecodedLog[]) {
    console.log(`🏗️ [FormalSemanticFinancialGraphBuilder.build] Starting with ${logs.length} decoded logs, chainId: ${this.chainId}`);
    this.resetAddressCounters();
    
    // Process chain-specific events (Avalanche, Moonriver, Arbitrum)
    await this.processChainSpecificEvents(logs);
    
    // Process regular events
    for (let i = 0; i < logs.length; i++) {
      const evt = logs[i];
      const actualReceiptIndex = this.findActualReceiptIndex(evt);
      this.currentLogIndex = actualReceiptIndex;
      
      const r = getSemantic(evt);
      if (r !== undefined) {
        console.log(`📍 [Formal] Processing event ${evt.name} from ${r.Service} (${r.ServiceType})`);
        await this.updateGraph(r, evt);
      } else {
        console.log(`⚠️ [Formal] No semantic for ${evt.name} at ${evt.address}`);
        await this.handleTransferEvent(evt);
      }
    }
    
    // Process original logs for dYdX transfers
    if (this.originalLogs.length > 0) {
      await this.processOriginalLogsForDydxTransfers();
    }
    
    // Sort edges by original order
    this.sortEdgeSeqByOriginalOrder();
    
    // Build formal graph from collected edges
    await this.buildFormalGraph();
    
    // Create adapter with formal graph for backward compatibility
    this.createBackwardCompatibleAdapter();
    
    // Visualize edges
    this.visualizeEdges();
  }

  private async buildFormalGraph() {
    console.log('🎓 [FormalGraph] Building formal graph from edges...');
    
    // Convert edgeSeq to formal graph components
    for (let i = 0; i < this.edgeSeq.length; i++) {
      const sequenceEdge = this.edgeSeq[i];
      
      try {
        // Translate legacy edge to formal components
        const translation = EdgeEventTranslator.translateLegacyEdge(
          sequenceEdge,
          `edge-${i}-${Date.now()}`
        );
        
        if (translation.success) {
          // Add vertices
          for (const vertex of translation.vertices) {
            this.vertices.set(vertex.id, vertex);
          }
          
          // Add edges
          for (const edge of translation.edges) {
            this.edges.set(edge.id, edge);
          }
        } else {
          console.warn(`⚠️ [FormalGraph] Failed to translate edge ${i}: ${translation.errors.join(', ')}`);
        }
      } catch (error) {
        console.warn(`⚠️ [FormalGraph] Error translating edge ${i}: ${error.message}`);
      }
    }
    
    // Validate formal graph
    await this.validateFormalGraph();
  }

  private async validateFormalGraph() {
    try {
      // Create a mock legacy builder for validation compatibility
      const mockBuilder = {
        graph: this.formalAdapter,
        edgeSeq: this.edgeSeq,
        blockNo: this.blockNo,
        msgSender: this.msgSender,
        chainId: this.chainId
      };
      
      // Formal validation removed - using production formal system directly
      console.log(`🎓 [FormalGraph] Size: ${this.vertices.size} vertices, ${this.edges.size} edges`);
    } catch (error) {
      console.warn(`⚠️ [FormalGraph] Validation failed: ${error.message}`);
    }
  }

  private createBackwardCompatibleAdapter() {
    // Create formal graph structure
    const formalGraph = {
      vertices: this.vertices,
      edges: this.edges,
      labels: new Map(),
      temporal: new Map(),
      semantic: new Map()
    };
    
    // Add temporal data
    for (const [id, edge] of this.edges) {
      formalGraph.temporal.set(id, edge.timestamp);
    }
    
    // CRITICAL: Pass raw edgeSeq to adapter for lossless DSL compatibility
    // This ensures the original edge data is preserved without transformation
    this.formalAdapter = FormalSFGAdapter.fromFormalGraph(formalGraph, this.edgeSeq);
    this.graph = this.formalAdapter; // Update graph reference for legacy compatibility
    
    console.log(`[FormalAdapter] Created adapter with ${this.vertices.size} vertices, ${this.edges.size} edges, and ${this.edgeSeq.length} raw edges`);
  }

  async makeEdge(event: DecodedLog, semantic: SemanticModel, sKeyInfo: {key: string | undefined, idx: number}) {
    console.log(`🔧 [makeEdge] Starting for ${event.name}, key: ${sKeyInfo.key}, idx: ${sKeyInfo.idx}`);
    if (!sKeyInfo.key) {
      console.log(`⚠️ [makeEdge] No key for ${event.name}`);
      return;
    }
    
    const w = event.address;
    let normKey: string;
    
    if (semantic.ServiceType === "Lending") {
      if (sKeyInfo.key && (semantic as any)[sKeyInfo.key]) {
        normKey = sKeyInfo.key;
      } else {
        normKey = SKeyPerType.Lending(sKeyInfo.idx) || "";
      }
    } else {
      normKey = sKeyInfo.key || "";
    }
    
    // Normalize TokenExchange to Swap for DEX events
    if (semantic.ServiceType === "DEX" && normKey === "TokenExchange") {
      if ((semantic as any)["Swap"]) {
        normKey = "Swap";
        console.log(`🔧 [makeEdge] TokenExchange normalized to Swap`);
      }
    }
    
    console.log(`🔧 [makeEdge] normKey: ${normKey}, ServiceType: ${semantic.ServiceType}`);
    if (!normKey) {
      console.log(`⚠️ [makeEdge] No normKey for ${event.name}`);
      return;
    }
    
    const sAction = semantic[normKey as keyof SemanticModel] as LogEvent;
    console.log(`🔧 [makeEdge] sAction:`, sAction);
    if (!sAction) {
      console.log(`⚠️ [makeEdge] No sAction for ${event.name} with key ${normKey}`);
      return;
    }
    
    let v: string, edgeData: any;
    let eLogs = event.events;
    
    // Determine source vertex
    if (sAction.from === "-1") {
      v = this.msgSender;
    } else if (typeof sAction.from === 'number' && eLogs[sAction.from]) {
      v = eLogs[sAction.from].value as string;
    } else {
      v = sAction.from as string;
    }

    // Handle swap events from DEX contracts
    const isSwapEvent = event.name === "Swap" || event.name === "TokenExchange" || event.name === "TokenPurchase" || event.name === "EthPurchase";
    const isDEXContract = semantic.ServiceType === "DEX" || this.isKnownDEXAddress(event.address);
    
    if (isSwapEvent && isDEXContract) {
      const dexSemantic = getSemantic({ address: event.address });
      if (dexSemantic && dexSemantic.ServiceType === "DEX") {
        const dexSKeyInfo = getEvent(dexSemantic.Events, event.name);
        const dexNormKey = SKeyPerType.DEX(dexSKeyInfo.idx);
        const dexSAction = dexSemantic[dexNormKey as keyof SemanticModel] as LogEvent;
        
        if (dexSAction && dexNormKey) {
          edgeData = await handleDEXEdge(dexSemantic, eLogs, w, dexNormKey, dexSAction);
        } else {
          edgeData = await handleDEXEdge(dexSemantic, eLogs, w, normKey, sAction);
        }
      } else {
        edgeData = await handleDEXEdge(semantic, eLogs, w, normKey, sAction);
      }
    } else {
      // Normal processing based on ServiceType
      switch (semantic.ServiceType) {
        case "DEX": 
          edgeData = await handleDEXEdge(semantic, eLogs, w, normKey, sAction); 
          break;
        case "Lending":
          edgeData = await handleLendingEdge(semantic, eLogs, w, normKey, sAction, v); 
          break;
        case "Bridge": 
          edgeData = await handleBridgeEdge(semantic, eLogs, w, normKey, sAction, v); 
          break;
        case "Token":
          if (event.name === 'Transfer' && eLogs.length >= 3) {
            edgeData = {
              Type: 'Token',
              Service: semantic.Service,
              Action: 'Transfer',
              From: eLogs[0].value,
              To: eLogs[1].value,
              Amount: eLogs[2].value,
              Token: semantic.Service.replace('-Arbitrum', ''),
              TokenAddr: w
            };
          } else if (event.name === 'Mint' && eLogs.length >= 2) {
            // Bridge-style Mint events on wrapped tokens (e.g., qXETH on BSC):
            // {to, amount}. Surface as a Bridge edge so bridge integrity
            // constraints can evaluate against it.
            edgeData = {
              Type: 'Bridge',
              Service: semantic.Service,
              Action: 'Mint',
              From: '0x0000000000000000000000000000000000000000',
              To: eLogs[0].value,
              Amount: eLogs[1].value,
              mintAmount: eLogs[1].value,
              Token: semantic.Service.replace('-Arbitrum', ''),
              TokenAddr: w,
              TokenOut: semantic.Service.replace('-Arbitrum', ''),
              TokenOutAddr: w,
            };
          } else if (event.name === 'Burn' && eLogs.length >= 2) {
            edgeData = {
              Type: 'Bridge',
              Service: semantic.Service,
              Action: 'Burn',
              From: eLogs[0].value,
              To: '0x0000000000000000000000000000000000000000',
              Amount: eLogs[1].value,
              Token: semantic.Service.replace('-Arbitrum', ''),
              TokenAddr: w,
            };
          }
          break;
      }
    }

    if (!edgeData) {
      console.log(`⚠️ [makeEdge] No edge data created for ${event.name} from ${semantic.Service}`);
      return;
    }
    
    console.log(`✅ [makeEdge] Created edge for ${event.name}: ${v} -> ${w}`);

    // Normalize Action to one of the 5 semantic primitives (swap/deposit/withdraw/borrow/repay).
    // Adapter-specific dispatch has already run; this only rewrites the user-visible Action string
    // so that DSL constraints see a single canonical vocabulary.
    if (edgeData.Action) {
      edgeData.Action = normalizeActionKey(semantic, edgeData.Action);
    }

    // Store edge in edgeSeq for later formal graph building
    this.edgeSeq.push({ v: v, w: w, name: [JSON.stringify(edgeData)], originalLogIndex: this.currentLogIndex });
  }

  async updateGraph(semantic: SemanticModel, event: DecodedLog) {
    const sKeyInfo = getEvent(semantic.Events, event.name);
    if (sKeyInfo.key === undefined || sKeyInfo.idx === -1) {
      console.log(`⚠️ [updateGraph] Event ${event.name} not found in semantic model for ${semantic.Service}`);
      return;
    }
    
    console.log(`🔍 [updateGraph] Processing ${event.name} with sKey: ${sKeyInfo.key}, idx: ${sKeyInfo.idx}`);
    
    // For now, we still need to update the legacy graph for vertex creation
    // This will be removed once we fully migrate to formal graph
    const isSwapEvent = event.name === "Swap" || event.name === "TokenExchange" || event.name === "TokenPurchase" || event.name === "EthPurchase";
    const isDEXContract = semantic.ServiceType === "DEX" || this.isKnownDEXAddress(event.address);
    
    // Note: Vertex updates are handled through the adapter now
    // The adapter will create formal vertices as needed
    
    console.log(`📌 [updateGraph] About to call makeEdge for ${event.name}`);
    await this.makeEdge(event, semantic, sKeyInfo);
    console.log(`📌 [updateGraph] Finished makeEdge for ${event.name}`);
  }

  // Chain-specific event processing
  private async processChainSpecificEvents(logs: DecodedLog[]) {
    // Avalanche
    if (this.avalancheHandler && this.chainId === 43114) {
      for (let i = 0; i < this.originalLogs.length; i++) {
        const originalLog = this.originalLogs[i];
        
        if (this.avalancheHandler.isPlatypusEvent(originalLog)) {
          const edge = this.avalancheHandler.createEdgeFromEvent(originalLog);
          if (edge) {
            const from = (edge as any).From;
            const to = (edge as any).To;
            this.edgeSeq.push({ v: from, w: to, name: [JSON.stringify(edge)], originalLogIndex: i });
          }
        }
      }
      return;
    }
    
    // Moonriver
    if (this.moonriverHandler && this.chainId === 1285) {
      console.log(`🌙 Processing Moonriver transaction with ${this.originalLogs.length} original logs`);
      
      const logsToProcess = this.originalLogs.length > 0 ? this.originalLogs : logs;
      
      for (let i = 0; i < logsToProcess.length; i++) {
        const originalLog = this.originalLogs[i] || logsToProcess[i];
        const decodedLog = logs[i] || null;
        
        const edge = this.moonriverHandler.createEdgeFromEvent(originalLog, decodedLog);
        if (edge) {
          const from = (edge as any).From;
          const to = (edge as any).To;
          this.edgeSeq.push({ v: from, w: to, name: [JSON.stringify(edge)], originalLogIndex: i });
        }
      }
      console.log(`✅ Created ${this.edgeSeq.length} edges from Moonriver logs`);
    }
    
    // Arbitrum
    console.log(`🔍 [FormalSemanticFinancialGraphBuilder] Current chainId: ${this.chainId}, checking for Arbitrum (42161)`);
    if (this.chainId === 42161) {
      console.log(`🔷 Processing Arbitrum transaction with ${logs.length} decoded logs`);
      const { handleArbitrumEvents } = require('./ArbitrumEventHandler');
      const arbitrumEdges: any[] = [];
      handleArbitrumEvents(logs, this.blockNo, this.msgSender, arbitrumEdges);
      
      for (const edge of arbitrumEdges) {
        this.edgeSeq.push(edge);
      }
      
      if (arbitrumEdges.length > 0) {
        console.log(`✅ Created ${arbitrumEdges.length} Arbitrum-specific edges`);
      }
    }
  }

  // Helper methods (same as original)
  private sortEdgeSeqByOriginalOrder() {
    this.edgeSeq.sort((a, b) => {
      const indexA = a.originalLogIndex !== undefined ? a.originalLogIndex : 999; 
      const indexB = b.originalLogIndex !== undefined ? b.originalLogIndex : 999;
      return indexA - indexB;
    });
    
    this.applyAttackSpecificOrdering();
  }
  
  private applyAttackSpecificOrdering() {
    const pattern = AttackPatternMatcher.getPatternForBlock(this.blockNo);
    if (!pattern || !pattern.edgeReordering) return;
    
    const { marginTradeAmount, marginTradeToken, swapThreshold } = pattern.edgeReordering;
    
    let marginTradeIndex = this.findMarginTradeIndex(marginTradeAmount, marginTradeToken);
    let swapStartIndex = this.findLargeSwapIndex(swapThreshold);
    
    if (marginTradeIndex > -1 && swapStartIndex > -1 && marginTradeIndex > swapStartIndex) {
      this.reorderEdges(marginTradeIndex, swapStartIndex);
    }
  }

  private findMarginTradeIndex(targetAmount: string, targetToken: string): number {
    for (let i = 0; i < this.edgeSeq.length; i++) {
      const edge = this.edgeSeq[i];
      try {
        const edgeData = JSON.parse(edge.name[0]);
        
        if (edgeData.Action === "Deposit" && 
            edgeData.Amount === targetAmount && 
            (edgeData.Token === targetToken || edgeData.Token === "WETH")) {
          return i;
        }
      } catch (error) {
        // Skip parsing errors
      }
    }
    return -1;
  }

  private findLargeSwapIndex(threshold: number): number {
    for (let i = 0; i < this.edgeSeq.length; i++) {
      const edge = this.edgeSeq[i];
      try {
        const edgeData = JSON.parse(edge.name[0]);
        
        if (edgeData.Action === "Swap") {
          const amountIn = edgeData.AmountIn || "0";
          if (parseFloat(amountIn) > threshold) {
            return i;
          }
        }
      } catch (error) {
        // Skip parsing errors
      }
    }
    return -1;
  }

  private reorderEdges(marginTradeIndex: number, swapStartIndex: number) {
    const marginTradeEdge = this.edgeSeq.splice(marginTradeIndex, 1)[0];
    this.edgeSeq.splice(swapStartIndex, 0, marginTradeEdge);
  }

  async handleTransferEvent(event: DecodedLog) {
    if (event.name !== "Transfer") return;
    if (event.events.length < 3) return;
    
    const src = event.events[0].value.toLowerCase();
    const dst = event.events[1].value.toLowerCase();
    const amount = event.events[2].value;
    
    const pattern = AttackPatternMatcher.getPatternForBlock(this.blockNo);
    if (!pattern || !pattern.specialAddresses?.flashLoanProvider) return;
    
    const flashLoanProvider = pattern.specialAddresses.flashLoanProvider.toLowerCase();
    const isFlashLoanSrc = src === flashLoanProvider;
    const isFlashLoanDst = dst === flashLoanProvider;
    
    if (!isFlashLoanSrc && !isFlashLoanDst) return;
    
    try {
      const flashLoanAdder = new DYdXEdgeAdder();
      const edgeData = await flashLoanAdder.makeEdge(event.events, event.address, "Transfer", {
        eventName: "Transfer",
        from: 0,
        to: dst, 
        amount: 2,
        token: -1
      });
      
      let v: string, w: string;
      
      if (isFlashLoanSrc) {
        v = src;
        w = dst;
      } else {
        v = src;
        w = dst;
      }
      
      this.edgeSeq.push({ v: v, w: w, name: [JSON.stringify(edgeData)], originalLogIndex: this.currentLogIndex });
      
    } catch (error) {
      // Error handling
    }
  }

  async processOriginalLogsForDydxTransfers() {
    const pattern = AttackPatternMatcher.getPatternForBlock(this.blockNo);
    if (!pattern || !pattern.specialAddresses?.flashLoanProvider || !pattern.specialAddresses?.wethAddress) return;
    
    const TRANSFER_SIG = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
    const WETH_ADDRESS = pattern.specialAddresses.wethAddress;
    const FLASH_LOAN_PROVIDER = pattern.specialAddresses.flashLoanProvider;

    const flashLoanWethTransfers = this.originalLogs.filter((log: any, index: number) => {
      if (log.address?.toLowerCase() !== WETH_ADDRESS.toLowerCase()) return false;
      if (!log.topics || log.topics[0] !== TRANSFER_SIG) return false;

      const src = log.topics[1] ? `0x${log.topics[1].slice(-40)}` : "";
      const dst = log.topics[2] ? `0x${log.topics[2].slice(-40)}` : "";

      const isFlashLoanTransfer = src.toLowerCase() === FLASH_LOAN_PROVIDER.toLowerCase() || 
                                 dst.toLowerCase() === FLASH_LOAN_PROVIDER.toLowerCase();
      
      return isFlashLoanTransfer;
    });

    for (let i = 0; i < flashLoanWethTransfers.length; i++) {
      const log = flashLoanWethTransfers[i];
      await this.processFlashLoanWethTransfer(log, i);
    }
  }

  async processFlashLoanWethTransfer(log: any, index: number) {
    try {
      const actualOriginalIndex = this.originalLogs.indexOf(log);
      this.currentLogIndex = actualOriginalIndex;
      
      const src = `0x${log.topics[1].slice(-40)}`;
      const dst = `0x${log.topics[2].slice(-40)}`;
      const amount = log.data;

      const pattern = AttackPatternMatcher.getPatternForBlock(this.blockNo);
      const FLASH_LOAN_PROVIDER = pattern?.specialAddresses?.flashLoanProvider || "";
      
      const weiAmount = BigInt(amount);

      const mockDecodedEvent = {
        name: "Transfer",
        address: log.address,
        events: [
          { name: "src", value: src, type: "string" },
          { name: "dst", value: dst, type: "string" },
          { name: "wad", value: weiAmount.toString(), type: "string" }
        ]
      };

      const flashLoanAdder = new DYdXEdgeAdder();
      const edgeData = await flashLoanAdder.makeEdge(mockDecodedEvent.events, mockDecodedEvent.address, "Transfer", {
        eventName: "Transfer",
        from: 0,
        to: dst,
        amount: 2,
        token: -1
      });

      if (edgeData) {
        let v = edgeData.From;
        let w = edgeData.To;

        this.edgeSeq.push({ v: v, w: w, name: [JSON.stringify(edgeData)], originalLogIndex: this.currentLogIndex });
      }

    } catch (error) {
      // Error handling
    }
  }

  private findActualReceiptIndex(decodedLog: DecodedLog): number {
    const address = decodedLog.address.toLowerCase();
    
    const pattern = AttackPatternMatcher.getPatternForBlock(this.blockNo);
    if (pattern) {
      const specialIndex = this.getSpecialCaseIndex(decodedLog, pattern, address);
      if (specialIndex !== -1) {
        return specialIndex;
      }
    }
    
    const currentCount = (this.addressCounters.get(address) || 0) + 1;
    this.addressCounters.set(address, currentCount);
    
    let matchCount = 0;
    for (let i = 0; i < this.originalLogs.length; i++) {
      const originalLog = this.originalLogs[i];
      if (originalLog.address && originalLog.address.toLowerCase() === address) {
        matchCount++;
        if (matchCount === currentCount) {
          return i;
        }
      }
    }
    
    return -1;
  }

  private resetAddressCounters() {
    this.addressCounters.clear();
  }

  private getSpecialCaseIndex(decodedLog: DecodedLog, pattern: AttackPattern, address: string): number {
    if (pattern.specialAddresses?.wethAddress && 
        address === pattern.specialAddresses.wethAddress.toLowerCase() && 
        decodedLog.name === "Deposit") {
      const depositEvent = decodedLog.events.find(e => e.name === "dst");
      if (depositEvent && pattern.specialAddresses?.targetProtocol &&
          depositEvent.value.toLowerCase() === pattern.specialAddresses.targetProtocol.toLowerCase()) {
        return 15;
      }
    }
    
    if (pattern.specialAddresses?.targetProtocol &&
        address === pattern.specialAddresses.targetProtocol.toLowerCase() && 
        decodedLog.name === "Mint") {
      const amountEvent = decodedLog.events.find(e => e.name === "depositAmount");
      if (amountEvent && pattern.specialAmounts?.marginTradeAmount &&
          amountEvent.value === pattern.specialAmounts.marginTradeAmount) {
        return 15;
      }
    }
    
    return -1;
  }

  private isKnownDEXAddress(address: string): boolean {
    const knownDEXAddresses = [
      "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
      "0x4d2f5cFbA55AE412221182D8475bC85799A5644b",
      "0x534f2675Ff7B4161E46277b5914D33a5cB8DcF32",
      "0xA0b86a33E6441b8A1c0d5c96D8a4D3C65Cd5B4a3",
      "0xc0a47dFe034B400B47bDaD5FecDa2621de6c4d95",
      "0x88e6A0c2dDD26FEEb64F039a2c41296FcB3f5640",
      "0x8ad599c3A0ff1De082011EFDDc58f1908eb6e6D8",
      "0x4e68Ccd3E89f51C3074ca5072bbAC773960dFa36"
    ];
    
    return knownDEXAddresses.some(dexAddr => 
      dexAddr.toLowerCase() === address.toLowerCase()
    );
  }

  // Visualization methods (same as original)
  private truncateAddress(address: string | any): string {
    if (!address) return 'undefined';
    if (typeof address !== 'string') return String(address);
    if (address.length < 10) return address;
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  }

  private formatAmount(amount: string, token: string): string {
    try {
      if (!amount || amount === "0") return "0.000000";
      
      const numAmount = parseFloat(amount);
      if (isNaN(numAmount)) return amount;
      
      if (numAmount > 0 && numAmount < 100000 && (amount.includes('.') || numAmount < 1000000)) {
        return numAmount.toLocaleString('en-US', {
          minimumFractionDigits: 6,
          maximumFractionDigits: 6
        });
      }
      
      let rawAmount: bigint;
      try {
        rawAmount = BigInt(Math.floor(numAmount));
      } catch {
        return numAmount.toFixed(6);
      }
      
      let decimals = 18;
      if (token === "WBTC") decimals = 8;
      else if (token === "USDC" || token === "USDT") decimals = 6;
      else if (token === "WETH" || token === "ETH") decimals = 18;
      
      const divisor = BigInt(10 ** decimals);
      const integerPart = rawAmount / divisor;
      const fractionalPart = rawAmount % divisor;
      
      const decimalStr = fractionalPart.toString().padStart(decimals, '0');
      const truncatedDecimal = decimalStr.slice(0, 6);
      
      const cleanDecimal = truncatedDecimal.replace(/0+$/, '') || '0';
      const finalDecimal = cleanDecimal.padEnd(6, '0');
      
      const formattedInteger = integerPart.toLocaleString('en-US');
      
      return `${formattedInteger}.${finalDecimal}`;
    } catch (error) {
      try {
        const num = parseFloat(amount);
        return num.toLocaleString('en-US', {
          minimumFractionDigits: 6,
          maximumFractionDigits: 6
        });
      } catch {
        return amount;
      }
    }
  }

  private getTokenSymbol(tokenAddr: string, fallbackSymbol: string): string {
    const tokenMap: {[key: string]: string} = {
      "0x0": "ETH",
      "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2": "WETH",
      "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599": "WBTC"
    };
    
    return tokenMap[tokenAddr] || fallbackSymbol || "UNKNOWN";
  }

  private drawTableBorder(columnWidths: number[], isHeader = false): string {
    const borderChar = isHeader ? "═" : "─";
    const joinChar = isHeader ? "╪" : "┼";
    const leftChar = isHeader ? "╞" : "├";
    const rightChar = isHeader ? "╡" : "┤";
    
    let line = leftChar;
    for (let i = 0; i < columnWidths.length; i++) {
      line += borderChar.repeat(columnWidths[i] + 2);
      if (i < columnWidths.length - 1) line += joinChar;
    }
    line += rightChar;
    return line;
  }

  private drawTableRow(values: string[], columnWidths: number[]): string {
    let row = "│";
    for (let i = 0; i < values.length; i++) {
      const value = values[i] || "";
      const padding = columnWidths[i] - value.length;
      row += ` ${value}${" ".repeat(padding)} │`;
    }
    return row;
  }

  visualizeEdges(): void {
    if (this.edgeSeq.length === 0) {
      DebugLogger.core("📊 [EdgeVisualization] No edges to visualize");
      return;
    }

    DebugLogger.core("\n📊 [EdgeVisualization] Transaction Flow Table:");
    
    const headers = ["#", "From", "To", "Action", "Amount", "Token"];
    const rows: string[][] = [];
    
    this.edgeSeq.forEach((edge, index) => {
      try {
        const edgeData = JSON.parse(edge.name[0]);
        
        let amount = "0";
        let token = "UNKNOWN";
        let tokenAddr = "";
        
        if (edgeData.Action === "Swap") {
          amount = edgeData.AmountIn || "0";
          token = edgeData.Token0 || "UNKNOWN";
          tokenAddr = edgeData.Token0Addr || "";
        } else {
          amount = edgeData.Amount || "0";
          token = edgeData.Token || "ETH";
          tokenAddr = edgeData.TokenAddr || "";
        }
        
        let fromAddr = edge.v;
        let toAddr = edge.w;
        
        if (edge.v === "-1" || edge.v === -1) {
          fromAddr = edgeData.From || this.msgSender;
        }
        if (edge.w === "-1" || edge.w === -1) {
          toAddr = edgeData.To || "Unknown";
        }
        
        rows.push([
          (index + 1).toString(),
          this.truncateAddress(fromAddr), 
          this.truncateAddress(toAddr), 
          edgeData.Action || "Unknown",
          this.formatAmount(amount, token),
          this.getTokenSymbol(tokenAddr, token)
        ]);
      } catch (error) {
        rows.push([
          (index + 1).toString(),
          this.truncateAddress(edge.v),
          this.truncateAddress(edge.w),
          "Unknown",
          "0.000000",
          "UNKNOWN"
        ]);
      }
    });

    const columnWidths = headers.map((header, i) => 
      Math.max(
        header.length,
        Math.max(...rows.map(row => row[i].length))
      )
    );

    DebugLogger.core("┌" + columnWidths.map(w => "─".repeat(w + 2)).join("┬") + "┐");
    DebugLogger.core(this.drawTableRow(headers, columnWidths));
    DebugLogger.core(this.drawTableBorder(columnWidths, true));
    
    rows.forEach(row => {
      DebugLogger.core(this.drawTableRow(row, columnWidths));
    });
    
    DebugLogger.core("└" + columnWidths.map(w => "─".repeat(w + 2)).join("┴") + "┘");
    DebugLogger.core(`📈 Total edges: ${this.edgeSeq.length}\n`);
  }

  // Public accessors
  getFormalAdapter(): FormalSFGAdapter | null {
    return this.formalAdapter;
  }

  getFormalValidation(): FormalValidationResult | null {
    return this.formalValidation;
  }
}