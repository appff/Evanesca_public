import { argv } from "process";
import { fs, path } from "../../PreTasks";

export class TransactionSplitter {
  private _path: string;
  private _chunkSize: number;
  private _startIdx: number;
  constructor (path: string, chunkSize: number, startIdx: number) {
    this._path = path;
    this._chunkSize = chunkSize;
    if (startIdx !== undefined) this._startIdx = startIdx;
    else this._startIdx = 0;
  }

  splitTransaction() {
    const txList = fs.readFileSync(this._path, "utf8").split(",");
    let chunk = "";
    for (let i = this._startIdx; i < txList.length; i++) {
      // Appending tx according to _chunkSize
      chunk += txList[i];
      if ((i+1) % this._chunkSize != 0) chunk += ",";
      if ((i+1) % this._chunkSize == 0) {
        fs.writeFileSync(this.getPathWithoutExt() + "_" + i + ".list", chunk);
        chunk = "";
      }
    }
  }

  getPathWithoutExt() {
    return path.parse(this._path).name; 
  }
}

(new TransactionSplitter(argv[2], Number(argv[3]), Number(argv[4])).splitTransaction());