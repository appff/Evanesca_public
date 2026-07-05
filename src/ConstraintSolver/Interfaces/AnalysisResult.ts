import { constraintIndexMapper } from "../ConstraintIndexMapper";

export class AnalysisResult {
  public _index: number;
  public _violation: Array<boolean>; // dynamically sized based on DSL constraints
  public _elapsed: number;
  public _comment: string;
  public _hash: string;
  public blockNumber?: number;
  public protocolViolations?: any[]; // Protocol invariant violations
  public constraintViolations: any[]; // Hidden behavior / constraint violations

  constructor() {
    // Dynamically size the violation array based on actual constraint count
    const constraintCount = constraintIndexMapper.getConstraintCount();
    this._violation = new Array<boolean>(constraintCount).fill(false);
    this._index = -1;
    this._elapsed = -1;
    this._comment = "";
    this._hash = "";
    this.protocolViolations = undefined;
    this.constraintViolations = [];
  }
}
