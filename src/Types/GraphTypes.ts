/**
 * Graph Types for Evanesca
 * Defines the Edge interface used across the system
 */

import { ISemanticFinancialEdge } from '../SemanticFinancialGraph/Interfaces/IEdge';

/**
 * Extended Edge interface
 * Core data structure for transaction analysis
 */
export interface Edge extends ISemanticFinancialEdge {
  // Basic transaction fields
  from: string;
  to: string;
  value?: number;
  value_usd?: number;
  Type?: string;
  Action?: string;
  token?: string;
  token_type?: string;

  // Protocol specific
  protocol?: string;
  protocol_version?: string;
  pool_id?: string;
  position_id?: string;

  // Time tracking
  block_number?: number;
  timestamp?: number;
  last_update?: number;

  // Market conditions
  price_change_1h?: number;
  price_change_24h?: number;
  volume_24h?: number;
  gas_price_gwei?: number;

  // Risk assessment
  risk_score?: number;
  risk_level?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  confidence_score?: number;
}

/**
 * Type alias for backward compatibility
 */
export type GraphEdge = Edge;

