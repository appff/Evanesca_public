/// <reference types="mocha" />
import { expect } from "chai";
import { preTasksForRegressionTest } from "../../../PreTasks";
import "../shared/testSetup";

preTasksForRegressionTest();

describe("TEND/WING price probe", () => {
  it("CascadingPriceManager + OnChainPriceResolver: TEND/WING prices at block 11023147", async () => {
    // Lazy import to avoid load-time circular issues
    const { CascadingPriceManager } = await import(
      "../../../Utils/PriceManager/CascadingPriceManager"
    );
    const { OnChainPriceResolver, RateLimiter } = await import(
      "../../../Utils/PriceManager/OnChainPriceResolver"
    );
    const { PersistentPriceCache } = await import(
      "../../../Utils/PriceManager/PersistentPriceCache"
    );

    const blockNo = 13338895; // actual TEND attack block (paper Figure 4 tx)
    const tendAddr = "0x1453Dbb8A29551ADe11D89825CA812e05317EAEB";
    const wingAddr = "0x667088b212ce3d06a1b553a7221E1fD19000d9aF"; // not yet verified

    console.log("\n========= TEND/WING PRICE PROBE =========");

    // 1) CascadingPriceManager (full chain)
    const cascading = new CascadingPriceManager();
    const tendCascade = await cascading.getPrice("TEND", blockNo, tendAddr);
    console.log(`[CascadingPriceManager] TEND @ ${blockNo}: $${tendCascade}`);

    // 2) Direct OnChainPriceResolver
    const cache = new PersistentPriceCache("./cache/price_cache.db");
    const resolver = new OnChainPriceResolver(cache, new RateLimiter(3));

    const tendDirect = await resolver.getPrice(tendAddr, "TEND", blockNo);
    console.log(`[OnChainPriceResolver] TEND @ ${blockNo}: $${tendDirect}`);

    const wingDirect = await resolver.getPrice(wingAddr, "WING", blockNo);
    console.log(`[OnChainPriceResolver] WING @ ${blockNo}: $${wingDirect}`);

    console.log("=========================================\n");

    expect(tendDirect).to.be.a("number");
  });
});
