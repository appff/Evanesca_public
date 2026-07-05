import { ExpressionValue } from '../../SemanticFinancialGraph/Types';
import { LambdaFunction } from '../DSLInterpreter';

/**
 * Array operation utilities for DSL expressions with lambda support
 */
export class ArrayOperations {

  /**
   * Filter array elements using a lambda predicate
   * @param array - Array to filter
   * @param lambdaFunc - Lambda function that returns boolean
   * @param interpreter - DSL interpreter for executing lambda
   */
  static async filter(
    array: any[],
    lambdaFunc: LambdaFunction,
    interpreter: any  // Use any to avoid circular dependency
  ): Promise<ExpressionValue> {
    if (!Array.isArray(array)) {
      throw new Error('filter() requires an array as first argument');
    }

    if (lambdaFunc.parameters.length !== 1) {
      throw new Error('filter() lambda must have exactly 1 parameter');
    }

    const result: any[] = [];
    for (const element of array) {
      const predicateResult = await interpreter.executeLambda(lambdaFunc, [element]);
      if (predicateResult) {
        result.push(element);
      }
    }

    return result;
  }

  /**
   * Map array elements using a lambda transformer
   * @param array - Array to map
   * @param lambdaFunc - Lambda function that transforms each element
   * @param interpreter - DSL interpreter for executing lambda
   */
  static async map(
    array: any[],
    lambdaFunc: LambdaFunction,
    interpreter: any  // Use any to avoid circular dependency
  ): Promise<ExpressionValue> {
    if (!Array.isArray(array)) {
      throw new Error('map() requires an array as first argument');
    }

    if (lambdaFunc.parameters.length !== 1) {
      throw new Error('map() lambda must have exactly 1 parameter');
    }

    const result: any[] = [];
    for (const element of array) {
      const transformedValue = await interpreter.executeLambda(lambdaFunc, [element]);
      result.push(transformedValue);
    }

    return result;
  }

  /**
   * Group array elements by a lambda-computed key
   * @param array - Array to group
   * @param lambdaFunc - Lambda function that computes grouping key
   * @param interpreter - DSL interpreter for executing lambda
   */
  static async groupBy(
    array: any[],
    lambdaFunc: LambdaFunction,
    interpreter: any  // Use any to avoid circular dependency
  ): Promise<ExpressionValue> {
    if (!Array.isArray(array)) {
      throw new Error('groupBy() requires an array as first argument');
    }

    if (lambdaFunc.parameters.length !== 1) {
      throw new Error('groupBy() lambda must have exactly 1 parameter');
    }

    const groups: { [key: string]: any[] } = {};

    for (const element of array) {
      const key = await interpreter.executeLambda(lambdaFunc, [element]);
      const keyStr = String(key);

      if (!groups[keyStr]) {
        groups[keyStr] = [];
      }
      groups[keyStr].push(element);
    }

    return groups;
  }

  /**
   * Sort array elements using a lambda comparator
   * @param array - Array to sort
   * @param lambdaFunc - Lambda function that compares two elements
   * @param interpreter - DSL interpreter for executing lambda
   */
  static async sort(
    array: any[],
    lambdaFunc: LambdaFunction,
    interpreter: any  // Use any to avoid circular dependency
  ): Promise<ExpressionValue> {
    if (!Array.isArray(array)) {
      throw new Error('sort() requires an array as first argument');
    }

    if (lambdaFunc.parameters.length !== 2) {
      throw new Error('sort() lambda must have exactly 2 parameters (a, b)');
    }

    // Create a copy to avoid mutating original array
    const sortedArray = [...array];

    // Use async sort with bubble sort algorithm (simple but works with async comparator)
    for (let i = 0; i < sortedArray.length; i++) {
      for (let j = 0; j < sortedArray.length - i - 1; j++) {
        const comparisonResult = await interpreter.executeLambda(
          lambdaFunc,
          [sortedArray[j], sortedArray[j + 1]]
        );

        if (Number(comparisonResult) > 0) {
          // Swap elements
          const temp = sortedArray[j];
          sortedArray[j] = sortedArray[j + 1];
          sortedArray[j + 1] = temp;
        }
      }
    }

    return sortedArray;
  }

  /**
   * Slice array to get a subset
   * @param array - Array to slice
   * @param args - [start, end?] slice parameters
   */
  static slice(array: any[], args: ExpressionValue[]): ExpressionValue {
    if (!Array.isArray(array)) {
      throw new Error('slice() requires an array as first argument');
    }

    const start = args.length > 0 && typeof args[0] === 'number' ? args[0] : 0;
    const end = args.length > 1 && typeof args[1] === 'number' ? args[1] : undefined;

    return array.slice(start, end);
  }

  /**
   * Sum array elements using a lambda selector
   * @param array - Array to sum
   * @param lambdaFunc - Lambda function that extracts the value to sum
   * @param interpreter - DSL interpreter for executing lambda
   */
  static async sumWithLambda(
    array: any[],
    lambdaFunc: LambdaFunction,
    interpreter: any
  ): Promise<ExpressionValue> {
    if (!Array.isArray(array)) {
      throw new Error('sum() requires an array as first argument');
    }

    if (lambdaFunc.parameters.length !== 1) {
      throw new Error('sum() lambda must have exactly 1 parameter');
    }

    let total = 0;
    for (const element of array) {
      const value = await interpreter.executeLambda(lambdaFunc, [element]);
      total += (typeof value === 'number' ? value : 0);
    }

    return total;
  }

  /**
   * Average array elements using a lambda selector
   * @param array - Array to average
   * @param lambdaFunc - Lambda function that extracts the value to average
   * @param interpreter - DSL interpreter for executing lambda
   */
  static async avgWithLambda(
    array: any[],
    lambdaFunc: LambdaFunction,
    interpreter: any
  ): Promise<ExpressionValue> {
    if (!Array.isArray(array)) {
      throw new Error('avg() requires an array as first argument');
    }

    if (array.length === 0) return 0;

    if (lambdaFunc.parameters.length !== 1) {
      throw new Error('avg() lambda must have exactly 1 parameter');
    }

    let total = 0;
    for (const element of array) {
      const value = await interpreter.executeLambda(lambdaFunc, [element]);
      total += (typeof value === 'number' ? value : 0);
    }

    return total / array.length;
  }

  /**
   * Check if any element matches the lambda predicate
   * @param array - Array to check
   * @param lambdaFunc - Lambda predicate function
   * @param interpreter - DSL interpreter for executing lambda
   */
  static async some(
    array: any[],
    lambdaFunc: LambdaFunction,
    interpreter: any
  ): Promise<ExpressionValue> {
    if (!Array.isArray(array)) {
      throw new Error('some() requires an array as first argument');
    }

    if (lambdaFunc.parameters.length !== 1) {
      throw new Error('some() lambda must have exactly 1 parameter');
    }

    for (const element of array) {
      const predicateResult = await interpreter.executeLambda(lambdaFunc, [element]);
      if (predicateResult) {
        return true;
      }
    }

    return false;
  }

  /**
   * Count elements matching the lambda predicate
   * @param array - Array to count
   * @param lambdaFunc - Lambda predicate function
   * @param interpreter - DSL interpreter for executing lambda
   */
  static async countWithLambda(
    array: any[],
    lambdaFunc: LambdaFunction,
    interpreter: any
  ): Promise<ExpressionValue> {
    if (!Array.isArray(array)) {
      throw new Error('count() requires an array as first argument');
    }

    if (lambdaFunc.parameters.length !== 1) {
      throw new Error('count() lambda must have exactly 1 parameter');
    }

    let matchCount = 0;
    for (const element of array) {
      const predicateResult = await interpreter.executeLambda(lambdaFunc, [element]);
      if (predicateResult) {
        matchCount++;
      }
    }

    return matchCount;
  }

  /**
   * Find minimum value in array
   * @param array - Array to search
   */
  static min(array: any[]): ExpressionValue {
    if (!Array.isArray(array)) {
      throw new Error('min() requires an array');
    }
    if (array.length === 0) return undefined;

    return Math.min(...array.map(v => typeof v === 'number' ? v : 0));
  }

  /**
   * Find maximum value in array
   * @param array - Array to search
   */
  static max(array: any[]): ExpressionValue {
    if (!Array.isArray(array)) {
      throw new Error('max() requires an array');
    }
    if (array.length === 0) return undefined;

    return Math.max(...array.map(v => typeof v === 'number' ? v : 0));
  }

  /**
   * Calculate standard deviation of array values
   * @param array - Array of numbers
   */
  static stdDev(array: any[]): ExpressionValue {
    if (!Array.isArray(array)) {
      throw new Error('stdDev() requires an array');
    }
    if (array.length === 0) return 0;

    const mean = ArrayOperations.average([array]);
    const squaredDiffs = array.map(val => Math.pow((typeof val === 'number' ? val : 0) - mean, 2));
    const avgSquaredDiff = squaredDiffs.reduce((acc, val) => acc + val, 0) / array.length;
    return Math.sqrt(avgSquaredDiff);
  }

  /**
   * Calculate average of array values (no lambda)
   * @param array - Array of numbers
   */
  static avg(array: any[]): ExpressionValue {
    if (!Array.isArray(array)) {
      throw new Error('avg() requires an array');
    }
    if (array.length === 0) return 0;

    const sum = array.reduce((acc, val) => acc + (typeof val === 'number' ? val : 0), 0);
    return sum / array.length;
  }

  // =========================================================================
  // Legacy Methods (kept for backward compatibility with old DSL constraints)
  // =========================================================================

  static sum(args: ExpressionValue[]): number {
    if (args.length !== 1 || !Array.isArray(args[0])) {
      throw new Error('sum() requires an array argument');
    }
    return (args[0] as number[]).reduce((acc, val) => acc + (typeof val === 'number' ? val : 0), 0);
  }

  static count(args: ExpressionValue[]): number {
    if (args.length !== 1 || !Array.isArray(args[0])) {
      throw new Error('count() requires an array argument');
    }
    return args[0].length;
  }

  static getLength(args: ExpressionValue[]): number {
    if (args.length !== 1) return 0;
    const arr = args[0];
    if (Array.isArray(arr)) return arr.length;
    if (typeof arr === 'string') return arr.length;
    return 0;
  }

  static first(args: ExpressionValue[]): ExpressionValue {
    if (args.length !== 1 || !Array.isArray(args[0])) {
      throw new Error('first() requires an array argument');
    }
    const arr = args[0] as ExpressionValue[];
    return arr.length > 0 ? arr[0] : undefined;
  }

  static last(args: ExpressionValue[]): ExpressionValue {
    if (args.length !== 1 || !Array.isArray(args[0])) {
      throw new Error('last() requires an array argument');
    }
    const arr = args[0] as ExpressionValue[];
    return arr.length > 0 ? arr[arr.length - 1] : undefined;
  }

  static average(args: ExpressionValue[]): number {
    if (args.length !== 1 || !Array.isArray(args[0])) {
      throw new Error('average() requires an array argument');
    }
    const arr = args[0] as number[];
    if (arr.length === 0) return 0;
    const sum = arr.reduce((acc, val) => acc + (typeof val === 'number' ? val : 0), 0);
    return sum / arr.length;
  }

  static standardDeviation(args: ExpressionValue[]): number {
    if (args.length !== 1 || !Array.isArray(args[0])) {
      throw new Error('stddev() requires an array argument');
    }
    const arr = args[0] as number[];
    if (arr.length === 0) return 0;
    
    const mean = ArrayOperations.average(args);
    const squaredDiffs = arr.map(val => Math.pow((typeof val === 'number' ? val : 0) - mean, 2));
    const avgSquaredDiff = squaredDiffs.reduce((acc, val) => acc + val, 0) / arr.length;
    return Math.sqrt(avgSquaredDiff);
  }

  static percentile(args: ExpressionValue[]): number {
    if (args.length !== 2 || !Array.isArray(args[0]) || typeof args[1] !== 'number') {
      throw new Error('percentile() requires an array and a percentile value (0-100)');
    }
    const arr = (args[0] as number[]).sort((a, b) => a - b);
    const percentile = args[1] as number;
    
    if (percentile < 0 || percentile > 100) {
      throw new Error('Percentile must be between 0 and 100');
    }
    
    const index = Math.ceil((percentile / 100) * arr.length) - 1;
    return arr[Math.max(0, index)] || 0;
  }

  static median(args: ExpressionValue[]): number {
    return ArrayOperations.percentile([args[0], 50]);
  }
}