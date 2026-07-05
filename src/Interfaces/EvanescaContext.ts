import { AnalysisResult } from "../ConstraintSolver/Interfaces/AnalysisResult";
// ValidationFramework import removed - component was unused and has been cleaned up

type transactionList = string[];

export interface EvanescaContext {
  tList: transactionList;
  fins: Array<number>;
  reports: Array<AnalysisResult>;
  analyzed: Set<string>;
  complexity: Array<number>;
  edges?: any[];  // Added to store actual SFG edges from bGraph.edgeSeq
  // formalValidation field removed - ValidationFramework was disabled and unused
  formalAnalysis?: Array<{
    transactionHash: string;
    result: any; // FormalAnalysisResult
    timestamp: number;
  }>;  // Added to store formal analysis results for paper submission
  micaCompliance?: Array<{
    transactionHash: string;
    violations: any[];
    timestamp: number;
  }>;  // Added to store MiCA compliance results for regulation mode
}
