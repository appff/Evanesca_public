/// <reference types="mocha" />
import { expect } from "chai";
import { run } from "../../../Driver";
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
  it("Cream Fi#2", async() => {
    const res = await run("0x0fe2542079644e107cbf13690eb9c2c65963ccb79089ff96bfaf8dced2331c92", cntx);
    expect(res).to.not.be.undefined;
    expect(res!.reports[0]._violation[2]).equal(true);
  });
})
