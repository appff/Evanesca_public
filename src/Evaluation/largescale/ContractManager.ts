// This is to obtain label of contracts from Etherscan.
// Title DOM안에 정보가 있음
// The result of getLabel is used to assign cashflow's node name.
export class ContractManager {
  private axios = require ("axios");
  private cheerio = require ("cheerio");
  private baseUrl;
  constructor (isETH: boolean) {
    if (isETH) this.baseUrl =  "https://etherscan.io/address/";
    else this.baseUrl = "https://bscscan.com/address/";
  }
  async getContractLabel (addr: string) {
    try {
      const $ = this.cheerio.load((await this.axios.get( this.baseUrl + addr)).data);
      const label = $('.card-header div span[data-toggle="tooltip"]').first().text();
      return label != "" ? label : "Unknown: " + addr;
    } catch (error) {
      console.error(`getContractLabel: ${error}`);
    }
  }
}
