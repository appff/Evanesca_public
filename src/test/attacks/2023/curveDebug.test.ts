/// <reference types="mocha" />

/**
 * Debug test for Curve Finance attack detection
 */

import { expect } from "chai";
import { run } from "../../../Driver";
import { preTasksForRegressionTest } from "../../../PreTasks";
import { EvanescaContext } from "../../../Interfaces/EvanescaContext";
import '../shared/testSetup'; // Ensures proper test cleanup


preTasksForRegressionTest();

describe("Curve Finance Attack Debug", () => {
  it("should analyze pETH pool transaction directly", async function() {
    this.timeout(60000);
    
    const context: EvanescaContext = {
      tList: [],
      fins: [],
      reports: [],
      analyzed: new Set<string>(),
      complexity: []
    };
    
    const txHash = "0xa84aa065ce61dbb1eb50ab6ae67fc31a9da50dd2c74eefd561661bfce2f1620c";
    
    console.log("🔍 Analyzing transaction:", txHash);
    
    try {
      const results = await run(txHash, context);
      
      console.log("\n📊 Analysis Results:");
      console.log("- Reports generated:", results.reports.length);
      console.log("- Transactions analyzed:", results.analyzed.size);
      console.log("- Complexity scores:", results.complexity);
      
      if (results.reports.length > 0) {
        const report = results.reports[0];
        console.log("\n📈 First Report Details:");
        console.log("- Index:", report._index);
        console.log("- Violations:", report._violation);
        console.log("- Hash:", report._hash);
        console.log("- Comment:", report._comment);
        
        // Check each violation type
        const violationTypes = [
          'L1_REENTRANCY',
          'L2_EXCESSIVE_BORROWING', 
          'D1_DEX_INVARIANCE',
          'D2_ABNORMAL_SWAP',
          'BRIDGE_MINT',
          'BRIDGE_DEPOSIT'
        ];
        
        console.log("\n🚨 Constraint Violations:");
        report._violation.forEach((violated, index) => {
          if (violated) {
            console.log(`  ✅ ${violationTypes[index]} VIOLATED`);
          }
        });
        
        const hasAnyViolation = report._violation.some(v => v);
        console.log("\n🎯 Attack detected:", hasAnyViolation);
      } else {
        console.log("\n❌ No reports generated - this is the problem!");
        console.log("Possible reasons:");
        console.log("1. Transaction not being processed");
        console.log("2. Events not being decoded");
        console.log("3. Graph not being built");
        console.log("4. Constraints not being evaluated");
      }
      
      // Check if transaction was processed
      if (results.analyzed.has(txHash)) {
        console.log("\n✅ Transaction was analyzed");
      } else {
        console.log("\n❌ Transaction was NOT analyzed");
      }
      
    } catch (error) {
      console.error("\n❌ Error during analysis:", error);
      throw error;
    }
  });
});