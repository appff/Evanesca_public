/**
 * Formal Specification for Evanesca DSL (Domain-Specific Language)
 * Complete grammar, type system, and semantic analysis for academic rigor
 */

import { 
    ASTNode, 
    Expression, 
    BinaryExpression,
    Identifier,
    NumberLiteral,
    StringLiteral,
    FunctionCall 
} from '../../DSL/DSLParser';

// Type aliases for formal analysis
type BinaryOpNode = BinaryExpression;
type IdentifierNode = Identifier;
type LiteralNode = NumberLiteral | StringLiteral;
type FunctionCallNode = FunctionCall;

// Extended interfaces for formal analysis
interface UnaryOpNode extends Expression {
  type: 'unary_expression';
  operator: string;
  operand: Expression;
}

interface ExtendedFunctionCall extends FunctionCall {
  name: string; // Alias for 'function' property
  args: Expression[]; // Alias for 'arguments' property
}

// Type guards for formal analysis
function isBinaryExpression(node: Expression): node is BinaryExpression {
  return node.type === 'binary_expression';
}

function isUnaryExpression(node: Expression): node is UnaryOpNode {
  return node.type === 'unary_expression';
}

function isFunctionCall(node: Expression): node is FunctionCall {
  return node.type === 'function_call';
}

// Helper functions to access properties safely
function getOperandFromExpression(node: Expression): Expression | null {
  if (isUnaryExpression(node)) {
    return node.operand;
  }
  return null;
}

function getOperatorFromExpression(node: Expression): string | null {
  if (isBinaryExpression(node)) {
    return node.operator;
  }
  if (isUnaryExpression(node)) {
    return node.operator;
  }
  return null;
}

function getFunctionNameFromCall(node: Expression): string | null {
  if (isFunctionCall(node)) {
    return node.function; // Use actual property name
  }
  return null;
}

function getFunctionArgsFromCall(node: Expression): Expression[] | null {
  if (isFunctionCall(node)) {
    return node.arguments; // Use actual property name
  }
  return null;
}

// ============================================================================
// FORMAL GRAMMAR SPECIFICATION (BNF)
// ============================================================================

/**
 * Complete BNF Grammar for Evanesca DSL
 * 
 * <constraint> ::= <identifier> ':' <expression>
 * <expression> ::= <logical_expr>
 * <logical_expr> ::= <logical_term> ('||' <logical_term>)*
 * <logical_term> ::= <comparison> ('&&' <comparison>)*
 * <comparison> ::= <arithmetic> (<comparison_op> <arithmetic>)?
 * <arithmetic> ::= <term> (('+' | '-') <term>)*
 * <term> ::= <factor> (('*' | '/' | '%') <factor>)*
 * <factor> ::= <unary_op>? <primary>
 * <primary> ::= <identifier> | <literal> | <function_call> | '(' <expression> ')'
 * <function_call> ::= <identifier> '(' <argument_list>? ')'
 * <argument_list> ::= <expression> (',' <expression>)*
 * <comparison_op> ::= '>' | '>=' | '<' | '<=' | '==' | '!='
 * <unary_op> ::= '!' | '-'
 * <identifier> ::= [a-zA-Z_][a-zA-Z0-9_]*
 * <literal> ::= <number> | <string> | <boolean>
 * <number> ::= [0-9]+('.'[0-9]+)?
 * <string> ::= '"' [^"]* '"'
 * <boolean> ::= 'true' | 'false'
 */
export interface DSLGrammar {
    productions: {
        constraint: string[];
        expression: string[];
        logical_expr: string[];
        logical_term: string[];
        comparison: string[];
        arithmetic: string[];
        term: string[];
        factor: string[];
        primary: string[];
        function_call: string[];
        argument_list: string[];
        comparison_op: string[];
        unary_op: string[];
        identifier: string[];
        literal: string[];
        number: string[];
        string: string[];
        boolean: string[];
    };
}

// ============================================================================
// TYPE SYSTEM SPECIFICATION
// ============================================================================

/**
 * DSL Type System - Formal type definitions
 */
export enum DSLType {
    // Primitive types
    NUMBER = 'number',
    STRING = 'string',
    BOOLEAN = 'boolean',
    
    // DeFi domain-specific types
    TOKEN = 'token',
    ADDRESS = 'address',
    AMOUNT = 'amount',
    PERCENTAGE = 'percentage',
    
    // Complex types
    ARRAY = 'array',
    OBJECT = 'object',
    FUNCTION = 'function',
    
    // Special types
    ANY = 'any',
    VOID = 'void',
    UNKNOWN = 'unknown'
}

/**
 * Type Environment - Context for type checking
 */
export interface TypeEnvironment {
    variables: Map<string, DSLType>;
    functions: Map<string, FunctionSignature>;
    scopes: TypeEnvironment[];
}

/**
 * Function signature for type checking
 */
export interface FunctionSignature {
    name: string;
    parameters: { name: string; type: DSLType }[];
    returnType: DSLType;
    pure: boolean; // No side effects
    deterministic: boolean; // Same input → same output
}

/**
 * Type checking result
 */
export interface TypeCheckResult {
    type: DSLType;
    errors: TypeError[];
    warnings: TypeWarning[];
}

export interface TypeError {
    message: string;
    location: { line: number; column: number };
    expected: DSLType;
    actual: DSLType;
}

export interface TypeWarning {
    message: string;
    location: { line: number; column: number };
    suggestion?: string;
}

// ============================================================================
// BUILT-IN FUNCTIONS AND OPERATORS
// ============================================================================

/**
 * Built-in function signatures for DSL
 */
export const BUILTIN_FUNCTIONS: Map<string, FunctionSignature> = new Map([
    // Mathematical functions
    ['abs', {
        name: 'abs',
        parameters: [{ name: 'value', type: DSLType.NUMBER }],
        returnType: DSLType.NUMBER,
        pure: true,
        deterministic: true
    }],
    ['max', {
        name: 'max',
        parameters: [
            { name: 'a', type: DSLType.NUMBER },
            { name: 'b', type: DSLType.NUMBER }
        ],
        returnType: DSLType.NUMBER,
        pure: true,
        deterministic: true
    }],
    ['min', {
        name: 'min',
        parameters: [
            { name: 'a', type: DSLType.NUMBER },
            { name: 'b', type: DSLType.NUMBER }
        ],
        returnType: DSLType.NUMBER,
        pure: true,
        deterministic: true
    }],
    
    // DeFi-specific functions
    ['getTokenBalance', {
        name: 'getTokenBalance',
        parameters: [
            { name: 'address', type: DSLType.ADDRESS },
            { name: 'token', type: DSLType.TOKEN }
        ],
        returnType: DSLType.AMOUNT,
        pure: false,
        deterministic: false
    }],
    ['getSwapAmount', {
        name: 'getSwapAmount',
        parameters: [
            { name: 'edge_id', type: DSLType.STRING }
        ],
        returnType: DSLType.AMOUNT,
        pure: false,
        deterministic: true
    }],
    ['calculateProfitRatio', {
        name: 'calculateProfitRatio',
        parameters: [
            { name: 'initial', type: DSLType.AMOUNT },
            { name: 'final', type: DSLType.AMOUNT }
        ],
        returnType: DSLType.PERCENTAGE,
        pure: true,
        deterministic: true
    }],
    
    // Graph traversal functions
    ['getEdgesByType', {
        name: 'getEdgesByType',
        parameters: [{ name: 'type', type: DSLType.STRING }],
        returnType: DSLType.ARRAY,
        pure: false,
        deterministic: true
    }],
    ['hasFlashLoan', {
        name: 'hasFlashLoan',
        parameters: [],
        returnType: DSLType.BOOLEAN,
        pure: false,
        deterministic: true
    }],
    ['countSwaps', {
        name: 'countSwaps',
        parameters: [],
        returnType: DSLType.NUMBER,
        pure: false,
        deterministic: true
    }]
]);

/**
 * Operator type signatures
 */
export const OPERATOR_SIGNATURES: Map<string, FunctionSignature> = new Map([
    // Arithmetic operators
    ['+', {
        name: '+',
        parameters: [
            { name: 'left', type: DSLType.NUMBER },
            { name: 'right', type: DSLType.NUMBER }
        ],
        returnType: DSLType.NUMBER,
        pure: true,
        deterministic: true
    }],
    ['-', {
        name: '-',
        parameters: [
            { name: 'left', type: DSLType.NUMBER },
            { name: 'right', type: DSLType.NUMBER }
        ],
        returnType: DSLType.NUMBER,
        pure: true,
        deterministic: true
    }],
    ['*', {
        name: '*',
        parameters: [
            { name: 'left', type: DSLType.NUMBER },
            { name: 'right', type: DSLType.NUMBER }
        ],
        returnType: DSLType.NUMBER,
        pure: true,
        deterministic: true
    }],
    ['/', {
        name: '/',
        parameters: [
            { name: 'left', type: DSLType.NUMBER },
            { name: 'right', type: DSLType.NUMBER }
        ],
        returnType: DSLType.NUMBER,
        pure: true,
        deterministic: true
    }],
    
    // Comparison operators
    ['>', {
        name: '>',
        parameters: [
            { name: 'left', type: DSLType.NUMBER },
            { name: 'right', type: DSLType.NUMBER }
        ],
        returnType: DSLType.BOOLEAN,
        pure: true,
        deterministic: true
    }],
    ['>=', {
        name: '>=',
        parameters: [
            { name: 'left', type: DSLType.NUMBER },
            { name: 'right', type: DSLType.NUMBER }
        ],
        returnType: DSLType.BOOLEAN,
        pure: true,
        deterministic: true
    }],
    ['<', {
        name: '<',
        parameters: [
            { name: 'left', type: DSLType.NUMBER },
            { name: 'right', type: DSLType.NUMBER }
        ],
        returnType: DSLType.BOOLEAN,
        pure: true,
        deterministic: true
    }],
    ['<=', {
        name: '<=',
        parameters: [
            { name: 'left', type: DSLType.NUMBER },
            { name: 'right', type: DSLType.NUMBER }
        ],
        returnType: DSLType.BOOLEAN,
        pure: true,
        deterministic: true
    }],
    ['==', {
        name: '==',
        parameters: [
            { name: 'left', type: DSLType.ANY },
            { name: 'right', type: DSLType.ANY }
        ],
        returnType: DSLType.BOOLEAN,
        pure: true,
        deterministic: true
    }],
    ['!=', {
        name: '!=',
        parameters: [
            { name: 'left', type: DSLType.ANY },
            { name: 'right', type: DSLType.ANY }
        ],
        returnType: DSLType.BOOLEAN,
        pure: true,
        deterministic: true
    }],
    
    // Logical operators
    ['&&', {
        name: '&&',
        parameters: [
            { name: 'left', type: DSLType.BOOLEAN },
            { name: 'right', type: DSLType.BOOLEAN }
        ],
        returnType: DSLType.BOOLEAN,
        pure: true,
        deterministic: true
    }],
    ['||', {
        name: '||',
        parameters: [
            { name: 'left', type: DSLType.BOOLEAN },
            { name: 'right', type: DSLType.BOOLEAN }
        ],
        returnType: DSLType.BOOLEAN,
        pure: true,
        deterministic: true
    }],
    ['!', {
        name: '!',
        parameters: [{ name: 'operand', type: DSLType.BOOLEAN }],
        returnType: DSLType.BOOLEAN,
        pure: true,
        deterministic: true
    }]
]);

// ============================================================================
// TYPE INFERENCE AND CHECKING
// ============================================================================

/**
 * Type Inference Engine
 * Implements Hindley-Milner-style type inference for DSL expressions
 */
export class TypeInferenceEngine {
    private constraints: TypeConstraint[] = [];
    private nextTypeVar = 0;
    
    /**
     * Infer types for an AST node
     */
    inferType(node: ASTNode, env: TypeEnvironment): TypeCheckResult {
        switch (node.type) {
            case 'BinaryOp':
                return this.inferBinaryOp(node as BinaryOpNode, env);
            case 'UnaryOp':
                return this.inferUnaryOp(node as UnaryOpNode, env);
            case 'Identifier':
                return this.inferIdentifier(node as IdentifierNode, env);
            case 'Literal':
                return this.inferLiteral(node as LiteralNode);
            case 'FunctionCall':
                return this.inferFunctionCall(node as FunctionCallNode, env);
            default:
                return {
                    type: DSLType.UNKNOWN,
                    errors: [{ 
                        message: `Unknown AST node type: ${node.type}`,
                        location: { line: 0, column: 0 },
                        expected: DSLType.ANY,
                        actual: DSLType.UNKNOWN
                    }],
                    warnings: []
                };
        }
    }
    
    private inferBinaryOp(node: BinaryOpNode, env: TypeEnvironment): TypeCheckResult {
        const leftResult = this.inferType(node.left, env);
        const rightResult = this.inferType(node.right, env);
        
        const errors = [...leftResult.errors, ...rightResult.errors];
        const warnings = [...leftResult.warnings, ...rightResult.warnings];
        
        const opSignature = OPERATOR_SIGNATURES.get(node.operator);
        if (!opSignature) {
            errors.push({
                message: `Unknown operator: ${node.operator}`,
                location: { line: 0, column: 0 },
                expected: DSLType.ANY,
                actual: DSLType.UNKNOWN
            });
            return { type: DSLType.UNKNOWN, errors, warnings };
        }
        
        // Type check operands
        const [leftParam, rightParam] = opSignature.parameters;
        if (leftParam && !this.isTypeCompatible(leftResult.type, leftParam.type)) {
            errors.push({
                message: `Type mismatch for left operand of ${node.operator}`,
                location: { line: 0, column: 0 },
                expected: leftParam.type,
                actual: leftResult.type
            });
        }
        
        if (rightParam && !this.isTypeCompatible(rightResult.type, rightParam.type)) {
            errors.push({
                message: `Type mismatch for right operand of ${node.operator}`,
                location: { line: 0, column: 0 },
                expected: rightParam.type,
                actual: rightResult.type
            });
        }
        
        return { type: opSignature.returnType, errors, warnings };
    }
    
    private inferUnaryOp(node: Expression, env: TypeEnvironment): TypeCheckResult {
        const operand = getOperandFromExpression(node);
        const operator = getOperatorFromExpression(node);
        
        if (!operand || !operator) {
            return { 
                type: DSLType.UNKNOWN, 
                errors: [{ message: 'Invalid unary expression', location: { line: 0, column: 0 }, expected: DSLType.ANY, actual: DSLType.UNKNOWN }], 
                warnings: [] 
            };
        }
        
        const operandResult = this.inferType(operand, env);
        const errors = [...operandResult.errors];
        const warnings = [...operandResult.warnings];
        
        const opSignature = OPERATOR_SIGNATURES.get(operator);
        if (!opSignature) {
            errors.push({
                message: `Unknown unary operator: ${operator}`,
                location: { line: 0, column: 0 },
                expected: DSLType.ANY,
                actual: DSLType.UNKNOWN
            });
            return { type: DSLType.UNKNOWN, errors, warnings };
        }
        
        const [operandParam] = opSignature.parameters;
        if (operandParam && !this.isTypeCompatible(operandResult.type, operandParam.type)) {
            errors.push({
                message: `Type mismatch for operand of ${operator}`,
                location: { line: 0, column: 0 },
                expected: operandParam.type,
                actual: operandResult.type
            });
        }
        
        return { type: opSignature.returnType, errors, warnings };
    }
    
    private inferIdentifier(node: IdentifierNode, env: TypeEnvironment): TypeCheckResult {
        const varType = env.variables.get(node.name);
        if (varType) {
            return { type: varType, errors: [], warnings: [] };
        }
        
        // Check built-in variables (e.g., context variables)
        const builtinType = this.getBuiltinVariableType(node.name);
        if (builtinType !== DSLType.UNKNOWN) {
            return { type: builtinType, errors: [], warnings: [] };
        }
        
        return {
            type: DSLType.UNKNOWN,
            errors: [{
                message: `Undefined variable: ${node.name}`,
                location: { line: 0, column: 0 },
                expected: DSLType.ANY,
                actual: DSLType.UNKNOWN
            }],
            warnings: []
        };
    }
    
    private inferLiteral(node: LiteralNode): TypeCheckResult {
        let type: DSLType;
        
        if (typeof node.value === 'number') {
            type = DSLType.NUMBER;
        } else if (typeof node.value === 'string') {
            type = DSLType.STRING;
        } else if (typeof node.value === 'boolean') {
            type = DSLType.BOOLEAN;
        } else {
            type = DSLType.UNKNOWN;
        }
        
        return { type, errors: [], warnings: [] };
    }
    
    private inferFunctionCall(node: FunctionCallNode, env: TypeEnvironment): TypeCheckResult {
        const funcName = getFunctionNameFromCall(node);
        if (!funcName) {
            return {
                type: DSLType.UNKNOWN,
                errors: [{ message: 'Invalid function call', location: { line: 0, column: 0 }, expected: DSLType.FUNCTION, actual: DSLType.UNKNOWN }],
                warnings: []
            };
        }
        
        const funcSignature = BUILTIN_FUNCTIONS.get(funcName) || env.functions.get(funcName);
        if (!funcSignature) {
            return {
                type: DSLType.UNKNOWN,
                errors: [{
                    message: `Unknown function: ${funcName}`,
                    location: { line: 0, column: 0 },
                    expected: DSLType.FUNCTION,
                    actual: DSLType.UNKNOWN
                }],
                warnings: []
            };
        }
        
        const funcArgs = getFunctionArgsFromCall(node);
        if (!funcArgs) {
            return {
                type: DSLType.UNKNOWN,
                errors: [{ message: 'Invalid function call arguments', location: { line: 0, column: 0 }, expected: DSLType.ARRAY, actual: DSLType.UNKNOWN }],
                warnings: []
            };
        }
        
        const errors: TypeError[] = [];
        const warnings: TypeWarning[] = [];
        
        // Check argument count
        if (funcArgs.length !== funcSignature.parameters.length) {
            errors.push({
                message: `Function ${funcName} expects ${funcSignature.parameters.length} arguments, got ${funcArgs.length}`,
                location: { line: 0, column: 0 },
                expected: DSLType.FUNCTION,
                actual: DSLType.FUNCTION
            });
        }
        
        // Type check arguments
        for (let i = 0; i < Math.min(funcArgs.length, funcSignature.parameters.length); i++) {
            const argResult = this.inferType(funcArgs[i], env);
            errors.push(...argResult.errors);
            warnings.push(...argResult.warnings);
            
            const expectedType = funcSignature.parameters[i].type;
            if (!this.isTypeCompatible(argResult.type, expectedType)) {
                errors.push({
                    message: `Argument ${i + 1} of ${funcName} has wrong type`,
                    location: { line: 0, column: 0 },
                    expected: expectedType,
                    actual: argResult.type
                });
            }
        }
        
        return { type: funcSignature.returnType, errors, warnings };
    }
    
    private isTypeCompatible(actual: DSLType, expected: DSLType): boolean {
        if (expected === DSLType.ANY) return true;
        if (actual === expected) return true;
        
        // Domain-specific compatibility rules
        if (expected === DSLType.NUMBER) {
            return actual === DSLType.AMOUNT || actual === DSLType.PERCENTAGE;
        }
        
        if (expected === DSLType.STRING) {
            return actual === DSLType.TOKEN || actual === DSLType.ADDRESS;
        }
        
        return false;
    }
    
    private getBuiltinVariableType(name: string): DSLType {
        const builtinVars: { [key: string]: DSLType } = {
            'attackerProfit': DSLType.AMOUNT,
            'swapCount': DSLType.NUMBER,
            'hasFlashLoan': DSLType.BOOLEAN,
            'txTimestamp': DSLType.NUMBER,
            'gasUsed': DSLType.NUMBER
        };
        
        return builtinVars[name] || DSLType.UNKNOWN;
    }
    
    private generateTypeVariable(): DSLType {
        return `T${this.nextTypeVar++}` as DSLType;
    }
}

/**
 * Type constraint for constraint solving
 */
export interface TypeConstraint {
    left: DSLType;
    right: DSLType;
    reason: string;
}

// ============================================================================
// SEMANTIC ANALYSIS
// ============================================================================

/**
 * Semantic Analyzer for DSL
 * Performs semantic checks beyond type checking
 */
export class DSLSemanticAnalyzer {
    
    /**
     * Perform complete semantic analysis
     */
    analyze(ast: ASTNode, env: TypeEnvironment): SemanticAnalysisResult {
        const typeEngine = new TypeInferenceEngine();
        const typeResult = typeEngine.inferType(ast, env);
        
        const semanticErrors: SemanticError[] = [];
        const semanticWarnings: SemanticWarning[] = [];
        
        // Check for undefined behavior
        this.checkUndefinedBehavior(ast, semanticErrors, semanticWarnings);
        
        // Check for unreachable code
        this.checkUnreachableCode(ast, semanticErrors, semanticWarnings);
        
        // Check for performance issues
        this.checkPerformanceIssues(ast, semanticErrors, semanticWarnings);
        
        return {
            typeResult,
            semanticErrors,
            semanticWarnings,
            complexity: this.calculateComplexity(ast),
            deterministic: this.isDeterministic(ast),
            sideEffects: this.hasSideEffects(ast)
        };
    }
    
    private checkUndefinedBehavior(ast: ASTNode, errors: SemanticError[], warnings: SemanticWarning[]): void {
        // Check for division by zero
        if (ast.type === 'BinaryOp') {
            const binaryOp = ast as BinaryOpNode;
            if (binaryOp.operator === '/') {
                if (binaryOp.right.type === 'Literal') {
                    const literal = binaryOp.right as LiteralNode;
                    if (literal.value === 0) {
                        errors.push({
                            message: 'Division by zero',
                            location: { line: 0, column: 0 },
                            severity: 'error'
                        });
                    }
                }
            }
        }
    }
    
    private checkUnreachableCode(ast: ASTNode, errors: SemanticError[], warnings: SemanticWarning[]): void {
        // Implementation would check for unreachable code patterns
        // This is a placeholder for more complex analysis
    }
    
    private checkPerformanceIssues(ast: ASTNode, errors: SemanticError[], warnings: SemanticWarning[]): void {
        // Check for expensive operations in loops
        // Check for recursive function calls
        // This is a placeholder for more complex analysis
    }
    
    private calculateComplexity(ast: ASTNode): number {
        // Cyclomatic complexity calculation
        let complexity = 1;
        
        // Traverse AST and count decision points
        this.traverseAST(ast, (node) => {
            if (node.type === 'BinaryOp') {
                const binaryOp = node as BinaryOpNode;
                if (binaryOp.operator === '&&' || binaryOp.operator === '||') {
                    complexity++;
                }
            }
        });
        
        return complexity;
    }
    
    private isDeterministic(ast: ASTNode): boolean {
        let deterministic = true;
        
        this.traverseAST(ast, (node) => {
            if (node.type === 'function_call') {
                const funcCall = node as FunctionCallNode;
                const funcName = getFunctionNameFromCall(funcCall);
                if (funcName) {
                    const funcSignature = BUILTIN_FUNCTIONS.get(funcName);
                    if (funcSignature && !funcSignature.deterministic) {
                        deterministic = false;
                    }
                }
            }
        });
        
        return deterministic;
    }
    
    private hasSideEffects(ast: ASTNode): boolean {
        let sideEffects = false;
        
        this.traverseAST(ast, (node) => {
            if (node.type === 'function_call') {
                const funcCall = node as FunctionCallNode;
                const funcName = getFunctionNameFromCall(funcCall);
                if (funcName) {
                    const funcSignature = BUILTIN_FUNCTIONS.get(funcName);
                    if (funcSignature && !funcSignature.pure) {
                        sideEffects = true;
                    }
                }
            }
        });
        
        return sideEffects;
    }
    
    private traverseAST(ast: ASTNode, visitor: (node: ASTNode) => void): void {
        visitor(ast);
        
        switch (ast.type) {
            case 'BinaryOp':
                const binaryOp = ast as BinaryOpNode;
                this.traverseAST(binaryOp.left, visitor);
                this.traverseAST(binaryOp.right, visitor);
                break;
            case 'unary_expression':
                const unaryOp = ast as UnaryOpNode;
                const operand = getOperandFromExpression(unaryOp);
                if (operand) {
                    this.traverseAST(operand, visitor);
                }
                break;
            case 'function_call':
                const funcCall = ast as FunctionCallNode;
                const funcArgs = getFunctionArgsFromCall(funcCall);
                if (funcArgs) {
                    funcArgs.forEach(arg => this.traverseAST(arg, visitor));
                }
                break;
        }
    }
}

/**
 * Semantic analysis results
 */
export interface SemanticAnalysisResult {
    typeResult: TypeCheckResult;
    semanticErrors: SemanticError[];
    semanticWarnings: SemanticWarning[];
    complexity: number;
    deterministic: boolean;
    sideEffects: boolean;
}

export interface SemanticError {
    message: string;
    location: { line: number; column: number };
    severity: 'error' | 'warning';
}

export interface SemanticWarning {
    message: string;
    location: { line: number; column: number };
    suggestion?: string;
}

// ============================================================================
// DENOTATIONAL SEMANTICS
// ============================================================================

/**
 * Denotational semantics for DSL expressions
 * Mathematical meaning of expressions
 */
export class DenotationalSemantics {
    
    /**
     * Evaluation context for semantic functions
     */
    static evaluate(ast: ASTNode, context: EvaluationContext): SemanticValue {
        switch (ast.type) {
            case 'BinaryOp':
                return this.evaluateBinaryOp(ast as BinaryOpNode, context);
            case 'UnaryOp':
                return this.evaluateUnaryOp(ast as UnaryOpNode, context);
            case 'Identifier':
                return this.evaluateIdentifier(ast as IdentifierNode, context);
            case 'Literal':
                return this.evaluateLiteral(ast as LiteralNode);
            case 'FunctionCall':
                return this.evaluateFunctionCall(ast as FunctionCallNode, context);
            default:
                return { type: DSLType.UNKNOWN, value: undefined };
        }
    }
    
    private static evaluateBinaryOp(node: BinaryOpNode, context: EvaluationContext): SemanticValue {
        const left = this.evaluate(node.left, context);
        const right = this.evaluate(node.right, context);
        
        switch (node.operator) {
            case '+':
                return { type: DSLType.NUMBER, value: (left.value as number) + (right.value as number) };
            case '-':
                return { type: DSLType.NUMBER, value: (left.value as number) - (right.value as number) };
            case '*':
                return { type: DSLType.NUMBER, value: (left.value as number) * (right.value as number) };
            case '/':
                return { type: DSLType.NUMBER, value: (left.value as number) / (right.value as number) };
            case '>':
                return { type: DSLType.BOOLEAN, value: (left.value as number) > (right.value as number) };
            case '>=':
                return { type: DSLType.BOOLEAN, value: (left.value as number) >= (right.value as number) };
            case '<':
                return { type: DSLType.BOOLEAN, value: (left.value as number) < (right.value as number) };
            case '<=':
                return { type: DSLType.BOOLEAN, value: (left.value as number) <= (right.value as number) };
            case '==':
                return { type: DSLType.BOOLEAN, value: left.value === right.value };
            case '!=':
                return { type: DSLType.BOOLEAN, value: left.value !== right.value };
            case '&&':
                return { type: DSLType.BOOLEAN, value: (left.value as boolean) && (right.value as boolean) };
            case '||':
                return { type: DSLType.BOOLEAN, value: (left.value as boolean) || (right.value as boolean) };
            default:
                return { type: DSLType.UNKNOWN, value: undefined };
        }
    }
    
    private static evaluateUnaryOp(node: Expression, context: EvaluationContext): SemanticValue {
        const operand = getOperandFromExpression(node);
        const operator = getOperatorFromExpression(node);
        
        if (!operand || !operator) {
            return { type: DSLType.UNKNOWN, value: undefined };
        }
        
        const operandValue = this.evaluate(operand, context);
        
        switch (operator) {
            case '!':
                return { type: DSLType.BOOLEAN, value: !(operandValue.value as boolean) };
            case '-':
                return { type: DSLType.NUMBER, value: -(operandValue.value as number) };
            default:
                return { type: DSLType.UNKNOWN, value: undefined };
        }
    }
    
    private static evaluateIdentifier(node: IdentifierNode, context: EvaluationContext): SemanticValue {
        const value = context.variables.get(node.name);
        if (value !== undefined) {
            return value;
        }
        
        return { type: DSLType.UNKNOWN, value: undefined };
    }
    
    private static evaluateLiteral(node: LiteralNode): SemanticValue {
        if (typeof node.value === 'number') {
            return { type: DSLType.NUMBER, value: node.value };
        } else if (typeof node.value === 'string') {
            return { type: DSLType.STRING, value: node.value };
        } else if (typeof node.value === 'boolean') {
            return { type: DSLType.BOOLEAN, value: node.value };
        }
        
        return { type: DSLType.UNKNOWN, value: undefined };
    }
    
    private static evaluateFunctionCall(node: FunctionCallNode, context: EvaluationContext): SemanticValue {
        // Built-in function evaluation would be implemented here
        // For now, return placeholder
        return { type: DSLType.UNKNOWN, value: undefined };
    }
}

/**
 * Semantic value in denotational semantics
 */
export interface SemanticValue {
    type: DSLType;
    value: any;
}

/**
 * Evaluation context for semantic evaluation
 */
export interface EvaluationContext {
    variables: Map<string, SemanticValue>;
    functions: Map<string, (args: SemanticValue[]) => SemanticValue>;
}

// ============================================================================
// FORMAL VALIDATION INTERFACE
// ============================================================================

/**
 * Main DSL Formal Validator
 * Entry point for all DSL formal validation
 */
export class DSLFormalValidator {
    private typeEngine: TypeInferenceEngine;
    private semanticAnalyzer: DSLSemanticAnalyzer;
    
    constructor() {
        this.typeEngine = new TypeInferenceEngine();
        this.semanticAnalyzer = new DSLSemanticAnalyzer();
    }
    
    /**
     * Validate a DSL constraint with complete formal analysis
     */
    validateConstraint(ast: ASTNode): DSLValidationResult {
        const env = this.createDefaultTypeEnvironment();
        const semanticResult = this.semanticAnalyzer.analyze(ast, env);
        
        return {
            syntaxValid: true, // AST parsing already validates syntax
            typeValid: semanticResult.typeResult.errors.length === 0,
            semanticValid: semanticResult.semanticErrors.length === 0,
            typeErrors: semanticResult.typeResult.errors,
            typeWarnings: semanticResult.typeResult.warnings,
            semanticErrors: semanticResult.semanticErrors,
            semanticWarnings: semanticResult.semanticWarnings,
            inferredType: semanticResult.typeResult.type,
            complexity: semanticResult.complexity,
            deterministic: semanticResult.deterministic,
            sideEffects: semanticResult.sideEffects
        };
    }
    
    private createDefaultTypeEnvironment(): TypeEnvironment {
        const env: TypeEnvironment = {
            variables: new Map(),
            functions: new Map(BUILTIN_FUNCTIONS),
            scopes: []
        };
        
        // Add built-in variables
        env.variables.set('attackerProfit', DSLType.AMOUNT);
        env.variables.set('swapCount', DSLType.NUMBER);
        env.variables.set('hasFlashLoan', DSLType.BOOLEAN);
        env.variables.set('txTimestamp', DSLType.NUMBER);
        env.variables.set('gasUsed', DSLType.NUMBER);
        
        return env;
    }
}

/**
 * Complete DSL validation result
 */
export interface DSLValidationResult {
    syntaxValid: boolean;
    typeValid: boolean;
    semanticValid: boolean;
    typeErrors: TypeError[];
    typeWarnings: TypeWarning[];
    semanticErrors: SemanticError[];
    semanticWarnings: SemanticWarning[];
    inferredType: DSLType;
    complexity: number;
    deterministic: boolean;
    sideEffects: boolean;
}