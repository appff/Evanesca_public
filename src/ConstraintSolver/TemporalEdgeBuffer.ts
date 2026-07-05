/**
 * Temporal Edge Buffer for MiCA Regulation Constraints
 *
 * Provides historical transaction context for temporal window constraints that require
 * daily/weekly aggregation (e.g., unverified user EUR 150 daily limit).
 *
 * Architecture:
 * - Stores edges within configurable time/block windows
 * - Indexed by user address for O(1) lookup
 * - Automatic cleanup of old edges outside window
 * - Support for both BLOCK_WINDOW(n) and TIME_WINDOW(seconds) semantics
 */

export interface ProcessedEdge {
  // Core identifiers
  source: string;                // User address
  destination: string;           // Protocol address

  // Temporal data
  block_number: number;
  timestamp: number;

  // Transaction data
  Action: string;                // Swap, Transfer, Borrow, Deposit, Withdraw, Bridge
  Type: string;                  // DEX, Lending, Bridge, Transfer
  value_usd: number;            // USD value of transaction

  // Participant metadata (MiCA compliance)
  participant?: {
    verification_status?: string;     // unverified, verified, institutional
    jurisdiction?: string;            // ISO 3166-1 alpha-2 country code
    risk_profile?: string;            // low, medium, high
    beneficial_owner_id?: string;     // For related account detection
  };

  // Protocol-specific data (optional)
  asset_in?: string;
  asset_out?: string;
  AmountIn?: string;
  AmountOut?: string;
  Token0?: string;
  Token1?: string;
  Token?: string;
  Amount?: string;
  Protocol?: string;

  // Raw edge data for reference
  [key: string]: any;
}

interface TemporalEdgeBufferConfig {
  maxBlockWindow: number;    // Max blocks to retain (default: 6500 = ~24h on Ethereum)
  maxTimeWindow: number;     // Max seconds to retain (default: 86400 = 24h)
  currentBlock: number;      // Current block number
}

export class TemporalEdgeBuffer {
  // Core storage
  private edges: ProcessedEdge[] = [];

  // Configuration
  private maxBlockWindow: number;
  private maxTimeWindow: number;
  private currentBlock: number;

  // Index structures for O(1) lookup
  private edgesByUser: Map<string, ProcessedEdge[]> = new Map();
  private edgesByBlock: Map<number, ProcessedEdge[]> = new Map();

  constructor(config: TemporalEdgeBufferConfig) {
    this.maxBlockWindow = config.maxBlockWindow;
    this.maxTimeWindow = config.maxTimeWindow;
    this.currentBlock = config.currentBlock;
  }

  /**
   * Add edge to buffer with automatic indexing
   */
  addEdge(edge: ProcessedEdge): void {
    this.edges.push(edge);

    // Index by user address
    if (!this.edgesByUser.has(edge.source)) {
      this.edgesByUser.set(edge.source, []);
    }
    this.edgesByUser.get(edge.source)!.push(edge);

    // Index by block number
    if (!this.edgesByBlock.has(edge.block_number)) {
      this.edgesByBlock.set(edge.block_number, []);
    }
    this.edgesByBlock.get(edge.block_number)!.push(edge);
  }

  /**
   * Get all edges for a user within block window
   *
   * @param address User address
   * @param windowSize Number of blocks to look back
   * @returns Array of edges within window
   */
  getEdgesInBlockWindow(address: string, windowSize: number): ProcessedEdge[] {
    const userEdges = this.edgesByUser.get(address) || [];
    const windowStartBlock = this.currentBlock - windowSize;

    return userEdges.filter(edge =>
      edge.block_number >= windowStartBlock &&
      edge.block_number <= this.currentBlock
    );
  }

  /**
   * Get all edges for a user within time window
   *
   * @param address User address
   * @param windowSeconds Number of seconds to look back
   * @returns Array of edges within window
   */
  getEdgesInTimeWindow(address: string, windowSeconds: number): ProcessedEdge[] {
    const userEdges = this.edgesByUser.get(address) || [];
    const currentTime = Math.floor(Date.now() / 1000);
    const windowStartTime = currentTime - windowSeconds;

    return userEdges.filter(edge =>
      edge.timestamp >= windowStartTime &&
      edge.timestamp <= currentTime
    );
  }

  /**
   * Get all edges in buffer (for context.edges array)
   */
  getAllEdges(): ProcessedEdge[] {
    return this.edges;
  }

  /**
   * Get edges count by user (for debugging)
   */
  getUserEdgeCount(address: string): number {
    return this.edgesByUser.get(address)?.length || 0;
  }

  /**
   * Cleanup edges outside max window
   * Called periodically to prevent memory growth
   */
  cleanup(): void {
    const windowStartBlock = this.currentBlock - this.maxBlockWindow;

    // Remove old edges
    this.edges = this.edges.filter(edge =>
      edge.block_number >= windowStartBlock
    );

    // Rebuild indices (could be optimized with incremental cleanup)
    this.rebuildIndices();
  }

  /**
   * Rebuild index structures after cleanup
   */
  private rebuildIndices(): void {
    this.edgesByUser.clear();
    this.edgesByBlock.clear();

    for (const edge of this.edges) {
      // Index by user
      if (!this.edgesByUser.has(edge.source)) {
        this.edgesByUser.set(edge.source, []);
      }
      this.edgesByUser.get(edge.source)!.push(edge);

      // Index by block
      if (!this.edgesByBlock.has(edge.block_number)) {
        this.edgesByBlock.set(edge.block_number, []);
      }
      this.edgesByBlock.get(edge.block_number)!.push(edge);
    }
  }

  /**
   * Get buffer statistics (for monitoring)
   */
  getStats(): {
    totalEdges: number;
    uniqueUsers: number;
    uniqueBlocks: number;
    memoryUsageEstimate: string;
  } {
    const edgeSizeEstimate = 1024; // ~1KB per edge
    const totalMemory = this.edges.length * edgeSizeEstimate;
    const memoryMB = (totalMemory / (1024 * 1024)).toFixed(2);

    return {
      totalEdges: this.edges.length,
      uniqueUsers: this.edgesByUser.size,
      uniqueBlocks: this.edgesByBlock.size,
      memoryUsageEstimate: `${memoryMB} MB`
    };
  }

  /**
   * Clear all data (for test cleanup)
   */
  clear(): void {
    this.edges = [];
    this.edgesByUser.clear();
    this.edgesByBlock.clear();
  }
}
