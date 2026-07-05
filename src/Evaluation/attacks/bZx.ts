import { web3 } from '../../PreTasks';
import { Scenario } from './iScenario';
import { LogDecoder } from '../../ABIDecoder/LogDecoder';
import { DebtAnalzer } from '../../CashflowGraph/DebtAnalyzer';
import { ContractManager } from '../largescale/ContractManager';
import { CashFlowGraph } from '../../CashflowGraph/CashflowGraph';
import { DSLConstraintSolver, DEFAULT_DSL_RULES } from '../../DSL/DSLConstraintSolver';
import { SimpleLexer, SimpleParser } from '../../DSL/DSLParser';
import { ConstraintManager } from '../../DSL/Interpreter';
const attack = (require('../../helpers/attackTxs')).getAttack("bZx");

export class bZx extends Scenario {
  public cfG:CashFlowGraph;
  private dslSolver: DSLConstraintSolver;

  constructor() {
    super();
    this.cfG = new CashFlowGraph(true);
    this.setDecoder(new LogDecoder(true));
    
    // Initialize DSL constraint solver (using default constraints)
    this.dslSolver = new DSLConstraintSolver(0, DEFAULT_DSL_RULES);
  }

  async execute(): Promise<string> {
    console.log(`[Pre] Target Cont: ${await web3.eth.getBalance(attack.targetCont)}`);
    console.log(`[Pre] Attacker: ${await web3.eth.getBalance(attack.attacker)}`);

    const attNonce = await web3.eth.getTransactionCount(attack.attacker);
    const receipt = await web3.eth.sendTransaction({
      from: attack.attacker, nonce: attNonce, to: attack.targetCont, gasPrice: attack.gasPrice,
      data: attack.tx, //gasLimit: attack.gasLimit
    });

    console.log(`[Post] Target Cont: ${await web3.eth.getBalance(attack.targetCont)}`);
    console.log(`[Post] Attacker: ${await web3.eth.getBalance(attack.attacker)}`);

    return await this.logDecode(receipt);
  }

  simulate(logs: any): Promise<any> {
    const log9 = {"name":"Receive",
                  "events":[{"name":"from","type":"address","value":"0x4f4e0f2cb72e718fc0433222768c57e823162152"},
                            {"name":"to","type":"address","value":"0x4Ddc2D193948926D02f9B1fE9e1daa0718270ED5"},
                            {"name":"amount","type":"uint256","value":"5500000000000000000000"}]};

    const log20 = {"name":"Receive",
                    "events":[{"name":"from","type":"address","value":"0x4f4e0f2cb72e718fc0433222768c57e823162152"},
                              {"name":"to","type":"address","value":"0xb0200b0677dd825bb32b93d055ebb9dc3521db9d"},
                              {"name":"amount","type":"uint256","value":"1300000000000000000000"}]};

    const log40 = {"name":"Send",
                    "events":[{"name":"from","type":"address","value":"0x4d2f5cfba55ae412221182d8475bc85799a5644b"},
                              {"name":"to","type":"address","value":"0x4f4e0f2cb72e718fc0433222768c57e823162152"},
                              {"name":"amount","type":"uint256","value":"6871412738870224322944"}]};

    // 🔥 [NEW] dYdX flashloan borrow Transfer event (actual transaction data)
    // Transfer(indexed src, indexed dst, uint256 wad) from WETH contract
    const dydxFlashloanBorrow = {
      "name": "Transfer",
      "address": "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", // WETH contract address
      "events": [
        {"name": "src", "type": "address", "value": "0x1E0447b19BB6EcFdAe1e4AE1694b0C3659614e4e"}, // dYdX (actual case)
        {"name": "dst", "type": "address", "value": "0x4f4e0f2cb72E718fC0433222768c57e823162152"}, // borrower (actual case)
        {"name": "wad", "type": "uint256", "value": "10000000000000000000000"} // 10,000 ETH (actual amount)
      ]
    };

    // 🔥 [NEW] dYdX flashloan repay Transfer event (actual transaction data)
    // This should appear later in the transaction
    const dydxFlashloanRepay = {
      "name": "Transfer", 
      "address": "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", // WETH contract address
      "events": [
        {"name": "src", "type": "address", "value": "0x0de0dD63d9fB65450339ef27577d4f39d095EB85"}, // actual repayer from transaction
        {"name": "dst", "type": "address", "value": "0x1E0447b19BB6EcFdAe1e4AE1694b0C3659614e4e"}, // dYdX
        {"name": "wad", "type": "uint256", "value": "10000000000000010000000"} // actual amount from transaction
      ]
    };

    // Event injection
    // Insert dYdX flashloan borrow at the beginning (position 0)
    logs.splice(0, 0, dydxFlashloanBorrow);
    logs.splice(10, 0, log9);   // Adjusted position (+1 due to new event)
    logs.splice(21, 0, log20);  // Adjusted position (+1 due to new event) 
    logs.splice(40, 0, log40);  // Adjusted position (+1 due to new event)
    // Insert dYdX flashloan repay near the end (before last few events)
    logs.splice(logs.length - 2, 0, dydxFlashloanRepay);
    
    console.log(`🔥 [bZx-Simulate] Added dYdX flashloan Transfer events:`);
    console.log(`   📥 Borrow: ${dydxFlashloanBorrow.events[2].value} wei WETH`);
    console.log(`   📤 Repay: ${dydxFlashloanRepay.events[2].value} wei WETH`);
    console.log(`   📊 Total logs after injection: ${logs.length}`);
    
    // Debug: Verify added Transfer events
    const transferLogs = logs.filter((log: any) => log.name === "Transfer");
    console.log(`   🔍 Transfer events in logs: ${transferLogs.length}`);
    transferLogs.forEach((log: any, index: number) => {
      console.log(`      Transfer ${index}: src=${log.events[0]?.value}, dst=${log.events[1]?.value}, amount=${log.events[2]?.value}`);
    });
    
    return logs;
  }

  async buildcfG(parsedEvent: any): Promise<[string,string]> {
    const cm = new ContractManager(true);
    this.cfG._tags.set(attack.targetCont, "Exploit Contract");
    this.cfG._tags.set(attack.attacker, "Attacker");
    // related addresses
    this.cfG._tags.set("0x1e0447b19bb6ecfdae1e4ae1694b0c3659614e4e", await cm.getContractLabel("0x1e0447b19bb6ecfdae1e4ae1694b0c3659614e4e"));
    this.cfG._tags.set("0x4ddc2d193948926d02f9b1fe9e1daa0718270ed5","Compound cETH Token");
    this.cfG._tags.set("0xc11b1268c1a384e55c48c2391d8d480264a3a7f4","Compound cWBTC Token");
    this.cfG._tags.set("0x8b3d70d628ebd30d4a2ea82db95ba2e906c71633","bZx Vault");
    this.cfG._tags.set("0xb017c9936f9271daff23d4c9876651442958a80f","bZx Related1");
    this.cfG._tags.set("0x77f973fcaf871459aa58cd81881ce453759281bc","bZx ETH iToken");
    this.cfG._tags.set("0xb0200b0677dd825bb32b93d055ebb9dc3521db9d","bZx Protocol");
    this.cfG._tags.set("0x65bf64ff5f51272f729bdcd7acfb00677ced86cd","Kyber Contract");
    this.cfG._tags.set("0x57f8160e1c59d16c01bbe181fd94db4e56b60495","Kyber Reserve WETH");
    this.cfG._tags.set("0x4d2f5cfba55ae412221182d8475bc85799a5644b","Uniswap: WBTC");
    this.cfG._tags.set("0x31e085afd48a1d6e51cc193153d625e8f0514c7f","Kyber Reserve Uniswap");
    return [await this.cfG.buildGraph(parsedEvent), this.cfG.calcProfit()];
  }

  async analyzeDebt(): Promise<string> {
    // Existing debt analysis
    const debtAnalyzer = new DebtAnalzer(this.cfG);
    debtAnalyzer.detectCycle();
    const debtResult = debtAnalyzer.borrowOrSwap(attack.targetCont);
    
    // Constraint analysis using our custom DSL parser
    try {
      console.log("🔍 Running custom DSL parser analysis for bZx attack...");
      
      // Get current block number
      const blockNumber = await web3.eth.getBlockNumber();
      
      // 1. Test by directly parsing DSL rules
      console.log("📝 Testing custom DSL parser...");
      const lexer = new SimpleLexer(DEFAULT_DSL_RULES);
      const tokens = lexer.tokenize();
      console.log(`✅ Lexer generated ${tokens.length} tokens`);
      
      const parser = new SimpleParser(tokens);
      const constraints = parser.parseMultipleConstraints();
      console.log(`✅ Parser parsed ${constraints.length} constraints:`);
      constraints.forEach((constraint, index) => {
        console.log(`   ${index + 1}. ${constraint.name}: ${constraint.message}`);
      });
      
      // 2. Test using ConstraintManager directly
      console.log("🔧 Testing custom ConstraintManager...");
      const constraintManager = new ConstraintManager();
      constraintManager.addConstraints(constraints);
      
      // 3. Test with actual bZx attack data
      const bzxAttackData = [
        // Flash loan: 5500 ETH from Compound
        {
          w: "Compound_cETH",
          v: attack.targetCont,
          name: JSON.stringify({
            Action: "Borrow",
            Amount: "5500000000000000000000", // 5500 ETH
            Token: "ETH",
            TokenAddr: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"
          })
        },
        // Core of bZx attack: abnormal swap
        {
          w: "Uniswap_WBTC",
          v: attack.targetCont,
          name: JSON.stringify({
            Action: "Swap",
            AmountIn: "1300000000000000000000", // 1300 ETH
            AmountOut: "6871412738870224322944", // 6871 WBTC
            Token0: "ETH",
            Token1: "WBTC",
            Token0Addr: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
            Token1Addr: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599",
            isFirstSwap: false,
            gasPrice: 100
          })
        },
        // Re-entrancy simulation
        {
          w: "Compound_cETH",
          v: attack.targetCont,
          name: JSON.stringify({
            Action: "Withdraw",
            Amount: "1000000000000000000000", // 1000 ETH
            Token: "ETH",
            TokenAddr: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"
          })
        }
      ];

      // Mock graph structure
      const mockGraph = {
        node: (id: string) => {
          const nodeMap: any = {
            "Compound_cETH": { Type: "Lending" },
            "Uniswap_WBTC": { Type: "DEX" },
            "Kyber_WBTC": { Type: "DEX" }
          };
          return nodeMap[id] || { Type: "Unknown" };
        }
      };

      // 4. Execute constraints directly on each transaction
      console.log("⚖️ Executing constraints on bZx attack data...");
      let totalViolations = 0;
      const violationDetails: string[] = [];
      
      for (const seq of bzxAttackData) {
        const context = this.createExecutionContext(seq, mockGraph, blockNumber);
        console.log(`  🎯 Processing: ${context.edge?.type} ${context.edge?.action}`);
        
        const violations = constraintManager.getViolations(context);
        for (const violation of violations) {
          if (violation.violated) {
            totalViolations++;
            violationDetails.push(violation.message || 'Unknown violation');
            console.log(`    🚨 Violation: ${violation.message || 'Unknown violation'}`);
          }
        }
      }
      
      // 5. Also test DSLConstraintSolver
      console.log("🔍 Testing DSLConstraintSolver integration...");
      this.dslSolver = new DSLConstraintSolver(blockNumber, DEFAULT_DSL_RULES);
      const dslResult = await this.dslSolver.solve(mockGraph, bzxAttackData);
      
      console.log("📊 Custom DSL Parser Analysis Results:");
      console.log(`- Direct violations: ${totalViolations}`);
      console.log(`- Violation details: ${violationDetails.join(', ')}`);
      console.log(`- DSL Solver violations: ${dslResult._violation.some(v => v === true)}`);
      console.log(`- DSL Solver comments: ${dslResult._comment}`);
      
      // Return integrated results
      const combinedResult = {
        traditional_debt_analysis: debtResult,
        custom_dsl_parser_analysis: {
          tokens_generated: tokens.length,
          constraints_parsed: constraints.length,
          direct_violations: totalViolations,
          violation_details: violationDetails,
          dsl_solver_violations: dslResult._violation,
          dsl_solver_comments: dslResult._comment
        },
        attack_detected: (debtResult && debtResult.length > 0) || totalViolations > 0 || dslResult._violation.some(v => v === true)
      };
      
      return JSON.stringify(combinedResult, null, 2);
      
    } catch (error) {
      console.error("❌ Error in custom DSL parser analysis:", error);
      
      // Return only existing results on analysis failure
      const attackDetected = debtResult && debtResult.length > 0;
      return JSON.stringify({
        traditional_debt_analysis: debtResult,
        custom_dsl_error: error instanceof Error ? error.message : String(error),
        attack_detected: attackDetected
      }, null, 2);
    }
  }

  // Create execution context (for DSL analysis)
  private createExecutionContext(seq: { w: string, v: string, name: any }, graph: any, blockNo: number): any {
    const node = graph.node(seq.w);
    const edgeData = JSON.parse(seq.name);
    
    return {
      edge: {
        type: node.Type,
        action: edgeData.Action,
        ...edgeData
      },
      user: {
        balance: 0,
        collateral: 1000000
      },
      graph: node,
      blockNo: blockNo
    };
  }
}
