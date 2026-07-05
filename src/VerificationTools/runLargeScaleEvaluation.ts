#!/usr/bin/env npx ts-node

import fs from "fs";
import path from "path";
import readline from "readline";
import type { EvanescaContext } from "../Interfaces/EvanescaContext";
import {
  ParquetViolationWriter,
  ViolationRecord,
  SkipRecord,
} from "../Utils/ParquetWriter";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CLIOptions {
  input: string;
  outputDir: string;
  limit: number;
  flushInterval: number;
  resume: boolean;
}

interface Checkpoint {
  processedHashes: string[];
  processedCount: number;
  violationCount: number;
  skipCount: number;
  lastUpdatedAt: string;
}

// ---------------------------------------------------------------------------
// CLI parsing
// ---------------------------------------------------------------------------

function parseArgs(): CLIOptions {
  const args = process.argv.slice(2);
  const defaults: CLIOptions = {
    input: "",
    outputDir: "./large-scale-results",
    limit: 0,
    flushInterval: 5000,
    resume: false,
  };

  return args.reduce<CLIOptions>(
    (acc, arg) => {
      if (arg === "--resume") {
        acc.resume = true;
        return acc;
      }
      const eqIndex = arg.indexOf("=");
      if (eqIndex === -1) return acc;
      const key = arg.slice(0, eqIndex);
      const value = arg.slice(eqIndex + 1);
      if (key === "--input") acc.input = value;
      if (key === "--output") acc.outputDir = value;
      if (key === "--limit") acc.limit = parseInt(value, 10);
      if (key === "--flush-interval") acc.flushInterval = parseInt(value, 10);
      return acc;
    },
    { ...defaults },
  );
}

function extractHashes(line: string): string[] {
  return line
    .split(",")
    .map((hash: string) => hash.trim())
    .filter(Boolean);
}

// ---------------------------------------------------------------------------
// Checkpoint helpers
// ---------------------------------------------------------------------------

function loadCheckpoint(checkpointPath: string): Checkpoint | null {
  if (!fs.existsSync(checkpointPath)) return null;
  try {
    const raw = fs.readFileSync(checkpointPath, "utf-8");
    return JSON.parse(raw) as Checkpoint;
  } catch {
    return null;
  }
}

function saveCheckpoint(
  checkpointPath: string,
  processedSet: Set<string>,
  processedCount: number,
  violationCount: number,
  skipCount: number,
): void {
  const checkpoint: Checkpoint = {
    processedHashes: Array.from(processedSet),
    processedCount,
    violationCount,
    skipCount,
    lastUpdatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(
    checkpointPath,
    JSON.stringify(checkpoint, null, 2),
    "utf-8",
  );
}

// ---------------------------------------------------------------------------
// JSONL helpers
// ---------------------------------------------------------------------------

function appendJsonl(filePath: string, record: Record<string, any>): void {
  fs.appendFileSync(filePath, JSON.stringify(record) + "\n", "utf-8");
}

// ---------------------------------------------------------------------------
// Main processing logic
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const options = parseArgs();
  // Large-scale runs generate extremely verbose logs by default (RPC/cache/price).
  // Keep output manageable unless explicitly disabled by the caller.
  if (process.env.EVANESCA_QUIET === undefined) {
    process.env.EVANESCA_QUIET = "true";
  }
  // Many modules still use console.log directly (not the structured logger).
  // For large-scale runs, silence console.log/warn to avoid overwhelming IO.
  // Keep console.error intact so failures remain visible.
  const runnerLog = console.log.bind(console);
  const runnerWarn = console.warn.bind(console);
  if (
    process.env.EVANESCA_QUIET === "true" &&
    process.env.LOG_LEVEL === undefined
  ) {
    // Suppress per-transaction Driver INFO logs.
    process.env.LOG_LEVEL = "ERROR";
  }
  if (process.env.EVANESCA_QUIET === "true") {
    console.log = () => {};
    console.warn = () => {};
  }
  // Large-scale precision audits should evaluate the DSL constraints only.
  // (Disable hash-based/custom heuristics that would contaminate FP accounting.)
  if (process.env.EVANESCA_DSL_ONLY === undefined) {
    process.env.EVANESCA_DSL_ONLY = "true";
  }

  const inputPath = path.resolve(process.cwd(), options.input);
  if (!fs.existsSync(inputPath)) {
    console.error(`Input file not found: ${inputPath}`);
    process.exit(1);
  }

  const outputDir = path.resolve(process.cwd(), options.outputDir);
  fs.mkdirSync(outputDir, { recursive: true });

  // Output paths
  const violationsJsonlPath = path.join(outputDir, "violations.jsonl");
  const skipsJsonlPath = path.join(outputDir, "skips.jsonl");
  const reportPath = path.join(outputDir, "violations.parquet");
  const skipLogPath = path.join(outputDir, "price-skip.parquet");
  const checkpointPath = path.join(outputDir, "checkpoint.json");

  process.env.EVANESCA_SKIP_LOG = skipLogPath;

  // DSL / constraint setup
  const dslPath = path.join(
    process.cwd(),
    "src",
    "DSL",
    "constraints",
    "default_constraints.dsl",
  );

  // IMPORTANT:
  // The global constraint index mapper is instantiated at module import time
  // (via AnalysisResult -> ConstraintIndexMapper singleton). To ensure
  // consistent constraint indexing and correct _violation sizing, set DSL_FILE
  // BEFORE importing Driver / ConstraintIndexMapper.
  process.env.DSL_FILE = dslPath;

  // Lazy-load modules that depend on the global constraint index mapper.
  const { ConstraintIndexMapper } = await import(
    "../ConstraintSolver/ConstraintIndexMapper"
  );
  const { run } = await import("../Driver");

  // Ensure the evaluation run uses the same DSL file as the index mapper.
  // (Driver loads constraints dynamically via DSL_FILE; without this, we may
  // accidentally evaluate a different constraint set than we label.)
  const constraintMapper = new ConstraintIndexMapper(dslPath);
  const constraintNames = constraintMapper.getConstraintNames();

  // -----------------------------------------------------------------------
  // Resume support
  // -----------------------------------------------------------------------
  const processedSet: Set<string> = new Set();
  let processedCount = 0;
  let violationCount = 0;
  let skipCount = 0;

  if (options.resume) {
    const existing = loadCheckpoint(checkpointPath);
    if (existing) {
      for (const h of existing.processedHashes) {
        processedSet.add(h);
      }
      processedCount = existing.processedCount;
      violationCount = existing.violationCount;
      skipCount = existing.skipCount;
      console.log(
        `Resuming from checkpoint: ${processedCount} txs already processed ` +
          `(${violationCount} violations, ${skipCount} skips)`,
      );
    } else {
      console.log("No checkpoint found, starting fresh.");
    }
  } else {
    // Fresh run – truncate JSONL files if they exist
    if (fs.existsSync(violationsJsonlPath)) fs.unlinkSync(violationsJsonlPath);
    if (fs.existsSync(skipsJsonlPath)) fs.unlinkSync(skipsJsonlPath);
  }

  // -----------------------------------------------------------------------
  // Banner
  // -----------------------------------------------------------------------
  runnerLog("=".repeat(80));
  runnerLog("EVANESCA LARGE-SCALE EVALUATION RUNNER");
  runnerLog("=".repeat(80));
  function redactRpcUrl(url: string): string {
    try {
      const u = new URL(url);
      const redactedPath = u.pathname
        .replace(/\/v3\/[^/]+/g, "/v3/<redacted>")
        .replace(/\/v2\/[^/]+/g, "/v2/<redacted>")
        .replace(/\/archive\/evm\/[^/]+/g, "/archive/evm/<redacted>");
      return `${u.protocol}//${u.host}${redactedPath}`;
    } catch {
      return url
        .replace(/(\/v3\/)[^/]+/g, "$1<redacted>")
        .replace(/(\/v2\/)[^/]+/g, "$1<redacted>")
        .replace(/(\/archive\/evm\/)[^/]+/g, "$1<redacted>");
    }
  }

  // Avoid leaking RPC API keys in logs; report only the host/path with redaction.
  const rpcUrl = process.env.INFURA_ETH_URL || process.env.INFURA_URL || "";
  const rpcShown = rpcUrl ? redactRpcUrl(rpcUrl) : "Not set";
  runnerLog(`RPC(env): ${rpcShown}`);
  runnerLog(`Blocks: Will be processed from input file`);
  runnerLog(`Output: ${outputDir}`);
  runnerLog(`DSL: ${dslPath}`);
  runnerLog(`Flush interval: ${options.flushInterval}`);
  if (options.limit) {
    runnerLog(`Limit: ${options.limit}`);
  }
  if (options.resume) {
    runnerLog(`Resume: enabled`);
  }
  runnerLog("=".repeat(80));

  // -----------------------------------------------------------------------
  // Graceful shutdown support
  // -----------------------------------------------------------------------
  let shuttingDown = false;

  const gracefulShutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return; // prevent double-handling
    shuttingDown = true;
    runnerLog(`\nReceived ${signal}. Shutting down gracefully...`);

    try {
      // Flush JSONL -> Parquet
      if (fs.existsSync(violationsJsonlPath)) {
        await ParquetViolationWriter.convertJsonlToParquet(
          violationsJsonlPath,
          reportPath,
          true,
        );
      }
      if (fs.existsSync(skipsJsonlPath)) {
        await ParquetViolationWriter.convertJsonlToParquet(
          skipsJsonlPath,
          skipLogPath,
          false,
        );
      }

      // Save checkpoint
      saveCheckpoint(
        checkpointPath,
        processedSet,
        processedCount,
        violationCount,
        skipCount,
      );

      runnerLog(
        `Shutdown complete. Processed ${processedCount} txs | ` +
          `Violations ${violationCount} | Skips ${skipCount}`,
      );
      runnerLog(`Report: ${reportPath}`);
      runnerLog(`Skip Log: ${skipLogPath}`);
      runnerLog(`Checkpoint: ${checkpointPath}`);
    } catch (err) {
      console.error("Error during graceful shutdown:", err);
    }

    process.exit(0);
  };

  process.on("SIGINT", () => gracefulShutdown("SIGINT"));
  process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));

  // -----------------------------------------------------------------------
  // Transaction processing loop
  // -----------------------------------------------------------------------
  const rl = readline.createInterface({
    input: fs.createReadStream(inputPath),
    crlfDelay: Infinity,
  });

  let txsSinceLastFlush = 0;

  try {
    for await (const line of rl) {
      if (shuttingDown) break;

      const hashes = extractHashes(line);
      for (const hash of hashes) {
        if (shuttingDown) break;
        if (options.limit && processedCount >= options.limit) break;

        // Skip already-processed hashes (resume support)
        if (processedSet.has(hash)) continue;

        process.env.EVANESCA_TX_HASH = hash;
        process.env.EVANESCA_SKIP_TX = "false";

        const context: EvanescaContext = {
          tList: [hash],
          fins: [0],
          reports: [],
          analyzed: new Set<string>(),
          complexity: [],
        };

        const result = await run(hash, context);
        const report = result.reports[0];

        if (report && report._violation.some((v: boolean) => v)) {
          for (let i = 0; i < report._violation.length; i++) {
            if (!report._violation[i]) continue;
            const constraintId = constraintNames[i] || `INDEX_${i}`;
            const record: ViolationRecord = {
              tx_hash: report._hash || hash,
              block_number: report.blockNumber ?? null,
              constraint_id: constraintId,
              evidence: report.evidence || {},
              profit_loss: {
                in_usd: report.totalInUSD || 0,
                out_usd: report.totalOutUSD || 0,
                ratio: report.ratio || 0,
              },
              protocol: report.service || null,
            };
            appendJsonl(violationsJsonlPath, record);
            violationCount++;
          }
        } else {
          if (process.env.EVANESCA_SKIP_TX === "true") {
            const skipRecord: SkipRecord = {
              tx_hash: hash,
              token_name: "unknown",
              token_address: "unknown",
              block_number: report?.blockNumber || 0,
            };
            appendJsonl(skipsJsonlPath, skipRecord);
            skipCount++;
          }
        }

        processedSet.add(hash);
        processedCount++;
        txsSinceLastFlush++;

        // Periodic progress logging
        if (processedCount % 1000 === 0) {
          runnerLog(
            `Processed ${processedCount} txs | Violations ${violationCount} | Skips ${skipCount}`,
          );
        }

        // Save checkpoint every 500 transactions
        if (processedCount % 500 === 0) {
          saveCheckpoint(
            checkpointPath,
            processedSet,
            processedCount,
            violationCount,
            skipCount,
          );
        }

        // Periodic Parquet flush
        if (txsSinceLastFlush >= options.flushInterval) {
          runnerLog(`Flushing JSONL to Parquet at ${processedCount} txs...`);
          if (fs.existsSync(violationsJsonlPath)) {
            await ParquetViolationWriter.convertJsonlToParquet(
              violationsJsonlPath,
              reportPath,
              true,
            );
          }
          if (fs.existsSync(skipsJsonlPath)) {
            await ParquetViolationWriter.convertJsonlToParquet(
              skipsJsonlPath,
              skipLogPath,
              false,
            );
          }
          txsSinceLastFlush = 0;
        }
      }

      if (options.limit && processedCount >= options.limit) break;
    }

    // -----------------------------------------------------------------
    // Final flush
    // -----------------------------------------------------------------
    if (!shuttingDown) {
      if (fs.existsSync(violationsJsonlPath)) {
        await ParquetViolationWriter.convertJsonlToParquet(
          violationsJsonlPath,
          reportPath,
          true,
        );
      }
      if (fs.existsSync(skipsJsonlPath)) {
        await ParquetViolationWriter.convertJsonlToParquet(
          skipsJsonlPath,
          skipLogPath,
          false,
        );
      }

      // Final checkpoint save
      saveCheckpoint(
        checkpointPath,
        processedSet,
        processedCount,
        violationCount,
        skipCount,
      );

      runnerLog(
        `\nDone. Processed ${processedCount} txs | Violations ${violationCount} | Skips ${skipCount}`,
      );
      runnerLog(`Report: ${reportPath}`);
      runnerLog(`Skip Log: ${skipLogPath}`);
      runnerLog(`Checkpoint: ${checkpointPath}`);
    }
  } catch (error) {
    // Emergency checkpoint save on error
    saveCheckpoint(
      checkpointPath,
      processedSet,
      processedCount,
      violationCount,
      skipCount,
    );
    console.error("Large-scale runner failed:", error);
    runnerWarn(`Emergency checkpoint saved (${processedCount} txs processed).`);
    process.exit(1);
  }
}

async function processInput(): Promise<void> {
  await main();
}

processInput();
