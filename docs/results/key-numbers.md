# Evanesca Key Numbers

Status: public-release draft. These numbers summarize the paper-era research
snapshot and must not be treated as live benchmark results until the matching
artifact manifests and reproduction commands are finalized.

## Dataset

| Scalar | Value | Public-release status |
|--------|-------|-----------------------|
| Total Ethereum transactions analyzed | 14,187,803 | needs public artifact manifest |
| Confirmed incidents | 40 | inclusion/exclusion criteria drafted in the technical report |
| Chains covered | 5: Ethereum 23, BSC 10, Arbitrum 5, Optimism 1, Avalanche 1 | needs benchmark manifest |
| Time span | 2020-2024 | needs dataset manifest |

## Flagged Instances

| Scalar | Value | Public interpretation |
|--------|-------|----------------------|
| Total flagged instances | 1,418 | constraint-backed candidate events |
| Baseline arbitrage | 956 | routine arbitrage baseline, not harmful by default |
| Non-baseline instances | 462 | requires category-level review |

## Non-Baseline Breakdown

| Category | Count | Public interpretation |
|----------|-------|----------------------|
| Reward-distribution manipulation | 207 | candidate implementation-defect family |
| Price manipulation | 166 | known attack class / manipulation category |
| Yield-bearing token deviation | 12 | candidate derivative-pricing family |
| Other non-baseline | 77 | unresolved long-tail candidates |

## Implementation-Defect Snapshot

| Family | Count |
|--------|------:|
| Reward-distribution manipulation | 207 |
| Derivative pricing / yield-bearing token deviation | 12 |
| Total implementation-defect instances | 219 |

## Constraint Set

The current paper-era scalar set uses nine constraints:

- `PRICE_MANIPULATION`
- `DEX_K_INVARIANT`
- `LENDING_COLLATERALIZATION`
- `EXCHANGE_RATE_MANIPULATION`
- `ORACLE_MANIPULATION`
- `BRIDGE_INTEGRITY_VIOLATION`
- `FLASH_LOAN_ATTACK`
- `CONCENTRATED_LIQUIDITY_ATTACK`
- `EMPTY_MARKET_ATTACK`

## Threshold Parameters

| Parameter | Value | Role |
|-----------|-------|------|
| `alpha` | 0.05 | DEX swap anomaly threshold |
| `beta` | 0.02 | lending/oracle-mediated stablecoin-derivative threshold |

These thresholds are measurement parameters. Public claims about precision,
recall, false positives, or false negatives require sensitivity analysis and a
public labeling protocol.

## Public Claim Rule

Use these numbers only with scope qualifiers:

- they describe a specific research snapshot;
- routine arbitrage is a baseline class, not an exploit class;
- implementation-defect claims require case-level evidence;
- public reproduction requires a manifest with source data, commands, expected
  output, limitations, and environment requirements.
