/**
 * Probe WING token: find its UniV2 pool and verify on-chain price.
 */
import { preTasksForRegressionTest } from "../src/PreTasks";
import "../src/test/attacks/shared/testSetup";

preTasksForRegressionTest();

async function main() {
  const { web3 } = await import("../src/PreTasks");
  const { OnChainPriceResolver, RateLimiter } = await import(
    "../src/Utils/PriceManager/OnChainPriceResolver"
  );
  const { PersistentPriceCache } = await import(
    "../src/Utils/PriceManager/PersistentPriceCache"
  );

  const WING = "0xcB3df3108635932D912632ef7132d03EcFC39080"; // Wings (WING) chicken-icon
  const WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
  const UNI_V2_FACTORY = "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f";

  // Query factory.getPair(WING, WETH)
  // selector = keccak256("getPair(address,address)") -> 0xe6a43905
  const params =
    "0x" +
    WING.slice(2).toLowerCase().padStart(64, "0") +
    WETH.slice(2).toLowerCase().padStart(64, "0");
  const data = "0xe6a43905" + params.slice(2);
  const result = await web3.eth.call({ to: UNI_V2_FACTORY, data });
  const poolAddr = "0x" + (result as string).slice(-40);

  console.log(`\n========= WING POOL PROBE =========`);
  console.log(`WING token:  ${WING}`);
  console.log(`WETH token:  ${WETH}`);
  console.log(`Univ2 pair:  ${poolAddr}`);
  if (poolAddr === "0x0000000000000000000000000000000000000000") {
    console.log("  -> pool does not exist on UniV2");
  }

  // Verify on-chain price at a 2020 era block
  const cache = new PersistentPriceCache("./cache/price_cache.db");
  const resolver = new OnChainPriceResolver(cache, new RateLimiter(3));
  const blocksToTry = [11000000, 11500000, 12000000, 12500000];
  for (const b of blocksToTry) {
    try {
      const price = await resolver.getPrice(WING, "WING", b);
      console.log(`OnChainResolver WING @ ${b}: $${price}`);
    } catch (e) {
      console.log(`error @ ${b}: ${(e as Error).message}`);
    }
  }
  console.log(`====================================\n`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
