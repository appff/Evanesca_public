# Evanesca Large-Scale Evaluation Implementation Plan (2023-2025, Ethereum)

## Goals

- Run `src/DSL/constraints/default_constraints.dsl` on the full Ethereum dataset (2023-2025).
- Discover zero-day or new suspicious trading patterns.
- Produce report artifacts to support the paper’s large-scale evaluation section.

## Constraints (Agreed)

- Full dataset (no sampling).
- Infura provider with a hard cap of **2M credits/day**.
- Storage budget: **100GB**.
- Price must be computed at **block-1** for each transaction (no stablecoin $1 shortcut).
- Price sources: **Chainlink primary**, **Uniswap V2/V3 fallback**, **Curve excluded**.
- Unknown price tokens: **skip**, but log `tx hash + token name + token address`.
- Violations: write **per-tx JSONL reports**.

## High-Level Architecture

1. **Ingestion**: Fetch blocks + receipts (full range).
2. **Decoding**: Build semantic edges from logs.
3. **Pricing**: Resolve token prices at block-1 with caching.
4. **Constraint Evaluation**: Apply `default_constraints.dsl` in streaming mode.
5. **Reporting**: Write JSONL reports for violations and skipped tokens.
6. **Metrics**: Track throughput, cache hit rates, violations per constraint, and RPC usage.

## Data Ingestion Strategy

- Use `eth_getBlockByNumber` for block metadata and tx hashes.
- Use `eth_getBlockReceipts` for batch receipts (Infura supports it).
- Fallback: `eth_getTransactionReceipt` only if block receipts fail.
- **Checkpointing**: Store last processed block per partition for restart.

## Storage Plan (Compact)

- **Primary output**: Parquet + zstd, partitioned by month.
- **Feature schema**: store only fields needed by `default_constraints.dsl` and price evaluation.
- Raw receipts are not retained long-term (optional rolling window for debug only).

### Suggested Feature Columns (Minimum)

- tx_hash, block_number, block_timestamp
- from, to, value
- log summary (event name + indexed params minimal)
- protocol metadata (if derived)
- decoded edge fields: Action, Type, Amount, token addresses
- totalInUSD, totalOutUSD (derived using block-1 price)

## Pricing Strategy (Block-1)

- **Primary**: Chainlink price feed via `eth_call` at block-1.
- **Fallback**: Uniswap V2/V3 pool price (reserve ratio/tick) at block-1.
- **Caching**: `price(token, block)` cache in RocksDB/SQLite.
- **Unknown price**: skip evaluation for that edge/tx, log to skip log.

### Unknown Price Skip Log (JSONL)

Each line:

```
{"tx_hash":"0x...","token_name":"...","token_address":"0x...","block_number":12345678}
```

If this grows excessively, it signals a systemic price resolution issue.

## Pricing/Cache/Skip Log Implementation Details

### Price Resolver Flow

1. Resolve token metadata (symbol, decimals) from local cache; fetch on demand if missing.
2. Try Chainlink feed lookup for the token address; if present, query `latestRoundData` at block-1.
3. If Chainlink is unavailable or returns invalid data, compute price from Uniswap:
   - V2: read reserves at block-1 and compute spot price vs a stable/ETH reference.
   - V3: read slot0/tick at block-1 and compute price using the pool's tick math.
4. Convert to USD using a WETH/USD or stable/USD anchor at the same block-1.
5. Cache the final `price(token, block)` result with TTL = infinity (block-specific).

### Cache Design

- **Token metadata cache**: `token_meta(address)` stored in SQLite/RocksDB.
- **Price cache**: `token_price(address, block)` stored in SQLite/RocksDB.
- **Pool cache** (Uniswap): `pool_for_pair(tokenA, tokenB, fee)` to avoid repeated discovery.
- Cache entries are immutable for historical blocks; eviction is unnecessary.

### Unknown Price Handling

- If neither Chainlink nor Uniswap pricing succeeds:
  - Skip evaluation for the affected edge/tx.
  - Write a JSONL record to the skip log with tx + token identity.
  - Count skip rates per day to detect systemic errors early.

### Pricing Accuracy Guardrails

- Reject prices with missing decimals, zero reserves, or negative/zero Chainlink answers.
- Log any price jumps >100x between adjacent blocks for manual audit.

## Evaluation Engine (Large-Scale Runner)

- New runner should stream partitions using `TransactionAnalyzer.analyzeStream()`.
- Use bounded memory and controlled concurrency to stay within Infura limits.
- Configure `BatchProcessor` batch size and concurrency per RPC budget.

## Reporting Plan

- **Violation report (JSONL)** per tx:

```
{
  "tx_hash": "0x...",
  "block_number": 12345678,
  "constraint_id": "C_...",
  "evidence": {...},
  "profit_loss": {"in_usd": 0, "out_usd": 0, "ratio": 0},
  "protocol": "..."
}
```

- Write reports as append-only JSONL for reliability.

## Metrics to Track

- Throughput: tx/sec, blocks/sec
- RPC usage per day (credits estimate)
- Cache hit rates (prices, receipts)
- Violation counts per constraint
- Violations over time (monthly trend)

## Implementation Tasks (Phased)

1. **Ingestion + Checkpoint**
   - Build block range crawler using block receipts.
   - Add checkpoint storage and retry.
2. **Price Resolver**
   - Chainlink primary + Uniswap fallback.
   - Cache layer for `price(token, block)`.
   - Skip logging for unknown price tokens.
3. **Large-Scale Runner**
   - Stream evaluation over parquet partitions.
   - Enforce concurrency + memory limits.
4. **Reporting & Metrics**
   - JSONL reports for violations + skip log.
   - Export summary metrics for paper.

## Progress Update (Current)

- **Price Resolver**: Implemented block-1 pricing (`EVANESCA_USE_PREV_BLOCK_PRICE=true`) with Chainlink primary and Uniswap V2 fallback. Unknown prices now skip evaluation and emit `price-skip.jsonl` logs when `EVANESCA_SKIP_UNKNOWN_PRICE=true`.
- **Large-Scale Runner**: Added `runLargeScaleEvaluation.ts` wired to `large-scale-constraint.dsl` with JSONL violation output.
- **Ingestion (UPDATED 2025-01)**: Completely rewritten `runLargeScaleIngest.ts`:
  - **Semantic Event Filtering**: Only stores txs with events decodable by our 66 protocol ABIs (134 unique topics)
  - **Storage Reduction**: ~46% fewer transactions stored (54% filtering rate on mainnet)
  - **Infura Rate Limiting**: 10M credits/day, adaptive RPS with token bucket algorithm
  - **Checkpoint-based Resume**: Safe interruption and resumption for multi-day ingests
  - **Parallel Processing**: Configurable concurrency (default 10 blocks/batch)
  - **Monthly Partitioning**: JSONL output partitioned by month for efficient querying
- **Artifacts**:
  - Violation reports: `large-scale-results/violations.jsonl`
  - Price skip log: `large-scale-results/price-skip.jsonl`
  - **Filtered receipts**: `large-scale-ingest/receipts-YYYY-MM.jsonl` (NEW - txHash + minimal receipt data)
  - Checkpoint: `large-scale-ingest/checkpoint.json`
  - New DSL: `src/DSL/constraints/large-scale-constraint.dsl`

## Semantic Event Filtering (NEW)

The ingestion now uses `SemanticEventFilter` to pre-filter transactions:

- Extracts all event topic hashes from loaded ABIs (66 services, 134 unique topics)
- Only stores transactions containing at least one decodable event
- Reduces storage by ~46% while preserving all analyzable transactions
- Filter runs in O(1) per log via Set lookup

### FilteredReceipt Schema (JSONL)

```json
{
  "txHash": "0x...",
  "blockNumber": 20000000,
  "timestamp": 1718000000,
  "from": "0x...",
  "to": "0x...",
  "gasUsed": "0x...",
  "status": true,
  "logsCount": 5
}
```

## Deliverables for Paper

- Dataset description (2023-2025 full chain).
- Large-scale constraint evaluation stats.
- Suspicious pattern summary (top constraints, protocols).
- Performance + resource usage (throughput, storage, RPC calls).
- Examples of newly discovered patterns (case studies).
