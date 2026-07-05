import { Scenario } from './iScenario';
import { web3 } from '../../PreTasks';
import { CashFlowGraph } from '../../CashflowGraph/CashflowGraph';
import { DebtAnalzer } from '../../CashflowGraph/DebtAnalyzer';
import { LogDecoder } from '../../ABIDecoder/LogDecoder';

const attack = (require('../../helpers/attackTxs')).getAttack("imBTC");
const imBTCAddr = "0x3212b29e33587a00fb1c83346f5dbfa69a458923";
const imBTCPoolAddr = "0xffcf45b540e6c9f094ae656d2e34ad11cdfdb187";

export class imBTC extends Scenario{
  public cfG:CashFlowGraph;

  constructor() {
    super();
    this.setDecoder(new LogDecoder(true));
    this.cfG = new CashFlowGraph(true);
  }

  async execute(): Promise<string> {
    // Load imBTC contract which is deployed.
    const imBTC = new web3.eth.Contract(await this.decoder.getABIfromEtherscan(imBTCAddr), imBTCAddr);
    const relatedAddrs = [{Name:'Pool', Addr:imBTCPoolAddr},
                          {Name:'Attacker EOA', Addr:attack.targetCont},
                          {Name:'Attacker', Addr:attack.attacker}];
    // await ChainHelper.printBalances("Pre", imBTC, imBTCAddr, relatedAddrs);
    console.log("=================================================================");

    // execute attack
    var attNonce = await web3.eth.getTransactionCount(attack.attacker);
    const receipt = await web3.eth.sendTransaction({
      from: attack.attacker, nonce: attNonce, to: attack.targetCont,
      gasPrice: attack.gasPrice, data: attack.tx, //gasLimit: attack.gasLimit
    });
    // .catch ((error: { message: any; }) => {console.log(`Error: ${error.message}`)});

    // check the balance of attack contract
    // await ChainHelper.printBalances("Post", imBTC, imBTCAddr, relatedAddrs);
    console.log("================================================================");

    // print logs
    return await this.logDecode(receipt);
  }

  // this function simulates Evanesca's instrumentation
  simulate (logs: any): Promise<any> {
    const Receive0 = {"name":"Receive","events":
                    [{"name":"from","type":"address","value":"0xbd2250d713bf98b7e00c26e2907370ad30f0891a"},
                     {"name":"to","type":"address","value":"0xffcf45b540e6c9f094ae656d2e34ad11cdfdb187"},
                     {"name":"amount","type":"uint256","value":"1000000000000000000"}],"address":"unknown"};
    const Receive9 = {"name":"Receive","events":
                      [{"name":"from","type":"address","value":"0xffcf45b540e6C9F094ae656D2e34ad11cdfdb187"},
                       {"name":"from","type":"address","value":"0xbd2250d713bf98b7e00c26e2907370ad30f0891a"},
                       {"name":"amount","type":"uint256","value":"30776073619962707"}]};
    const Receive13 = {"name":"Receive","events":
                       [{"name":"from","type":"address","value":"0xffcf45b540e6C9F094ae656D2e34ad11cdfdb187"},
                        {"name":"to","type":"address","value":"0xbd2250d713bf98b7e00c26e2907370ad30f0891a"},
                        {"name":"amount","type":"uint256","value":"984253946794823082"}]};

    // Event injection
    logs.splice(0,0, Receive0);
    logs.splice(9,0, Receive9);
    logs.push(Receive13);
    return logs;
  }

  async buildcfG(parsedEvent: any): Promise<[string,string]> {
    this.cfG._tags.set(attack.targetCont, "Attacker");
    this.cfG._tags.set(imBTCPoolAddr, "Uniswap imBTC Pool");
    return [await this.cfG.buildGraph(parsedEvent), this.cfG.calcProfit()];
  }

  async analyzeDebt(): Promise<string> {
    const debtAnalyzer = new DebtAnalzer(this.cfG);
    debtAnalyzer.detectCycle();
    const result = debtAnalyzer.borrowOrSwap(attack.targetCont);
    return JSON.stringify(result, null, 2);
  }
}
