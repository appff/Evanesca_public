import { imBTC } from "../../Evaluation/attacks/imBtc";
import { bZx } from '../../Evaluation/attacks/bZx';
import { Worker } from 'worker_threads';

const txCrawler = require("./evaluation/largescale/txCrawler")

async function exeimBTC() {
  const executor = new imBTC();
  const r = await executor.execute();
  await postProcess(executor, r);
}

async function exebZx() {
  const executor = new bZx();
  const r = await executor.execute();
  await postProcess(executor, r);
}

async function postProcess(executor: any, r: any) {
  const cfGandProfit = await executor.buildcfG(r);
  console.log("================================================================");
  console.log(`Built cfG\n${cfGandProfit[0]}`);
  console.log("================================================================");
  console.log(`Calculated Profit\n${cfGandProfit[1]}`);
  console.log(`Operation Type Analysis`);
  console.log(await executor.analyzeDebt());
}

function main() {
  let isDebug = false;
  if (process.argv[2] === "crawl") {
    txCrawler.crawl(9200000, 10200000); 
  }
  else if (process.argv[3] === "true") isDebug = true;
  // [EVN cmd]: export NODE\_OPTIONS=--experimental-worker
  const worker = new Worker('./helpers/execute/worker.js',
                { workerData: { attack:`${process.argv[2]}`,
                                debug:isDebug }});
  worker.on('message', (result) => {
    if (result.toString() === "on" && process.argv[2] === "imBTC") exeimBTC();
    else if (result.toString() === "on" && process.argv[2] === "bZx") exebZx();
  });
}

main();
