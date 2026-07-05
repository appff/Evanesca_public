#!/usr/bin/env npx ts-node

/**
 * Evidence replay helper: recompute numeric metrics (USD in/out, rho(e), gasUSD)
 * for a single on-chain transaction hash.
 *
 * This is intended to back the paper's "evidence replay" reproducibility claim.
 */

import fs from "fs";
import path from "path";
import type { SequenceEdge } from "../SemanticFinancialGraph/Types";

type CLIOptions = {
  txHash: string;
  outPath: string | null;
  theta: number;
  quiet: boolean;
  allowMissingPrices: boolean;
};

type TokenAmount = {
  symbol: string | null;
  address: string | null;
  amount_raw: string | null;
  amount: number | null;
  usd: number | null;
};

type EdgeMetrics = {
  index: number;
  type: string | null;
  action: string | null;
  service: string | null;
  from: string | null;
  to: string | null;
  token_in: TokenAmount | null;
  token_out: TokenAmount | null;
  rho: number | null;
  abs_rho_minus_1: number | null;
  missing_price: boolean;
  raw: Record<string, any>;
};

type TxMetricsReport = {
  tx_hash: string;
  chain_id: number;
  block_number: number;
  from: string;
  to: string | null;
  gas_used: string | null;
  effective_gas_price_wei: string | null;
  gas_cost_eth: number | null;
  gas_cost_usd: number | null;
  decoded_logs: number;
  edges_total: number;
  theta: number;
  swaps_total: number;
  swaps_over_theta: number;
  max_abs_rho_minus_1: number | null;
  edges: EdgeMetrics[];
  missing_prices: Array<{
    edge_index: number;
    side: "in" | "out" | "single";
    symbol: string;
    address: string;
  }>;
  pnl_usd_by_address: Record<string, number>;
  pnl_top_positive: Array<{ address: string; pnl_usd: number }>;
  pnl_top_negative: Array<{ address: string; pnl_usd: number }>;
  generated_at: string;
};

function parseArgs(): CLIOptions {
  const args = process.argv.slice(2);
  const opts: CLIOptions = {
    txHash: "",
    outPath: null,
    theta: 0.05,
    quiet: true,
    allowMissingPrices: false,
  };

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--tx") {
      opts.txHash = (args[++i] || "").trim();
      continue;
    }
    if (a.startsWith("--tx=")) {
      opts.txHash = a.slice("--tx=".length).trim();
      continue;
    }
    if (a === "--out") {
      opts.outPath = (args[++i] || "").trim() || null;
      continue;
    }
    if (a.startsWith("--out=")) {
      opts.outPath = a.slice("--out=".length).trim() || null;
      continue;
    }
    if (a === "--theta") {
      opts.theta = parseFloat(args[++i] || "");
      continue;
    }
    if (a.startsWith("--theta=")) {
      opts.theta = parseFloat(a.slice("--theta=".length));
      continue;
    }
    if (a === "--quiet") {
      const v = (args[++i] || "").toLowerCase();
      opts.quiet = v === "true" || v === "1" || v === "yes";
      continue;
    }
    if (a.startsWith("--quiet=")) {
      const v = a.slice("--quiet=".length).toLowerCase();
      opts.quiet = v === "true" || v === "1" || v === "yes";
      continue;
    }
    if (a === "--allow-missing-prices") {
      const v = (args[++i] || "").toLowerCase();
      opts.allowMissingPrices = v === "true" || v === "1" || v === "yes";
      continue;
    }
    if (a.startsWith("--allow-missing-prices=")) {
      const v = a.slice("--allow-missing-prices=".length).toLowerCase();
      opts.allowMissingPrices = v === "true" || v === "1" || v === "yes";
      continue;
    }
    if (a === "--help" || a === "-h") {
      console.log(`
Replay numeric evidence metrics for a transaction hash.

Usage:
  npx ts-node --transpile-only src/VerificationTools/replayTxMetrics.ts --tx <0x...> [options]

Options:
  --out <path>                 Write JSON output to file (default: stdout only)
  --theta <float>              Threshold for |rho-1| counting (default: 0.05)
  --quiet <true|false>         Suppress noisy internal logs (default: true)
  --allow-missing-prices <t/f> Do not fail when a token price is missing (default: false)

Example:
  npx ts-node --transpile-only src/VerificationTools/replayTxMetrics.ts \\
    --tx 0x48785cd3515f8558109f78b7cfe86a21df5dc6a35238cd20c4aa04a7ed831199 \\
    --out docs/experiments/fp_validation_wacco/replay-0x48785c..1199.json
`);
      process.exit(0);
    }
  }

  if (!/^0x[0-9a-fA-F]{64}$/.test(opts.txHash)) {
    throw new Error(`Invalid/missing --tx: ${opts.txHash}`);
  }
  if (!Number.isFinite(opts.theta) || opts.theta <= 0) {
    throw new Error(`Invalid --theta: ${opts.theta}`);
  }
  return opts;
}

function getStr(v: any): string | null {
  if (v === null || v === undefined) return null;
  return String(v);
}

function pickFirstString(...candidates: any[]): string | null {
  for (const c of candidates) {
    const s = getStr(c);
    if (s && s.trim()) return s;
  }
  return null;
}

function safeParseEdgeData(seq: SequenceEdge): Record<string, any> {
  try {
    const raw = seq.name?.[0];
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function edgeType(edgeData: Record<string, any>, node: any): string | null {
  return pickFirstString(edgeData.Type, edgeData.type, node?.Type, node?.type);
}

function edgeAction(edgeData: Record<string, any>): string | null {
  return pickFirstString(edgeData.Action, edgeData.action);
}

function edgeService(edgeData: Record<string, any>, node: any): string | null {
  const svc = pickFirstString(
    edgeData.Service,
    edgeData.service,
    edgeData.Protocol,
    edgeData.protocol,
    node?.Service,
    node?.ServiceType,
  );
  return svc ? svc.toLowerCase() : null;
}

function looksLikeDexSwap(t: string | null, a: string | null): boolean {
  if (!t || !a) return false;
  return t.toLowerCase() === "dex" && a.toLowerCase() === "swap";
}

function dexIn(edgeData: Record<string, any>): { amountRaw: string | null; symbol: string | null; addr: string | null } {
  const amountRaw = pickFirstString(edgeData.AmountIn, edgeData.amountIn, edgeData.amount_in);
  const symbol = pickFirstString(
    edgeData.Token0,
    edgeData.TokenInSymbol,
    edgeData.token0,
    edgeData.TokenIn,
    edgeData.input_token_symbol,
  );
  const addr = pickFirstString(
    edgeData.Token0Addr,
    edgeData.TokenInAddress,
    edgeData.TokenInAddr,
    edgeData.token0Addr,
    edgeData.input_token_address,
  );
  return { amountRaw, symbol, addr };
}

function dexOut(edgeData: Record<string, any>): { amountRaw: string | null; symbol: string | null; addr: string | null } {
  const amountRaw = pickFirstString(edgeData.AmountOut, edgeData.amountOut, edgeData.amount_out);
  const symbol = pickFirstString(
    edgeData.Token1,
    edgeData.TokenOutSymbol,
    edgeData.token1,
    edgeData.TokenOut,
    edgeData.output_token_symbol,
  );
  const addr = pickFirstString(
    edgeData.Token1Addr,
    edgeData.TokenOutAddress,
    edgeData.TokenOutAddr,
    edgeData.token1Addr,
    edgeData.output_token_address,
  );
  return { amountRaw, symbol, addr };
}

function singleToken(
  edgeData: Record<string, any>,
): { amountRaw: string | null; symbol: string | null; addr: string | null } {
  const amountRaw = pickFirstString(edgeData.Amount, edgeData.amount, edgeData.value);
  const symbol = pickFirstString(edgeData.Token, edgeData.token, edgeData.TokenSymbol);
  const addr = pickFirstString(edgeData.TokenAddr, edgeData.tokenAddr, edgeData.TokenAddress);
  return { amountRaw, symbol, addr };
}

async function main(): Promise<void> {
  const opts = parseArgs();

  const runnerLog = console.log.bind(console);
  const runnerWarn = console.warn.bind(console);

  if (opts.quiet) {
    if (process.env.EVANESCA_QUIET === undefined) process.env.EVANESCA_QUIET = "true";
    if (process.env.LOG_LEVEL === undefined) process.env.LOG_LEVEL = "ERROR";
    console.log = () => {};
    console.warn = () => {};
  }

  // Ensure we do not silently substitute $1 prices; fail fast on missing prices.
  process.env.EVANESCA_SKIP_UNKNOWN_PRICE = "true";
  process.env.EVANESCA_TX_HASH = opts.txHash;

  const [
    { makeLogs },
    { detectChainFromTxHash, getEventLogs },
    { buildModelMap },
    { FormalSemanticFinancialGraphBuilder },
    { batchToUSD, getTokenUSD },
    { TokenDecimalFetcher },
    { PrecisionMath },
  ] = await Promise.all([
    import("../ABIDecoder/LogDecoder"),
    import("../Utils/Driver/DriverUtils"),
    import("../SemanticFinancialGraph/SemanticFinancialGraphUtils"),
    import("../SemanticFinancialGraph/FormalSemanticFinancialGraphBuilder"),
    import("../Utils/PriceManager/PriceUtils"),
    import("../Utils/TokenDecimalFetcher"),
    import("../Utils/PrecisionMath"),
  ]);

  buildModelMap();

  const receipt: any = await getEventLogs(opts.txHash);
  if (!receipt) {
    runnerWarn(`No receipt found for tx: ${opts.txHash}`);
    process.exit(2);
    return;
  }

  const chainId = detectChainFromTxHash(opts.txHash);
  const decoded = makeLogs(receipt);

  const builder = new FormalSemanticFinancialGraphBuilder(
    receipt.blockNumber,
    receipt.from,
    chainId,
  );
  builder.setOriginalLogs(receipt.logs || []);
  await builder.build(decoded);

  const edgeSeq: SequenceEdge[] = builder.edgeSeq || [];
  const graph: any = builder.graph;

  // Collect USD conversion requests for DEX swap edges.
  type Req = { tokenAmount: string; tokenSymbol: string; tokenAddr: string; blockNo: number };
  type Ref = { edgeIndex: number; side: "in" | "out" | "single"; symbol: string; address: string };
  const reqs: Req[] = [];
  const refs: Ref[] = [];

  for (let i = 0; i < edgeSeq.length; i++) {
    const seq = edgeSeq[i];
    const data = safeParseEdgeData(seq);
    const node = graph?.node ? graph.node(seq.w) : null;
    const t = edgeType(data, node);
    const a = edgeAction(data);
    if (looksLikeDexSwap(t, a)) {
      const inTok = dexIn(data);
      const outTok = dexOut(data);

      if (inTok.amountRaw && inTok.symbol) {
        reqs.push({
          tokenAmount: inTok.amountRaw,
          tokenSymbol: inTok.symbol,
          tokenAddr: inTok.addr || "",
          blockNo: receipt.blockNumber,
        });
        refs.push({
          edgeIndex: i,
          side: "in",
          symbol: inTok.symbol,
          address: inTok.addr || "",
        });
      }
      if (outTok.amountRaw && outTok.symbol) {
        reqs.push({
          tokenAmount: outTok.amountRaw,
          tokenSymbol: outTok.symbol,
          tokenAddr: outTok.addr || "",
          blockNo: receipt.blockNumber,
        });
        refs.push({
          edgeIndex: i,
          side: "out",
          symbol: outTok.symbol,
          address: outTok.addr || "",
        });
      }
      continue;
    }

    // Single-token value edges (e.g., Token Transfer, Withdraw) for PnL replay.
    const s = singleToken(data);
    if (s.amountRaw && s.symbol) {
      reqs.push({
        tokenAmount: s.amountRaw,
        tokenSymbol: s.symbol,
        tokenAddr: s.addr || "",
        blockNo: receipt.blockNumber,
      });
      refs.push({
        edgeIndex: i,
        side: "single",
        symbol: s.symbol,
        address: s.addr || "",
      });
    }
  }

  const usd = reqs.length ? await batchToUSD(reqs) : [];

  const edgeUsdIn = new Map<number, number>();
  const edgeUsdOut = new Map<number, number>();
  const edgeUsdSingle = new Map<number, number>();
  const missingPrices: TxMetricsReport["missing_prices"] = [];

  for (let k = 0; k < refs.length; k++) {
    const ref = refs[k];
    const v = usd[k] ?? 0;
    if (v === 0) {
      missingPrices.push({
        edge_index: ref.edgeIndex,
        side: ref.side,
        symbol: ref.symbol,
        address: ref.address,
      });
    }
    if (ref.side === "in") edgeUsdIn.set(ref.edgeIndex, v);
    else if (ref.side === "out") edgeUsdOut.set(ref.edgeIndex, v);
    else edgeUsdSingle.set(ref.edgeIndex, v);
  }

  // Gas cost (ETH) and gasUSD.
  const gasUsedStr = pickFirstString(receipt.gasUsed, receipt.gas_used);
  const gasPriceWeiStr = pickFirstString(
    receipt.effectiveGasPrice,
    receipt.effective_gas_price,
    receipt.gasPrice,
    receipt.gas_price,
  );
  let gasCostEth: number | null = null;
  let gasCostUsd: number | null = null;
  if (gasUsedStr && gasPriceWeiStr) {
    try {
      const gasWei = BigInt(gasUsedStr) * BigInt(gasPriceWeiStr);
      gasCostEth = PrecisionMath.normalizeAmount(gasWei.toString(), 18);
      const ethPrice = await getTokenUSD("ETH", receipt.blockNumber, "0x0000000000000000000000000000000000000000");
      gasCostUsd = gasCostEth * ethPrice;
    } catch {
      // ignore
    }
  }

  // Build edge-level metrics
  const edges: EdgeMetrics[] = [];
  let swapsTotal = 0;
  let swapsOverTheta = 0;
  let maxAbs: number | null = null;
  const pnlUsd = new Map<string, number>();

  function pnlAdd(address: string | null, deltaUsd: number): void {
    if (!address) return;
    const key = address.toLowerCase();
    pnlUsd.set(key, (pnlUsd.get(key) || 0) + deltaUsd);
  }

  for (let i = 0; i < edgeSeq.length; i++) {
    const seq = edgeSeq[i];
    const data = safeParseEdgeData(seq);
    const node = graph?.node ? graph.node(seq.w) : null;
    const t = edgeType(data, node);
    const a = edgeAction(data);
    const svc = edgeService(data, node);

    const isSwap = looksLikeDexSwap(t, a);
    let tokenIn: TokenAmount | null = null;
    let tokenOut: TokenAmount | null = null;
    let rho: number | null = null;
    let abs: number | null = null;
    let missingPrice = false;

    if (isSwap) {
      swapsTotal++;
      const inTok = dexIn(data);
      const outTok = dexOut(data);

      const inUsd = edgeUsdIn.get(i) ?? null;
      const outUsd = edgeUsdOut.get(i) ?? null;
      if ((inUsd ?? 0) === 0 || (outUsd ?? 0) === 0) missingPrice = true;

      let inAmountNorm: number | null = null;
      let outAmountNorm: number | null = null;
      if (inTok.amountRaw && inTok.symbol && inTok.addr) {
        const dec = await TokenDecimalFetcher.getTokenDecimals(inTok.addr, inTok.symbol, receipt.blockNumber);
        inAmountNorm = PrecisionMath.normalizeAmount(inTok.amountRaw, dec);
      }
      if (outTok.amountRaw && outTok.symbol && outTok.addr) {
        const dec = await TokenDecimalFetcher.getTokenDecimals(outTok.addr, outTok.symbol, receipt.blockNumber);
        outAmountNorm = PrecisionMath.normalizeAmount(outTok.amountRaw, dec);
      }

      tokenIn = {
        symbol: inTok.symbol,
        address: inTok.addr,
        amount_raw: inTok.amountRaw,
        amount: inAmountNorm,
        usd: inUsd,
      };
      tokenOut = {
        symbol: outTok.symbol,
        address: outTok.addr,
        amount_raw: outTok.amountRaw,
        amount: outAmountNorm,
        usd: outUsd,
      };

      if ((inUsd ?? 0) > 0 && (outUsd ?? 0) > 0) {
        rho = (outUsd as number) / (inUsd as number);
        abs = Math.abs(rho - 1);
        if (abs > opts.theta) swapsOverTheta++;
        if (maxAbs === null || abs > maxAbs) maxAbs = abs;
      }

      // PnL attribution (transaction-local): sender pays inUSD and receives outUSD.
      pnlAdd(pickFirstString(data.From, data.from, seq.v), -(inUsd || 0));
      pnlAdd(pickFirstString(data.From, data.from, seq.v), +(outUsd || 0));
    } else {
      // Single-token value edge.
      const s = singleToken(data);
      const usdVal = edgeUsdSingle.get(i) ?? null;
      if ((usdVal ?? 0) === 0 && s.amountRaw && s.symbol) missingPrice = true;

      let amtNorm: number | null = null;
      if (s.amountRaw && s.symbol && s.addr) {
        const dec = await TokenDecimalFetcher.getTokenDecimals(s.addr, s.symbol, receipt.blockNumber);
        amtNorm = PrecisionMath.normalizeAmount(s.amountRaw, dec);
      }

      if (s.amountRaw && s.symbol) {
        tokenOut = {
          symbol: s.symbol,
          address: s.addr,
          amount_raw: s.amountRaw,
          amount: amtNorm,
          usd: usdVal,
        };

        // Transfer-like PnL attribution: From loses, To gains.
        const fromAddr = pickFirstString(data.From, data.from, seq.v);
        const toAddr = pickFirstString(data.To, data.to, seq.w);
        pnlAdd(fromAddr, -(usdVal || 0));
        pnlAdd(toAddr, +(usdVal || 0));
      }
    }

    edges.push({
      index: i,
      type: t,
      action: a,
      service: svc,
      from: pickFirstString(data.From, data.from, seq.v),
      to: pickFirstString(data.To, data.to, seq.w),
      token_in: tokenIn,
      token_out: tokenOut,
      rho,
      abs_rho_minus_1: abs,
      missing_price: missingPrice,
      raw: data,
    });
  }

  // Subtract gas from tx sender (Ethereum semantics).
  if (gasCostUsd !== null) {
    pnlAdd(receipt.from, -gasCostUsd);
  }

  const pnlObj: Record<string, number> = Object.fromEntries(
    Array.from(pnlUsd.entries()).map(([addr, v]) => [addr, v]),
  );
  const pnlSorted = Array.from(pnlUsd.entries()).sort((a, b) => b[1] - a[1]);
  const pnlTopPositive = pnlSorted
    .filter(([, v]) => v > 0)
    .slice(0, 10)
    .map(([address, pnl_usd]) => ({ address, pnl_usd }));
  const pnlTopNegative = pnlSorted
    .filter(([, v]) => v < 0)
    .slice(0, 10)
    .map(([address, pnl_usd]) => ({ address, pnl_usd }));

  const report: TxMetricsReport = {
    tx_hash: opts.txHash,
    chain_id: chainId,
    block_number: receipt.blockNumber,
    from: receipt.from,
    to: receipt.to || null,
    gas_used: gasUsedStr,
    effective_gas_price_wei: gasPriceWeiStr,
    gas_cost_eth: gasCostEth,
    gas_cost_usd: gasCostUsd,
    decoded_logs: decoded.length,
    edges_total: edgeSeq.length,
    theta: opts.theta,
    swaps_total: swapsTotal,
    swaps_over_theta: swapsOverTheta,
    max_abs_rho_minus_1: maxAbs,
    edges,
    missing_prices: missingPrices,
    pnl_usd_by_address: pnlObj,
    pnl_top_positive: pnlTopPositive,
    pnl_top_negative: pnlTopNegative,
    generated_at: new Date().toISOString(),
  };

  const json = JSON.stringify(report, null, 2);
  if (opts.outPath) {
    const abs = path.isAbsolute(opts.outPath)
      ? opts.outPath
      : path.resolve(process.cwd(), opts.outPath);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, json + "\n", "utf-8");
    runnerLog(`Wrote: ${abs}`);
  } else {
    runnerLog(json);
  }

  if (missingPrices.length && !opts.allowMissingPrices) {
    runnerWarn(
      `Missing ${missingPrices.length} price conversions; rerun with --allow-missing-prices=true to ignore.`,
    );
    process.exitCode = 2;
  }

  // Force termination: some dependencies keep handles open (e.g., sqlite caches).
  process.exit(process.exitCode ?? 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
