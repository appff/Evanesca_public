import { DecodedEvent, LogEvent } from "../SemanticFinancialGraphUtils";
import { ISemanticFinancialEdge } from "./IEdge";

export interface IEdgeAdder {
  makeEdge(eLogs: DecodedEvent[], w: string, sKey: string, sAction: LogEvent, v: string): Promise<ISemanticFinancialEdge | null>;
  makeEdge(eLogs: DecodedEvent[], w: string, sKey: string, sAction: LogEvent): Promise<ISemanticFinancialEdge | null>;
}

export interface IPairInfo { t0: string, t1: string, t0Addr: string, t1Addr: string }