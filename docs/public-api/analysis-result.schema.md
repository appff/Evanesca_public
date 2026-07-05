# Evanesca Analysis Result Schema

Status: draft schema for CLI, examples, and future frontend evidence explorer.

The frontend should consume this JSON contract rather than calling internal Evanesca modules directly.

## Top-Level Shape

```ts
type EvanescaAnalysisResult = {
  schemaVersion: "0.1";
  txHash: string;
  chain: ChainId;
  blockNumber?: number;
  timestamp?: string;
  summary: AnalysisSummary;
  graph: SemanticFinancialGraph;
  constraints: ConstraintFinding[];
  pnl?: PnLSummary;
  evidence: EvidenceStep[];
  raw?: RawEvidence;
  diagnostics?: DiagnosticMessage[];
};
```

## Summary

```ts
type AnalysisSummary = {
  status: "clean" | "flagged" | "unsupported" | "error";
  category?:
    | "baseline_arbitrage"
    | "price_manipulation"
    | "reward_manipulation"
    | "derivative_pricing"
    | "confirmed_incident"
    | "unattributed";
  title?: string;
  description?: string;
  confidence?: number;
};
```

## Graph

```ts
type SemanticFinancialGraph = {
  nodes: SFGNode[];
  edges: SFGEdge[];
};

type SFGNode = {
  id: string;
  kind: "account" | "contract" | "token" | "pool" | "market" | "protocol" | "unknown";
  label?: string;
  address?: string;
  protocol?: string;
  chain?: ChainId;
};

type SFGEdge = {
  id: string;
  source: string;
  target: string;
  action:
    | "swap"
    | "deposit"
    | "withdraw"
    | "borrow"
    | "repay"
    | "liquidate"
    | "bridge"
    | "reward"
    | "transfer"
    | "unknown";
  tokenIn?: TokenAmount;
  tokenOut?: TokenAmount;
  valueUsdIn?: number;
  valueUsdOut?: number;
  protocol?: string;
  logIndex?: number;
  raw?: unknown;
};
```

## Constraint Findings

```ts
type ConstraintFinding = {
  id: string;
  name: string;
  severity: "info" | "low" | "medium" | "high";
  edgeIds: string[];
  predicate: string;
  observedValue?: number | string;
  threshold?: number | string;
  explanation: string;
};
```

## Evidence Timeline

```ts
type EvidenceStep = {
  index: number;
  edgeId?: string;
  action: string;
  actor?: string;
  protocol?: string;
  description: string;
  tokenDeltas?: TokenAmount[];
  valueUsd?: number;
  constraintIds?: string[];
};
```

## PnL

```ts
type PnLSummary = {
  beneficiary?: string;
  netUsd?: number;
  tokenDeltas: TokenAmount[];
  assumptions?: string[];
};
```

## Shared Types

```ts
type ChainId =
  | "ethereum"
  | "bsc"
  | "arbitrum"
  | "optimism"
  | "avalanche"
  | "polygon"
  | "unknown";

type TokenAmount = {
  token: string;
  symbol?: string;
  amount: string;
  decimals?: number;
  valueUsd?: number;
};

type RawEvidence = {
  transfers?: unknown[];
  logs?: unknown[];
  traces?: unknown[];
};

type DiagnosticMessage = {
  level: "info" | "warning" | "error";
  message: string;
};
```

## Frontend Contract

The evidence explorer should support static JSON files that conform to this schema before any live backend is added.

Initial frontend features should read:
- `summary` for the overview panel;
- `graph.nodes` and `graph.edges` for SFG visualization;
- `constraints` for the constraint panel;
- `evidence` for the timeline;
- `pnl` for value-flow summary.
