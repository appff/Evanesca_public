// Attack Pattern Configuration System
// This allows adding new attack patterns without modifying core logic

export interface AttackPattern {
  name: string;
  blockRange: {
    start: number;
    end: number;
  };
  edgeReordering?: {
    marginTradeAmount: string;
    marginTradeToken: string;
    swapThreshold: number;
  };
  specialAddresses?: {
    flashLoanProvider?: string;
    targetProtocol?: string;
    wethAddress?: string;
  };
  specialAmounts?: {
    marginTradeAmount: string;
    flashLoanAmount?: string;
  };
}

export const ATTACK_PATTERNS: AttackPattern[] = [
  {
    name: "bZx_Attack",
    blockRange: {
      start: 9484000,
      end: 9510000
    },
    edgeReordering: {
      marginTradeAmount: "1300000000000000000000", // 1300 ETH
      marginTradeToken: "ETH",
      swapThreshold: 5000 * 1e18 // 5000 ETH
    },
    specialAddresses: {
      flashLoanProvider: "0x1e0447b19bb6ecfdae1e4ae1694b0c3659614e4e", // dYdX
      targetProtocol: "0xb0200b0677dd825bb32b93d055ebb9dc3521db9d", // bZx
      wethAddress: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2"
    },
    specialAmounts: {
      marginTradeAmount: "1300000000000000000000"
    }
  },
  // Future attack patterns can be added here:
  // {
  //   name: "Harvest_Attack",
  //   blockRange: { start: 10916000, end: 10917000 },
  //   ...
  // }
];

export class AttackPatternMatcher {
  static getPatternForBlock(blockNo: number): AttackPattern | null {
    return ATTACK_PATTERNS.find(pattern => 
      blockNo >= pattern.blockRange.start && 
      blockNo <= pattern.blockRange.end
    ) || null;
  }
  
  static isSpecialAddress(address: string, blockNo: number, type: keyof NonNullable<AttackPattern['specialAddresses']>): boolean {
    const pattern = this.getPatternForBlock(blockNo);
    if (!pattern || !pattern.specialAddresses) return false;
    
    const specialAddr = pattern.specialAddresses[type];
    return specialAddr ? address.toLowerCase() === specialAddr.toLowerCase() : false;
  }
}