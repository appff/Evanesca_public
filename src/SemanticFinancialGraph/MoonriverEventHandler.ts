/**
 * Moonriver-specific event handler for Meter.io bridge and other Moonriver protocols
 * Handles Moonriver-specific event processing and edge creation
 */

// Simplified edge interface for Moonriver events
interface MoonriverEdge {
  Type: string;
  Service: string;
  Action: string;
  From: string;
  To: string;
  Amount?: string;
  Token?: string;
  TokenAddr?: string;
  metadata?: any;
}

// Known Meter.io bridge and related addresses on Moonriver
const METER_BRIDGE_ADDRESSES = new Set([
  '0x868892cccedbff0b028f3b3595205ea91b99376b'.toLowerCase(), // Passport Meter: BNB
  '0x639a647fbe20b6c8ac19e48e2de44ea792c62c5c'.toLowerCase(), // MultiChain: ETH Token
  '0x69b4fbd8c8cf74720a62a5e92e2528c3f895ce10'.toLowerCase(), // UniswapV2 Pair
  '0x1b02da8cb0d097eb8d57a175b88c7d8b47997506'.toLowerCase(), // SolarSwapRouter
  '0x8d3d13cac607b7297ff61a5e1e71072758af4d01'.toLowerCase(), // Attack EOA
]);

// Known SolarSwap (Moonriver DEX) addresses
const SOLARSWAP_ADDRESSES = new Set([
  '0x1b02da8cb0d097eb8d57a175b88c7d8b47997506'.toLowerCase(), // SolarSwapRouter
  '0x69b4fbd8c8cf74720a62a5e92e2528c3f895ce10'.toLowerCase(), // Pair contract
]);

export class MoonriverEventHandler {
  /**
   * Check if a log is from Meter.io bridge or related protocol
   */
  isMeterBridgeEvent(log: any): boolean {
    if (!log || !log.address) return false;
    
    const address = log.address.toLowerCase();
    
    // Check if address is a known Meter bridge contract
    if (METER_BRIDGE_ADDRESSES.has(address)) {
      return true;
    }
    
    // Check if it's a SolarSwap event (used in the attack)
    if (SOLARSWAP_ADDRESSES.has(address)) {
      return true;
    }
    
    return false;
  }

  /**
   * Create edge from Moonriver event
   */
  createEdgeFromEvent(log: any, decodedLog?: any): MoonriverEdge | null {
    if (!log || !log.address) {
      return null;
    }

    const address = log.address?.toLowerCase() || '';
    
    // Check if this is a bridge-related event
    if (METER_BRIDGE_ADDRESSES.has(address)) {
      // Parse the decoded log if available
      if (decodedLog && decodedLog.name) {
        const eventName = decodedLog.name;
        
        // Handle Transfer events (wrapped token transfers)
        if (eventName === 'Transfer') {
          const from = decodedLog.events?.[0]?.value || '';
          const to = decodedLog.events?.[1]?.value || '';
          const amount = decodedLog.events?.[2]?.value || '0';
          
          // Check if this is a wrapped token transfer
          if (address === '0x868892cccedbff0b028f3b3595205ea91b99376b') {
            return {
              Type: 'Bridge',
              Service: 'MeterBridge',
              Action: 'Transfer',
              From: from,
              To: to,
              Amount: amount,
              Token: 'WBNB',
              TokenAddr: address,
              metadata: {
                isBridgeOperation: true,
                isWrappedToken: true,
                moonriverEvent: true,
                possibleBypass: amount === '0' || amount === '2000000000000000000000'
              }
            };
          }
        }
        
        // Handle Approval events
        if (eventName === 'Approval') {
          const owner = decodedLog.events?.[0]?.value || '';
          const spender = decodedLog.events?.[1]?.value || '';
          const amount = decodedLog.events?.[2]?.value || '0';
          
          return {
            Type: 'Bridge',
            Service: 'MeterBridge',
            Action: 'Approval',
            From: owner,
            To: spender,
            Amount: amount,
            Token: 'WBNB',
            TokenAddr: address,
            metadata: {
              isBridgeOperation: true,
              moonriverEvent: true
            }
          };
        }
      }
    }
    
    // Check if this is a DEX event (SolarSwap)
    if (SOLARSWAP_ADDRESSES.has(address)) {
      if (decodedLog && decodedLog.name) {
        const eventName = decodedLog.name;
        
        // Handle Swap events
        if (eventName === 'Swap') {
          const sender = decodedLog.events?.[0]?.value || '';
          const amount0In = decodedLog.events?.[1]?.value || '0';
          const amount1In = decodedLog.events?.[2]?.value || '0';
          const amount0Out = decodedLog.events?.[3]?.value || '0';
          const amount1Out = decodedLog.events?.[4]?.value || '0';
          const to = decodedLog.events?.[5]?.value || '';
          
          return {
            Type: 'DEX',
            Service: 'SolarSwap',
            Action: 'Swap',
            From: sender,
            To: to,
            Amount: amount1In !== '0' ? amount1In : amount0In,
            Token: amount1In !== '0' ? 'Token1' : 'Token0',
            TokenAddr: address,
            metadata: {
              amount0In,
              amount1In,
              amount0Out,
              amount1Out,
              moonriverEvent: true,
              possibleAttack: true
            }
          };
        }
        
        // Handle Sync events
        if (eventName === 'Sync') {
          return {
            Type: 'DEX',
            Service: 'SolarSwap',
            Action: 'Sync',
            From: address,
            To: address,
            Amount: '0',
            Token: '',
            TokenAddr: address,
            metadata: {
              reserve0: decodedLog.events?.[0]?.value || '0',
              reserve1: decodedLog.events?.[1]?.value || '0',
              moonriverEvent: true
            }
          };
        }
      }
    }
    
    // Create a generic edge for any Moonriver event
    return {
      Type: 'Bridge',
      Service: 'MeterBridge',
      Action: 'Unknown',
      From: address,
      To: address,
      Amount: '0',
      Token: '',
      TokenAddr: address,
      metadata: {
        moonriverEvent: true,
        needsInvestigation: true
      }
    };
  }
  
  /**
   * Check if transaction is on Moonriver
   */
  isMoonriverTransaction(chainId: number): boolean {
    return chainId === 1285;
  }
  
  /**
   * Process Meter.io bridge attack pattern
   */
  detectMeterAttackPattern(edges: MoonriverEdge[]): boolean {
    // Look for the specific pattern:
    // 1. Large wrapped token transfer (2000 WBNB)
    // 2. Approval to router
    // 3. Swap operations
    // 4. No actual deposit to bridge
    
    let hasLargeTransfer = false;
    let hasApproval = false;
    let hasSwap = false;
    
    for (const edge of edges) {
      // Check for large WBNB transfer
      if (edge.Action === 'Transfer' && edge.Token === 'WBNB') {
        const amount = parseFloat(edge.Amount || '0');
        if (amount > 1000) { // More than 1000 tokens
          hasLargeTransfer = true;
        }
      }
      
      // Check for approval to router
      if (edge.Action === 'Approval' && edge.To?.toLowerCase() === '0x1b02da8cb0d097eb8d57a175b88c7d8b47997506') {
        hasApproval = true;
      }
      
      // Check for swap
      if (edge.Action === 'Swap') {
        hasSwap = true;
      }
    }
    
    // If we have all three patterns, it's likely the Meter.io attack
    return hasLargeTransfer && hasApproval && hasSwap;
  }
}