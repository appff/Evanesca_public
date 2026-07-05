#!/usr/bin/env node

import * as fs from "fs";
import * as path from "path";
import type { AnalysisResult } from "../ConstraintSolver/Interfaces/AnalysisResult";
import type { EvanescaContext } from "../Interfaces/EvanescaContext";

type CliOptions = {
  tx?: string;
  chain: string;
  out?: string;
  pretty: boolean;
  includeRaw: boolean;
};

type PublicNode = {
  id: string;
  kind: "account" | "contract" | "token" | "pool" | "market" | "protocol" | "unknown";
  label?: string;
  address?: string;
  protocol?: string;
  chain?: string;
};

type PublicEdge = {
  id: string;
  source: string;
  target: string;
  action: string;
  tokenIn?: PublicTokenAmount;
  tokenOut?: PublicTokenAmount;
  valueUsdIn?: number;
  valueUsdOut?: number;
  protocol?: string;
  logIndex?: number;
  raw?: unknown;
};

type PublicTokenAmount = {
  token: string;
  symbol?: string;
  amount: string;
  decimals?: number;
  valueUsd?: number;
};

type PublicConstraintFinding = {
  id: string;
  name: string;
  severity: "info" | "low" | "medium" | "high";
  edgeIds: string[];
  predicate: string;
  observedValue?: number | string;
  threshold?: number | string;
  explanation: string;
};

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    chain: "ethereum",
    pretty: false,
    includeRaw: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--tx":
      case "--hash":
        options.tx = argv[++i];
        break;
      case "--chain":
        options.chain = argv[++i] || options.chain;
        break;
      case "--out":
      case "-o":
        options.out = argv[++i];
        break;
      case "--pretty":
        options.pretty = true;
        break;
      case "--include-raw":
        options.includeRaw = true;
        break;
      case "--help":
      case "-h":
        printHelp();
        process.exit(0);
      default:
        if (!options.tx && !arg.startsWith("-")) {
          options.tx = arg;
        } else {
          throw new Error(`Unknown argument: ${arg}`);
        }
    }
  }

  if (!options.tx) {
    throw new Error("Missing transaction hash. Use --tx <hash>.");
  }

  return options;
}

function printHelp(): void {
  console.log(`Evanesca analysis export

Usage:
  npm run analyze -- --tx <hash> [--chain ethereum] [--out result.json] [--pretty]
  npm run analyze -- <hash> --pretty

Options:
  --tx, --hash <hash>     Transaction hash to analyze
  --chain <chain>         Chain label for exported JSON (default: ethereum)
  -o, --out <file>        Write JSON to file instead of stdout
  --pretty               Pretty-print JSON
  --include-raw          Include raw parsed edge payloads when available
  -h, --help             Show this help
`);
}

function createContext(): EvanescaContext {
  return {
    tList: [],
    analyzed: new Set<string>(),
    reports: new Array<AnalysisResult>(),
    fins: new Array<number>(),
    complexity: new Array<number>(),
  };
}

function normalizeAction(value: unknown): string {
  const raw = String(value || "unknown").toLowerCase();
  if (raw.includes("swap")) return "swap";
  if (raw.includes("deposit") || raw.includes("mint")) return "deposit";
  if (raw.includes("withdraw") || raw.includes("redeem")) return "withdraw";
  if (raw.includes("borrow")) return "borrow";
  if (raw.includes("repay")) return "repay";
  if (raw.includes("liquidat")) return "liquidate";
  if (raw.includes("bridge")) return "bridge";
  if (raw.includes("reward") || raw.includes("claim")) return "reward";
  if (raw.includes("transfer")) return "transfer";
  return "unknown";
}

function parseEdgePayload(edge: any): any {
  const raw = edge?.name?.[0];
  if (typeof raw !== "string") return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function firstDefined<T>(...values: T[]): T | undefined {
  return values.find(value => value !== undefined && value !== null && value !== "") as T | undefined;
}

function toNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function tokenAmount(token: unknown, symbol: unknown, amount: unknown, valueUsd: unknown): PublicTokenAmount | undefined {
  const tokenValue = firstDefined(token, symbol);
  const amountValue = firstDefined(amount);
  if (!tokenValue && amountValue === undefined) return undefined;
  return {
    token: String(tokenValue || "unknown"),
    symbol: symbol ? String(symbol) : undefined,
    amount: String(amountValue ?? "0"),
    valueUsd: toNumber(valueUsd),
  };
}

function convertEdges(edges: any[], includeRaw: boolean): { nodes: PublicNode[]; edges: PublicEdge[] } {
  const nodes = new Map<string, PublicNode>();
  const publicEdges: PublicEdge[] = [];

  edges.forEach((edge, index) => {
    const payload = parseEdgePayload(edge);
    const source = String(firstDefined(edge?.v, payload.From, payload.from, "unknown_source"));
    const target = String(firstDefined(edge?.w, payload.To, payload.to, "unknown_target"));
    const protocol = firstDefined(payload.Service, payload.service, payload.Protocol, payload.protocol);
    const action = normalizeAction(firstDefined(payload.Action, payload.action, payload.Type, payload.type));

    if (!nodes.has(source)) {
      nodes.set(source, {
        id: source,
        kind: "unknown",
        label: shorten(source),
        address: looksLikeAddress(source) ? source : undefined,
        protocol: protocol ? String(protocol) : undefined,
      });
    }

    if (!nodes.has(target)) {
      nodes.set(target, {
        id: target,
        kind: "unknown",
        label: shorten(target),
        address: looksLikeAddress(target) ? target : undefined,
        protocol: protocol ? String(protocol) : undefined,
      });
    }

    publicEdges.push({
      id: `edge_${index}`,
      source,
      target,
      action,
      tokenIn: tokenAmount(
        firstDefined(payload.input_token_address, payload.InputToken, payload.TokenIn, payload.Token),
        firstDefined(payload.input_token_symbol, payload.InputSymbol, payload.TokenInSymbol, payload.Token),
        firstDefined(payload.input_token_amount, payload.AmountIn, payload.amountIn, payload.Amount),
        firstDefined(payload.totalInUSD, payload.total_in_usd, payload.valueUsdIn)
      ),
      tokenOut: tokenAmount(
        firstDefined(payload.output_token_address, payload.OutputToken, payload.TokenOut, payload.Token),
        firstDefined(payload.output_token_symbol, payload.OutputSymbol, payload.TokenOutSymbol, payload.Token),
        firstDefined(payload.output_token_amount, payload.AmountOut, payload.amountOut),
        firstDefined(payload.totalOutUSD, payload.total_out_usd, payload.valueUsdOut)
      ),
      valueUsdIn: toNumber(firstDefined(payload.totalInUSD, payload.total_in_usd, payload.valueUsdIn)),
      valueUsdOut: toNumber(firstDefined(payload.totalOutUSD, payload.total_out_usd, payload.valueUsdOut)),
      protocol: protocol ? String(protocol) : undefined,
      logIndex: toNumber(edge?.originalLogIndex),
      raw: includeRaw ? payload : undefined,
    });
  });

  return {
    nodes: [...nodes.values()],
    edges: publicEdges,
  };
}

function convertConstraintFindings(reports: AnalysisResult[], edgeIds: string[]): PublicConstraintFinding[] {
  const { constraintIndexMapper } = require("../ConstraintSolver/ConstraintIndexMapper");
  const constraintNames = constraintIndexMapper.getConstraintNames();
  const findings: PublicConstraintFinding[] = [];

  reports.forEach((report, reportIndex) => {
    report._violation?.forEach((violated, constraintIndex) => {
      if (!violated) return;
      const name = constraintNames[constraintIndex] || `CONSTRAINT_${constraintIndex}`;
      findings.push({
        id: `finding_${reportIndex}_${constraintIndex}`,
        name,
        severity: "info",
        edgeIds,
        predicate: "See constraint library for implementation predicate.",
        explanation: report._comment || `${name} fired.`,
      });
    });

    for (const [violationIndex, violation] of (report.constraintViolations || []).entries()) {
      findings.push({
        id: `finding_${reportIndex}_detail_${violationIndex}`,
        name: String(violation?.name || violation?.type || "ADDITIONAL_CONSTRAINT_FINDING"),
        severity: "info",
        edgeIds,
        predicate: String(violation?.predicate || "See analyzer details."),
        observedValue: violation?.observedValue,
        threshold: violation?.threshold,
        explanation: String(violation?.message || violation?.description || "Additional analyzer finding."),
      });
    }
  });

  return findings;
}

function buildEvidence(edges: PublicEdge[], findings: PublicConstraintFinding[]) {
  const findingIds = findings.map(finding => finding.id);
  return edges.map((edge, index) => ({
    index: index + 1,
    edgeId: edge.id,
    action: edge.action,
    protocol: edge.protocol,
    description: `${edge.action} from ${shorten(edge.source)} to ${shorten(edge.target)}`,
    valueUsd: edge.valueUsdOut ?? edge.valueUsdIn,
    constraintIds: findingIds,
  }));
}

function shorten(value: string): string {
  if (!value) return "unknown";
  return value.length > 16 ? `${value.slice(0, 8)}...${value.slice(-6)}` : value;
}

function looksLikeAddress(value: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(value);
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const { run } = await import("../Driver");
  const context = createContext();
  const result = await run(options.tx!, context);
  const reports: AnalysisResult[] = result?.reports || [];
  const convertedGraph = convertEdges(result?.edges || [], options.includeRaw);
  const edgeIds = convertedGraph.edges.map(edge => edge.id);
  const constraints = convertConstraintFindings(reports, edgeIds);

  const output = {
    schemaVersion: "0.1",
    txHash: options.tx,
    chain: options.chain,
    blockNumber: reports.find(report => report.blockNumber !== undefined)?.blockNumber,
    summary: {
      status: constraints.length > 0 ? "flagged" : "clean",
      category: constraints.length > 0 ? "unattributed" : undefined,
      title: constraints.length > 0 ? "Constraint finding exported" : "No constraint findings exported",
      description: reports.map(report => report._comment).filter(Boolean).join(" ") || undefined,
    },
    graph: convertedGraph,
    constraints,
    evidence: buildEvidence(convertedGraph.edges, constraints),
    diagnostics: [
      {
        level: "info",
        message: "Generated by experimental public JSON export wrapper.",
      },
    ],
  };

  const json = JSON.stringify(output, null, options.pretty ? 2 : 0);

  if (options.out) {
    const outPath = path.resolve(process.cwd(), options.out);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, json + "\n");
  } else {
    process.stdout.write(json + "\n");
  }
}

main().catch(error => {
  console.error(`Evanesca analysis export failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
