import { cheerio } from "../../PreTasks";
import { lstOracle } from "./ChainlinkOracleList";

  const USDprices = new Map<string, string>();

  export function addEntity(sym: string, ora: string) {
    USDprices.set(sym, ora);
  }
  
  export function getFeeds() {
    const $ = cheerio.load(lstOracle);
    const r = $("table > tbody > tr .proxy-pair");
    $(r).each(function (_: number, link: any){
      if (!$(link).text().endsWith("USD")) return
      const oracle = $(`table > tbody > tr:nth-child(${_ + 1}) > td > a > code`).text();
      const symbol = ($(link).text().split("/")[0] as string).trim();
      addEntity(symbol, oracle);
    });
  }
  
  export function getOracleAddr(symbol: string) {
    return USDprices.get(symbol);
  }