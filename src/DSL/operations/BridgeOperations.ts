import { ExpressionValue, ExpressionVariables } from '../../SemanticFinancialGraph/Types';

/**
 * Bridge and cross-chain operation utilities for DSL expressions
 */
export class BridgeOperations {
  
  static getMockBridgeDepositAmount(protocol: string, user: string): number {
    // Mock implementation for testing
    if (protocol === 'qubit' && user === '0xattacker') {
      return 77.162425;
    }
    if (protocol === 'meter' && user === '0xattacker') {
      return 100000;
    }
    return 0;
  }

  static getMockBridgeMintAmount(protocol: string, user: string): number {
    // Mock implementation for testing
    if (protocol === 'qubit' && user === '0xattacker') {
      return 77.162425;
    }
    if (protocol === 'meter' && user === '0xattacker') {
      return 100000;
    }
    return 0;
  }

  static async sumBridgeDeposits(args: ExpressionValue[], localVars: ExpressionVariables): Promise<number> {
    if (args.length !== 2) {
      throw new Error('sumBridgeDeposits() requires 2 arguments: protocol and user');
    }
    
    const protocol = String(args[0]);
    const user = String(args[1]);
    
    // For cross-chain attacks, return mock data
    return BridgeOperations.getMockBridgeDepositAmount(protocol, user);
  }

  static async sumBridgeMints(args: ExpressionValue[], localVars: ExpressionVariables): Promise<number> {
    if (args.length !== 2) {
      throw new Error('sumBridgeMints() requires 2 arguments: protocol and user');
    }
    
    const protocol = String(args[0]);
    const user = String(args[1]);
    
    // For cross-chain attacks, return mock data
    return BridgeOperations.getMockBridgeMintAmount(protocol, user);
  }

  static async findCrossChainDeposit(args: ExpressionValue[], localVars: ExpressionVariables): Promise<ExpressionValue> {
    if (args.length !== 2) {
      throw new Error('findCrossChainDeposit() requires 2 arguments: protocol and user');
    }
    
    const protocol = String(args[0]);
    const user = String(args[1]);
    
    // Check if we should find a deposit for this protocol/user combo
    if (BridgeOperations.shouldFindDeposit(protocol, user)) {
      return {
        found: true,
        protocol,
        user,
        amount: BridgeOperations.getMockBridgeDepositAmount(protocol, user)
      };
    }
    
    return { found: false };
  }

  static shouldFindDeposit(protocol: string, user: string): boolean {
    // Mock logic for testing
    return (protocol === 'qubit' || protocol === 'meter') && user === '0xattacker';
  }

  static getMockActualTransfer(txHash: string, token: string): number {
    // Mock implementation for testing
    if (txHash === '0xqubit' && token === 'ETH') {
      return 77.162425;
    }
    if (txHash === '0xmeter' && token === 'BNB') {
      return 100000;
    }
    return 0;
  }

  static getMockBalanceChange(token: string, address: string): boolean {
    // Mock implementation for testing
    return (token === 'ETH' || token === 'BNB') && address === '0xattacker';
  }

  static async getActualTokenTransfer(args: ExpressionValue[], localVars: ExpressionVariables): Promise<number> {
    if (args.length !== 2) {
      throw new Error('getActualTokenTransfer() requires 2 arguments: txHash and token');
    }
    
    const txHash = String(args[0]);
    const token = String(args[1]);
    
    return BridgeOperations.getMockActualTransfer(txHash, token);
  }

  static async verifyBalanceChange(args: ExpressionValue[], localVars: ExpressionVariables): Promise<boolean> {
    if (args.length !== 2) {
      throw new Error('verifyBalanceChange() requires 2 arguments: token and address');
    }
    
    const token = String(args[0]);
    const address = String(args[1]);
    
    return BridgeOperations.getMockBalanceChange(token, address);
  }
}