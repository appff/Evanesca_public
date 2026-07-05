/**
 * Debug ERM enrichment by running pipeline on:
 *  - 1 firing hash (0x48785cd3...) — known to fire EXCHANGE_RATE_MANIPULATION
 *  - 1 non-firing hash (0x1f35bf8a...) — has Panel-C cycle but does NOT fire ERM
 * Diff the [ERM_DEBUG] lines to identify the bug.
 */
import { run } from "../src/Driver";
import { preTasksForRegressionTest } from "../src/PreTasks";
import { EvanescaContext } from "../src/Interfaces/EvanescaContext";
import { AnalysisResult } from "../src/ConstraintSolver/Interfaces/AnalysisResult";
import "../src/test/attacks/shared/testSetup";

preTasksForRegressionTest();

async function go(label: string, hash: string) {
  console.log(`\n========== ${label}: ${hash} ==========`);
  process.env.EVANESCA_SKIP_TX = "false";
  process.env.EVANESCA_TX_HASH = hash;
  const cntx: EvanescaContext = {
    tList: [], analyzed: new Set(), reports: new Array<AnalysisResult>(),
    fins: [], complexity: [],
  };
  await run(hash, cntx);
}

async function main() {
  process.env.EVANESCA_DSL_ONLY = "true";
  process.env.EVANESCA_ERM_DEBUG = "true";
  await go("FIRING", "0x48785cd3515f8558109f78b7cfe86a21df5dc6a35238cd20c4aa04a7ed831199");
  await go("NON-FIRING", "0x1f35bf8a3bf19eae1acb08196835b95f00d395dfc3cd7e4ed7ffdd48e85a0088");
}

main().catch(e => { console.error(e); process.exit(1); });
