/// <reference types="mocha" />
import { expect } from "chai";
import { preTasksForRegressionTest } from "../../../PreTasks";
import "../shared/testSetup";

preTasksForRegressionTest();

describe("TEND pool identification", () => {
  it("Identify pool 0xcfb8cf118b... factory + token0/token1", async () => {
    const { web3 } = await import("../../../PreTasks");
    const poolAddr = "0xcfb8cf118b4f0abb2e8ce6dbeb90d6bc0a62693d";
    const blockNo = 13338895;

    // Selector-based eth_call to avoid ABI decoding mismatches
    async function call(selector: string): Promise<string> {
      const result = await web3.eth.call(
        { to: poolAddr, data: selector },
        blockNo,
      );
      return "0x" + (result as string).slice(-40);
    }
    const t0 = await call("0x0dfe1681"); // token0()
    const t1 = await call("0xd21220a7"); // token1()
    let factory: string;
    try {
      factory = await call("0xc45a0155"); // factory()
    } catch (e) {
      factory = `error: ${(e as Error).message}`;
    }

    console.log(`\n========= TEND POOL IDENTIFICATION =========`);
    console.log(`Pool addr: ${poolAddr}`);
    console.log(`token0:    ${t0}`);
    console.log(`token1:    ${t1}`);
    console.log(`factory:   ${factory}`);
    console.log(`UniV2 factory: 0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f`);
    console.log(`Sushi V2 factory: 0xC0AEe478e3658e2610c5F7A4A2E1777cE9e4f2Ac`);
    console.log(`============================================\n`);
    expect(t0).to.be.a("string");
  });
});
