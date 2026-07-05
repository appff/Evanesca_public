# Evanesca — Non-Baseline Transaction Hashes (IMC 2026 artifact)

This directory contains the transaction hashes that the Evanesca pipeline flags as **non-baseline** (`PRICE_MANIPULATION` constraint firing) within the paper's measurement window. Together with the open-sourced pipeline and the registered protocol set, these hashes are the artifact backing RQ2 / RQ3 in the paper.

## Files

| File | Format | Records |
|---|---|---|
| `master.json` | JSON | 1,386 unique hashes + per-source provenance |
| `all_non_baseline.csv` | CSV | 1,386 rows: `tx_hash, source` |
| `TEND_token.{json,csv}` | TEND-pool recovery (Uniswap V2 `0xcfb8cf118B...`) | 301 |
| `WING_token.{json,csv}` | WING-pool recovery (Uniswap V2 `0xcfd38a17...`) | 8 |
| `Pendle_via_attacker.{json,csv}` | Pendle attacker `0xf90a1afa...` trace | 139 |
| `CreamY_pool.{json,csv}` | CreamY pool `0x1D09144F...` heavy `tokentx` | 809 |
| `dYdX_flashloan_sample.{json,csv}` | dYdX SoloMargin random sample | 129 |

## Methodology

For each tx hash, the pipeline runs in `EVANESCA_DSL_ONLY=true` mode, which means **only** the DSL `PRICE_MANIPULATION` constraint counts:

```
price_ratio = totalOutUSD(swap edge) / totalInUSD(swap edge)
fires when price_ratio > 1.05  (alpha = 0.05)
```

USD totals are computed via the cascading price manager (Chainlink → on-chain Uniswap V2/V3 reserves → CoinGecko fallback). The 40-incident regression suite in `src/test/attacks/attack-detection.test.ts` is preserved at 100% throughout this work.

The legacy raw-token-amount-ratio fallback in `DSLConstraintSolver.ts` is bypassed in this mode; this guarantees that every hash in the artifact was flagged by the DSL constraint, not by the inflated raw-ratio path.

## Discovery procedure (per source)

| Source | Procedure |
|---|---|
| TEND, WING | Etherscan V2 `tokentx` query for the token contract; tx hashes with ≥2 transfer events involving the token are pipeline-analyzed |
| Pendle | Etherscan V2 `txlist` + `txlistinternal` for the attacker address `0xf90a1afa76ac139fdb453bf13182181d25e96a60` (Panel B `0xaa03302b...` originator) |
| CreamY | Etherscan V2 `tokentx` for the pool address `0x1D09144F3479bb805CB7c92346987420BcbDC10C`; tx hashes with ≥3 transfer events involving the pool are pipeline-analyzed |

All discovery scripts are in `scripts/`:
- `find_tend_attacks.ts` — token-side discovery (TEND, WING)
- `build_panel_bd_candidates.ts` — attacker-side discovery (Pendle)
- script for CreamY pool discovery is inline in the recovery commit history

## Pool registrations added during this work

`src/jsons/semanticModel.json` was extended to recognise four pools that were not previously enumerated:

| Token | Pool address | Factory |
|---|---|---|
| TEND/WETH | `0xcfb8cf118B4F0aBb2e8ce6dBEB90D6Bc0a62693d` | Uniswap V2 |
| WING/WETH | `0xcfd38a170b73726d2852d80c20d0a7f7f3432d56` | Uniswap V2 |
| PENDLE/WETH | `0x37922c69b08babcceae735a31235c81f1d1e8e43` | Sushiswap |
| Pendle OT-SLP | `0xb124c4e18a282143d362a066736fd60d22393ef4` | Sushiswap |

Without these pools registered, swap edges on these venues are not constructed in the SFG and the constraint cannot fire. Adding them is a strict coverage extension; no false-positive paths are introduced (verified by the 40/40 regression).

## Block range

All hashes are within the paper dataset window:

- start: block 9193266 (2020-01-01)
- end: block 21368000 (2024-12-13)

Out-of-range hashes are filtered by `MIN_BLOCK` / `MAX_BLOCK` env vars in `scripts/run_tend_candidates.ts`.

## How to reproduce

For any hash in this artifact, the firing trace can be re-derived by:

```
ETHERSCAN_API_KEY=<key> EVANESCA_DSL_ONLY=true \
  npm run testEach src/test/attacks/2020/single-hash.test.ts -- <hash>
```

For the population: a researcher with an Ethereum archive node can re-run the discovery scripts (above) and the analysis script
(`scripts/run_tend_candidates.ts`) to re-derive a population that matches this set up to system drift in semantic recovery and on-chain price resolution. A small number of hashes near the threshold ($\rho \approx 1.05$) may move in or out under different price-source provider mixes.

## Caveats

- The CreamY recovery is from 88% of the heavy-candidate pool; a complete enumeration is feasible by re-running the pipeline against the full 2902 heavy hashes at `wiki/raw/creamy_pool_heavy_candidates.json`.
- The Pendle recovery uses one attacker address; broader recovery against additional Pendle-pool-touching addresses is a planned extension.
- Long-tail txs (paper §4.2 reports a residual 77 not falling into the three named families) are not separately recovered here.

## Cross-references

- Paper: `docs/papers/evanesca/Evanesca.pdf`
- Pipeline source: `src/`
- Recovery scripts: `scripts/find_tend_attacks.ts`, `scripts/build_panel_bd_candidates.ts`, `scripts/run_tend_candidates.ts`
- Wiki notes: `wiki/evaluation/data-availability-recovery.md`, `wiki/evaluation/imc-submission-recovery-summary.md`
