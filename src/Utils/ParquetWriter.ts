import { ParquetSchema, ParquetWriter } from "parquetjs-lite";

export interface ViolationRecord {
  tx_hash: string;
  block_number: number | null;
  constraint_id: string;
  evidence: Record<string, any>;
  profit_loss: {
    in_usd: number;
    out_usd: number;
    ratio: number;
  };
  protocol: string | null;
}

export interface SkipRecord {
  tx_hash: string;
  token_name: string;
  token_address: string;
  block_number: number;
}

const violationSchema = new ParquetSchema({
  tx_hash: { type: "UTF8" },
  block_number: { type: "INT64", optional: true },
  constraint_id: { type: "UTF8" },
  evidence: { type: "UTF8" },
  in_usd: { type: "DOUBLE" },
  out_usd: { type: "DOUBLE" },
  ratio: { type: "DOUBLE" },
  protocol: { type: "UTF8", optional: true },
});

const skipSchema = new ParquetSchema({
  tx_hash: { type: "UTF8" },
  token_name: { type: "UTF8" },
  token_address: { type: "UTF8" },
  block_number: { type: "INT64" },
});

export class ParquetViolationWriter {
  /**
   * Write violations to Parquet file
   */
  static async writeViolations(
    violations: ViolationRecord[],
    outputPath: string,
  ): Promise<void> {
    const writer = await ParquetWriter.openFile(violationSchema, outputPath);

    for (const v of violations) {
      await writer.appendRow({
        tx_hash: v.tx_hash,
        block_number: v.block_number ?? 0,
        constraint_id: v.constraint_id,
        evidence: JSON.stringify(v.evidence),
        in_usd: v.profit_loss.in_usd,
        out_usd: v.profit_loss.out_usd,
        ratio: v.profit_loss.ratio,
        protocol: v.protocol ?? "",
      });
    }

    await writer.close();
    console.log(`Wrote ${violations.length} violations to ${outputPath}`);
  }

  /**
   * Write price skip records to Parquet file
   */
  static async writeSkips(
    skips: SkipRecord[],
    outputPath: string,
  ): Promise<void> {
    const writer = await ParquetWriter.openFile(skipSchema, outputPath);

    for (const s of skips) {
      await writer.appendRow({
        tx_hash: s.tx_hash,
        token_name: s.token_name,
        token_address: s.token_address,
        block_number: s.block_number,
      });
    }

    await writer.close();
    console.log(`Wrote ${skips.length} skip records to ${outputPath}`);
  }

  /**
   * Convert JSONL to Parquet for storage reduction
   */
  static async convertJsonlToParquet(
    inputPath: string,
    outputPath: string,
    isViolations: boolean,
  ): Promise<void> {
    const fs = require("fs");
    const readline = require("readline");

    const schema = isViolations ? violationSchema : skipSchema;
    const writer = await ParquetWriter.openFile(schema, outputPath);

    const fileStream = fs.createReadStream(inputPath);
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity,
    });

    let processed = 0;
    for await (const line of rl) {
      const record = JSON.parse(line);

      if (isViolations) {
        await writer.appendRow({
          tx_hash: record.tx_hash,
          block_number: record.block_number ?? 0,
          constraint_id: record.constraint_id,
          evidence:
            typeof record.evidence === "string"
              ? record.evidence
              : JSON.stringify(record.evidence),
          in_usd: record.profit_loss?.in_usd ?? record.in_usd ?? 0,
          out_usd: record.profit_loss?.out_usd ?? record.out_usd ?? 0,
          ratio: record.profit_loss?.ratio ?? record.ratio ?? 0,
          protocol: record.protocol ?? "",
        });
      } else {
        await writer.appendRow(record);
      }

      processed++;
      if (processed % 10000 === 0) {
        console.log(`Processed ${processed} records...`);
      }
    }

    await writer.close();
    console.log(
      `Converted ${processed} records from JSONL to Parquet: ${outputPath}`,
    );
  }
}
