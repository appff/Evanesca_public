#!/usr/bin/env npx tsx

/**
 * Extract Protocol Violations for Manual Analysis
 * Generates a report of transaction hashes with their specific constraint violations
 */

import fs from 'fs';
import path from 'path';
import { run } from '../Driver';
import { EvanescaContext } from '../Interfaces/EvanescaContext';

interface ViolationRecord {
    txHash: string;
    protocol: string;
    blockNumber: number;
    violatedConstraints: string[];
    violationDetails: any;
    timestamp?: number;
}

async function extractViolations() {
    console.log('🔍 Extracting Protocol Violations for Manual Analysis\n');
    console.log('=' .repeat(70));
    
    // Load transaction data
    const baseDir = path.join(__dirname, '../..', 'verification-results', 'etherscan-2025-08-27T04-19-13-150Z');
    const protocols = ['uniswap', 'curve', 'aave', 'balancer'];
    
    const violations: ViolationRecord[] = [];
    let totalProcessed = 0;
    let totalViolations = 0;
    
    // Process first 500 transactions from each protocol (2000 total)
    for (const protocol of protocols) {
        console.log(`\n📂 Processing ${protocol} transactions...`);
        
        const filePath = path.join(baseDir, `${protocol}-transactions.json`);
        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        const transactions = (data.transactions || data).slice(0, 500); // First 500 from each
        
        for (let i = 0; i < transactions.length; i++) {
            const tx = transactions[i];
            totalProcessed++;
            
            // Progress indicator
            if (i % 100 === 0) {
                console.log(`  Processing ${protocol}: ${i}/500`);
            }
            
            try {
                // Create context for analysis
                const context: EvanescaContext = {
                    tList: [tx.hash],
                    fins: [],
                    reports: [],
                    analyzed: new Set<string>(),
                    complexity: []
                };
                
                // Use ProtocolInvariants.dsl
                process.env.DSL_FILE = 'src/DSL/ProtocolInvariants.dsl';
                
                const result = await run(tx.hash, context);
                
                // Check for violations
                if (context.reports && context.reports.length > 0) {
                    for (const report of context.reports) {
                        const violatedConstraints: string[] = [];
                        const violationDetails: any = {};
                        
                        // Extract violated constraint names
                        if (report._violation && Array.isArray(report._violation)) {
                            report._violation.forEach((violated: boolean, index: number) => {
                                if (violated && report._constraintNames && report._constraintNames[index]) {
                                    violatedConstraints.push(report._constraintNames[index]);
                                    
                                    // Try to get details
                                    if (report._constraintDetails && report._constraintDetails[index]) {
                                        violationDetails[report._constraintNames[index]] = report._constraintDetails[index];
                                    }
                                }
                            });
                        }
                        
                        // Alternative check for violations
                        if (report.protocolViolations && Array.isArray(report.protocolViolations)) {
                            report.protocolViolations.forEach((v: any) => {
                                if (typeof v === 'string' && !violatedConstraints.includes(v)) {
                                    violatedConstraints.push(v);
                                } else if (v.constraint && !violatedConstraints.includes(v.constraint)) {
                                    violatedConstraints.push(v.constraint);
                                    violationDetails[v.constraint] = v;
                                }
                            });
                        }
                        
                        if (violatedConstraints.length > 0) {
                            violations.push({
                                txHash: tx.hash,
                                protocol: protocol.toUpperCase(),
                                blockNumber: tx.blockNumber || 0,
                                violatedConstraints,
                                violationDetails,
                                timestamp: tx.timestamp
                            });
                            totalViolations++;
                            break; // Only record once per transaction
                        }
                    }
                }
                
            } catch (error) {
                // Silent error - transaction couldn't be analyzed
            }
        }
    }
    
    // Generate human-readable report
    const reportPath = path.join(__dirname, '../..', 'verification-results', 'reports', 'protocol-violations-manual-analysis.md');
    
    let report = `# Protocol Violation Report for Manual Analysis
Generated: ${new Date().toISOString()}

## Summary
- **Total Transactions Analyzed**: ${totalProcessed}
- **Transactions with Violations**: ${totalViolations}
- **Violation Rate**: ${((totalViolations / totalProcessed) * 100).toFixed(2)}%

## Violation Records for Manual Verification

Each record below requires human verification to determine if it's a true protocol violation or a false positive.

---

`;

    // Group violations by constraint type for easier analysis
    const violationsByConstraint: Map<string, ViolationRecord[]> = new Map();
    
    violations.forEach(v => {
        v.violatedConstraints.forEach(constraint => {
            if (!violationsByConstraint.has(constraint)) {
                violationsByConstraint.set(constraint, []);
            }
            violationsByConstraint.get(constraint)!.push(v);
        });
    });
    
    // Write violations grouped by constraint
    for (const [constraint, records] of violationsByConstraint) {
        report += `### ${constraint} (${records.length} violations)\n\n`;
        report += `| # | Transaction Hash | Protocol | Block | Manual Check |\n`;
        report += `|---|-----------------|----------|-------|-------------|\n`;
        
        records.slice(0, 20).forEach((record, index) => { // Show first 20 of each type
            report += `| ${index + 1} | [${record.txHash.substring(0, 10)}...](https://etherscan.io/tx/${record.txHash}) | ${record.protocol} | ${record.blockNumber} | [ ] Valid / [ ] False Positive |\n`;
        });
        
        if (records.length > 20) {
            report += `| ... | ${records.length - 20} more violations | | | |\n`;
        }
        
        report += `\n`;
    }
    
    // Add manual analysis section
    report += `## Manual Analysis Instructions

1. **For each transaction hash**:
   - Click the Etherscan link to view transaction details
   - Check the actual token amounts and pool states
   - Verify if the constraint violation is legitimate

2. **Classification Guide**:
   - **Valid Violation**: Protocol actually violated its invariant (e.g., k-value changed beyond tolerance)
   - **False Positive**: Constraint triggered incorrectly due to:
     - Rounding errors
     - Gas optimization tricks
     - Multi-step transactions
     - Oracle delays

3. **Common False Positive Patterns**:
   - **UNISWAP_V2_INVARIANT**: Check for fee-on-transfer tokens
   - **AAVE_HEALTH_FACTOR**: Check for flash loan transactions
   - **ORACLE_PRICE_MANIPULATION**: Check for high volatility periods
   - **LIQUIDITY_BALANCE_INVARIANT**: Check for single-sided liquidity adds

## Sample Transactions for Deep Dive

`;

    // Add 10 sample transactions with full details
    const samples = violations.slice(0, 10);
    samples.forEach((v, index) => {
        report += `### Sample ${index + 1}: ${v.txHash}\n`;
        report += `- **Protocol**: ${v.protocol}\n`;
        report += `- **Block**: ${v.blockNumber}\n`;
        report += `- **Violated Constraints**: ${v.violatedConstraints.join(', ')}\n`;
        report += `- **Etherscan**: https://etherscan.io/tx/${v.txHash}\n`;
        report += `- **Manual Verification**: [ ] Valid Violation / [ ] False Positive\n`;
        report += `- **Notes**: _____________________________________\n\n`;
    });
    
    // Write report
    fs.writeFileSync(reportPath, report);
    console.log(`\n✅ Report generated: ${reportPath}`);
    console.log(`📊 Total violations found: ${totalViolations} (${((totalViolations / totalProcessed) * 100).toFixed(2)}%)`);
    
    // Also create a JSON file for programmatic analysis
    const jsonPath = path.join(__dirname, '../..', 'verification-results', 'reports', 'protocol-violations-data.json');
    fs.writeFileSync(jsonPath, JSON.stringify({
        summary: {
            totalAnalyzed: totalProcessed,
            totalViolations,
            violationRate: ((totalViolations / totalProcessed) * 100).toFixed(2) + '%',
            timestamp: new Date().toISOString()
        },
        violationsByConstraint: Object.fromEntries(
            Array.from(violationsByConstraint.entries()).map(([k, v]) => [
                k, 
                v.map(r => ({
                    txHash: r.txHash,
                    protocol: r.protocol,
                    block: r.blockNumber
                }))
            ])
        ),
        allViolations: violations
    }, null, 2));
    
    console.log(`📁 JSON data saved: ${jsonPath}`);
}

// Run extraction
extractViolations().catch(console.error);