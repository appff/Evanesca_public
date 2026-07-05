import { LogDecoder } from "../../ABIDecoder/LogDecoder";
export abstract class Scenario {
  static _DEBUG = true;
  public decoder!: LogDecoder;
  abstract execute (): Promise<string>;
  abstract simulate (logs: any): Promise<string>;
  abstract buildcfG (logs: any): Promise<[string, string]>;
  abstract analyzeDebt (): Promise<string>;

  setDecoder(_decoder: LogDecoder) {
    this.decoder = _decoder;
  }

  async logDecode(receipt: any): Promise<string> {
    if (receipt) {
      let parsedLogs = await this.decoder.decode(receipt.logs);
      parsedLogs = this.simulate(parsedLogs);
      if (Scenario._DEBUG)
        console.log(parsedLogs);
      return JSON.stringify(parsedLogs);
    } else throw console.error("receipt may be null");
  }
}
