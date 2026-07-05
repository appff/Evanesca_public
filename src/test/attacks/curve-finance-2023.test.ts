/// <reference types="mocha" />

import { expect } from "chai";
import { run } from "../../Driver";
import now from 'performance-now';
import '../shared/testSetup'; // Ensures proper test cleanup


describe("Curve Finance Attack Detection (2023)", () => {
  it("should detect pETH/ETH pool attack (Vyper compiler reentrancy bug)", async () => {
    const start = now();
    const txHash = "0xa84aa065ce61dbb1eb50ab6ae67fc31a9da50dd2c74eefd561661bfce2f1620c";
    
    console.log("\n🎯 Testing Curve Finance pETH/ETH pool attack...");
    console.log(`📝 Transaction: ${txHash}`);
    
    const cntx: any = {
      tList: [txHash],
      reports: [],
      fins: [0],
      complexity: [0],
      abnormalities: [],
      analyzed: new Set()
    };
    
    await run(txHash, cntx);
    
    const end = now();
    const elapsed = ((end - start) / 1000).toFixed(2);
    
    console.log(`\n✅ Analysis complete in ${elapsed}s`);
    
    if (cntx.reports.length > 0) {
      const report = cntx.reports[0];
      console.log("\n📊 Detection Results:");
      console.log(`- Anomalous: ${report._anomalous ? '✅ ATTACK DETECTED' : '❌ Not detected'}`);
      console.log(`- Confidence: ${report._confidence || 'N/A'}%`);
      
      if (report._violation && report._violation.length > 0) {
        console.log("\n🚨 Constraint Violations:");
        report._violation.forEach((v: any, idx: number) => {
          if (v) {
            console.log(`  - Violation ${idx}: ${v}`);
          }
        });
      }
      
      if (report._pnlDetails) {
        console.log("\n💰 PNL Analysis:");
        console.log(`- Attacker profit: ${JSON.stringify(report._pnlDetails)}`);
      }
      
      // Expect attack to be detected
      expect(report._anomalous).to.be.true;
    } else {
      console.log("❌ No report generated for transaction");
      expect.fail("No report generated");
    }
  });

  it("should detect alETH/ETH pool attack", async () => {
    const start = now();
    const txHash = "0xb676d789bb8b66a08105c844a49c2bcffb400e5c1cfabd4bc30cca4bff3c9801";
    
    console.log("\n🎯 Testing Curve Finance alETH/ETH pool attack...");
    console.log(`📝 Transaction: ${txHash}`);
    
    const cntx: any = {
      tList: [txHash],
      reports: [],
      fins: [0],
      complexity: [0],
      abnormalities: [],
      analyzed: new Set()
    };
    
    await run(txHash, cntx);
    
    const end = now();
    const elapsed = ((end - start) / 1000).toFixed(2);
    
    console.log(`\n✅ Analysis complete in ${elapsed}s`);
    
    if (cntx.reports.length > 0) {
      const report = cntx.reports[0];
      console.log("\n📊 Detection Results:");
      console.log(`- Anomalous: ${report._anomalous ? '✅ ATTACK DETECTED' : '❌ Not detected'}`);
      console.log(`- Confidence: ${report._confidence || 'N/A'}%`);
      
      // Expect attack to be detected
      expect(report._anomalous).to.be.true;
    } else {
      console.log("❌ No report generated for transaction");
      expect.fail("No report generated");
    }
  });

  it("should detect msETH/ETH pool attack", async () => {
    const start = now();
    const txHash = "0xc93eb238ff717925c4400d0d74961fcc1cf2e77e229e036b11335a9e5d6ae264";
    
    console.log("\n🎯 Testing Curve Finance msETH/ETH pool attack...");
    console.log(`📝 Transaction: ${txHash}`);
    
    const cntx: any = {
      tList: [txHash],
      reports: [],
      fins: [0],
      complexity: [0],
      abnormalities: [],
      analyzed: new Set()
    };
    
    await run(txHash, cntx);
    
    const end = now();
    const elapsed = ((end - start) / 1000).toFixed(2);
    
    console.log(`\n✅ Analysis complete in ${elapsed}s`);
    
    if (cntx.reports.length > 0) {
      const report = cntx.reports[0];
      console.log("\n📊 Detection Results:");
      console.log(`- Anomalous: ${report._anomalous ? '✅ ATTACK DETECTED' : '❌ Not detected'}`);
      console.log(`- Confidence: ${report._confidence || 'N/A'}%`);
      
      // Expect attack to be detected
      expect(report._anomalous).to.be.true;
    } else {
      console.log("❌ No report generated for transaction");
      expect.fail("No report generated");
    }
  });

  it("should detect CRV/ETH pool attack", async () => {
    const start = now();
    const txHash = "0x1a72853f9b9ae02c993fce3ba69eda12c9b93be5ac2b83b1c0e1f4bc0e150b4e";
    
    console.log("\n🎯 Testing Curve Finance CRV/ETH pool attack...");
    console.log(`📝 Transaction: ${txHash}`);
    
    const cntx: any = {
      tList: [txHash],
      reports: [],
      fins: [0],
      complexity: [0],
      abnormalities: [],
      analyzed: new Set()
    };
    
    await run(txHash, cntx);
    
    const end = now();
    const elapsed = ((end - start) / 1000).toFixed(2);
    
    console.log(`\n✅ Analysis complete in ${elapsed}s`);
    
    if (cntx.reports.length > 0) {
      const report = cntx.reports[0];
      console.log("\n📊 Detection Results:");
      console.log(`- Anomalous: ${report._anomalous ? '✅ ATTACK DETECTED' : '❌ Not detected'}`);
      console.log(`- Confidence: ${report._confidence || 'N/A'}%`);
      
      // Expect attack to be detected
      expect(report._anomalous).to.be.true;
    } else {
      console.log("❌ No report generated for transaction");
      expect.fail("No report generated");
    }
  });
});