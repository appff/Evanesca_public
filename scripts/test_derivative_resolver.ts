import { preTasksForRegressionTest } from "../src/PreTasks";
import "../src/test/attacks/shared/testSetup";

preTasksForRegressionTest();

async function main() {
  const { OnChainPriceResolver, RateLimiter } = await import(
    "../src/Utils/PriceManager/OnChainPriceResolver"
  );
  const { PersistentPriceCache } = await import(
    "../src/Utils/PriceManager/PersistentPriceCache"
  );

  const cache = new PersistentPriceCache("./cache/price_cache.db");
  const r = new OnChainPriceResolver(cache, new RateLimiter(3));

  const tokens = [
    { addr: "0x797AAB1ce7c01eB727ab980762bA88e7133d2157", sym: "crUSDT" },
    { addr: "0x44fbeBd2F576670a6C33f6Fc0B00aA8c5753b322", sym: "crUSDC" },
    { addr: "0xd6aD7a6750A7593E092a9B218d66C0A814a3436e", sym: "yUSDC" },
    { addr: "0x83f798e925BcD4017Eb265844FDDAbb448f1707D", sym: "yUSDT" },
    { addr: "0x1FF8CDB51219a8838b52E9cAc09b71e591BC998e", sym: "crBUSD" },
    { addr: "0x73a052500105205d34Daf004eAb301916DA8190f", sym: "yTUSD" },
    { addr: "0x5dbcF33D8c2E976c6b560249878e6F1491Bca25c", sym: "yyCRV" },
  ];

  const block = 11074915; // CreamY attack era

  for (const t of tokens) {
    try {
      const px = await r.getPrice(t.addr, t.sym, block);
      console.log(`${t.sym.padEnd(10)} ${t.addr}  -> $${px}`);
    } catch (e) {
      console.log(`${t.sym}  ERROR: ${(e as Error).message}`);
    }
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
