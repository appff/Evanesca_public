/**
 * Shared constraint/violation types used across the codebase.
 *
 * NOTE:
 * HiddenBehaviorAnalyzer historically imported `../ConstraintSolver/types`, but the
 * type definition file was missing on disk. This file restores that module so
 * runtime imports succeed (ts-node/tsx require() resolution).
 */

export type ConstraintSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface ConstraintViolation {
  constraint: string;
  severity?: ConstraintSeverity;
  message: string;
  transaction: string; // transaction hash (0x...)
  details?: Record<string, any>;
}

