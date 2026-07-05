import {
  ConstraintDef,
  Expression,
  BinaryExpression,
  UnaryExpression,
  ConditionalExpression,
  Identifier,
  NumberLiteral,
  StringLiteral,
  MemberAccess,
  FunctionCall,
  Condition,
  ArrayLiteral,
  ObjectLiteral,
  ArrayAccess,
  LambdaExpression,
  VariableDeclarationStatement
} from './DSLParser';
import { DebugLogger } from '../Utils/DebugLogger';
import * as crypto from 'crypto';

/**
 * Compiled constraint function signature
 */
export type CompiledConstraint = {
  name: string;
  hash: string;
  whenFn?: (context: any) => boolean;
  conditionFn?: (context: any) => any;
  violationFn?: (context: any) => boolean;
  message?: string;
  sourceCode: string;
};

/**
 * DSL Compiler - Transforms DSL constraints into optimized JavaScript functions
 * Provides significant performance improvements over interpreted execution
 */
export class DSLCompiler {
  private compiledCache: Map<string, CompiledConstraint> = new Map();
  private compileStats = {
    totalCompilations: 0,
    cacheHits: 0,
    totalCompileTime: 0,
    averageCompileTime: 0
  };
  // Track local variables declared with 'let' during compilation
  private localVariables: Set<string> = new Set();

  /**
   * Compile a constraint definition into optimized JavaScript
   */
  compileConstraint(constraint: ConstraintDef): CompiledConstraint {
    const startTime = performance.now();

    // Check cache first
    const cacheKey = this.generateCacheKey(constraint);
    if (this.compiledCache.has(cacheKey)) {
      this.compileStats.cacheHits++;
      DebugLogger.core(`💾 [DSLCompiler] Cache hit for constraint: ${constraint.name}`);
      return this.compiledCache.get(cacheKey)!;
    }

    // Reset local variables for this constraint
    this.localVariables.clear();

    DebugLogger.core(`🔨 [DSLCompiler] Compiling constraint: ${constraint.name}`);

    try {
      // Debug: Show constraint structure
      DebugLogger.core(`🔍 [DSLCompiler] Constraint fields: when=${!!constraint.when}, condition=${!!constraint.condition}, conditions=${!!constraint.conditions}, violation=${!!constraint.violation}`);

      // Generate JavaScript code
      const sourceCode = this.generateConstraintCode(constraint);

      // Create compiled constraint object
      const compiled: CompiledConstraint = {
        name: constraint.name,
        hash: cacheKey,
        message: constraint.message,
        sourceCode
      };

      // Compile individual functions
      if (constraint.when) {
        const whenCode = this.compileExpression(constraint.when);
        DebugLogger.core(`🔍 [DSLCompiler] When code: ${whenCode}`);
        compiled.whenFn = new Function('context', `return ${whenCode};`) as (context: any) => boolean;
      }

      if (constraint.condition) {
        const conditionCode = this.compileCondition(constraint.condition);
        DebugLogger.core(`🔍 [DSLCompiler] Condition code:\n${conditionCode}`);
        compiled.conditionFn = new Function('context', conditionCode) as (context: any) => any;
      }

      // Handle conditions block (statement block with let/return)
      if (constraint.conditions) {
        DebugLogger.core(`🔍 [DSLCompiler] Processing conditions block with ${constraint.conditions.length} statements`);
        const conditionsCode = this.compileConditionsBlock(constraint.conditions);
        DebugLogger.core(`🔍 [DSLCompiler] Conditions code:\n${conditionsCode}`);
        compiled.conditionFn = new Function('context', conditionsCode) as (context: any) => any;

        // Clear local variables after compiling conditions block
        // Violation expression needs to access these through context, not as local variables
        this.localVariables.clear();
      }

      if (constraint.violation) {
        const violationCode = this.compileExpression(constraint.violation);
        DebugLogger.core(`🔍 [DSLCompiler] Violation code: ${violationCode}`);
        compiled.violationFn = new Function('context', `return ${violationCode};`) as (context: any) => boolean;
      }

      // Update stats
      const compileTime = performance.now() - startTime;
      this.compileStats.totalCompilations++;
      this.compileStats.totalCompileTime += compileTime;
      this.compileStats.averageCompileTime = this.compileStats.totalCompileTime / this.compileStats.totalCompilations;

      // Cache the compiled constraint
      this.compiledCache.set(cacheKey, compiled);

      DebugLogger.core(`✅ [DSLCompiler] Compiled ${constraint.name} in ${compileTime.toFixed(2)}ms`);
      
      return compiled;
    } catch (error) {
      DebugLogger.error(`❌ [DSLCompiler] Failed to compile ${constraint.name}: ${error}`);
      throw error;
    }
  }

  /**
   * Compile multiple constraints in batch
   */
  compileConstraints(constraints: ConstraintDef[]): CompiledConstraint[] {
    DebugLogger.core(`🔨 [DSLCompiler] Batch compiling ${constraints.length} constraints`);
    const startTime = performance.now();
    
    const compiled = constraints.map(c => this.compileConstraint(c));
    
    const totalTime = performance.now() - startTime;
    DebugLogger.core(`✅ [DSLCompiler] Batch compilation completed in ${totalTime.toFixed(2)}ms`);
    
    return compiled;
  }

  /**
   * Generate complete JavaScript code for a constraint
   */
  private generateConstraintCode(constraint: ConstraintDef): string {
    const lines: string[] = [];
    
    lines.push(`// Constraint: ${constraint.name}`);
    
    if (constraint.when) {
      lines.push(`// When: ${this.compileExpression(constraint.when)}`);
    }
    
    if (constraint.condition) {
      lines.push(`// Condition:`);
      lines.push(this.compileCondition(constraint.condition));
    }
    
    if (constraint.violation) {
      lines.push(`// Violation: ${this.compileExpression(constraint.violation)}`);
    }
    
    return lines.join('\n');
  }

  /**
   * Compile an expression to JavaScript code
   */
  private compileExpression(expr: Expression): string {
    switch (expr.type) {
      case 'binary_expression':
        return this.compileBinaryExpression(expr as BinaryExpression);

      case 'unary_expression':
        return this.compileUnaryExpression(expr as UnaryExpression);

      case 'conditional_expression':
        return this.compileConditionalExpression(expr as ConditionalExpression);

      case 'identifier':
        return this.compileIdentifier(expr as Identifier);

      case 'number':
        return (expr as NumberLiteral).value.toString();

      case 'string':
        return `"${(expr as StringLiteral).value}"`;

      case 'member_access':
        return this.compileMemberAccess(expr as MemberAccess);

      case 'function_call':
        return this.compileFunctionCall(expr as FunctionCall);

      case 'array_literal':
        return this.compileArrayLiteral(expr as ArrayLiteral);

      case 'object_literal':
        return this.compileObjectLiteral(expr as ObjectLiteral);

      case 'array_access':
        return this.compileArrayAccess(expr as ArrayAccess);

      case 'lambda':
        return this.compileLambdaExpression(expr as LambdaExpression);

      case 'variable_declaration':
        return this.compileVariableDeclaration(expr as any as VariableDeclarationStatement);

      default:
        throw new Error(`Unknown expression type: ${expr.type}`);
    }
  }

  /**
   * Compile binary expression (e.g., a > b, x == y)
   */
  private compileBinaryExpression(expr: BinaryExpression): string {
    const left = this.compileExpression(expr.left);
    const right = this.compileExpression(expr.right);
    
    // Handle special operators
    switch (expr.operator) {
      case '&&':
      case '||':
        return `(${left} ${expr.operator} ${right})`;
      case '==':
        // CRITICAL FIX: Keep == as == (not ===) to allow type coercion
        // This is essential for comparing objects with valueOf/toString to primitives
        // Example: edge.source (object) == edges[i].source (string) needs type coercion
        return `(${left} == ${right})`;
      case '!=':
        // CRITICAL FIX: Keep != as != (not !==) for consistency with ==
        return `(${left} != ${right})`;
      default:
        return `(${left} ${expr.operator} ${right})`;
    }
  }

  /**
   * Compile unary expression (e.g., !x, -n)
   */
  private compileUnaryExpression(expr: UnaryExpression): string {
    const operand = this.compileExpression(expr.argument);
    
    // Handle unary operators
    switch (expr.operator) {
      case '!':
        return `(!${operand})`;
      case '-':
        return `(-${operand})`;
      case '+':
        return `(+${operand})`;
      default:
        return `(${expr.operator}${operand})`;
    }
  }

  /**
   * Compile conditional expression (ternary operator: test ? consequent : alternate)
   */
  private compileConditionalExpression(expr: ConditionalExpression): string {
    const test = this.compileExpression(expr.test);
    const consequent = this.compileExpression(expr.consequent);
    const alternate = this.compileExpression(expr.alternate);
    return `(${test} ? ${consequent} : ${alternate})`;
  }

  /**
   * Compile identifier (variable reference)
   */
  private compileIdentifier(expr: Identifier): string {
    // Check if this is a local variable (declared with 'let')
    if (this.localVariables.has(expr.name)) {
      // Local variable - access directly without context prefix
      return expr.name;
    }
    // Context property - access through context object
    return `context.${expr.name}`;
  }

  /**
   * Compile member access (e.g., edge.type)
   */
  private compileMemberAccess(expr: MemberAccess): string {
    // Handle object - it can be either a string or an Expression
    const object = typeof expr.object === 'string'
      ? `context.${expr.object}`
      : this.compileExpression(expr.object);

    return `${object}?.${expr.property}`;
  }

  /**
   * Compile function call
   */
  private compileFunctionCall(expr: FunctionCall): string {
    const args = expr.arguments.map(arg => this.compileExpression(arg)).join(', ');

    // If function is a string, check for built-in functions
    if (typeof expr.function === 'string') {
      switch (expr.function) {
        case 'abs':
          return `Math.abs(${args})`;
        case 'max':
          return `Math.max(${args})`;
        case 'min':
          return `Math.min(${args})`;
        default:
          // Context method
          return `context.${expr.function}(${args})`;
      }
    } else {
      // Function is an Expression (e.g., member access like array.filter)
      const functionExpr = this.compileExpression(expr.function);
      return `${functionExpr}(${args})`;
    }
  }

  /**
   * Compile array literal (e.g., [1, 2, 3])
   */
  private compileArrayLiteral(expr: ArrayLiteral): string {
    const elements = expr.elements.map(e => this.compileExpression(e)).join(', ');
    return `[${elements}]`;
  }

  /**
   * Compile object literal (e.g., {key: value})
   */
  private compileObjectLiteral(expr: ObjectLiteral): string {
    const props = expr.properties.map(p => {
      const key = typeof p.key === 'string' ? p.key : this.compileExpression(p.key);
      const value = this.compileExpression(p.value);
      return `${key}: ${value}`;
    }).join(', ');
    return `{${props}}`;
  }

  /**
   * Compile array access (e.g., arr[0])
   */
  private compileArrayAccess(expr: ArrayAccess): string {
    const array = this.compileExpression(expr.array);
    const index = this.compileExpression(expr.index);
    return `${array}[${index}]`;
  }

  /**
   * Compile lambda expression (e.g., (x) => x * 2)
   */
  private compileLambdaExpression(expr: LambdaExpression): string {
    const params = expr.parameters.join(', ');

    // Save current local variables and add lambda parameters
    const savedLocalVars = new Set(this.localVariables);
    expr.parameters.forEach(param => this.localVariables.add(param));

    // Compile body with lambda parameters tracked as local variables
    const body = this.compileExpression(expr.body);

    // Restore previous local variables
    this.localVariables = savedLocalVars;

    return `((${params}) => ${body})`;
  }

  /**
   * Compile variable declaration (e.g., let x = 5)
   */
  private compileVariableDeclaration(stmt: VariableDeclarationStatement): string {
    const value = this.compileExpression(stmt.initializer);
    return `let ${stmt.identifier} = ${value}`;
  }

  /**
   * Compile conditions block (statement block with let/return)
   */
  private compileConditionsBlock(statements: Expression[]): string {
    const lines: string[] = [];
    const localVarNames: string[] = [];

    // First pass: extract all local variable names
    for (const stmt of statements) {
      if (stmt.type === 'variable_declaration') {
        const varStmt = stmt as any as VariableDeclarationStatement;
        this.localVariables.add(varStmt.identifier);
        localVarNames.push(varStmt.identifier);
      }
    }

    // Second pass: compile statements with local variable tracking
    for (const stmt of statements) {
      if (stmt.type === 'variable_declaration') {
        lines.push(this.compileVariableDeclaration(stmt as any as VariableDeclarationStatement) + ';');
      } else {
        // This is the return expression - we need to return both the result and all local variables
        lines.push(`const __result = ${this.compileExpression(stmt)};`);
      }
    }

    // Return an object with all local variables and the result
    // This allows the violation expression to access local variables
    const returnObj = [
      '__result: __result',
      ...localVarNames.map(name => `${name}: ${name}`)
    ].join(', ');
    lines.push(`return { ${returnObj} };`);

    const result = lines.join('\n');
    // Debug logging to see generated JavaScript
    DebugLogger.core(`🔍 [DSLCompiler] Generated conditions block:\n${result}`);
    return result;
  }

  /**
   * Compile condition object to JavaScript code
   */
  private compileCondition(conditions: Condition[]): string {
    const lines: string[] = [];
    
    // Create optimized condition object
    lines.push('const conditionVars = {};');
    
    for (const condition of conditions) {
      const varName = condition.name;
      const value = this.compileExpression(condition.expression);
      
      // Use more efficient assignment
      lines.push(`conditionVars.${varName} = ${value};`);
    }
    
    lines.push('return conditionVars;');
    
    return lines.join('\n');
  }

  /**
   * Generate cache key for constraint
   */
  private generateCacheKey(constraint: ConstraintDef): string {
    const constraintStr = JSON.stringify(constraint);
    return crypto.createHash('sha256').update(constraintStr).digest('hex').substring(0, 16);
  }

  /**
   * Execute compiled constraint
   */
  executeCompiled(compiled: CompiledConstraint, context: any): {
    shouldCheck: boolean;
    conditionVars?: any;
    violated: boolean;
    message?: string;
  } {
    // Debug: Check if this is a MiCA unverified user constraint evaluation
    const isUnverifiedUser = context.edge?.participant?.verification_status === 'unverified';
    const hasHighValue = context.edge?.value_usd > 150;
    const shouldDebug = isUnverifiedUser && hasHighValue && compiled.name === 'MICA_UNVERIFIED_USER_LIMIT';

    if (shouldDebug) {
      DebugLogger.core(`\n🔍 [EXECUTE] === ${compiled.name} Execution Start ===`);
      DebugLogger.core(`   Participant: ${context.edge?.participant?.verification_status}`);
      DebugLogger.core(`   Value USD: $${context.edge?.value_usd}`);
      DebugLogger.core(`   Edges available: ${context.edges?.length || 0}`);
    }

    // Check when condition
    if (compiled.whenFn) {
      const whenResult = compiled.whenFn(context);

      if (shouldDebug) {
        DebugLogger.core(`🔍 [WHEN] Result: ${whenResult}`);
      }

      if (!whenResult) {
        if (shouldDebug) {
          DebugLogger.core(`❌ [WHEN] Failed - skipping constraint`);
        }
        return { shouldCheck: false, violated: false };
      }
    }

    // Evaluate condition
    let conditionVars = {};
    if (compiled.conditionFn) {
      // Debug BEFORE calling conditionFn
      if (shouldDebug) {
        DebugLogger.core(`🔍 [PRE-CONDITIONS] Context state:`);
        DebugLogger.core(`   edges length: ${context.edges?.length || 0}`);
        DebugLogger.core(`   edge.source type: ${typeof context.edge?.source}`);
        DebugLogger.core(`   edge.source value: ${context.edge?.source}`);
        if (context.edges && context.edges.length > 0) {
          DebugLogger.core(`   edges[0].source: ${context.edges[0]?.source} (type: ${typeof context.edges[0]?.source})`);
          const testComparison = context.edge?.source == context.edges[0]?.source;
          DebugLogger.core(`   Test: edge.source == edges[0].source = ${testComparison}`);
        }
      }

      conditionVars = compiled.conditionFn(context);

      if (shouldDebug) {
        DebugLogger.core(`🔍 [CONDITIONS] Calculated vars:`);
        DebugLogger.core(`   user_txs_24h count: ${conditionVars.user_txs_24h?.length || 0}`);
        DebugLogger.core(`   daily_volume_usd: ${conditionVars.daily_volume_usd}`);
        DebugLogger.core(`   daily_volume_eur: ${conditionVars.daily_volume_eur}`);
        DebugLogger.core(`   All vars: ${JSON.stringify(conditionVars, null, 2)}`);
      }
    }

    // Check violation - preserve token classification functions from original context
    const violationContext = {
      ...context,
      ...conditionVars,
      // Ensure token classification functions are preserved
      is_governance_token: context.is_governance_token,
      is_lp_token: context.is_lp_token,
      is_vault_token: context.is_vault_token
    };
    const violated = compiled.violationFn ? compiled.violationFn(violationContext) : false;

    if (shouldDebug) {
      DebugLogger.core(`🔍 [VIOLATION] Result: ${violated}`);
      DebugLogger.core(`   Violation check: daily_volume_eur (${conditionVars.daily_volume_eur}) > 150?`);
      DebugLogger.core(`🔍 [EXECUTE] === ${compiled.name} Execution End ===\n`);
    }

    return {
      shouldCheck: true,
      conditionVars,
      violated,
      message: violated ? compiled.message : undefined
    };
  }

  /**
   * Get compilation statistics
   */
  getStats(): typeof this.compileStats {
    return { ...this.compileStats };
  }

  /**
   * Clear compiled cache
   */
  clearCache(): void {
    this.compiledCache.clear();
    DebugLogger.core('🗑️ [DSLCompiler] Cleared compiled constraint cache');
  }

  /**
   * Get human-readable summary
   */
  getSummary(): string {
    const stats = this.getStats();
    const cacheHitRate = stats.totalCompilations > 0 
      ? (stats.cacheHits / (stats.totalCompilations + stats.cacheHits) * 100).toFixed(1)
      : '0.0';
    
    return `DSL Compiler Summary:
- Total Compilations: ${stats.totalCompilations}
- Cache Hits: ${stats.cacheHits}
- Cache Hit Rate: ${cacheHitRate}%
- Average Compile Time: ${stats.averageCompileTime.toFixed(2)}ms
- Cache Size: ${this.compiledCache.size} constraints`;
  }
}

// Global compiler instance
let globalCompiler: DSLCompiler | undefined;

/**
 * Get global DSL compiler instance
 */
export function getGlobalDSLCompiler(): DSLCompiler {
  if (!globalCompiler) {
    globalCompiler = new DSLCompiler();
  }
  return globalCompiler;
}

/**
 * Set global DSL compiler instance (for testing)
 */
export function setGlobalDSLCompiler(compiler: DSLCompiler): void {
  globalCompiler = compiler;
}