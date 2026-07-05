/**
 * SemanticEventFilter - Extract and cache supported event topic hashes from Semantic Model
 *
 * This module provides efficient filtering of transactions based on whether they contain
 * events that our semantic model can decode. Used by large-scale ingest to avoid storing
 * irrelevant transactions.
 */

import { keccak256, toUtf8Bytes } from "ethers";
import { ABIs, getLoadedServices } from "../ABIDecoder/defaultABIs";

interface EventSignatureInfo {
  signature: string; // e.g., "Swap(address,uint256,uint256,uint256,uint256,address)"
  topicHash: string; // keccak256 of signature
  eventName: string; // e.g., "Swap"
  service: string; // e.g., "Uniswap"
}

/**
 * Singleton class for semantic event filtering
 */
export class SemanticEventFilter {
  private static instance: SemanticEventFilter;
  private topicHashSet: Set<string> = new Set();
  private eventInfoMap: Map<string, EventSignatureInfo> = new Map();
  private initialized: boolean = false;

  private constructor() {}

  public static getInstance(): SemanticEventFilter {
    if (!SemanticEventFilter.instance) {
      SemanticEventFilter.instance = new SemanticEventFilter();
    }
    return SemanticEventFilter.instance;
  }

  /**
   * Initialize the filter by extracting all event signatures from loaded ABIs
   */
  public initialize(): void {
    if (this.initialized) return;

    const services = getLoadedServices();
    let totalEvents = 0;

    for (const service of services) {
      const abi = ABIs[service];
      if (!abi || !Array.isArray(abi)) continue;

      for (const item of abi) {
        if (item.type !== "event") continue;

        try {
          // Build event signature: EventName(type1,type2,...)
          const inputs = item.inputs || [];
          const paramTypes = inputs
            .map((input: any) => {
              // Handle indexed tuple types
              if (input.type === "tuple" || input.type === "tuple[]") {
                return this.formatTupleType(input);
              }
              return input.type;
            })
            .join(",");

          const signature = `${item.name}(${paramTypes})`;
          const topicHash = keccak256(toUtf8Bytes(signature)).toLowerCase();

          const info: EventSignatureInfo = {
            signature,
            topicHash,
            eventName: item.name,
            service,
          };

          this.topicHashSet.add(topicHash);

          // Store first occurrence of each topic hash
          if (!this.eventInfoMap.has(topicHash)) {
            this.eventInfoMap.set(topicHash, info);
          }

          totalEvents++;
        } catch (e) {
          // Skip malformed events
          console.warn(
            `Failed to process event ${item.name} from ${service}:`,
            e,
          );
        }
      }
    }

    this.initialized = true;
    console.log(
      `✅ SemanticEventFilter initialized: ${this.topicHashSet.size} unique event topics from ${services.length} services (${totalEvents} total events)`,
    );
  }

  /**
   * Format tuple type for signature generation
   */
  private formatTupleType(input: any): string {
    if (!input.components) return input.type;

    const componentTypes = input.components
      .map((c: any) => {
        if (c.type === "tuple" || c.type === "tuple[]") {
          return this.formatTupleType(c);
        }
        return c.type;
      })
      .join(",");

    if (input.type === "tuple[]") {
      return `(${componentTypes})[]`;
    }
    return `(${componentTypes})`;
  }

  /**
   * Check if a receipt contains at least one event we can decode
   */
  public hasDecodableEvents(receipt: {
    logs: Array<{ topics: string[] }>;
  }): boolean {
    if (!this.initialized) {
      this.initialize();
    }

    if (!receipt.logs || receipt.logs.length === 0) {
      return false;
    }

    for (const log of receipt.logs) {
      if (log.topics && log.topics.length > 0) {
        const topic0 = log.topics[0].toLowerCase();
        if (this.topicHashSet.has(topic0)) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Get event info for a topic hash
   */
  public getEventInfo(topicHash: string): EventSignatureInfo | undefined {
    return this.eventInfoMap.get(topicHash.toLowerCase());
  }

  /**
   * Get all supported topic hashes
   */
  public getSupportedTopicHashes(): string[] {
    if (!this.initialized) {
      this.initialize();
    }
    return Array.from(this.topicHashSet);
  }

  /**
   * Get statistics about loaded events
   */
  public getStats(): { uniqueTopics: number; services: number } {
    if (!this.initialized) {
      this.initialize();
    }
    return {
      uniqueTopics: this.topicHashSet.size,
      services: getLoadedServices().length,
    };
  }

  /**
   * Filter an array of receipts to only those with decodable events
   */
  public filterReceipts<T extends { logs: Array<{ topics: string[] }> }>(
    receipts: T[],
  ): T[] {
    return receipts.filter((r) => this.hasDecodableEvents(r));
  }
}

// Export singleton getter for convenience
export function getSemanticEventFilter(): SemanticEventFilter {
  return SemanticEventFilter.getInstance();
}
