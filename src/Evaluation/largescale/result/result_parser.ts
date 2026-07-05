// For compound result
const fs = require("fs");

const r = fs.readFileSync("./e2_result/e2_compound.result");
const arr = r.toString().replace(/\r\n/g,'\n').split('\n');
const pSet = new Set<String>();
const pLineNo = new Set<Number>();
const abSet = new Set<String>();
const strTmSet = new Array<String>();
const tmSet = new Array<number>();
const compSet = new Array<number>();
let totalTx = 0;

function getPoolList() {
  let lineNo = 0;
  for (lineNo; lineNo < arr.length; lineNo++){
    if (arr[lineNo].includes("tx file:")) {
      const pName = arr[lineNo].split("tx file: ")[1];
      
      // It means the line no which shows tx count in the pool.
      if (!pSet.has(pName)) pLineNo.add(lineNo-1);  
      pSet.add(pName);
    }
  }
  console.log(`pSet size: ${pSet.size}`);
  console.log(`pSet: ${Array.from(pSet)}`);
}

function getTxCount() {
  console.log(`pLineNo size: ${pLineNo.size}`);  
  console.log(`pLineNo: ${Array.from(pLineNo)}`);
  pLineNo.forEach(lineNo => {
    totalTx += Number(arr[parseInt(lineNo.toString())].split(" ")[1].split("/")[0]);
  });
  console.log(`total tx count: ${totalTx}`);
}

function getAbnormality() {
  let lineNo = 0;
  let prevTx = "";
  let foundAb = 0;
  for (lineNo; lineNo < arr.length; lineNo++){
    if (arr[lineNo].includes("Current tx:"))
      prevTx = arr[lineNo].split(" ")[2];
    if (arr[lineNo].includes("Abnormal")){
      abSet.add(`${prevTx}: ${arr[lineNo].split(" ")[3]}`);
      foundAb++;
    }
  }
  console.log(`total abnormality: ${abSet.size} / ${foundAb}`);
  // console.log(`abnormalities: ${Array.from(abSet)}`);
  abSet.forEach(v => {
    console.log(v);
  })
}

function getTime() {
  let lineNo = 0;
  let totalTime = 0;
  for (lineNo; lineNo < arr.length; lineNo++) {
    if (arr[lineNo].includes("Solver elapsed time")){
      const ms = arr[lineNo].split(":: ")[1].split("ms")[0];
      strTmSet.push(ms);
      const timeToNum = Number(ms);
      tmSet.push(timeToNum);
      totalTime += timeToNum;
      console.log(`string to number: ${Number(ms)}`);
    }
  }
  console.log(`time Set size: ${strTmSet.length}`);
  console.log(`total time: ${totalTime}`);
  console.log(`max time: ${Math.max.apply(Math, tmSet)} min time: ${Math.min.apply(Math, tmSet)}`); 
  console.log(`avg.time: ${totalTime/strTmSet.length} ms`);

  for (const a of strTmSet)
    if (a.includes("ms")) console.log(a);
}

function getComplexity() {
  let lineNo = 0;
  let totalComplexity = 0;
  let min = 100000, max = 0;
  for (lineNo; lineNo < arr.length; lineNo++) {
    if (arr[lineNo].includes("complexity")){
      const comp = Number(arr[lineNo].split("complexity: ")[1]);
      compSet.push(comp);
      totalComplexity += comp;
      // console.log(`string to number: ${comp}`);
      if (min > comp) min = comp;
      if (max < comp) max = comp;
    }
  }
  console.log(`log Set size: ${compSet.length}`);
  console.log(`total logs: ${totalComplexity}`);
  console.log(`max comp: ${max} min comp: ${min}`); 
  console.log(`avg.log complexity: ${totalComplexity/compSet.length}`);
}



// getPoolList();
// getTxCount();

getAbnormality();

// getTime();

// getComplexity();