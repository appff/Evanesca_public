{
  function makeBinaryExpression(left, operator, right) {
    return {
      type: "binary_expression",
      operator: operator,
      left: left,
      right: right
    };
  }

  function makeUnaryExpression(operator, operand) {
    return {
      type: "unary_expression",
      operator: operator,
      operand: operand
    };
  }

  function makeIdentifier(name) {
    return {
      type: "identifier",
      name: name
    };
  }

  function makeNumber(value) {
    return {
      type: "number",
      value: parseFloat(value)
    };
  }

  function makeString(value) {
    return {
      type: "string",
      value: value.slice(1, -1) // 따옴표 제거
    };
  }

  function makeMemberAccess(object, property) {
    return {
      type: "member_access",
      object: object,
      property: property
    };
  }

  function makeFunctionCall(functionName, arguments_) {
    return {
      type: "function_call",
      function: functionName,
      arguments: arguments_
    };
  }

  function makeConstraintDef(name, body) {
    return {
      type: "constraint_def",
      name: name,
      when: body.when,
      condition: body.condition,
      violation: body.violation,
      message: body.message
    };
  }
}

// 시작 규칙
Start
  = ConstraintDef

// 제약 조건 정의
ConstraintDef
  = "constraint" _ name:Identifier _ "{" _ body:ConstraintBody _ "}" {
    return makeConstraintDef(name.name, body);
  }

// 제약 조건 본문
ConstraintBody
  = when:WhenClause? _ condition:ConditionClause? _ violation:ViolationClause? _ message:MessageClause? {
    const result = {};
    if (when) result.when = when;
    if (condition) result.condition = condition;
    if (violation) result.violation = violation;
    if (message) result.message = message;
    return result;
  }

// When 절
WhenClause
  = "when" _ ":" _ expression:Expression {
    return expression;
  }

// Condition 절
ConditionClause
  = "condition" _ ":" _ "{" _ conditions:ConditionList _ "}" {
    return conditions;
  }

// Violation 절
ViolationClause
  = "violation" _ ":" _ expression:Expression {
    return expression;
  }

// Message 절
MessageClause
  = "message" _ ":" _ message:StringLiteral {
    return message.value;
  }

// 조건 리스트
ConditionList
  = first:Condition rest:("," _ Condition)* {
    const conditions = [first];
    for (let i = 0; i < rest.length; i++) {
      conditions.push(rest[i][2]);
    }
    return conditions;
  }

// 개별 조건
Condition
  = name:Identifier _ ":" _ expression:Expression {
    return {
      name: name.name,
      expression: expression
    };
  }

// 표현식 (논리 OR)
Expression
  = left:LogicalAnd rest:("||" _ LogicalAnd)* {
    if (rest.length === 0) {
      return left;
    }
    let result = left;
    for (let i = 0; i < rest.length; i++) {
      result = makeBinaryExpression(result, "||", rest[i][2]);
    }
    return result;
  }

// 논리 AND
LogicalAnd
  = left:Equality rest:("&&" _ Equality)* {
    if (rest.length === 0) {
      return left;
    }
    let result = left;
    for (let i = 0; i < rest.length; i++) {
      result = makeBinaryExpression(result, "&&", rest[i][2]);
    }
    return result;
  }

// 동등 비교
Equality
  = left:Comparison rest:((("==" / "!=") _ Comparison))* {
    if (rest.length === 0) {
      return left;
    }
    let result = left;
    for (let i = 0; i < rest.length; i++) {
      result = makeBinaryExpression(result, rest[i][0], rest[i][2]);
    }
    return result;
  }

// 비교 연산
Comparison
  = left:Additive rest:((("<=" / ">=" / "<" / ">") _ Additive))* {
    if (rest.length === 0) {
      return left;
    }
    let result = left;
    for (let i = 0; i < rest.length; i++) {
      result = makeBinaryExpression(result, rest[i][0], rest[i][2]);
    }
    return result;
  }

// 덧셈/뺄셈
Additive
  = left:Multiplicative rest:((("+" / "-") _ Multiplicative))* {
    if (rest.length === 0) {
      return left;
    }
    let result = left;
    for (let i = 0; i < rest.length; i++) {
      result = makeBinaryExpression(result, rest[i][0], rest[i][2]);
    }
    return result;
  }

// 곱셈/나눗셈
Multiplicative
  = left:Primary rest:((("*" / "/") _ Primary))* {
    if (rest.length === 0) {
      return left;
    }
    let result = left;
    for (let i = 0; i < rest.length; i++) {
      result = makeBinaryExpression(result, rest[i][0], rest[i][2]);
    }
    return result;
  }

// 기본 표현식
Primary
  = NumberLiteral
  / Identifier
  / StringLiteral
  / "(" _ expression:Expression _ ")" { return expression; }
  / MemberAccess
  / FunctionCall

// 숫자 리터럴
NumberLiteral
  = digits:[0-9]+ ("." digits2:[0-9]+)? {
    const whole = digits.join("");
    const fraction = digits2 ? digits2.join("") : "";
    return makeNumber(whole + (fraction ? "." + fraction : ""));
  }

// 식별자
Identifier
  = first:[a-zA-Z_] rest:[a-zA-Z0-9_]* {
    return makeIdentifier(first + rest.join(""));
  }

// 문자열 리터럴
StringLiteral
  = '"' chars:[^"]* '"' {
    return makeString('"' + chars.join("") + '"');
  }

// 멤버 접근 (edge.amount, user.balance 등)
MemberAccess
  = object:Identifier _ "." _ property:Identifier {
    return makeMemberAccess(object.name, property.name);
  }

// 함수 호출
FunctionCall
  = functionName:FunctionName _ "(" _ arguments_:ArgumentList _ ")" {
    return makeFunctionCall(functionName, arguments_);
  }

// Function names - including mathematical extensions
FunctionName
  = "toUSD" / "abs" / "max" / "min" 
  / "pow" / "sqrt" / "ln" / "log10" / "cbrt" / "exp" / "floor" / "ceil"
  / "calculateK" / "priceImpact" / "utilizationRate" / "getAmountOut"
  / "collateralizationRatio" / "calculateInterestRate"
  / "avg" / "std" / "percentile"
  / "filter" / "map" / "sum" / "count" / "length" / "first" / "last" / "any" / "all"
  / name:Identifier { return name.name; }

// 인수 리스트
ArgumentList
  = first:Expression rest:("," _ Expression)* {
    const arguments_ = [first];
    for (let i = 0; i < rest.length; i++) {
      arguments_.push(rest[i][2]);
    }
    return arguments_;
  }
  / { return [] }

// 공백
_ "whitespace"
  = [ \t\n\r]* 