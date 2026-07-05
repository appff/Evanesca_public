import { addrToNormToken } from "../PreTasks"

export interface PoolList {
  Address: string
  NormalizedSymbol: string
}

export interface PoolToNormlizedToken{ 
  Service: string
  PoolList: PoolList []
}

export interface AddressWithNorlizedToken {
  Symbol: string
  Address: string
}

export function getAddressWithNormalToken(tokenAddress: string) {
  // If input is an address, find the symbol
  for (let i of addrToNormToken) { 
    if (i.Address.toLowerCase() === tokenAddress.toLowerCase()) return i.Symbol;
  }
  
  // If input is a symbol, find the address (backward compatibility)
  for (let i of addrToNormToken) { 
    if (i.Symbol === tokenAddress) return i.Address;
  }
  
  // Graceful handling: log warning and return generic symbol instead of throwing
  console.warn(`⚠️ [EdgeAdderUtils] Unsupported token ${tokenAddress} - using generic mapping`);
  
  // Return a generic representation instead of failing
  if (tokenAddress.startsWith('0x') && tokenAddress.length === 42) {
    // It's an address, return a generic symbol
    return `UNKNOWN_${tokenAddress.slice(0, 8).toUpperCase()}`;
  } else {
    // It's a symbol, return a generic address
    return '0x0000000000000000000000000000000000000000';
  }
}