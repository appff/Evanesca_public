#!/usr/bin/env npx ts-node

import fs from "fs";
import path from "path";
import { getSemanticEventFilter } from "./SemanticEventFilter";

import dotenv from "dotenv";
dotenv.config();

function kstTimestamp(): string {
  return new Date().toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function log(...args: unknown[]): void {
  console.log(`[${kstTimestamp()}]`, ...args);
}

function warn(...args: unknown[]): void {
  console.warn(`[${kstTimestamp()}]`, ...args);
}

function logError(...args: unknown[]): void {
  console.error(`[${kstTimestamp()}]`, ...args);
}

const DEFAULT_INFURA_URL =
  "https://eth-mainnet.public.blastapi.io";
const CREDITS_PER_DAY = 15_000_000;
const CREDITS_PER_SECOND = 4_000;
const CREDITS_PER_BLOCK_RECEIPTS = 30;
const CHECKPOINT_INTERVAL = 500;
const PROGRESS_LOG_INTERVAL = 1000;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

interface CLIOptions {
  startBlock: number;
  endBlock: number;
  outputDir: string;
  rps: number;
  resume: boolean;
  dryRun: boolean;
  concurrency: number;
}

interface CheckpointData {
  lastBlock: number;
  endBlock: number;
  startedAt: string;
  lastUpdatedAt: string;
  stats: IngestStats;
}

interface IngestStats {
  blocksProcessed: number;
  totalTxs: number;
  filteredTxs: number;
  rpcCalls: number;
  creditsUsed: number;
  filterRate: number;
}

interface FilteredReceipt {
  txHash: string;
  blockNumber: number;
  timestamp: number;
  from: string;
  to: string | null;
  gasUsed: string;
  status: boolean;
  logsCount: number;
}

function parseArgs(): CLIOptions {
  const args = process.argv.slice(2);
  const options: CLIOptions = {
    startBlock: -1,
    endBlock: -1,
    outputDir: "large-scale-ingest",
    rps: 100,
    resume: false,
    dryRun: false,
    concurrency: 10,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--start":
      case "-s":
        options.startBlock = parseInt(args[++i], 10);
        break;
      case "--end":
      case "-e":
        options.endBlock = parseInt(args[++i], 10);
        break;
      case "--output":
      case "-o":
        options.outputDir = args[++i];
        break;
      case "--rps":
        options.rps = parseFloat(args[++i]);
        break;
      case "--resume":
        options.resume = true;
        break;
      case "--dry-run":
        options.dryRun = true;
        break;
      case "--concurrency":
      case "-c":
        options.concurrency = parseInt(args[++i], 10);
        break;
      case "--help":
      case "-h":
        printHelp();
        process.exit(0);
      default:
        if (args[i].startsWith("--")) {
          warn(`Unknown option: ${args[i]}`);
        }
    }
  }

  if (!options.resume && (options.startBlock < 0 || options.endBlock < 0)) {
    logError("--start and --end are required unless --resume is set");
    printHelp();
    process.exit(1);
  }

  if (options.startBlock > options.endBlock && options.endBlock >= 0) {
    logError("start block must be <= end block");
    process.exit(1);
  }

  return options;
}

function printHelp(): void {
  console.log(`
Large-Scale Semantic Event Ingest

Filters and stores only transactions containing events that our semantic model can decode.
Uses Infura with rate limiting (10M credits/day, 4K credits/sec).

Usage:
  npx ts-node src/VerificationTools/runLargeScaleIngest.ts --start <block> --end <block> [options]

Options:
  --start, -s <block>     Start block (inclusive)
  --end, -e <block>       End block (inclusive)
  --output, -o <dir>      Output directory (default: large-scale-ingest)
  --rps <number>          Max RPC requests per second (default: 100)
  --concurrency, -c <n>   Parallel block processing (default: 10)
  --resume                Resume from last checkpoint
  --dry-run               Simulate without writing files
  --help, -h              Show this help

Examples:
  # Full 2023-2025 ingest
  npx ts-node src/VerificationTools/runLargeScaleIngest.ts --start 15049030 --end 21500000

  # Resume interrupted ingest
  npx ts-node src/VerificationTools/runLargeScaleIngest.ts --resume

  # Dry run to estimate filtering rate
  npx ts-node src/VerificationTools/runLargeScaleIngest.ts --start 20000000 --end 20001000 --dry-run
`);
}

function isPlaceholder(value?: string): boolean {
  if (!value) return true;
  return (
    value.includes("your-") ||
    value.includes("your_infura") ||
    value.includes("project-id-here")
  );
}

function requireRpcUrl(): string {
  // Prefer full URL overrides when available (often provided via export).
  const infuraEthUrl = process.env.INFURA_ETH_URL;
  if (infuraEthUrl && !isPlaceholder(infuraEthUrl)) return infuraEthUrl;

  const infuraUrl = process.env.INFURA_URL;
  if (infuraUrl && !isPlaceholder(infuraUrl)) return infuraUrl;

  // Infura "API key" is effectively the Project ID in /v3/<id> JSON-RPC URLs.
  const infuraProjectId =
    process.env.INFURA_PROJECT_ID ||
    process.env.INFURA_API_KEY ||
    process.env.INFURA_KEY;
  if (infuraProjectId && !isPlaceholder(infuraProjectId)) {
    return `https://mainnet.infura.io/v3/${infuraProjectId}`;
  }

  return DEFAULT_INFURA_URL;
}

function redactRpcUrl(url: string): string {
  try {
    const u = new URL(url);
    const redactedPath = u.pathname.replace(/\/v3\/[^/]+/g, "/v3/<redacted>");
    return `${u.protocol}//${u.host}${redactedPath}`;
  } catch {
    return url.replace(/(\/v3\/)[^/]+/g, "$1<redacted>");
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class RateLimiter {
  private tokens: number;
  private lastRefill: number;
  private dailyCredits: number = 0;
  private dayStart: number = Date.now();
  private readonly maxTokens: number;
  private readonly refillRate: number;

  constructor(rps: number) {
    this.maxTokens = rps;
    this.tokens = rps;
    this.refillRate = 1000 / rps;
    this.lastRefill = Date.now();
  }

  async acquire(credits: number = 1): Promise<void> {
    this.refillTokens();

    if (this.tokens < 1) {
      const waitTime = this.refillRate;
      await sleep(waitTime);
      this.refillTokens();
    }

    this.tokens -= 1;
    this.dailyCredits += credits;

    if (Date.now() - this.dayStart > 86400000) {
      this.dayStart = Date.now();
      this.dailyCredits = 0;
    }
  }

  private refillTokens(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    const tokensToAdd = elapsed / this.refillRate;
    this.tokens = Math.min(this.maxTokens, this.tokens + tokensToAdd);
    this.lastRefill = now;
  }

  getDailyCredits(): number {
    return this.dailyCredits;
  }

  getRemainingDailyCredits(): number {
    return CREDITS_PER_DAY - this.dailyCredits;
  }
}

async function callRpc<T>(
  rpcUrl: string,
  method: string,
  params: any[],
): Promise<T> {
  const payload = {
    jsonrpc: "2.0",
    id: Date.now(),
    method,
    params,
  };

  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const json = await response.json();
  if (json.error) {
    throw new Error(json.error.message || JSON.stringify(json.error));
  }

  return json.result as T;
}

function getMonthKey(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function loadCheckpoint(checkpointPath: string): CheckpointData | null {
  if (!fs.existsSync(checkpointPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(checkpointPath, "utf8"));
  } catch {
    return null;
  }
}

function saveCheckpoint(checkpointPath: string, data: CheckpointData): void {
  data.lastUpdatedAt = new Date().toISOString();
  fs.writeFileSync(checkpointPath, JSON.stringify(data, null, 2));
}

async function processBlockBatch(
  rpcUrl: string,
  blockNumbers: number[],
  rateLimiter: RateLimiter,
  filter: ReturnType<typeof getSemanticEventFilter>,
): Promise<{
  filteredReceipts: Map<number, FilteredReceipt[]>;
  blockTimestamps: Map<number, number>;
  stats: { totalTxs: number; filteredTxs: number; rpcCalls: number };
}> {
  const filteredReceipts = new Map<number, FilteredReceipt[]>();
  const blockTimestamps = new Map<number, number>();
  let totalTxs = 0;
  let filteredTxs = 0;
  let rpcCalls = 0;

  const blockPromises = blockNumbers.map(async (blockNo) => {
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      await rateLimiter.acquire(CREDITS_PER_BLOCK_RECEIPTS);
      rpcCalls++;

      try {
        const receipts = await callRpc<any[]>(rpcUrl, "eth_getBlockReceipts", [
          "0x" + blockNo.toString(16),
        ]);

        if (!receipts || receipts.length === 0) {
          return { blockNo, receipts: [], timestamp: 0 };
        }

        const block = await callRpc<any>(rpcUrl, "eth_getBlockByNumber", [
          "0x" + blockNo.toString(16),
          false,
        ]);
        rpcCalls++;
        const timestamp = block?.timestamp ? parseInt(block.timestamp, 16) : 0;

        const filtered = receipts.filter((r) => filter.hasDecodableEvents(r));

        return {
          blockNo,
          receipts: filtered,
          timestamp,
          totalInBlock: receipts.length,
        };
      } catch (error: any) {
        // Handle HTTP 429 Too Many Requests
        if (
          error.message.includes("429") ||
          error.message.includes("Too Many Requests")
        ) {
          // If we hit provider-side quota limits (often surfaced as HTTP 429),
          // backing off for a full day avoids tight retry loops.
          const cooldown = 43200000; // 12 hours
          warn(
            `⚠️  HTTP 429 detected at block ${blockNo}. Cooling down for ${cooldown / 1000}s...`,
          );
          await sleep(cooldown);
          // Don't count 429 as a retry attempt, or use a separate counter if needed
          // For now, let's just retry
          attempt--; // Decrement attempt to retry indefinitely for 429 or until manual stop
          if (attempt < 0) attempt = 0; // Safety
          continue;
        }

        if (attempt < MAX_RETRIES) {
          // Exponential backoff for other errors: 1s, 2s, 4s...
          const delay = RETRY_DELAY_MS * Math.pow(2, attempt - 1);
          await sleep(delay);
          continue;
        }
        warn(
          `Failed block ${blockNo} after ${MAX_RETRIES} retries: ${error.message}`,
        );
        return { blockNo, receipts: [], timestamp: 0 };
      }
    }
    return { blockNo, receipts: [], timestamp: 0 };
  });

  const results = await Promise.all(blockPromises);

  for (const result of results) {
    if (result.timestamp) {
      blockTimestamps.set(result.blockNo, result.timestamp);
    }

    totalTxs += (result as any).totalInBlock || 0;

    if (result.receipts.length > 0) {
      filteredTxs += result.receipts.length;

      const mapped: FilteredReceipt[] = result.receipts.map((r: any) => ({
        txHash: r.transactionHash,
        blockNumber: result.blockNo,
        timestamp: result.timestamp,
        from: r.from,
        to: r.to,
        gasUsed: r.gasUsed,
        status: r.status === "0x1",
        logsCount: r.logs?.length || 0,
      }));

      filteredReceipts.set(result.blockNo, mapped);
    }
  }

  return {
    filteredReceipts,
    blockTimestamps,
    stats: { totalTxs, filteredTxs, rpcCalls },
  };
}

async function main(): Promise<void> {
  const options = parseArgs();
  const rpcUrl = requireRpcUrl();

  const outputDir = path.resolve(process.cwd(), options.outputDir);
  fs.mkdirSync(outputDir, { recursive: true });

  const checkpointPath = path.join(outputDir, "checkpoint.json");
  const filter = getSemanticEventFilter();
  filter.initialize();

  let startBlock = options.startBlock;
  let endBlock = options.endBlock;
  let stats: IngestStats = {
    blocksProcessed: 0,
    totalTxs: 0,
    filteredTxs: 0,
    rpcCalls: 0,
    creditsUsed: 0,
    filterRate: 0,
  };

  if (options.resume) {
    const checkpoint = loadCheckpoint(checkpointPath);
    if (checkpoint) {
      startBlock = checkpoint.lastBlock + 1;
      endBlock = checkpoint.endBlock;
      stats = checkpoint.stats;
      log(`Resuming from block ${startBlock} (end ${endBlock})`);
      log(
        `Previous stats: ${stats.filteredTxs}/${stats.totalTxs} txs filtered (${(stats.filterRate * 100).toFixed(2)}%)`,
      );
    } else {
      logError(
        "No checkpoint found. Use --start and --end to begin a new ingest.",
      );
      process.exit(1);
    }
  }

  const rateLimiter = new RateLimiter(options.rps);
  const streamMap = new Map<string, fs.WriteStream>();
  const startTime = Date.now();

  log("=".repeat(80));
  log("EVANESCA LARGE-SCALE SEMANTIC INGEST");
  log("=".repeat(80));
  log(`RPC: ${redactRpcUrl(rpcUrl)}`);
  log(
    `Blocks: ${startBlock} -> ${endBlock} (${endBlock - startBlock + 1} blocks)`,
  );
  log(`Output: ${outputDir}`);
  log(`Dry run: ${options.dryRun ? "Yes" : "No"}`);
  log(`Concurrency: ${options.concurrency} blocks/batch`);
  log(`RPS limit: ${options.rps}`);

  const filterStats = filter.getStats();
  log(
    `Semantic filter: ${filterStats.uniqueTopics} event topics from ${filterStats.services} services`,
  );
  log("=".repeat(80));

  const totalBlocks = endBlock - startBlock + 1;
  const estimatedDays =
    (totalBlocks * CREDITS_PER_BLOCK_RECEIPTS * 2) / CREDITS_PER_DAY;
  log(
    `\nEstimated time: ${estimatedDays.toFixed(2)} days (at ${CREDITS_PER_DAY.toLocaleString()} credits/day)`,
  );

  let currentBlock = startBlock;

  while (currentBlock <= endBlock) {
    const batchEnd = Math.min(currentBlock + options.concurrency - 1, endBlock);
    const blockNumbers = Array.from(
      { length: batchEnd - currentBlock + 1 },
      (_, i) => currentBlock + i,
    );

    const {
      filteredReceipts,
      blockTimestamps,
      stats: batchStats,
    } = await processBlockBatch(rpcUrl, blockNumbers, rateLimiter, filter);

    stats.blocksProcessed += blockNumbers.length;
    stats.totalTxs += batchStats.totalTxs;
    stats.filteredTxs += batchStats.filteredTxs;
    stats.rpcCalls += batchStats.rpcCalls;
    stats.creditsUsed = rateLimiter.getDailyCredits();
    stats.filterRate =
      stats.totalTxs > 0 ? stats.filteredTxs / stats.totalTxs : 0;

    if (!options.dryRun) {
      for (const [blockNo, receipts] of filteredReceipts) {
        const timestamp = blockTimestamps.get(blockNo) || 0;
        const monthKey = getMonthKey(timestamp);

        if (!streamMap.has(monthKey)) {
          const monthPath = path.join(outputDir, `receipts-${monthKey}.jsonl`);
          streamMap.set(
            monthKey,
            fs.createWriteStream(monthPath, { flags: "a" }),
          );
        }

        const stream = streamMap.get(monthKey)!;
        for (const receipt of receipts) {
          stream.write(JSON.stringify(receipt) + "\n");
        }
      }
    }

    if (
      stats.blocksProcessed % CHECKPOINT_INTERVAL === 0 ||
      currentBlock + options.concurrency > endBlock
    ) {
      const checkpointData: CheckpointData = {
        lastBlock: batchEnd,
        endBlock,
        startedAt: options.resume
          ? "resumed"
          : new Date(startTime).toISOString(),
        lastUpdatedAt: new Date().toISOString(),
        stats,
      };
      saveCheckpoint(checkpointPath, checkpointData);
    }

    if (
      stats.blocksProcessed % PROGRESS_LOG_INTERVAL === 0 ||
      currentBlock === startBlock
    ) {
      const elapsed = (Date.now() - startTime) / 1000;
      const blocksPerSec = stats.blocksProcessed / elapsed;
      const remaining = (endBlock - batchEnd) / blocksPerSec;

      log(
        `Block ${batchEnd.toLocaleString()} | ` +
          `${stats.filteredTxs.toLocaleString()}/${stats.totalTxs.toLocaleString()} txs ` +
          `(${(stats.filterRate * 100).toFixed(1)}%) | ` +
          `${blocksPerSec.toFixed(1)} blk/s | ` +
          `ETA: ${(remaining / 3600).toFixed(1)}h`,
      );
    }

    currentBlock = batchEnd + 1;

    if (
      rateLimiter.getRemainingDailyCredits() <
      CREDITS_PER_BLOCK_RECEIPTS * options.concurrency * 10
    ) {
      log(
        "\nApproaching daily credit limit. Pausing until tomorrow...",
      );
      const msUntilMidnight = 86400000 - (Date.now() % 86400000);
      await sleep(msUntilMidnight + 60000);
    }

    // Add small delay between batches to reduce system load
    await sleep(200);
  }

  for (const stream of streamMap.values()) {
    stream.end();
  }

  const totalElapsed = (Date.now() - startTime) / 1000;

  log("\n" + "=".repeat(80));
  log("INGEST COMPLETE");
  log("=".repeat(80));
  log(`Blocks processed: ${stats.blocksProcessed.toLocaleString()}`);
  log(`Total transactions: ${stats.totalTxs.toLocaleString()}`);
  log(
    `Filtered transactions: ${stats.filteredTxs.toLocaleString()} (${(stats.filterRate * 100).toFixed(2)}%)`,
  );
  log(`RPC calls: ${stats.rpcCalls.toLocaleString()}`);
  log(`Time elapsed: ${(totalElapsed / 3600).toFixed(2)} hours`);
  log(
    `Throughput: ${(stats.blocksProcessed / totalElapsed).toFixed(1)} blocks/sec`,
  );
  log(`Output directory: ${outputDir}`);
}

main().catch((error) => {
  logError("Ingest failed:", error);
  process.exit(1);
});
