import { ExpressionValue } from '../../SemanticFinancialGraph/Types';

/**
 * String operation utilities for DSL expressions
 */
export class StringOperations {
  
  static contains(args: ExpressionValue[]): boolean {
    if (args.length !== 2) {
      throw new Error('contains() requires 2 arguments: string and substring');
    }
    const str = String(args[0]);
    const substr = String(args[1]);
    return str.includes(substr);
  }

  static startsWith(args: ExpressionValue[]): boolean {
    if (args.length !== 2) {
      throw new Error('startsWith() requires 2 arguments: string and prefix');
    }
    const str = String(args[0]);
    const prefix = String(args[1]);
    return str.startsWith(prefix);
  }

  static endsWith(args: ExpressionValue[]): boolean {
    if (args.length !== 2) {
      throw new Error('endsWith() requires 2 arguments: string and suffix');
    }
    const str = String(args[0]);
    const suffix = String(args[1]);
    return str.endsWith(suffix);
  }

  static patternMatch(args: ExpressionValue[]): boolean {
    if (args.length !== 2) {
      throw new Error('patternMatch() requires 2 arguments: string and pattern');
    }
    const str = String(args[0]);
    const pattern = String(args[1]);
    
    try {
      const regex = new RegExp(pattern);
      return regex.test(str);
    } catch (e) {
      // If pattern is not a valid regex, do simple string matching
      return str.includes(pattern);
    }
  }
}