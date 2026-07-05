/**
 * EventClassifier - Classifies events as financial or non-financial for SFG edge creation
 */

export class EventClassifier {
    // Non-financial events that should not create edges in SFG
    private static readonly NON_FINANCIAL_EVENTS = new Set([
        'Transfer',      // LP token transfers (non-financial for SFG)
        'Approval',      // Permission grants
        'Sync',         // State synchronization
        'AccrueInterest' // State updates
    ]);

    // Events that require special context to determine if they're financial
    private static readonly CONTEXT_DEPENDENT_EVENTS = new Set([
        'Transfer'      // Can be financial (direct transfers) or non-financial (LP tokens)
    ]);

    /**
     * Check if an event should create an edge in the SFG
     */
    static isFinancialEvent(eventName: string, context?: {
        serviceType?: string;
        semantic?: any;
    }): boolean {
        // Non-financial events never create edges
        if (this.NON_FINANCIAL_EVENTS.has(eventName)) {
            // Special case: Transfer from lending protocols might be financial
            if (eventName === 'Transfer' && context?.serviceType === 'Lending') {
                // Check if it's a cToken transfer (non-financial) or actual token transfer
                // For now, consider all Transfers from known protocols as non-financial
                return false;
            }
            return false;
        }

        // All other events from known protocols are considered financial
        return true;
    }

    /**
     * Get statistics about event types
     */
    static getEventStatistics(events: Array<{name: string, address: string}>): {
        total: number;
        financial: number;
        nonFinancial: number;
        breakdown: Map<string, number>;
    } {
        const breakdown = new Map<string, number>();
        let financial = 0;
        let nonFinancial = 0;

        for (const event of events) {
            const count = breakdown.get(event.name) || 0;
            breakdown.set(event.name, count + 1);

            if (this.isFinancialEvent(event.name)) {
                financial++;
            } else {
                nonFinancial++;
            }
        }

        return {
            total: events.length,
            financial,
            nonFinancial,
            breakdown
        };
    }

    /**
     * Calculate corrected edge creation rate
     * Only considers financial events in the denominator
     */
    static calculateCorrectedEdgeCreationRate(
        totalEvents: number,
        eventsWithEdges: number,
        nonFinancialEvents: number
    ): number {
        const expectedEdges = totalEvents - nonFinancialEvents;
        if (expectedEdges === 0) return 100; // No financial events expected
        
        return (eventsWithEdges / expectedEdges) * 100;
    }
}