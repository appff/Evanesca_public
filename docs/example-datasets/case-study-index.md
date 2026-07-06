# Case Study Index

Status: draft case-study index for public examples.

This page lists candidate public transactions for future example JSON exports. It is an index only; it is not a claim that every listed transaction has already been exported under the public schema.

## Confirmed-Incident Examples

| Case | Chain | Transaction hash | Intended role |
|------|-------|------------------|---------------|
| bZx Hack | Ethereum | `0xb5c8bd9430b6cc87a0e2fe110ece6bf527fa4f170a4bc8cd032f768fc5219838` | exported price-manipulation walkthrough in `bzx-analysis-result.json` |
| Harvest Attack #1 | Ethereum | `0x35f8d2f572fceaac9288e5d462117850ef2694786992a8c3f6d02612277b0877` | exported exchange-rate walkthrough in `harvest-analysis-result.json` |
| CreamFinance #2 | Ethereum | `0x0fe2542079644e107cbf13690eb9c2c65963ccb79089ff96bfaf8dced2331c92` | lending/oracle/accounting walkthrough |
| Pancake Bunny | BSC | `0x897c2de73dd55d7701e1b69ffb3a17b0f4801ced88b0c75fe1551c5fcce6a979` | BSC price-manipulation example |
| Qubit Finance | BSC | `0x50946e3e4ccb7d39f3512b7ecb75df66e6868b9af0eee8a7e4b61ef8a459518e` | bridge-accounting example |

## Defect-Family Examples

Public defect-family example selection is pending provenance review of:
- `artifacts/defect-hashes-public/reward_distribution_TEND_WING.json`
- `artifacts/defect-hashes-public/yield_bearing_CreamY_yyCRV.json`

## Export Command

Once RPC credentials are configured, export a case study with:

```bash
npm run analyze -- --tx <transaction-hash> --chain ethereum --out docs/example-datasets/<case>.json --pretty
```

Do not commit exported JSON until the output has been reviewed against `docs/public-api/analysis-result.schema.md`.
