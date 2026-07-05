/**
 * Avalanche-specific event handler for Platypus Finance
 * Directly maps event topics to edges for proper detection
 */

import { DecodedEvent, LogEvent } from './SemanticFinancialGraphUtils';
import { IDEXEdge, ILendingEdge } from './Interfaces/IEdge';

// Platypus event topic signatures
const PLATYPUS_TOPICS = {
  // Pool events
  DEPOSIT_POOL: '0xf5dd9317b9e63ac316ce44acc85f670b54b339cfa3e9076e1dd55065b922314b',
  WITHDRAW_POOL: '0xfb80d861da582b723be2d19507ce3e03851820c464abea89156ec77e089b1ad9',
  SWAP: '0x54787c404bb33c88e86f4baf88183a3b0141d0a848e6a9f7a13b66ae3a9b73d1',
  
  // Asset events
  CASH_ADDED: '0x04da412052b8d39d78da489e294630fcb3874f03dcb0ead4481c0a6d70df1e15',
  CASH_REMOVED: '0xf15a954400c2f966714cd09162f79a6682b77351200ad1d595000057fc4ee999',
  LIABILITY_ADDED: '0x2b74a49d287a99ef6b8a9f27aaef936372e282e0e95a6352f07c9fd12596655c',
  LIABILITY_REMOVED: '0xdf20ac3c7d97136ceef3f041d542947447276d67c158dced2e33d1ee7984f530',
  
  // MasterPlatypus events (with indexed parameters)
  DEPOSIT_MASTER: '0x90890809c654f11d6e72a28fa60149770a0d11ec6c92319d6ceb2bb0a4ea1a15',
  WITHDRAW_MASTER: '0xf279e6a1f5e320cca91135676d9cb6e44ca8a08c0b88342bcdb1144f6511b568',
  EMERGENCY_WITHDRAW: '0x5fafa99d0643513820be26656b45130b01e1c03062e1266bf36f88cbd3bd9695',
  
  // Indexed versions
  DEPOSIT_INDEXED: '0x127ccaf104001294d641a109178d4674feb7b68580acfa1aeee796d17570c68b',
  WITHDRAW_INDEXED: '0x9534d781e73f04061d3f9e1e533d62193397ed808dbcc84597470a40f18682b3',
  EMERGENCY_INDEXED: '0xfac522b4537ff5ba71d129a8b1c642bab14ce1702bc305a53ef1a29daf316062',
};

export class AvalancheEventHandler {
  /**
   * Check if a log is from Platypus protocol
   */
  isPlatypusEvent(log: any): boolean {
    const topic0 = log.topics[0];
    return Object.values(PLATYPUS_TOPICS).includes(topic0);
  }

  /**
   * Create edge from Avalanche Platypus event
   */
  createEdgeFromEvent(log: any, decodedEvent?: DecodedEvent[]): IDEXEdge | ILendingEdge | null {
    const topic0 = log.topics[0];
    const address = log.address.toLowerCase();
    
    // Handle Pool events
    if (topic0 === PLATYPUS_TOPICS.DEPOSIT_POOL) {
      return {
        Action: 'Deposit',
        AmountIn: this.decodeAmount(log.data, 2),
        Token0: 'USDC',
        Token0Addr: '0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e',
        AmountOut: this.decodeAmount(log.data, 3),
        Token1: 'LP-USDC',
        Token1Addr: '0xaef735b769a3b883a6173129d616be8aee977b17',
        From: this.decodeAddress(log.topics[1]),
        To: address
      } as IDEXEdge;
    }
    
    if (topic0 === PLATYPUS_TOPICS.WITHDRAW_POOL) {
      return {
        Action: 'Withdraw',
        AmountIn: this.decodeAmount(log.data, 3),
        Token0: 'LP-USDC',
        Token0Addr: '0xaef735b769a3b883a6173129d616be8aee977b17',
        AmountOut: this.decodeAmount(log.data, 2),
        Token1: 'USDC',
        Token1Addr: '0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e',
        From: address,
        To: this.decodeAddress(log.topics[1])
      } as IDEXEdge;
    }
    
    if (topic0 === PLATYPUS_TOPICS.SWAP) {
      return {
        Action: 'Swap',
        AmountIn: this.decodeAmount(log.data, 3),
        Token0: this.decodeToken(log.data, 1),
        Token0Addr: this.decodeToken(log.data, 1),
        AmountOut: this.decodeAmount(log.data, 4),
        Token1: this.decodeToken(log.data, 2),
        Token1Addr: this.decodeToken(log.data, 2),
        From: this.decodeAddress(log.topics[1]),
        To: this.decodeAddress(log.topics[2])
      } as IDEXEdge;
    }
    
    // Handle MasterPlatypus events
    if (topic0 === PLATYPUS_TOPICS.EMERGENCY_WITHDRAW || 
        topic0 === PLATYPUS_TOPICS.EMERGENCY_INDEXED) {
      // This is the exploit!
      const user = this.decodeAddress(log.topics[1]);
      const amount = this.decodeAmount(log.data, 0);
      
      return {
        Action: 'EmergencyWithdraw',
        From: address,
        To: user,
        Amount: amount,
        Token: 'LP-USDC',
        TokenAddr: '0xaef735b769a3b883a6173129d616be8aee977b17'
      } as ILendingEdge;
    }
    
    if (topic0 === PLATYPUS_TOPICS.DEPOSIT_MASTER || 
        topic0 === PLATYPUS_TOPICS.DEPOSIT_INDEXED) {
      const user = this.decodeAddress(log.topics[1]);
      const amount = this.decodeAmount(log.data, 0);
      
      return {
        Action: 'Stake',
        From: user,
        To: address,
        Amount: amount,
        Token: 'LP-USDC',
        TokenAddr: '0xaef735b769a3b883a6173129d616be8aee977b17'
      } as ILendingEdge;
    }
    
    return null;
  }
  
  /**
   * Decode address from topic (remove padding)
   */
  private decodeAddress(topic: string): string {
    return '0x' + topic.slice(-40);
  }
  
  /**
   * Decode amount from data at position
   */
  private decodeAmount(data: string, position: number): string {
    // Each parameter is 32 bytes (64 hex chars)
    const start = 2 + (position * 64); // Skip '0x'
    const end = start + 64;
    const hex = data.substring(start, end);
    return hex ? parseInt(hex, 16).toString() : '0';
  }
  
  /**
   * Decode token address from data
   */
  private decodeToken(data: string, position: number): string {
    const start = 2 + (position * 64) + 24; // Skip '0x' and padding
    const end = start + 40;
    return '0x' + data.substring(start, end);
  }
  
  /**
   * Check if transaction is on Avalanche
   */
  isAvalancheTransaction(chainId: number): boolean {
    return chainId === 43114;
  }
}