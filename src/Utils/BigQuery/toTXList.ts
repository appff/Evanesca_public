function convert(fpath: string){
  let final: string;
  const fs = require('fs');
  const arr = fs.readFileSync(fpath,'utf8').split("\n");
  for (let tx of arr) final += tx + ",";
  fs.writeFileSync(fpath, final);
}

convert(process.argv[2]);