import * as sqlite3 from "sqlite3";
const Database = sqlite3.Database;

// Extended Logger class to avoid private constructor issues
export class PublicLogger {
  private prefix: string;
  private level: "DEBUG" | "INFO" | "ERROR";

  constructor(prefix: string) {
    this.prefix = prefix;
    const quiet = process.env.EVANESCA_QUIET === "true";
    const envLevel = (process.env.PRICE_CACHE_LOG_LEVEL || "").toUpperCase();
    if (envLevel === "DEBUG" || envLevel === "INFO" || envLevel === "ERROR") {
      this.level = envLevel;
    } else {
      // Default: keep large-scale runs quiet unless explicitly enabled.
      this.level = quiet ? "ERROR" : "INFO";
    }
  }

  info(message: string): void {
    if (this.level === "DEBUG" || this.level === "INFO") {
      console.log(`[${this.prefix}] ${message}`);
    }
  }

  debug(message: string): void {
    if (this.level === "DEBUG") {
      console.log(`[${this.prefix}] DEBUG: ${message}`);
    }
  }

  error(message: string): void {
    // Errors are always printed.
    console.error(`[${this.prefix}] ERROR: ${message}`);
  }
}

export interface PriceCacheEntry {
  token: string;
  block: number;
  price: number;
  timestamp: number;
}

export interface TokenMetadata {
  address: string;
  symbol: string;
  decimals: number;
}

export class PersistentPriceCache {
  private db: sqlite3.Database;
  private logger: PublicLogger;
  private initPromise: Promise<void>;

  constructor(dbPath: string) {
    this.logger = new PublicLogger("PersistentPriceCache");
    this.db = new Database(dbPath);
    this.initPromise = this.initSchema();
  }

  private async initSchema(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.serialize(() => {
        this.db.run(`
          CREATE TABLE IF NOT EXISTS price_cache (
            token TEXT NOT NULL,
            block INTEGER NOT NULL,
            price REAL NOT NULL,
            timestamp INTEGER DEFAULT (strftime('%s', 'now')),
            PRIMARY KEY (token, block)
          );
        `);

        this.db.run(`
          CREATE TABLE IF NOT EXISTS token_metadata (
            address TEXT PRIMARY KEY,
            symbol TEXT NOT NULL,
            decimals INTEGER NOT NULL,
            timestamp INTEGER DEFAULT (strftime('%s', 'now'))
          );
        `);

        this.db.run(`
          CREATE TABLE IF NOT EXISTS pool_cache (
            token_address TEXT NOT NULL,
            pair_token TEXT NOT NULL,
            dex TEXT NOT NULL,
            pool_address TEXT NOT NULL,
            fee_tier INTEGER DEFAULT 0,
            PRIMARY KEY (token_address, pair_token, dex, fee_tier)
          );
        `);

        // Create indexes for performance
        this.db.run(
          `CREATE INDEX IF NOT EXISTS idx_price_cache_token_block ON price_cache(token, block)`,
        );
        this.db.run(
          `CREATE INDEX IF NOT EXISTS idx_token_metadata_address ON token_metadata(address)`,
        );
        this.db.run(
          `CREATE INDEX IF NOT EXISTS idx_pool_cache_token ON pool_cache(token_address)`,
        );

        this.logger.info("PersistentPriceCache: Database schema initialized");
        resolve();
      });
    });
  }

  async getPrice(token: string, block: number): Promise<number> {
    await this.initPromise;

    return new Promise((resolve, reject) => {
      this.db.get(
        "SELECT price FROM price_cache WHERE token = ? AND block = ?",
        [token.toLowerCase(), block],
        (err, row: { price?: number }) => {
          if (err) {
            this.logger.error(`Error getting cached price: ${err.message}`);
            reject(err);
            return;
          }

          if (row && row.price !== null && row.price !== undefined) {
            this.logger.debug(
              `Cache HIT: ${token} at block ${block} = $${row.price}`,
            );
            resolve(row.price);
          } else {
            this.logger.debug(`Cache MISS: ${token} at block ${block}`);
            resolve(0); // Return 0 to indicate "not found"
          }
        },
      );
    });
  }

  async setPrice(token: string, block: number, price: number): Promise<void> {
    await this.initPromise;

    return new Promise((resolve, reject) => {
      this.db.run(
        "INSERT OR REPLACE INTO price_cache (token, block, price) VALUES (?, ?, ?)",
        [token.toLowerCase(), block, price],
        (err) => {
          if (err) {
            this.logger.error(`Error setting cached price: ${err.message}`);
            reject(err);
            return;
          }
          this.logger.debug(
            `Cache SET: ${token} at block ${block} = $${price}`,
          );
          resolve();
        },
      );
    });
  }

  async getTokenMetadata(address: string): Promise<TokenMetadata | null> {
    await this.initPromise;

    return new Promise((resolve, reject) => {
      this.db.get(
        "SELECT symbol, decimals FROM token_metadata WHERE address = ?",
        [address.toLowerCase()],
        (err, row: { symbol?: string; decimals?: number }) => {
          if (err) {
            this.logger.error(`Error getting token metadata: ${err.message}`);
            reject(err);
            return;
          }

          if (row) {
            resolve({
              address: address.toLowerCase(),
              symbol: row.symbol!,
              decimals: row.decimals!,
            });
          } else {
            resolve(null);
          }
        },
      );
    });
  }

  async setTokenMetadata(
    address: string,
    symbol: string,
    decimals: number,
  ): Promise<void> {
    await this.initPromise;

    return new Promise((resolve, reject) => {
      this.db.run(
        "INSERT OR REPLACE INTO token_metadata (address, symbol, decimals) VALUES (?, ?, ?)",
        [address.toLowerCase(), symbol, decimals],
        (err) => {
          if (err) {
            this.logger.error(`Error setting token metadata: ${err.message}`);
            reject(err);
            return;
          }
          this.logger.debug(
            `Metadata SET: ${address} = ${symbol} (${decimals} decimals)`,
          );
          resolve();
        },
      );
    });
  }

  async getCacheStats(): Promise<{
    priceEntries: number;
    tokenEntries: number;
  }> {
    await this.initPromise;

    return new Promise((resolve, reject) => {
      this.db.get(
        "SELECT COUNT(*) as priceEntries FROM price_cache UNION ALL SELECT COUNT(*) as tokenEntries FROM token_metadata",
        [],
        (err, row: { priceEntries?: number; tokenEntries?: number }) => {
          if (err) {
            reject(err);
            return;
          }
          resolve({
            priceEntries: row.priceEntries || 0,
            tokenEntries: row.tokenEntries || 0,
          });
        },
      );
    });
  }

  async getPool(
    tokenAddress: string,
    pairToken: string,
    dex: string,
    feeTier: number = 0,
  ): Promise<string | null> {
    await this.initPromise;

    return new Promise((resolve, reject) => {
      this.db.get(
        "SELECT pool_address FROM pool_cache WHERE token_address = ? AND pair_token = ? AND dex = ? AND fee_tier = ?",
        [tokenAddress.toLowerCase(), pairToken.toLowerCase(), dex, feeTier],
        (err, row: { pool_address?: string }) => {
          if (err) {
            this.logger.error(`Error getting pool: ${err.message}`);
            reject(err);
            return;
          }
          resolve(row?.pool_address || null);
        },
      );
    });
  }

  async setPool(
    tokenAddress: string,
    pairToken: string,
    dex: string,
    poolAddress: string,
    feeTier: number = 0,
  ): Promise<void> {
    await this.initPromise;

    return new Promise((resolve, reject) => {
      this.db.run(
        "INSERT OR REPLACE INTO pool_cache (token_address, pair_token, dex, pool_address, fee_tier) VALUES (?, ?, ?, ?, ?)",
        [
          tokenAddress.toLowerCase(),
          pairToken.toLowerCase(),
          dex,
          poolAddress.toLowerCase(),
          feeTier,
        ],
        (err) => {
          if (err) {
            this.logger.error(`Error setting pool: ${err.message}`);
            reject(err);
            return;
          }
          this.logger.debug(
            `Pool SET: ${tokenAddress}/${pairToken} on ${dex} = ${poolAddress}`,
          );
          resolve();
        },
      );
    });
  }

  async clear(): Promise<void> {
    await this.initPromise;

    return new Promise((resolve, reject) => {
      this.db.serialize(() => {
        this.db.run("DELETE FROM price_cache", (err) => {
          if (err) {
            this.logger.error(`Error clearing price_cache: ${err.message}`);
            reject(err);
            return;
          }
        });
        this.db.run("DELETE FROM token_metadata", (err) => {
          if (err) {
            this.logger.error(
              `Error clearing token_metadata: ${err.message}`,
            );
            reject(err);
            return;
          }
        });
        this.db.run("DELETE FROM pool_cache", (err) => {
          if (err) {
            this.logger.error(
              `Error clearing pool_cache: ${err.message}`,
            );
            reject(err);
            return;
          }
          this.logger.info("PersistentPriceCache: All caches cleared");
          resolve();
        });
      });
    });
  }

  get size(): number {
    // Synchronous size estimate - returns 0 initially, use getSizeAsync for accurate count
    return 0;
  }

  async getSizeAsync(): Promise<number> {
    await this.initPromise;

    return new Promise((resolve, reject) => {
      this.db.get(
        "SELECT COUNT(*) as cnt FROM price_cache",
        [],
        (err, row: { cnt?: number }) => {
          if (err) {
            this.logger.error(`Error getting cache size: ${err.message}`);
            reject(err);
            return;
          }
          resolve(row?.cnt || 0);
        },
      );
    });
  }

  async cleanup(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.close((err) => {
        if (err) {
          this.logger.error(`Error closing database: ${err.message}`);
          reject(err);
        } else {
          this.logger.info("PersistentPriceCache: Database connection closed");
          resolve();
        }
      });
    });
  }
}
