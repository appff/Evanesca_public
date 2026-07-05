/**
 * Simple Graph Implementation to replace libG dependency
 * Provides basic multigraph functionality needed by SemanticFinancialGraphBuilder
 */

export interface GraphNode {
  [key: string]: any;
}

export interface GraphEdge {
  v: string;
  w: string;
  name?: any;
}

export class SimpleGraph {
  private nodeMap: Map<string, GraphNode> = new Map();
  private edgeMap: Map<string, GraphEdge[]> = new Map();
  private edgeList: GraphEdge[] = [];
  private multigraph: boolean;

  constructor(options?: { multigraph?: boolean }) {
    this.multigraph = options?.multigraph || false;
  }

  // Node operations
  hasNode(id: string): boolean {
    return this.nodeMap.has(id);
  }

  setNode(id: string, data?: GraphNode): void {
    this.nodeMap.set(id, data || {});
  }

  node(id: string): GraphNode | undefined {
    return this.nodeMap.get(id);
  }

  nodes(): string[] {
    return Array.from(this.nodeMap.keys());
  }

  removeNode(id: string): void {
    this.nodeMap.delete(id);
    // Remove edges connected to this node
    this.edgeList = this.edgeList.filter(e => e.v !== id && e.w !== id);
    this.edgeMap.delete(id);
    for (const [key, edges] of this.edgeMap.entries()) {
      this.edgeMap.set(key, edges.filter(e => e.w !== id));
    }
  }

  // Edge operations
  setEdge(edge: GraphEdge | { v: string; w: string; name?: any }): void {
    const { v, w, name } = edge;
    
    if (!this.edgeMap.has(v)) {
      this.edgeMap.set(v, []);
    }
    
    const newEdge = { v, w, name };
    
    if (!this.multigraph) {
      // Remove existing edge if not multigraph
      const existingEdges = this.edgeMap.get(v) || [];
      const index = existingEdges.findIndex(e => e.w === w);
      if (index !== -1) {
        existingEdges[index] = newEdge;
      } else {
        existingEdges.push(newEdge);
      }
      this.edgeMap.set(v, existingEdges);
    } else {
      // Add edge for multigraph
      this.edgeMap.get(v)!.push(newEdge);
    }
    
    this.edgeList.push(newEdge);
  }

  edge(v: string, w: string): any {
    const edges = this.edgeMap.get(v);
    if (!edges) return undefined;
    
    const edge = edges.find(e => e.w === w);
    return edge?.name;
  }

  edges(): GraphEdge[] {
    return this.edgeList;
  }

  hasEdge(v: string, w: string): boolean {
    const edges = this.edgeMap.get(v);
    if (!edges) return false;
    return edges.some(e => e.w === w);
  }

  outEdges(v: string): GraphEdge[] {
    return this.edgeMap.get(v) || [];
  }

  inEdges(w: string): GraphEdge[] {
    return this.edgeList.filter(e => e.w === w);
  }

  // Utility methods
  nodeCount(): number {
    return this.nodeMap.size;
  }

  edgeCount(): number {
    return this.edgeList.length;
  }

  sources(): string[] {
    const targets = new Set(this.edgeList.map(e => e.w));
    return this.nodes().filter(n => !targets.has(n));
  }

  sinks(): string[] {
    const sources = new Set(this.edgeList.map(e => e.v));
    return this.nodes().filter(n => !sources.has(n));
  }
}