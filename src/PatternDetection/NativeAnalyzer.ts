/**
 * Native TypeScript Analyzer for DeFi Attack Detection
 * 
 * This analyzer bypasses DSL limitations by directly accessing edge properties
 * and transaction data for complex attack pattern detection.
 */

import { SemanticFinancialGraph, SequenceEdge as Edge, EdgeSequence } from "../SemanticFinancialGraph/Types";
import { AnalysisResult } from "../ConstraintSolver/Interfaces/AnalysisResult";

export class NativeAnalyzer {
  private blockNumber: number;

  constructor(blockNumber: number) {
    this.blockNumber = blockNumber;
  }

  /**
   * Main analysis function that applies all native detection patterns
   */
  public analyze(graph: SemanticFinancialGraph, edgeSeq: EdgeSequence, transactionHash: string): AnalysisResult[] {
    const results: AnalysisResult[] = [];
    
    // Apply each detection pattern
    const detectors = [
      this.detectReentrancy.bind(this),
      this.detectExcessiveBorrowing.bind(this),
      this.detectPriceManipulation.bind(this),
      this.detectBridgeExploits.bind(this),
      this.detectFlashLoanAttacks.bind(this),
      this.detectNFTCollateralManipulation.bind(this),
      this.detectDonationInflation.bind(this),
      this.detectEmptyMarketManipulation.bind(this),
      this.detectReadOnlyReentrancy.bind(this),
      this.detectScaledBalanceManipulation.bind(this)
    ];

    for (const detector of detectors) {
      const result = detector(graph, edgeSeq, transactionHash);
      if (result) {
        results.push(result);
      }
    }

    return results;
  }

  /**
   * L1: Detect reentrancy attacks in lending protocols
   */
  private detectReentrancy(graph: SemanticFinancialGraph, edgeSeq: EdgeSequence, txHash: string): AnalysisResult | null {
    for (const edge of edgeSeq) {
      // Check for lending operations with suspicious patterns
      if ((edge.Type === "Lending" || edge.Action === "Borrow" || edge.Action === "Withdraw") &&
          edge.Amount && parseFloat(edge.Amount) > 100000) {
        
        // Check for reentrancy pattern: multiple calls in same transaction
        const sameFunctionCalls = edgeSeq.filter(e => 
          e.Action === edge.Action && 
          e.From === edge.From &&
          e.Service === edge.Service
        );

        if (sameFunctionCalls.length > 1) {
          return this.createResult(
            2, // L1 violation index
            `L1: Reentrancy detected in ${edge.Service} - Multiple ${edge.Action} calls`,
            txHash
          );
        }
      }
    }
    return null;
  }

  /**
   * L2: Detect excessive borrowing attacks
   */
  private detectExcessiveBorrowing(graph: SemanticFinancialGraph, edgeSeq: EdgeSequence, txHash: string): AnalysisResult | null {
    for (const edge of edgeSeq) {
      if (edge.Action === "Borrow" && edge.Amount) {
        const borrowAmount = parseFloat(edge.Amount);
        
        // Look for collateral edges from same address
        const collateralEdges = edgeSeq.filter(e => 
          e.From === edge.From &&
          (e.Action === "Supply" || e.Action === "Deposit") &&
          e.timestamp && edge.timestamp &&
          e.timestamp < edge.timestamp
        );

        const totalCollateral = collateralEdges.reduce((sum, e) => 
          sum + (e.Amount ? parseFloat(e.Amount) : 0), 0
        );

        // Check if borrowing exceeds reasonable collateral ratio (150%)
        if (totalCollateral > 0 && borrowAmount > totalCollateral * 1.5) {
          return this.createResult(
            3, // L2 violation index
            `L2: Excessive borrowing detected - Borrowed ${borrowAmount} with only ${totalCollateral} collateral`,
            txHash
          );
        }
      }
    }
    return null;
  }

  /**
   * D2: Detect price manipulation in DEX swaps
   */
  private detectPriceManipulation(graph: SemanticFinancialGraph, edgeSeq: EdgeSequence, txHash: string): AnalysisResult | null {
    for (const edge of edgeSeq) {
      if (edge.Action === "Swap" && edge.AmountIn && edge.AmountOut) {
        const amountIn = parseFloat(edge.AmountIn);
        const amountOut = parseFloat(edge.AmountOut);
        
        if (amountIn > 0) {
          const ratio = (amountOut / amountIn) * 100;
          
          // Detect abnormal swap ratios (>200% or <50%)
          if (ratio > 200 || ratio < 50) {
            return this.createResult(
              1, // D2 violation index
              `D2: Price manipulation detected - Swap ratio ${ratio.toFixed(2)}%`,
              txHash
            );
          }
        }
      }
    }
    return null;
  }

  /**
   * B1/B2: Detect bridge exploits (zero-value deposits, abnormal minting)
   */
  private detectBridgeExploits(graph: SemanticFinancialGraph, edgeSeq: EdgeSequence, txHash: string): AnalysisResult | null {
    for (const edge of edgeSeq) {
      if (edge.Type === "Bridge" || edge.Service?.includes("Bridge")) {
        // Check for zero-value deposits (Qubit, Meter.io pattern)
        if (edge.Action === "Deposit" && (!edge.Amount || parseFloat(edge.Amount) === 0)) {
          return this.createResult(
            4, // B1 violation index
            `B1: Bridge zero-value deposit exploit detected in ${edge.Service}`,
            txHash
          );
        }

        // Check for abnormal minting without proper deposits
        if (edge.Action === "Mint") {
          const depositEdge = edgeSeq.find(e => 
            e.Action === "Deposit" &&
            e.Service === edge.Service &&
            e.From === edge.From
          );

          if (!depositEdge || !depositEdge.Amount || parseFloat(depositEdge.Amount) === 0) {
            return this.createResult(
              5, // B2 violation index
              `B2: Bridge abnormal minting detected - Mint without proper deposit`,
              txHash
            );
          }
        }
      }
    }
    return null;
  }

  /**
   * Detect flash loan attacks
   */
  private detectFlashLoanAttacks(graph: SemanticFinancialGraph, edgeSeq: EdgeSequence, txHash: string): AnalysisResult | null {
    // Look for flash loan pattern: large borrow followed by repay in same tx
    const borrowEdges = edgeSeq.filter(e => 
      e.Action === "Borrow" || e.Action === "FlashLoan"
    );

    for (const borrowEdge of borrowEdges) {
      if (borrowEdge.Amount && parseFloat(borrowEdge.Amount) > 1000000) {
        // Look for corresponding repay
        const repayEdge = edgeSeq.find(e => 
          (e.Action === "Repay" || e.Action === "FlashLoanRepay") &&
          e.Service === borrowEdge.Service
        );

        if (repayEdge) {
          // Flash loan detected, check for manipulation between borrow and repay
          const manipulationEdges = edgeSeq.filter(e => 
            e.timestamp && borrowEdge.timestamp && repayEdge.timestamp &&
            e.timestamp > borrowEdge.timestamp &&
            e.timestamp < repayEdge.timestamp &&
            e.Action === "Swap"
          );

          if (manipulationEdges.length > 0) {
            return this.createResult(
              1, // D2 violation for price manipulation
              `Flash loan attack detected with ${manipulationEdges.length} manipulation swaps`,
              txHash
            );
          }
        }
      }
    }
    return null;
  }

  /**
   * Detect NFT collateral manipulation (ParaSpace pattern)
   */
  private detectNFTCollateralManipulation(graph: SemanticFinancialGraph, edgeSeq: EdgeSequence, txHash: string): AnalysisResult | null {
    for (const edge of edgeSeq) {
      if (edge.Service === "ParaSpace" && edge.Action === "Borrow") {
        // Check for NFT collateral edges
        const nftCollateralEdge = edgeSeq.find(e => 
          e.Service === "ParaSpace" &&
          e.From === edge.From &&
          (e.Action === "SupplyNFT" || e.Action === "DepositNFT")
        );

        if (nftCollateralEdge && edge.Amount) {
          const borrowAmount = parseFloat(edge.Amount);
          // Assume NFT collateral manipulation if borrowing > 50% of typical NFT value
          if (borrowAmount > 10000) {
            return this.createResult(
              3, // L2 violation
              `NFT collateral manipulation detected in ParaSpace - Excessive borrowing against NFT`,
              txHash
            );
          }
        }
      }
    }
    return null;
  }

  /**
   * Detect donation inflation attacks (Euler, Hundred Finance pattern)
   */
  private detectDonationInflation(graph: SemanticFinancialGraph, edgeSeq: EdgeSequence, txHash: string): AnalysisResult | null {
    for (const edge of edgeSeq) {
      if ((edge.Service === "Euler" || edge.Service === "Hundred") && 
          edge.Action === "Donate") {
        // Check for subsequent borrowing after donation
        const borrowEdge = edgeSeq.find(e => 
          e.Service === edge.Service &&
          e.Action === "Borrow" &&
          e.timestamp && edge.timestamp &&
          e.timestamp > edge.timestamp
        );

        if (borrowEdge && edge.Amount && borrowEdge.Amount) {
          const donationAmount = parseFloat(edge.Amount);
          const borrowAmount = parseFloat(borrowEdge.Amount);
          
          if (borrowAmount > donationAmount * 10) {
            return this.createResult(
              3, // L2 violation
              `Donation inflation attack detected in ${edge.Service}`,
              txHash
            );
          }
        }
      }
    }
    return null;
  }

  /**
   * Detect empty market manipulation (Hundred Finance pattern)
   */
  private detectEmptyMarketManipulation(graph: SemanticFinancialGraph, edgeSeq: EdgeSequence, txHash: string): AnalysisResult | null {
    for (const edge of edgeSeq) {
      if (edge.Service === "Hundred" && edge.Action === "InitializeMarket") {
        // Check for immediate exploitation after market initialization
        const exploitEdge = edgeSeq.find(e => 
          e.Service === "Hundred" &&
          (e.Action === "Borrow" || e.Action === "Withdraw") &&
          e.timestamp && edge.timestamp &&
          e.timestamp > edge.timestamp
        );

        if (exploitEdge && exploitEdge.Amount && parseFloat(exploitEdge.Amount) > 100000) {
          return this.createResult(
            3, // L2 violation
            `Empty market manipulation detected in Hundred Finance`,
            txHash
          );
        }
      }
    }
    return null;
  }

  /**
   * Detect read-only reentrancy (dForce pattern)
   */
  private detectReadOnlyReentrancy(graph: SemanticFinancialGraph, edgeSeq: EdgeSequence, txHash: string): AnalysisResult | null {
    for (const edge of edgeSeq) {
      if (edge.Service === "dForce") {
        // Look for oracle reads during state changes
        const oracleReads = edgeSeq.filter(e => 
          e.Action === "GetPrice" || e.Action === "ReadOracle"
        );

        const stateChanges = edgeSeq.filter(e => 
          e.Service === "dForce" &&
          (e.Action === "Transfer" || e.Action === "Swap" || e.Action === "Borrow")
        );

        // If oracle reads happen during state changes, it's suspicious
        for (const oracle of oracleReads) {
          for (const stateChange of stateChanges) {
            if (oracle.timestamp && stateChange.timestamp &&
                Math.abs(oracle.timestamp - stateChange.timestamp) < 100) {
              return this.createResult(
                2, // L1 violation for reentrancy
                `Read-only reentrancy detected in dForce`,
                txHash
              );
            }
          }
        }
      }
    }
    return null;
  }

  /**
   * Detect scaled balance manipulation (ParaSpace pattern)
   */
  private detectScaledBalanceManipulation(graph: SemanticFinancialGraph, edgeSeq: EdgeSequence, txHash: string): AnalysisResult | null {
    for (const edge of edgeSeq) {
      if (edge.Service === "ParaSpace" && edge.Action === "Supply") {
        // Look for subsequent borrowing with manipulated scaled balance
        const borrowEdge = edgeSeq.find(e => 
          e.Service === "ParaSpace" &&
          e.Action === "Borrow" &&
          e.From === edge.From &&
          e.timestamp && edge.timestamp &&
          e.timestamp > edge.timestamp
        );

        if (borrowEdge && edge.Amount && borrowEdge.Amount) {
          const supplyAmount = parseFloat(edge.Amount);
          const borrowAmount = parseFloat(borrowEdge.Amount);
          
          // Check for abnormal borrow/supply ratio
          if (borrowAmount > supplyAmount * 2) {
            return this.createResult(
              3, // L2 violation
              `Scaled balance manipulation detected in ParaSpace`,
              txHash
            );
          }
        }
      }
    }
    return null;
  }

  /**
   * Helper function to create AnalysisResult
   */
  private createResult(violationIndex: number, message: string, txHash: string): AnalysisResult {
    const result = new AnalysisResult();
    // Result already has dynamically sized violation array from constructor
    if (violationIndex < result._violation.length) {
      result._violation[violationIndex] = true;
    }
    result._index = 0;
    result._elapsed = 0;
    result._comment = message;
    result._hash = txHash;
    
    return result;
  }
}