// tx crawler
import w3 from 'web3';
import { HttpProvider } from 'web3-core';
var fs = require('fs');
const basePath = '/home/jeongmin/Documents/Largescale_evaluation/data/';
const web3 = new w3();
// web3.setProvider("http://localhost:8545");
// web3.setProvider("https://pilab:pilab0920@v.thebifrost.io/eth");
// web3.setProvider("https://mainnet.infura.io/v3/${INFURA_PROJECT_ID}");

export function convertToEvent(from, to, amount) {
  return {"name":"Receive",
          "events":[{"name":"from","type":"address","value":from},
                    {"name":"to","type":"address","value":to},
                    {"name":"amount","type":"uint256","value":amount}],
          "address":""};
}

export async function saveInTxs(txHash: string, dir: string) {
  const p = new Promise((res, _) => { (web3.currentProvider as HttpProvider).send({
    method: "debug_traceTransaction",
    params: [txHash, {
      tracer: `{data: [],
                fault: function(log) {},
                logIdx: 0,
                byte2Hex: function(byte) {
                  if (byte < 0x10)
                    return "0" + byte.toString(16);
                  return byte.toString(16);
                },
                array2Hex: function(arr) {
                  var retVal = "";
                  for (var i=0; i<arr.length; i++)
                    retVal += this.byte2Hex(arr[i]);
                  return retVal;
                },
                enter: function(callFrame) {
                  if (callFrame.getValue() !== undefined && callFrame.getValue() > 0)
                    this.data.push({Type : callFrame.getType().toString(), Value: callFrame.getValue().toLocaleString(),
                                    From: "0x" + this.array2Hex(callFrame.getFrom()), To: "0x" + this.array2Hex(callFrame.getTo())
                                  });
                  },
                step: function(log) {
                  if (log.op.toString().indexOf("LOG") > -1)
                      this.data.push({Type: log.op.toString(), IDX: ++this.logIdx});
                  },
                exit: function() {},
                result: function() { return this.data; }}` }],
      jsonrpc: "2.0",
      id: "1"
    }, (_, out) => {res(out.result);})
  });
  const inTx = await p;
  const file = `${dir}/${txHash}.inTx.txt`;
  if (inTx != undefined){
      const strInTx = JSON.stringify(inTx);
      await fs.writeFile(file, strInTx, 'utf8',
      (err: Error) => { if (err) console.error(); });
      console.log(`wrote inTxs: ${file} ${strInTx.length}`);
      return inTx;
  }
  return "";
}

async function crawl(startBlk: number, endBlk: number) {
  // https://etherscan.io/block/9200000 / 2020-01-02 8:30:49 AM
  // const startBlkNo = 9200000;
  // const currentBlkno = 9240057;
  // const endBlkNo = 10200000;
  // const endBlkNo = 13834210; // 2021-12-19 4:29PM
  // console.log("crawl");

  const totalTx = 17491508;
  let currentTx = 0;

  for (let no = startBlk; no <= endBlk; no++) {
    const block = await web3.eth.getBlock(no);
    // console.log(block);
    const dir = basePath + `${no}`;
    if (!fs.existsSync(dir)) fs.mkdirSync(dir);

    //sync version
    const last = block.transactions.length; let cur = 1;
    for (let tx of block.transactions) {
      // sleep(10); await saveEventLogs(tx, dir);
      sleep(1); await saveInTxs(tx, dir);
      console.log(`[${cur++}/${last}]`);
    }
    currentTx += block.transactions.length;
    console.log(`Completed transactions: [${currentTx}/${totalTx}]`);
    console.log(`Completed block no: ${no}`);
  }
}

async function saveEventLogs(txHash: string, dir: string) {
  const rect = await web3.eth.getTransactionReceipt(txHash);
  const file = `${dir}/${txHash}.txt`;
  if (rect != undefined) {
    await fs.writeFile(file, JSON.stringify(rect.logs), 'utf8',
      (err: Error) => { if (err) console.error(); });
    // console.log(`wrote events: ${file}`);
  }
}

function sleep(ms: number) {
  const wakeUpTime = Date.now() + ms;
  while (Date.now() < wakeUpTime) {}
}

// main();
// crawl(9230859,9400000);
// saveInTxs("0xb5c8bd9430b6cc87a0e2fe110ece6bf527fa4f170a4bc8cd032f768fc5219838", "");
