/// <reference types="mocha" />
import { expect } from "chai";
import { run } from "../../../Driver";
import { preTasksForRegressionTest } from "../../../PreTasks";
import { EvanescaContext } from "../../../Interfaces/EvanescaContext";
import { AnalysisResult } from "../../../ConstraintSolver/Interfaces/AnalysisResult";
import "../shared/testSetup";

preTasksForRegressionTest();
const cntx: EvanescaContext = {
  tList: [],
  analyzed: new Set<string>(),
  reports: new Array<AnalysisResult>(),
  fins: new Array<number>(),
  complexity: new Array<number>(),
};

describe("TEND reward-distribution probe", () => {
  it("paper Figure 4 TEND tx triggers any constraint?", async () => {
    const txHash =
      "0x3ac3628bd0cf7e52fc2c32e5a6ef24bb223bd4e6ffa0b7baab99de79b969524b";
    const res = await run(txHash, cntx);
    console.log("\n========= TEND TX ANALYSIS =========");
    console.log("Tx:", txHash);
    console.log("Result undefined?", res === undefined);
    if (res) {
      console.log("Number of reports:", res.reports.length);
      for (let i = 0; i < res.reports.length; i++) {
        const r = res.reports[i];
        const violation = (r as any)._violation;
        const fired = violation
          ? violation.map((v: boolean, idx: number) => (v ? idx : -1)).filter((idx: number) => idx >= 0)
          : [];
        console.log(`\n--- Report #${i} ---`);
        console.log(`  fired indices: [${fired.join(", ")}]`);
        console.log(`  full violation:`, violation);
        // Dump key edge fields if present
        const edges = (r as any)._edges || (r as any).edges || (r as any)._traces;
        if (edges) {
          console.log(`  edges count:`, Array.isArray(edges) ? edges.length : "not array");
          if (Array.isArray(edges)) {
            edges.slice(0, 10).forEach((e: any, j: number) => {
              console.log(`    edge#${j}:`, JSON.stringify({
                type: e.type || e.Type,
                Token0: e.Token0,
                Token1: e.Token1,
                Token0Addr: e.Token0Addr,
                Token1Addr: e.Token1Addr,
                AmountIn: e.AmountIn,
                AmountOut: e.AmountOut,
                totalInUSD: e.totalInUSD,
                totalOutUSD: e.totalOutUSD,
                price_ratio: e.totalOutUSD && e.totalInUSD ? (e.totalOutUSD / e.totalInUSD) : "n/a",
              }));
            });
          }
        }
      }
    }
    console.log("====================================\n");
    expect(res).to.not.be.undefined;
  });
});
