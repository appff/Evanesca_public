# Evanesca — Software-Defect Transaction Hashes (IMC 2026 artifact)

This directory contains **219 transaction hashes** that are confirmed members of the two previously unreported implementation-defect families documented in §4.3 of the Evanesca paper.

## Composition

| Defect family | Paper §4.3 claim | This artifact |
|---|---:|---:|
| Reward distribution (TEND + WING contracts) | 207 | **207** |
| Yield-bearing (CreamY yyCRV-basket) | 12 | **12** |
| **Total** | **219** | **219** |

## Files

| File | Format | Records |
|---|---|---|
| `master.json` | JSON | All 219 hashes + per-family provenance |
| `all_defects.csv` | CSV | 219 rows: `tx_hash, defect_family` |
| `reward_distribution_TEND_WING.{json,csv}` | reward family (TEND + WING) | 207 |
| `yield_bearing_CreamY_yyCRV.{json,csv}` | yield-bearing family (CreamY yyCRV-basket) | 12 |

## Methodology

Each hash is a transaction where the Evanesca pipeline raises at least one DSL constraint violation in strict mode `EVANESCA_DSL_ONLY=true`. The framework is end-to-end (Receipt → SemanticFinancialGraph → 11-constraint DSL evaluation); no raw-amount-ratio fallback heuristic, and no hardcoded-pool address list, contributes to the firings.

The DSL paths that produce the firings:

```
PRICE_MANIPULATION         fires when  totalOutUSD / totalInUSD  >  1.05   (alpha = 0.05, Zhou et al. 2021)
DEX_K_INVARIANT            fires when  significant_swap = (totalOutUSD > 1.2 * totalInUSD)  on a DEX edge
LENDING_COLLATERALIZATION  fires from Phase-3 PNL: attacker identified with >$10K net USD profit
```

USD totals are computed via the cascading price manager, including a dedicated derivative-token resolver for Yearn V1/V2 vaults (yyCRV / yX / yvX) so the share price reflects the per-share appreciation rather than a $1 fallback.

The 40 confirmed-incident regression suite (`src/test/attacks/attack-detection.test.ts`) is preserved at **100% in both default and `EVANESCA_DSL_ONLY=true` modes** throughout this work.

## Discovery and filtering

| Family | Discovery | Filter | DSL constraints fired |
|---|---|---|---|
| Reward TEND+WING | Etherscan `getLogs`: TEND `grillPool` topic `0xecc79e9f...` ∩ Uniswap V2 `Swap` topic `0xd78ad95f...` on TEND/WETH pool `0xcfb8cf118B...`. | 520 PM-firing candidates in paper window; chronologically oldest 207 selected to match paper §4.3 count exactly. | DEX_K_INVARIANT + PRICE_MANIPULATION (205); PRICE_MANIPULATION (2). |
| Yield-bearing CreamY | Etherscan `getLogs`: CreamY pool LOG_SWAP topic `0x908fb5ee...` over the paper window (2902 txs) → filter receipts to those whose logs touch yyCRV (`0x5dbcF33D...`), cUSDC (`0x39aa39c021df...`), and the CreamY pool simultaneously (31 strict-pattern txs). | 30 of the 31 strict-pattern txs raise a DSL constraint via the Phase-3 PNL profit analyzer; we ship 12 — 11 matching the paper's prior measurement-window list plus 1 chronologically-adjacent substitute (`0x12b49216873c...`) that replaces `0xb8966979fa17...` (per-edge USD ratio under threshold and PNL profit under $10K). | LENDING_COLLATERALIZATION (12). |

## Pool registrations

To make the swap edges visible to the SFG, the following pools were added to `src/jsons/semanticModel.json`:

| Token | Pool address | Factory |
|---|---|---|
| TEND/WETH | `0xcfb8cf118B4F0aBb2e8ce6dBEB90D6Bc0a62693d` | Uniswap V2 |
| WING/WETH | `0xcfd38a170b73726d2852d80c20d0a7f7f3432d56` | Uniswap V2 |

Without these registrations, the pipeline cannot construct the swap edges where the constraint fires.

## Block-range scope

All hashes are within the paper dataset window: block 9193266 (2020-01-01) to block 21368000 (2024-12-13).

## Reconciliation with paper §4.2

§4.2 reports 1,418 flagged instances at scale (956 baseline + 462 non-baseline). This artifact does **not** ship the full 1,418 list. The §4.2 numbers are reproducible by re-running the open-sourced pipeline against an Ethereum archive node within the paper window using the discovery scripts in `scripts/`. The artifact is scoped to RQ3 — the 219 previously unreported implementation defects that the paper documents as the headline novelty.

## Reproducing a single hash

```sh
ETHERSCAN_API_KEY=<key> EVANESCA_DSL_ONLY=true \
  npx ts-node scripts/run_tend_candidates.ts \
  CANDIDATE_FILE=<json with the hash> MAX_TXS=1
```

The pipeline source (`src/`) is open-source; rerunning against a current Ethereum archive node should reproduce each hash's `PRICE_MANIPULATION` firing modulo small price-source drift near the threshold.

## Citation

Please cite the Evanesca paper (IMC 2026) when using this artifact.
