# Evanesca Technical Report

Status: public-release draft.

## Abstract

Evanesca is an open-source framework for reconstructing decentralized-finance
(DeFi) transactions as Semantic Financial Graphs (SFGs) and auditing them with
transparent financial constraints. The goal is forensic reconstruction,
measurement, and analyst-facing evidence exploration, not real-time exploit
detection or automatic attribution of malicious intent.

The framework converts heterogeneous protocol traces into typed financial
actions, builds replayable graph evidence, evaluates service-class constraints,
and exports candidate findings in a public JSON format. This report describes
the project scope, terminology, threat model, graph abstraction, constraint
model, current evaluation status, and release requirements for the open-source
version of Evanesca.

## 1. Overview

DeFi incidents often look different at the event-log layer while sharing the
same financial structure. A swap manipulation on one automated market maker
(AMM), a vault exchange-rate error, and a reward-allocation bias may all involve
different contracts and event schemas. However, each can be inspected as a
sequence of financial actions, value flows, pricing dependencies, and accounting
relations.

Evanesca exposes those relations through a four-stage pipeline:

| Stage | Purpose | Public artifact |
|-------|---------|-----------------|
| Semantic recovery | Convert traces, logs, and protocol context into typed financial actions. | adapters and action objects |
| SFG construction | Assemble actions into a transaction-local graph with values and ordering. | SFG nodes and edges |
| Constraint evaluation | Evaluate service-class financial checks over SFG edges and paths. | constraint findings |
| Evidence export | Emit replayable graph, timeline, and PnL evidence for review. | analysis-result JSON |

The public release should be read as a framework for reconstructing and
characterizing value-extraction playbooks. A constraint match is a candidate
event, not a final exploit label. Human review, incident context, and
reproducible evidence remain part of the workflow.

## 2. Motivation

Most DeFi security systems start from a deployment-specific question: did this
contract emit a suspicious event, did a known attack template occur, or did a
monitoring rule fire? That approach is useful operationally, but it makes it
hard to compare behavior across protocols and hard to explain why a finding
matters beyond a rule name.

Evanesca starts from a measurement question instead: what financial actions
occurred, which economic assumptions were stressed, and how did value move?
This framing matters because DeFi value extraction spans several categories:

| Category | Interpretation in Evanesca |
|----------|----------------------------|
| Routine arbitrage | Value-extractive but expected market activity; used as a baseline. |
| Known attack class | Matches a previously documented incident family, such as price manipulation. |
| Implementation defect | Exposes a protocol-local accounting, reward, or pricing error. |
| Unattributed anomaly | Constraint-backed candidate that requires additional analysis. |

The distinction is central to the open-source release. Evanesca should not call
all abnormal transactions attacks. It should instead preserve the evidence
needed to decide whether the event is benign arbitrage, harmful extraction, or
unresolved behavior.

## 3. Threat Model and Terminology

### 3.1 Actors

Evanesca models transactions created by ordinary protocol users, arbitrageurs,
MEV searchers, liquidators, flash-loan users, and attackers composing multiple
protocols. The framework does not assume that the transaction sender is
malicious. It also does not require private mempool access, block-builder
control, or sandwich capability as core assumptions.

An adversarial transaction may:

- compose multiple DeFi services atomically;
- borrow temporary capital through flash loans;
- manipulate a pool, oracle, reward distribution, lending market, bridge, or
  derivative price within one transaction or short sequence;
- route value through multiple externally owned accounts or contracts;
- return most intermediate state to normal while retaining extracted value.

### 3.2 Loss Subjects

The affected party depends on the service class. Evanesca distinguishes:

- protocol reserves;
- liquidity providers;
- lending depositors;
- reward-pool participants;
- derivative-token holders;
- bridge users or backing reserves;
- traders who receive worse execution;
- no direct victim in routine market-efficiency arbitrage.

This distinction prevents the framework from treating every profitable trade as
harmful.

### 3.3 Candidate Event

A candidate event is a transaction or transaction-local evidence trace that
satisfies at least one Evanesca constraint. A candidate event is not
automatically an exploit, vulnerability, or malicious action.

### 3.4 Benign Arbitrage

Benign arbitrage is value extraction that resolves price differences without
violating a protocol-local accounting, collateral, oracle, reward, bridge, or
derivative-pricing assumption. Evanesca treats this as a baseline and calibration
class. It is useful because a framework that cannot reconstruct routine
arbitrage is unlikely to reconstruct more complex value movement correctly.

### 3.5 Harmful Extraction

Harmful extraction is abnormal value transfer caused by exploiting or violating
a protocol-local economic rule. Examples include:

- accounting relations that allow excess withdrawal;
- collateral relations that allow undercollateralized borrowing;
- oracle assumptions that can be distorted at execution time;
- reward allocation rules that can be biased through temporary balances;
- derivative pricing relations that diverge from underlying assets;
- bridge backing or mint/redeem relations that fail to conserve value.

### 3.6 Confirmed Incident

A confirmed incident is a publicly documented event with replayable on-chain
transaction evidence and an external incident narrative. For public benchmark
use, the inclusion criteria should be:

- public writeup or postmortem exists;
- transaction hash is available;
- trace, logs, and relevant contract context can be obtained;
- the economic effect is attributable to on-chain behavior;
- the chain is supported by the current collector.

Events should be excluded when the primary cause is off-chain compromise,
non-EVM infrastructure, missing traces, unavailable transaction hashes, or
behavior outside Evanesca's current service model.

## 4. Semantic Financial Graph

An SFG is a directed graph whose edges are typed financial actions rather than
raw token-transfer edges alone.

```text
G = (V, E)
```

Vertices represent entities such as accounts, contracts, pools, markets,
protocol services, and tokens. Edges represent actions such as swap, deposit,
withdraw, borrow, repay, liquidate, bridge, reward, and transfer. Each edge may
carry input and output token amounts, USD-normalized values, protocol context,
ordering information, and raw evidence pointers.

### 4.1 Why Not Raw Transfers Only

Raw transfers are often insufficient. A protocol can update shares, debt,
collateral, rewards, or derivative exchange rates without producing a simple
token-transfer pattern that explains the financial meaning. Evanesca therefore
recovers higher-level actions before building the graph.

### 4.2 Difference From Cash-Flow Trees

Cash-flow trees capture value movement, but many DeFi incidents depend on more
than direct asset flow. Evanesca's SFG is intended to also preserve:

- pricing dependency between an observed action and a manipulated market;
- collateral and debt relations;
- reward entitlement and allocation;
- derivative exchange-rate relations;
- bridge backing or mint/redeem relations;
- action ordering and per-step evidence;
- PnL attribution assumptions.

The novelty claim for the open-source project should be conservative: Evanesca
does not claim that graph modeling itself is new. The contribution is the
combination of a reusable financial semantics layer, SFG evidence export, and a
constraint methodology for measuring value-extraction candidates across
protocols.

### 4.3 Adapter Boundary

Protocol-specific code belongs in semantic recovery adapters. Constraints should
operate over recovered financial actions and service-class relations. This
boundary is important for generality: extending Evanesca to a new protocol
should require an adapter or service-class mapping, not a bespoke exploit
signature for every incident.

## 5. Constraint Evaluation

Evanesca constraints are service-class financial checks over SFG edges and
paths. They are not exploit signatures. A constraint encodes a financial
assumption that should normally hold for a service class, such as price
consistency, collateral sufficiency, exchange-rate stability, reward-allocation
fairness, or bridge backing.

Each public constraint should document:

- the action types it consumes;
- the service-class assumption it encodes;
- the observed value it computes;
- the threshold or predicate it evaluates;
- examples of true positives, benign baseline matches, and known limitations.

The current paper-era constraint set contains nine constraints:

| Constraint family | Service-class signal | Public-report status |
|-------------------|----------------------|----------------------|
| `PRICE_MANIPULATION` | abnormal swap value ratio | needs implementation-synced predicate |
| `DEX_K_INVARIANT` | AMM reserve invariant deviation | needs implementation-synced predicate |
| `LENDING_COLLATERALIZATION` | lending/collateral accounting anomaly | needs implementation-synced predicate |
| `EXCHANGE_RATE_MANIPULATION` | vault or derivative exchange-rate anomaly | needs implementation-synced predicate |
| `ORACLE_MANIPULATION` | oracle-mediated price/accounting inconsistency | needs implementation-synced predicate |
| `BRIDGE_INTEGRITY_VIOLATION` | bridge backing or mint/redeem inconsistency | needs implementation-synced predicate |
| `FLASH_LOAN_ATTACK` | atomic temporary-capital pattern | needs implementation-synced predicate |
| `CONCENTRATED_LIQUIDITY_ATTACK` | concentrated-liquidity price/tick manipulation | needs implementation-synced predicate |
| `EMPTY_MARKET_ATTACK` | low-liquidity lending-market share-price anomaly | needs implementation-synced predicate |

### 5.1 Value-Ratio Checks

For an edge `e` with nonzero USD input value, Evanesca commonly computes:

```text
rho(e) = valueUSD(out(e)) / valueUSD(in(e))
```

A deviation from one can indicate abnormal value movement. The paper-era
thresholds are:

- `alpha = 0.05` for DEX swap edges;
- `beta = 0.02` for lending and oracle-mediated stablecoin-derivative edges.

These should be presented as measurement parameters, not universal constants.
The public report should include sensitivity analysis before making strong
claims about false positives or false negatives. The current rationale is that
the DEX threshold is set above externally measured routine DEX slippage, while
the stablecoin-derivative threshold is tighter because those assets should have
a lower normal movement range.

### 5.2 Candidate Classification

Constraint findings should be classified after review:

| Label | Meaning |
|-------|---------|
| `baseline_arbitrage` | routine arbitrage or market-alignment behavior |
| `price_manipulation` | known or suspected price/oracle manipulation |
| `reward_manipulation` | reward allocation or distribution bias |
| `derivative_pricing` | exchange-rate or derivative pricing defect |
| `confirmed_incident` | externally documented incident reproduced by Evanesca |
| `unattributed` | unresolved candidate |

This separation is necessary because the same low-level signal can appear in
both benign and harmful contexts.

## 6. Evidence Trace and PnL Reconstruction

For each candidate event, Evanesca should expose the evidence trace used to
reach the finding. A trace should include:

- ordered financial actions;
- source and destination entities;
- token amounts and decimals;
- USD-normalized values and price-source assumptions;
- constraints fired and observed values;
- graph edge IDs;
- beneficiary or actor when recoverable;
- diagnostics and unsupported portions of the trace.

PnL reconstruction is an aid for explanation and triage. It should not be
reported without assumptions. Public artifacts should identify the price source,
block height, missing assets, unsupported transfers, and whether the value is
gross flow or net beneficiary gain.

The public JSON contract is documented in
`docs/public-api/analysis-result.schema.md`. The initial frontend should consume
that exported JSON rather than importing internal TypeScript modules.

## 7. Case Studies

The public release should include curated case studies only after their
transaction outputs are regenerated and checked against the public schema.

Planned case-study set:

| Case study | Purpose |
|------------|---------|
| Routine arbitrage baseline | show a profitable but non-harmful candidate |
| bZx-style price manipulation | exported public-schema example in `docs/example-datasets/bzx-analysis-result.json` |
| Harvest-style exchange-rate manipulation | show vault or pool exchange-rate distortion |
| TEND/WING reward distribution | show reward-allocation bias |
| CreamY derivative pricing | show derivative exchange-rate defect |

Current exported case-study artifact:

| Case | Chain | Transaction | Export |
|------|-------|-------------|--------|
| bZx Hack | Ethereum | `0xb5c8bd9430b6cc87a0e2fe110ece6bf527fa4f170a4bc8cd032f768fc5219838` | `docs/example-datasets/bzx-analysis-result.json` |

Each case study should include:

- transaction hash;
- reproduction command;
- graph overview;
- action timeline;
- constraints fired;
- classification rationale;
- limitations and unsupported steps.

Candidate public transaction hashes are tracked in
`docs/example-datasets/case-study-index.md`.

## 8. Evaluation Summary

This section records paper-era evaluation numbers that must be reconciled with
public artifacts before a release tag. The current public source of truth is
`docs/results/key-numbers.md`.

| Result | Value | Public-release status |
|--------|-------|-----------------------|
| Ethereum transactions analyzed | 14,187,803 | needs public artifact manifest |
| Confirmed incidents | 40 across five chains | inclusion/exclusion criteria drafted |
| Total flagged instances | 1,418 | needs reproduction manifest |
| Routine arbitrage baseline | 956 | should be separated from harmful findings |
| Non-baseline instances | 462 | needs classification notes |
| Reward-distribution manipulation | 207 | candidate new class; needs case study |
| Price manipulation | 166 | compare with prior systems where possible |
| Yield-bearing token deviation | 12 | candidate derivative-pricing class |
| Other non-baseline | 77 | unresolved/unattributed |
| Constraint count | 9 | should match implementation and docs |

The main public interpretation should be:

- Evanesca reconstructs confirmed incidents in the curated benchmark.
- Evanesca surfaces a broader set of candidate value-extraction events.
- Routine arbitrage must be reported as a baseline, not as false evidence of
  harmful behavior.
- Implementation-defect claims require case-level evidence and reproducible
  exported artifacts.

The release should not claim production-grade precision or recall until a
manual-labeling protocol, false-positive analysis, false-negative search, and
threshold sensitivity analysis are available.

## 9. Reproducibility Plan

The open-source release should make each public result reproducible from:

- code revision;
- configuration;
- dependency lockfile;
- environment variables and RPC requirements;
- input transaction hashes or dataset manifest;
- command line;
- expected output path;
- known limitations.

Current public commands:

```bash
npm install
npm run analyze -- --tx <transaction-hash> --chain ethereum --out out/analysis.json --pretty
npm run validate:public-artifacts
```

Current status:

- `npm install` completes.
- `npm run analyze -- --help` completes.
- `npm run validate:public-artifacts` completes.
- bZx case-study export completes with `npm run analyze -- --tx 0xb5c8bd9430b6cc87a0e2fe110ece6bf527fa4f170a4bc8cd032f768fc5219838 --chain ethereum --out docs/example-datasets/bzx-analysis-result.json --pretty`.
- `npm run build` currently fails on repository-wide TypeScript issues that
  predate this release-preparation branch.
- `sample-analysis-result.json` is synthetic and should not be cited as an empirical result.

## 10. Open-Source Release Scope

The initial release should include:

- source code with a documented CLI entry point;
- this technical report;
- public README, contributing, security, citation, and license files;
- public analysis-result schema;
- synthetic schema example;
- curated replayed transaction examples after verification;
- reproducibility and artifact manifests.

Frontend work should begin after this report, the JSON schema, and at least one
curated example output are stable. The first frontend milestone should be a
static evidence explorer over exported JSON files.

## 11. Limitations

Evanesca is not a real-time exploit detector and does not infer malicious intent
from on-chain traces alone. Its current limitations include:

- dependence on protocol adapters and supported service classes;
- incomplete handling of off-chain compromises and governance/social attacks;
- reliance on trace availability and RPC behavior;
- sensitivity to USD normalization and price-source assumptions;
- possible false positives from benign but unusual market behavior;
- possible false negatives for unsupported protocols or hidden state updates;
- public evaluation artifacts that still need provenance review.

These limitations should remain visible in public materials. They are part of
the intended analyst-facing workflow rather than an implementation detail to
hide.

## 12. Acknowledgements

This technical report builds on the Evanesca research prototype and incorporates
feedback from prior academic review cycles. The open-source release reorganizes
the system as a project-maintained framework for DeFi transaction reconstruction
and evidence exploration.
