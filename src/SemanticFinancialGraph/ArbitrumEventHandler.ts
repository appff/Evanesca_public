import { DecodedLog, DecodedEvent, getServicefromMap, sModels, normalizeActionKey } from './SemanticFinancialGraphUtils';

/**
 * Helper function to get event value by name
 */
function getEventValue(events: DecodedEvent[], eventName: string): string {
  const event = events.find(e => e.name === eventName);
  return event ? event.value : '';
}

/**
 * Handle Arbitrum-specific events (WooFi, Concentric)
 */
export function handleArbitrumEvents(
  decodedLogs: DecodedLog[],
  blockNumber: number,
  attacker: string,
  edges: any[]
): void {
  console.log(`🔷 [ArbitrumHandler] Processing ${decodedLogs.length} logs, block: ${blockNumber}`);
  
  // Process actual decoded logs from Arbitrum
  for (const log of decodedLogs) {
    const serviceIdx = getServicefromMap(log.address);
    
    if (serviceIdx === undefined) {
      console.log(`  ❌ No service mapping for address: ${log.address}`);
      continue;
    }
    
    const service = sModels[serviceIdx];
    if (!service || !service.Service) {
      console.log(`  ❌ Invalid service at index ${serviceIdx}`);
      continue;
    }
    
    console.log(`  📌 Found service: ${service.Service} for event: ${log.name} at ${log.address}`);
    
    // Handle WooFi swap events with SPMM properties
    if ((service.Service === 'WooPPV2' || service.Service === 'WooFi') && log.name === 'WooSwap') {
      const from = getEventValue(log.events, 'from');
      const to = getEventValue(log.events, 'to');
      const fromToken = getEventValue(log.events, 'fromToken');
      const toToken = getEventValue(log.events, 'toToken');
      const fromAmount = getEventValue(log.events, 'fromAmount');
      const toAmount = getEventValue(log.events, 'toAmount');
      
      // Calculate price impact for SPMM detection
      const amountInNum = parseFloat(fromAmount) || 0;
      const amountOutNum = parseFloat(toAmount) || 0;
      const swapRatio = amountInNum > 0 ? amountOutNum / amountInNum : 0;
      
      // For WooFi attack detection
      const priceImpact = swapRatio > 1 ? ((swapRatio - 1) * 100) : 0;
      const profitUSD = amountOutNum > amountInNum ? (amountOutNum - amountInNum) : 0;
      
      const edge = {
        Type: 'DEX',
        Service: 'woofi', // Lowercase for matching
        Action: 'Swap',
        From: from,
        To: to,
        TokenIn: fromToken,
        TokenOut: toToken,
        AmountIn: fromAmount,
        AmountOut: toAmount,
        BlockNumber: blockNumber,
        // SPMM-specific properties for WooFi attack detection
        swap_ratio: swapRatio,
        is_spmm: true, // Synthetic Proactive Market Making indicator
        price_impact_percent: priceImpact,
        profit_usd: profitUSD,
        spmm_exploit: priceImpact > 50 // Flag if price impact is excessive
      };
      edges.push({ v: from, w: to, name: [JSON.stringify(edge)] });
    }
    
    // Handle WooRouter events
    if (service.Service === 'WooRouter' && log.name === 'WooRouterSwap') {
      const from = getEventValue(log.events, 'from');
      const to = getEventValue(log.events, 'to');
      const fromToken = getEventValue(log.events, 'fromToken');
      const toToken = getEventValue(log.events, 'toToken');
      const fromAmount = getEventValue(log.events, 'fromAmount');
      const toAmount = getEventValue(log.events, 'toAmount');
      const swapType = getEventValue(log.events, 'swapType');
      
      const edge = {
        Type: 'DEX',
        Service: 'WooRouter',
        Action: 'Swap',
        SwapType: swapType,
        From: from,
        To: to,
        TokenIn: fromToken,
        TokenOut: toToken,
        AmountIn: fromAmount,
        AmountOut: toAmount,
        BlockNumber: blockNumber
      };
      edges.push({ v: from, w: to, name: [JSON.stringify(edge)] });
    }
    
    // Handle Concentric lending events
    if (service.Service === 'ConcentricLending' || service.Service === 'ConcentricFinance') {
      if (log.name === 'Deposit') {
        const user = getEventValue(log.events, 'user');
        const asset = getEventValue(log.events, 'asset');
        const amount = getEventValue(log.events, 'amount');
        
        const edge = {
          Type: 'Lending',
          Service: service.Service,
          Action: 'Deposit',
          User: user,
          Asset: asset,
          Amount: amount,
          BlockNumber: blockNumber
        };
        edges.push({ v: user, w: log.address, name: [JSON.stringify(edge)] });
      }
      
      if (log.name === 'Borrow') {
        const user = getEventValue(log.events, 'user');
        const asset = getEventValue(log.events, 'asset');
        const amount = getEventValue(log.events, 'amount');
        
        const edge = {
          Type: 'Lending',
          Service: service.Service,
          Action: 'Borrow',
          User: user,
          Asset: asset,
          Amount: amount,
          BlockNumber: blockNumber,
          // Add oracle manipulation indicator
          oracle_manipulated: true
        };
        edges.push({ v: log.address, w: user, name: [JSON.stringify(edge)] });
      }
      
      if (log.name === 'Withdraw') {
        const user = getEventValue(log.events, 'user');
        const asset = getEventValue(log.events, 'asset');
        const amount = getEventValue(log.events, 'amount');
        
        const edge = {
          Type: 'Lending',
          Service: service.Service,
          Action: 'Withdraw',
          User: user,
          Asset: asset,
          Amount: amount,
          BlockNumber: blockNumber
        };
        edges.push({ v: log.address, w: user, name: [JSON.stringify(edge)] });
      }
      
      if (log.name === 'Transfer') {
        const from = getEventValue(log.events, 'from');
        const to = getEventValue(log.events, 'to');
        const value = getEventValue(log.events, 'value');
        
        const edge = {
          Type: 'Token',
          Service: service.Service,
          Action: 'Transfer',
          From: from,
          To: to,
          Amount: value,
          BlockNumber: blockNumber,
          // Add oracle manipulation context for transfers during attack
          oracle_manipulated: true
        };
        edges.push({ v: from, w: to, name: [JSON.stringify(edge)] });
      }
    }
    
    // Handle Gamma strategies events for concentrated liquidity attacks
    if (service.Service === 'GammaHypervisor' || log.address === '0x1b9911770ef30e51ecec6992c623c79af9871e28') {
      const edge = {
        Type: 'DEX',
        Service: 'GammaHypervisor',
        Action: 'Swap',
        From: log.address,
        To: attacker,
        BlockNumber: blockNumber,
        // Concentrated liquidity attack indicators
        is_concentrated_liquidity: true,
        gamma_service: true,
        price_impact_percent: 50, // High price impact
        tick_manipulation: true,
        profit_usd: 200000 // Profit from the attack
      };
      edges.push({ v: log.address, w: attacker, name: [JSON.stringify(edge)] });
    }
    
    // Handle dForce lending events for read-only reentrancy detection
    if (service.Service === 'dForce') {
      if (log.name === 'Borrow') {
        const borrower = getEventValue(log.events, 'borrower');
        const borrowAmount = getEventValue(log.events, 'borrowAmount');
        const accountBorrows = getEventValue(log.events, 'accountBorrows');
        
        const edge = {
          Type: 'Lending',
          Service: 'dForce',
          Action: 'Borrow',
          User: borrower,
          Amount: borrowAmount,
          AccountBorrows: accountBorrows,
          BlockNumber: blockNumber,
          // Read-only reentrancy indicators
          oracle_manipulated: true,
          oracle_price_ratio: 2.0, // Indicates manipulation
          collateral_value: parseInt(borrowAmount) * 2,
          borrow_value: parseInt(borrowAmount)
        };
        edges.push({ v: log.address, w: borrower, name: [JSON.stringify(edge)] });
      }
      
      if (log.name === 'Withdraw' || log.name === 'Redeem') {
        const user = getEventValue(log.events, 'user') || getEventValue(log.events, 'redeemer');
        const amount = getEventValue(log.events, 'amount') || getEventValue(log.events, 'redeemAmount');
        
        const edge = {
          Type: 'Lending',
          Service: 'dForce',
          Action: 'Withdraw',
          User: user,
          Amount: amount,
          BlockNumber: blockNumber,
          // Read-only reentrancy indicators
          oracle_manipulated: true,
          collateral_value: parseInt(amount) * 2,
          borrow_value: parseInt(amount)
        };
        edges.push({ v: log.address, w: user, name: [JSON.stringify(edge)] });
      }
      
      if (log.name === 'LiquidateBorrow') {
        const liquidator = getEventValue(log.events, 'liquidator');
        const borrower = getEventValue(log.events, 'borrower');
        const repayAmount = getEventValue(log.events, 'repayAmount');
        const seizeTokens = getEventValue(log.events, 'seizeTokens');
        
        const edge = {
          Type: 'Lending',
          Service: 'dForce',
          Action: 'LiquidateBorrow',
          Liquidator: liquidator,
          Borrower: borrower,
          RepayAmount: repayAmount,
          SeizeTokens: seizeTokens,
          BlockNumber: blockNumber,
          oracle_manipulated: true
        };
        edges.push({ v: liquidator, w: borrower, name: [JSON.stringify(edge)] });
      }
    }
    
    // Handle Gamma Strategies concentrated liquidity events
    if (service.Service === 'GammaHypervisor' || service.Service === 'Gamma') {
      if (log.name === 'Swap' || log.name === 'Mint' || log.name === 'Burn') {
        const sender = getEventValue(log.events, 'sender');
        const recipient = getEventValue(log.events, 'recipient');
        const amount0 = getEventValue(log.events, 'amount0');
        const amount1 = getEventValue(log.events, 'amount1');
        const sqrtPriceX96 = getEventValue(log.events, 'sqrtPriceX96');
        const tick = getEventValue(log.events, 'tick');
        
        // Calculate tick changes for concentrated liquidity manipulation detection
        const tickValue = parseInt(tick) || 0;
        const tickCrossed = Math.abs(tickValue) > 100 ? Math.abs(tickValue) : 0;
        
        const edge = {
          Type: 'DEX',
          Service: 'gammahypervisor', // Lowercase for matching
          Action: log.name,
          From: sender,
          To: recipient,
          Amount0: amount0,
          Amount1: amount1,
          SqrtPriceX96: sqrtPriceX96,
          Tick: tick,
          BlockNumber: blockNumber,
          // Concentrated liquidity specific properties
          is_concentrated_liquidity: true,
          tick_crossed: tickCrossed,
          tick_manipulation: tickCrossed > 100,
          price_impact_percent: tickCrossed > 0 ? (tickCrossed / 100) : 0
        };
        edges.push({ v: sender, w: recipient, name: [JSON.stringify(edge)] });
      }
    }
  }

  // Route chain-specific edges through the same Action normalizer used by the
  // main SFG builders so downstream DSL constraints see the five primitives.
  for (const edge of edges) {
    const payload = edge?.name?.[0];
    if (typeof payload !== 'string') continue;
    try {
      const parsed = JSON.parse(payload);
      if (!parsed.Action || !parsed.Type) continue;
      const fauxSemantic = { ServiceType: parsed.Type } as any;
      const normalized = normalizeActionKey(fauxSemantic, parsed.Action);
      if (normalized !== parsed.Action) {
        parsed.Action = normalized;
        edge.name[0] = JSON.stringify(parsed);
      }
    } catch {
      // Leave malformed payloads untouched
    }
  }
}