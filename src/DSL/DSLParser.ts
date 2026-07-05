// AST node types
export interface ASTNode {
  type: string;
}

export interface TemporalSpec extends ASTNode {
  type: 'temporal_spec';
  window_type: 'BLOCK_WINDOW' | 'TIME_WINDOW';
  window_size: number;
}

export interface ConstraintDef extends ASTNode {
  type: 'constraint_def';
  name: string;
  description?: string;
  evaluation_mode?: 'single' | 'temporal' | 'hybrid';  // Evaluation mode: single, temporal, or hybrid (pattern-based)
  temporal?: TemporalSpec;
  when?: Expression;
  condition?: Condition[];
  conditions?: Expression[];  // For lambda test compatibility - block of statements
  violation?: Expression;
  message?: string;
  severity?: string;
  confidence?: number;
}

export interface Expression extends ASTNode {
  type: string;
}

export interface BinaryExpression extends Expression {
  type: 'binary_expression';
  operator: string;
  left: Expression;
  right: Expression;
}

export interface Identifier extends Expression {
  type: 'identifier';
  name: string;
}

export interface NumberLiteral extends Expression {
  type: 'number';
  value: number;
}

export interface StringLiteral extends Expression {
  type: 'string';
  value: string;
}

export interface MemberAccess extends Expression {
  type: 'member_access';
  object: string | Expression;  // Support both simple names and complex expressions for chaining
  property: string;
}

export interface FunctionCall extends Expression {
  type: 'function_call';
  function: string | Expression;  // Support both identifier strings and member access expressions
  arguments: Expression[];
}

export interface ArrayLiteral extends Expression {
  type: 'array_literal';
  elements: Expression[];
}

export interface ObjectLiteral extends Expression {
  type: 'object_literal';
  properties: ObjectProperty[];
}

export interface ObjectProperty {
  key: string | Expression;
  value: Expression;
}

export interface ArrayAccess extends Expression {
  type: 'array_access';
  array: Expression;
  index: Expression;
}

export interface ConditionalExpression extends Expression {
  type: 'conditional_expression';
  test: Expression;
  consequent: Expression;
  alternate: Expression;
}

export interface LambdaExpression extends Expression {
  type: 'lambda';
  parameters: string[];
  body: Expression;
}

export interface ForLoop extends ASTNode {
  type: 'for_loop';
  init?: Expression;
  condition?: Expression;
  update?: Expression;
  body: Expression[];
}

export interface WhileLoop extends ASTNode {
  type: 'while_loop';
  condition: Expression;
  body: Expression[];
}

export interface ForEachLoop extends ASTNode {
  type: 'foreach_loop';
  variable: string;
  iterable: Expression;
  body: Expression[];
}

export interface IfStatement extends ASTNode {
  type: 'if_statement';
  condition: Expression;
  consequent: Expression[];
  alternate?: Expression[];
}

export interface Statement extends ASTNode {
  type: string;
}

export interface VariableDeclarationStatement extends Statement {
  type: 'variable_declaration';
  keyword: 'let';
  identifier: string;
  initializer: Expression;
}

export interface Condition {
  name: string;
  expression: Expression;
}

// Token types
export enum TokenType {
  IDENTIFIER,
  NUMBER,
  STRING,
  KEYWORD,
  OPERATOR,
  PUNCTUATION,
  WHITESPACE,
  EOF
}

export interface Token {
  type: TokenType;
  value: string;
  line: number;
  column: number;
}

// Keywords
const KEYWORDS = new Set([
  'constraint', 'rule', 'when', 'condition', 'violation', 'message',
  'Swap', 'Borrow', 'Repay', 'Withdraw', 'Deposit',
  'description', 'conditions', 'severity', 'confidence', 'temporal', 'evaluation_mode',
  'for', 'while', 'foreach', 'in', 'if', 'else', 'return', 'break', 'continue',
  'let',
  'true', 'false', 'null', 'undefined'
]);

// Operators
const OPERATORS = new Set([
  '==', '!=', '<=', '>=', '<', '>', '&&', '||', '+', '-', '*', '/', '%', '!',
  '?', '=>', '=', '+=', '-=', '*=', '/=', '++', '--'
]);

// Punctuation
const PUNCTUATION = new Set([
  '{', '}', '(', ')', ':', ',', '.', '[', ']', ';'
]);

// Additional AST node types
export interface UnaryExpression extends Expression {
  type: 'unary_expression';
  operator: string;
  argument: Expression;
}

export class DSLLexer {
  private input: string;
  private position: number = 0;
  private line: number = 1;
  private column: number = 1;

  // Pre-compiled regex patterns for better performance
  private static readonly WHITESPACE_REGEX = /\s/;
  private static readonly IDENTIFIER_REGEX = /[a-zA-Z0-9_]/;
  private static readonly DIGIT_REGEX = /[0-9]/;
  private static readonly IDENTIFIER_START_REGEX = /[a-zA-Z_]/;
  
  // Character code constants for fastest comparison
  private static readonly CHAR_CODES = {
    NEWLINE: '\n'.charCodeAt(0),
    DOT: '.'.charCodeAt(0),
    QUOTE: '"'.charCodeAt(0),
    ZERO: '0'.charCodeAt(0),
    NINE: '9'.charCodeAt(0),
    A_LOWER: 'a'.charCodeAt(0),
    Z_LOWER: 'z'.charCodeAt(0),
    A_UPPER: 'A'.charCodeAt(0),
    Z_UPPER: 'Z'.charCodeAt(0),
    UNDERSCORE: '_'.charCodeAt(0)
  };

  constructor(input: string) {
    this.input = input;
  }

  private peek(): string {
    return this.position < this.input.length ? this.input[this.position] : '\0';
  }

  private peekCharCode(): number {
    return this.position < this.input.length ? this.input.charCodeAt(this.position) : 0;
  }

  private advance(): string {
    const char = this.peek();
    this.position++;
    if (char === '\n') {
      this.line++;
      this.column = 1;
    } else {
      this.column++;
    }
    return char;
  }

  private skipWhitespace(): void {
    // Optimized whitespace skipping using character codes
    while (this.position < this.input.length) {
      const charCode = this.input.charCodeAt(this.position);
      // Check for common whitespace characters by code
      if (charCode === 32 || charCode === 9 || charCode === 10 || charCode === 13) {
        this.advance();
      } else {
        break;
      }
    }
  }

  private isIdentifierChar(charCode: number): boolean {
    // Fast character code-based identifier checking
    return (charCode >= DSLLexer.CHAR_CODES.A_LOWER && charCode <= DSLLexer.CHAR_CODES.Z_LOWER) ||
           (charCode >= DSLLexer.CHAR_CODES.A_UPPER && charCode <= DSLLexer.CHAR_CODES.Z_UPPER) ||
           (charCode >= DSLLexer.CHAR_CODES.ZERO && charCode <= DSLLexer.CHAR_CODES.NINE) ||
           charCode === DSLLexer.CHAR_CODES.UNDERSCORE;
  }

  private isDigit(charCode: number): boolean {
    return charCode >= DSLLexer.CHAR_CODES.ZERO && charCode <= DSLLexer.CHAR_CODES.NINE;
  }

  private isIdentifierStart(charCode: number): boolean {
    return (charCode >= DSLLexer.CHAR_CODES.A_LOWER && charCode <= DSLLexer.CHAR_CODES.Z_LOWER) ||
           (charCode >= DSLLexer.CHAR_CODES.A_UPPER && charCode <= DSLLexer.CHAR_CODES.Z_UPPER) ||
           charCode === DSLLexer.CHAR_CODES.UNDERSCORE;
  }

  private readIdentifier(): Token {
    const start = this.position;
    // Use optimized character code checking
    while (this.position < this.input.length && this.isIdentifierChar(this.input.charCodeAt(this.position))) {
      this.position++;
      this.column++;
    }
    const value = this.input.substring(start, this.position);
    const type = KEYWORDS.has(value) ? TokenType.KEYWORD : TokenType.IDENTIFIER;
    return {
      type,
      value,
      line: this.line,
      column: this.column - value.length
    };
  }

  private readNumber(): Token {
    const start = this.position;
    // Use optimized digit checking
    while (this.position < this.input.length && this.isDigit(this.input.charCodeAt(this.position))) {
      this.position++;
      this.column++;
    }
    if (this.peekCharCode() === DSLLexer.CHAR_CODES.DOT) {
      this.position++;
      this.column++;
      while (this.position < this.input.length && this.isDigit(this.input.charCodeAt(this.position))) {
        this.position++;
        this.column++;
      }
    }
    const value = this.input.substring(start, this.position);
    return {
      type: TokenType.NUMBER,
      value,
      line: this.line,
      column: this.column - value.length
    };
  }

  private readString(): Token {
    this.advance(); // Skip opening quote
    const start = this.position;
    while (this.position < this.input.length && this.peek() !== '"') {
      this.advance();
    }
    const value = this.input.substring(start, this.position);
    this.advance(); // Skip closing quote
    return {
      type: TokenType.STRING,
      value,
      line: this.line,
      column: this.column - value.length - 2
    };
  }

  private readOperator(): Token {
    // Fast path for common 2-character operators using character codes
    if (this.position + 1 < this.input.length) {
      const char1 = this.input.charCodeAt(this.position);
      const char2 = this.input.charCodeAt(this.position + 1);
      
      // Check common 2-char operators by character codes for speed
      if ((char1 === 61 && char2 === 61) || // ==
          (char1 === 33 && char2 === 61) || // !=
          (char1 === 60 && char2 === 61) || // <=
          (char1 === 62 && char2 === 61) || // >=
          (char1 === 38 && char2 === 38) || // &&
          (char1 === 124 && char2 === 124) || // ||
          (char1 === 43 && char2 === 61) || // +=
          (char1 === 45 && char2 === 61) || // -=
          (char1 === 42 && char2 === 61) || // *=
          (char1 === 47 && char2 === 61) || // /=
          (char1 === 43 && char2 === 43) || // ++
          (char1 === 45 && char2 === 45) || // --
          (char1 === 61 && char2 === 62)) { // =>
        const twoChar = this.input.substring(this.position, this.position + 2);
        this.position += 2;
        this.column += 2;
        return {
          type: TokenType.OPERATOR,
          value: twoChar,
          line: this.line,
          column: this.column - 2
        };
      }
    }
    
    // Single character operator
    const value = this.advance();
    return {
      type: TokenType.OPERATOR,
      value,
      line: this.line,
      column: this.column - 1
    };
  }

  private skipComment(): void {
    if (this.peek() === '#') {
      // Skip until end of line
      while (this.position < this.input.length && this.peek() !== '\n') {
        this.advance();
      }
      // Skip the newline if present
      if (this.position < this.input.length && this.peek() === '\n') {
        this.advance();
        this.line++;
        this.column = 1;
      }
    }
  }

  nextToken(): Token {
    this.skipWhitespace();
    
    // Skip comments
    while (this.position < this.input.length && this.peek() === '#') {
      this.skipComment();
      this.skipWhitespace();
    }

    if (this.position >= this.input.length) {
      return {
        type: TokenType.EOF,
        value: "",
        line: this.line,
        column: this.column
      };
    }

    const charCode = this.peekCharCode();
    const char = this.peek();

    // Use optimized character code checking for identifier start
    if (this.isIdentifierStart(charCode)) {
      return this.readIdentifier();
    }

    // Use optimized digit checking
    if (this.isDigit(charCode)) {
      return this.readNumber();
    }

    // String literal check using character code
    if (charCode === DSLLexer.CHAR_CODES.QUOTE) {
      return this.readString();
    }

    // Operator check - try 2-character operators first for efficiency
    if (this.position + 1 < this.input.length) {
      const twoChar = this.input.substring(this.position, this.position + 2);
      if (OPERATORS.has(twoChar)) {
        return this.readOperator();
      }
    }
    
    if (OPERATORS.has(char)) {
      return this.readOperator();
    }

    if (PUNCTUATION.has(char)) {
      const value = this.advance();
      return {
        type: TokenType.PUNCTUATION,
        value,
        line: this.line,
        column: this.column - 1
      };
    }

    throw new Error(`Unexpected character: ${char} at line ${this.line}, column ${this.column}`);
  }

  tokenize(): Token[] {
    const tokens: Token[] = [];
    let token: Token;
    do {
      token = this.nextToken();
      tokens.push(token);
    } while (token.type !== TokenType.EOF);
    return tokens;
  }
}

export class DSLParser {
  private tokens: Token[];
  private position: number = 0;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  private peek(): Token {
    return this.position < this.tokens.length ? this.tokens[this.position] : this.tokens[this.tokens.length - 1];
  }

  private advance(): Token {
    return this.tokens[this.position++];
  }

  private match(type: TokenType, value?: string): Token {
    const token = this.peek();
    if (token.type === type && (!value || token.value === value)) {
      return this.advance();
    }
    throw new Error(`Expected ${type}${value ? ` '${value}'` : ''}, got ${token.type} '${token.value}' at position ${this.position}`);
  }

  // 여러 제약 조건 파싱
  parseMultipleConstraints(): ConstraintDef[] {
    const constraints: ConstraintDef[] = [];
    
    while (this.position < this.tokens.length && this.peek().type !== TokenType.EOF) {
      if (this.peek().type === TokenType.KEYWORD && this.peek().value === "constraint") {
        constraints.push(this.parseConstraintDef());
      } else {
        this.advance(); // Skip non-constraint tokens
      }
    }
    
    return constraints;
  }

  private parseConditionList(): Condition[] {
    const conditions: Condition[] = [];
    
    while (this.peek().type !== TokenType.PUNCTUATION || this.peek().value !== "}") {
      // 식별자가 아닌 토큰 건너뛰기
      if (this.peek().type !== TokenType.IDENTIFIER) {
        this.advance();
        continue;
      }
      
      const name = this.match(TokenType.IDENTIFIER).value;
      this.match(TokenType.PUNCTUATION, ":");
      const expression = this.parseExpression();  // Changed from parseAdditive to parseExpression
      conditions.push({ name, expression });
      
      if (this.peek().value === ",") {
        this.advance();
      }
    }
    
    return conditions;
  }

  private parseExpression(): Expression {
    return this.parseLogicalOr();
  }

  private parseLogicalOr(): Expression {
    let left = this.parseLogicalAnd();
    
    while (this.peek().value === "||") {
      this.advance();
      const right = this.parseLogicalAnd();
      left = {
        type: "binary_expression",
        operator: "||",
        left,
        right
      } as BinaryExpression;
    }
    
    return left;
  }

  private parseLogicalAnd(): Expression {
    let left = this.parseEquality();
    
    while (this.peek().type === TokenType.OPERATOR && this.peek().value === "&&") {
      const operator = this.advance().value;
      const right = this.parseEquality();
      left = {
        type: "binary_expression",
        operator,
        left,
        right
      } as BinaryExpression;
    }
    
    return left;
  }

  private parseUnary(): Expression {
    const token = this.peek();
    if (token.type === TokenType.OPERATOR && token.value === "!") {
      this.advance();
      const argument = this.parseUnary();
      return {
        type: "unary_expression",
        operator: "!",
        argument
      } as UnaryExpression;
    }
    return this.parsePostfix();
  }

  private parseEquality(): Expression {
    let left = this.parseComparison();
    
    while (this.peek().value === "==" || this.peek().value === "!=") {
      const operator = this.advance().value;
      const right = this.parseComparison();
      left = {
        type: "binary_expression",
        operator,
        left,
        right
      } as BinaryExpression;
    }
    
    return left;
  }

  private parseComparison(): Expression {
    let left = this.parseAdditive();
    
    while (["<", ">", "<=", ">="].includes(this.peek().value)) {
      const operator = this.advance().value;
      const right = this.parseAdditive();
      left = {
        type: "binary_expression",
        operator,
        left,
        right
      } as BinaryExpression;
    }
    
    return left;
  }

  private parseAdditive(): Expression {
    let left = this.parseMultiplicative();
    
    while (this.peek().value === "+" || this.peek().value === "-") {
      const operator = this.advance().value;
      const right = this.parseMultiplicative();
      left = {
        type: "binary_expression",
        operator,
        left,
        right
      } as BinaryExpression;
    }
    
    return left;
  }

  private parseMultiplicative(): Expression {
    let left = this.parseUnary();

    while (this.peek().value === "*" || this.peek().value === "/" || this.peek().value === "%") {
      const operator = this.advance().value;
      const right = this.parseUnary();
      left = {
        type: "binary_expression",
        operator,
        left,
        right
      } as BinaryExpression;
    }

    return left;
  }

  private parsePostfix(): Expression {
    let expression = this.parsePrimary();
    
    while (true) {
      const token = this.peek();
      
      // Array access: expr[index]
      if (token.value === "[") {
        this.advance();
        const index = this.parseExpression();
        this.match(TokenType.PUNCTUATION, "]");
        expression = {
          type: "array_access",
          array: expression,
          index
        } as ArrayAccess;
      }
      // Member access: expr.property - supports chaining
      else if (token.value === ".") {
        this.advance();
        const property = this.match(TokenType.IDENTIFIER).value;
        
        // Store the full expression to support chaining like array.filter().map()
        expression = {
          type: "member_access",
          object: expression,
          property
        } as MemberAccess;
      }
      // Function call: expr(args) - supports both identifiers and member access
      else if (token.value === "(") {
        if (expression.type === 'identifier' || expression.type === 'member_access') {
          this.advance();
          const args: Expression[] = [];

          if (this.peek().value !== ")") {
            args.push(this.parseExpression());
            while (this.peek().value === ",") {
              this.advance();
              args.push(this.parseExpression());
            }
          }

          this.match(TokenType.PUNCTUATION, ")");

          // For identifiers, extract the name string
          // For member access, keep the full expression
          const functionValue = expression.type === 'identifier' ?
            (expression as Identifier).name :
            expression;

          expression = {
            type: "function_call",
            function: functionValue,
            arguments: args
          } as FunctionCall;
        } else {
          break;
        }
      } else {
        break;
      }
    }
    
    return expression;
  }

  private parsePrimary(): Expression {
    const token = this.peek();
    
    if (token.type === TokenType.NUMBER) {
      this.advance();
      return {
        type: "number",
        value: parseFloat(token.value)
      } as NumberLiteral;
    }
    
    if (token.type === TokenType.STRING) {
      this.advance();
      return {
        type: "string",
        value: token.value
      } as StringLiteral;
    }
    
    // Keywords as literals
    if (token.type === TokenType.KEYWORD) {
      if (token.value === "true") {
        this.advance();
        return { type: "number", value: 1 } as NumberLiteral;
      }
      if (token.value === "false") {
        this.advance();
        return { type: "number", value: 0 } as NumberLiteral;
      }
      if (token.value === "null") {
        this.advance();
        return { type: "number", value: 0 } as NumberLiteral;
      }
    }
    
    if (token.type === TokenType.IDENTIFIER) {
      this.advance();
      return {
        type: "identifier",
        name: token.value
      } as Identifier;
    }
    
    // Array literal: [1, 2, 3]
    if (token.value === "[") {
      return this.parseArrayLiteral();
    }
    
    // Object literal: {key: value}
    if (token.value === "{") {
      // Need to distinguish from constraint block
      // If we're not at the start of a constraint, treat as object literal
      const nextToken = this.tokens[this.position + 1];
      if (nextToken && nextToken.type === TokenType.IDENTIFIER && !['when', 'condition', 'violation', 'message'].includes(nextToken.value)) {
        return this.parseObjectLiteral();
      }
    }
    
    if (token.value === "(") {
      // Check for lambda expression before treating as parenthesized expression
      if (this.isLambdaExpression()) {
        return this.parseLambdaExpression();
      }

      // Regular parenthesized expression
      this.advance();
      const expression = this.parseExpression();
      const nextToken = this.peek();
      if (nextToken.type !== TokenType.PUNCTUATION || nextToken.value !== ")") {
        throw new Error(`Expected ')', got ${nextToken.type} '${nextToken.value}' at position ${this.position}. Current token: ${JSON.stringify(nextToken)}`);
      }
      this.advance(); // consume the ')'
      return expression;
    }
    
    throw new Error(`Unexpected token: ${token.type} '${token.value}'`);
  }

  private parseArrayLiteral(): ArrayLiteral {
    this.match(TokenType.PUNCTUATION, "[");
    const elements: Expression[] = [];
    
    if (this.peek().value !== "]") {
      elements.push(this.parseExpression());
      while (this.peek().value === ",") {
        this.advance();
        if (this.peek().value === "]") break; // trailing comma
        elements.push(this.parseExpression());
      }
    }
    
    this.match(TokenType.PUNCTUATION, "]");
    return {
      type: "array_literal",
      elements
    } as ArrayLiteral;
  }

  private parseObjectLiteral(): ObjectLiteral {
    this.match(TokenType.PUNCTUATION, "{");
    const properties: ObjectProperty[] = [];
    
    if (this.peek().value !== "}") {
      properties.push(this.parseObjectProperty());
      while (this.peek().value === ",") {
        this.advance();
        if (this.peek().value === "}") break; // trailing comma
        properties.push(this.parseObjectProperty());
      }
    }
    
    this.match(TokenType.PUNCTUATION, "}");
    return {
      type: "object_literal",
      properties
    } as ObjectLiteral;
  }

  private parseObjectProperty(): ObjectProperty {
    let key: string | Expression;
    const token = this.peek();

    if (token.type === TokenType.IDENTIFIER) {
      key = this.advance().value;
    } else if (token.type === TokenType.STRING) {
      key = this.advance().value;
    } else if (token.value === "[") {
      this.advance();
      key = this.parseExpression();
      this.match(TokenType.PUNCTUATION, "]");
    } else {
      throw new Error(`Expected property key, got ${token.type} '${token.value}'`);
    }

    this.match(TokenType.PUNCTUATION, ":");
    const value = this.parseExpression();

    return { key, value };
  }

  // Lambda expression lookahead detection
  private isLambdaExpression(): boolean {
    let pos = this.position + 1; // Skip '('

    if (pos >= this.tokens.length) return false;

    // Check for (identifier) => pattern
    if (this.tokens[pos]?.type === TokenType.IDENTIFIER) {
      pos++;

      // Check for closing paren followed by arrow
      if (this.tokens[pos]?.value === ')') {
        pos++;
        return this.tokens[pos]?.value === '=>';
      }

      // Check for multiple parameters: (a, b, ...) =>
      while (this.tokens[pos]?.value === ',') {
        pos++; // Skip comma
        if (this.tokens[pos]?.type !== TokenType.IDENTIFIER) return false;
        pos++; // Skip identifier
      }

      if (this.tokens[pos]?.value === ')') {
        pos++;
        return this.tokens[pos]?.value === '=>';
      }
    }

    // Check for empty parameter list: () =>
    if (this.tokens[pos]?.value === ')') {
      pos++;
      return this.tokens[pos]?.value === '=>';
    }

    return false;
  }

  // Parse lambda expression: (param1, param2, ...) => expression
  private parseLambdaExpression(): LambdaExpression {
    this.match(TokenType.PUNCTUATION, "(");
    const parameters: string[] = [];

    if (this.peek().value !== ")") {
      parameters.push(this.match(TokenType.IDENTIFIER).value);
      while (this.peek().value === ",") {
        this.advance();
        parameters.push(this.match(TokenType.IDENTIFIER).value);
      }
    }

    this.match(TokenType.PUNCTUATION, ")");
    this.match(TokenType.OPERATOR, "=>");
    const body = this.parseExpression();

    return {
      type: 'lambda',
      parameters,
      body
    } as LambdaExpression;
  }

  // Parse variable declaration: let identifier = expression
  private parseVariableDeclaration(): VariableDeclarationStatement {
    this.match(TokenType.KEYWORD, "let");
    const identifier = this.match(TokenType.IDENTIFIER).value;
    this.match(TokenType.OPERATOR, "=");
    const initializer = this.parseExpression();

    return {
      type: 'variable_declaration',
      keyword: 'let',
      identifier,
      initializer
    } as VariableDeclarationStatement;
  }

  // Parse statement block for conditions: { let x = 1; let y = 2; return x + y }
  private parseStatementBlock(): Expression[] {
    const statements: Expression[] = [];

    while (this.peek().type !== TokenType.PUNCTUATION || this.peek().value !== "}") {
      const token = this.peek();

      // Skip non-keyword tokens
      if (token.type !== TokenType.KEYWORD && token.type !== TokenType.IDENTIFIER) {
        this.advance();
        continue;
      }

      // Handle 'let' statements
      if (token.type === TokenType.KEYWORD && token.value === "let") {
        statements.push(this.parseVariableDeclaration() as any);
        continue;
      }

      // Handle 'return' statement
      if (token.type === TokenType.KEYWORD && token.value === "return") {
        this.advance(); // consume 'return'
        const returnExpr = this.parseExpression();
        statements.push(returnExpr);
        break; // return is the last statement
      }

      // Other expression statements
      statements.push(this.parseExpression());

      // Check for end of block
      if (this.peek().type === TokenType.PUNCTUATION && this.peek().value === "}") {
        break;
      }
    }

    return statements;
  }

  private parseTemporalSpec(): TemporalSpec {
    // Expect: BLOCK_WINDOW(n) or TIME_WINDOW(n)
    const token = this.advance();
    if (token.type !== TokenType.IDENTIFIER) {
      throw new Error(`Expected temporal window type (BLOCK_WINDOW or TIME_WINDOW), got ${token.type} at line ${token.line}`);
    }

    const windowType = token.value as 'BLOCK_WINDOW' | 'TIME_WINDOW';
    if (!['BLOCK_WINDOW', 'TIME_WINDOW'].includes(windowType)) {
      throw new Error(`Unknown temporal window type: ${windowType}. Expected BLOCK_WINDOW or TIME_WINDOW at line ${token.line}`);
    }

    this.match(TokenType.PUNCTUATION, '(');
    const sizeToken = this.advance();
    if (sizeToken.type !== TokenType.NUMBER) {
      throw new Error(`Expected number for window size, got ${sizeToken.type} at line ${sizeToken.line}`);
    }

    const windowSize = parseInt(sizeToken.value, 10);
    if (windowSize <= 0) {
      throw new Error(`Window size must be positive, got ${windowSize} at line ${sizeToken.line}`);
    }

    this.match(TokenType.PUNCTUATION, ')');

    return {
      type: 'temporal_spec',
      window_type: windowType,
      window_size: windowSize
    };
  }

  private parseConstraintDef(): ConstraintDef {
    this.match(TokenType.KEYWORD, "constraint");
    const name = this.match(TokenType.IDENTIFIER).value;
    this.match(TokenType.PUNCTUATION, "{");

    const result: ConstraintDef = {
      type: "constraint_def",
      name
    };

    while (this.peek().type !== TokenType.PUNCTUATION || this.peek().value !== "}") {
      const token = this.peek();
      if (token.type !== TokenType.KEYWORD) {
        // 키워드가 아닌 경우 건너뛰기 (줄바꿈, 공백 등)
        this.advance();
        continue;
      }
      const keyword = token.value;
      
      switch (keyword) {
        case "description":
          this.advance();
          this.match(TokenType.PUNCTUATION, ":");
          result.description = this.match(TokenType.STRING).value;
          break;
        case "evaluation_mode":
          this.advance();
          this.match(TokenType.PUNCTUATION, ":");
          const modeValue = this.match(TokenType.STRING).value;
          if (!['single', 'temporal', 'hybrid'].includes(modeValue)) {
            throw new Error(`Invalid evaluation_mode: "${modeValue}". Must be "single", "temporal", or "hybrid"`);
          }
          result.evaluation_mode = modeValue as 'single' | 'temporal' | 'hybrid';
          break;
        case "temporal":
          this.advance();
          this.match(TokenType.PUNCTUATION, ":");
          result.temporal = this.parseTemporalSpec();
          break;
        case "when":
          this.advance();
          this.match(TokenType.PUNCTUATION, ":");
          result.when = this.parseExpression();
          break;
        case "condition":
          this.advance();
          this.match(TokenType.PUNCTUATION, ":");
          this.match(TokenType.PUNCTUATION, "{");
          result.condition = this.parseConditionList();
          this.match(TokenType.PUNCTUATION, "}");
          break;
        case "conditions":
          this.advance();
          this.match(TokenType.PUNCTUATION, ":");
          this.match(TokenType.PUNCTUATION, "{");
          result.conditions = this.parseStatementBlock();
          this.match(TokenType.PUNCTUATION, "}");
          break;
        case "violation":
          this.advance();
          this.match(TokenType.PUNCTUATION, ":");
          result.violation = this.parseExpression();
          break;
        case "message":
          this.advance();
          this.match(TokenType.PUNCTUATION, ":");
          result.message = this.match(TokenType.STRING).value;
          break;
        case "severity":
          this.advance();
          this.match(TokenType.PUNCTUATION, ":");
          result.severity = this.match(TokenType.STRING).value;
          break;
        case "confidence":
          this.advance();
          this.match(TokenType.PUNCTUATION, ":");
          result.confidence = parseFloat(this.match(TokenType.NUMBER).value);
          break;
        default:
          throw new Error(`Unexpected keyword: ${keyword}`);
      }
    }

    this.match(TokenType.PUNCTUATION, "}");
    return result;
  }

  // 기존 parse 메서드를 첫 번째 제약 조건만 파싱하도록 유지
  parse(): ConstraintDef {
    return this.parseConstraintDef();
  }
} 