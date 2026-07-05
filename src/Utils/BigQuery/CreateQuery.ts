import { argv } from "process";

function createQuery(_start: string, _end: string, _inPath:string, _outPath: string) {
  console.log(_start);
  if (_start == undefined || _end == undefined || _outPath == undefined){
    console.error("You should specify start, end indexies and out path");
    process.exit(1);
  }

  let start = Number(_start);
  let end = Number(_end);

  let i = 0;
  const fs = require('fs');
  const uniPool = JSON.parse(fs.readFileSync(_inPath, 'utf8'));
  let arrAddr = "";

  for (i = start; i < end; i++) {
    if (i > start) arrAddr += ","
    arrAddr += `LOWER('${uniPool[i]["contAddr"]}')`;
  }

  let query = `select distinct transaction_hash from bigquery-public-data.crypto_ethereum.logs 
  where address in (${arrAddr})
  limit 3000000`;

  console.log(`last i : ${i}, realArray: ${arrAddr.split(",").length}`);
  fs.writeFileSync(_outPath, query);
}

createQuery(argv[2], argv[3], argv[4], argv[5]);
