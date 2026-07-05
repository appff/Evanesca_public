/// <reference types="mocha" />
import { run } from "../../../Driver";
import { expect } from "chai";
import { preTasksForRegressionTest } from "../../../PreTasks";
import { EvanescaContext } from "../../../Interfaces/EvanescaContext"
import { AnalysisResult } from "../../../ConstraintSolver/Interfaces/AnalysisResult";
import '../shared/testSetup'; // Ensures proper test cleanup


preTasksForRegressionTest();
const cntx: EvanescaContext = { 
  tList: [], 
  analyzed: new Set<string>(), 
  reports: new Array<AnalysisResult>(), 
  fins: new Array<number>(),
  complexity: new Array<number>()
};

describe ('Each regression test', () => {
  it("Yearn finance", async() => {
    const res = await run("0xb094d168dd90fcd0946016b19494a966d3d2c348f57b890410c51425d89166e8", cntx);
    expect(res).to.not.be.undefined;
    expect(res!.reports[0]._violation[3]).equal(true);
  });
})

//yyDAI+yUSDC+yUSDT+yTUSD, yUSDC, yUSDT, ycDAI, ycUSDT, yBUSD, cyUSDC, yDAI