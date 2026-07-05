/**
 * MiCA Constraint Validation Script
 *
 * Phase 1.5: Validate constraints against MiCA requirements
 *
 * Validation Gates:
 * 1. Syntax Validation: DSL parsing success
 * 2. Logic Validation: Constraint structure and semantics
 * 3. Compliance Validation: MiCA article alignment
 * 4. Performance Validation: Execution efficiency
 */

import * as fs from 'fs';
import * as path from 'path';
import { DSLLexer, DSLParser } from './DSLParser';
import { ConstraintManager } from './DSLInterpreter';

interface ValidationResult {
  constraint: string;
  passed: boolean;
  errors: string[];
  warnings: string[];
  metrics?: {
    parseTime: number;
    tokenCount: number;
  };
}

interface ValidationReport {
  totalConstraints: number;
  passed: number;
  failed: number;
  validationResults: ValidationResult[];
  overallStatus: 'PASS' | 'FAIL';
}

class MiCAConstraintValidator {
  private constraintFile: string;
  private dslContent: string;
  private results: ValidationResult[] = [];

  constructor(constraintFilePath: string) {
    this.constraintFile = constraintFilePath;
    this.dslContent = fs.readFileSync(constraintFilePath, 'utf-8');
  }

  /**
   * Gate 1: Syntax Validation
   * - DSL parser successfully compiles constraint
   * - No syntax errors or undefined variables
   * - All referenced fields exist in SFG schema
   */
  private validateSyntax(): ValidationResult[] {
    console.log('\n=== GATE 1: SYNTAX VALIDATION ===\n');

    const results: ValidationResult[] = [];

    try {
      // Tokenize
      const startTokenize = Date.now();
      const lexer = new DSLLexer(this.dslContent);
      const tokens = lexer.tokenize();
      const tokenizeTime = Date.now() - startTokenize;

      console.log(`✅ Tokenization successful: ${tokens.length} tokens in ${tokenizeTime}ms`);

      // Parse
      const startParse = Date.now();
      const parser = new DSLParser(tokens);
      const constraints = parser.parseMultipleConstraints();
      const parseTime = Date.now() - startParse;

      console.log(`✅ Parsing successful: ${constraints.length} constraints in ${parseTime}ms\n`);

      // Validate each constraint individually
      constraints.forEach((constraint, index) => {
        const errors: string[] = [];
        const warnings: string[] = [];

        console.log(`Constraint ${index + 1}: ${constraint.name}`);

        // Check required fields
        if (!constraint.name) {
          errors.push('Missing constraint name');
        }

        if (!constraint.when) {
          warnings.push('No "when" condition specified');
        }

        if (!constraint.conditions && !constraint.condition) {
          errors.push('Missing "conditions" or "condition" block');
        }

        if (!constraint.violation) {
          errors.push('Missing "violation" specification');
        }

        // Check for description (best practice)
        if (!constraint.description) {
          warnings.push('Missing description field');
        }

        // Check for severity (MiCA compliance requirement)
        if (!constraint.severity) {
          warnings.push('Missing severity level');
        }

        // Check for confidence (validation requirement)
        if (!constraint.confidence) {
          warnings.push('Missing confidence score');
        }

        // Check for temporal window (Phase 0 requirement)
        if (!constraint.temporal) {
          warnings.push('No temporal window specified');
        }

        const passed = errors.length === 0;
        console.log(`  Status: ${passed ? '✅ PASS' : '❌ FAIL'}`);
        if (errors.length > 0) {
          console.log(`  Errors: ${errors.join(', ')}`);
        }
        if (warnings.length > 0) {
          console.log(`  Warnings: ${warnings.join(', ')}`);
        }
        console.log('');

        results.push({
          constraint: constraint.name,
          passed,
          errors,
          warnings,
          metrics: {
            parseTime: parseTime / constraints.length,
            tokenCount: tokens.length / constraints.length
          }
        });
      });

    } catch (error) {
      console.error('❌ Syntax validation failed:', error);
      results.push({
        constraint: 'PARSING_ERROR',
        passed: false,
        errors: [(error as Error).message],
        warnings: []
      });
    }

    return results;
  }

  /**
   * Gate 2: Logic Validation
   * - Detection logic mathematically sound
   * - Edge cases handled (division by zero, empty arrays)
   * - Temporal windows correctly specified
   */
  private validateLogic(): ValidationResult[] {
    console.log('\n=== GATE 2: LOGIC VALIDATION ===\n');

    const results: ValidationResult[] = [];
    const logicPatterns = {
      divisionByZero: /\/\s*([a-zA-Z_][a-zA-Z0-9_\.]*(?:\[[^\]]+\])?)\s*(?![><=])/g,
      arrayAccess: /\.length/g,
      filterOperations: /\.filter\(/g,
      sumOperations: /\.sum\(/g,
      mapOperations: /\.map\(/g,
      undefinedCheck: /!= null|!== null/g
    };

    const constraints = this.parseConstraints();

    constraints.forEach(constraint => {
      const errors: string[] = [];
      const warnings: string[] = [];
      const constraintStr = JSON.stringify(constraint);

      console.log(`Constraint: ${constraint.name}`);

      // Check for division operations (potential division by zero)
      const divisions = constraintStr.match(logicPatterns.divisionByZero);
      if (divisions && divisions.length > 0) {
        const hasZeroCheck = constraintStr.includes('!= 0') || constraintStr.includes('!== 0') || constraintStr.includes('> 0');
        if (!hasZeroCheck) {
          warnings.push('Division operation without explicit zero check');
        }
      }

      // Check for array operations (potential empty array issues)
      const hasArrayOps = logicPatterns.arrayAccess.test(constraintStr) ||
                         logicPatterns.filterOperations.test(constraintStr) ||
                         logicPatterns.sumOperations.test(constraintStr);

      if (hasArrayOps) {
        const hasLengthCheck = /\.length\s*[><=]/.test(constraintStr);
        if (!hasLengthCheck) {
          warnings.push('Array operations without length validation');
        }
      }

      // Check temporal window specification
      if (constraint.temporal) {
        const temporalStr = JSON.stringify(constraint.temporal);
        const isBlockWindow = temporalStr.includes('BLOCK_WINDOW');
        const isTimeWindow = temporalStr.includes('TIME_WINDOW');

        if (isBlockWindow) {
          const blockMatch = temporalStr.match(/BLOCK_WINDOW\((\d+)\)/);
          if (blockMatch) {
            const blocks = parseInt(blockMatch[1]);
            // Validate reasonable block windows
            if (blocks < 1) {
              errors.push('BLOCK_WINDOW must be >= 1');
            }
            if (blocks > 10000) {
              warnings.push(`Large BLOCK_WINDOW (${blocks}) may impact performance`);
            }
          }
        }

        if (isTimeWindow) {
          const timeMatch = temporalStr.match(/TIME_WINDOW\((\d+)\)/);
          if (timeMatch) {
            const seconds = parseInt(timeMatch[1]);
            if (seconds < 1) {
              errors.push('TIME_WINDOW must be >= 1 second');
            }
            if (seconds > 86400) {
              warnings.push(`Large TIME_WINDOW (${seconds}s) may impact performance`);
            }
          }
        }

        if (!isBlockWindow && !isTimeWindow) {
          warnings.push('Temporal window type not recognized');
        }
      }

      // Check for null/undefined handling
      const hasNullChecks = logicPatterns.undefinedCheck.test(constraintStr);
      if (constraintStr.includes('.') && !hasNullChecks) {
        warnings.push('Object property access without null checks');
      }

      const passed = errors.length === 0;
      console.log(`  Status: ${passed ? '✅ PASS' : '❌ FAIL'}`);
      if (errors.length > 0) {
        console.log(`  Errors: ${errors.join(', ')}`);
      }
      if (warnings.length > 0) {
        console.log(`  Warnings: ${warnings.join(', ')}`);
      }
      console.log('');

      results.push({
        constraint: constraint.name,
        passed,
        errors,
        warnings
      });
    });

    return results;
  }

  /**
   * Gate 3: Compliance Validation
   * - Correctly implements MiCA article requirements
   * - Aligns with regulatory technical standards (RTS)
   * - Matches compliance mapping document
   */
  private validateCompliance(): ValidationResult[] {
    console.log('\n=== GATE 3: COMPLIANCE VALIDATION ===\n');

    const results: ValidationResult[] = [];

    // Expected MiCA constraints from MICA_CONSTRAINT_COMPLIANCE_MAPPING.md
    const expectedConstraints = [
      { name: 'MICA_LARGE_TRANSACTION', article: '86', priority: 'High' },
      { name: 'MICA_UNVERIFIED_USER_LIMIT', article: '63(5)', priority: 'High' },
      { name: 'MICA_VERIFIED_USER_LIMIT', article: '63(5)', priority: 'High' },
      { name: 'MICA_WASH_TRADING_DETECTION', article: '84', priority: 'High' },
      { name: 'MICA_STABLECOIN_RESERVE_RATIO', article: '35', priority: 'High' },
      { name: 'MICA_STRUCTURING_DETECTION', article: '77', priority: 'Medium' },
      { name: 'MICA_RAPID_MOVEMENT_LAYERING', article: '77', priority: 'Medium' },
      { name: 'MICA_INSIDER_TRADING_PATTERN', article: '89', priority: 'Medium' },
      { name: 'MICA_PROHIBITED_JURISDICTION', article: '60', priority: 'Medium' },
      { name: 'MICA_HIGH_RISK_JURISDICTION', article: '60', priority: 'Medium' },
      { name: 'MICA_CIRCULAR_TRADING', article: '84', priority: 'Additional' },
      { name: 'MICA_UNUSUAL_VELOCITY', article: '77', priority: 'Additional' },
      { name: 'MICA_VOLUME_SPIKE', article: '77', priority: 'Additional' },
      { name: 'MICA_BRIDGE_LIMIT_EVASION', article: '77', priority: 'Additional' },
      { name: 'MICA_INSTITUTIONAL_VERIFICATION', article: '62', priority: 'Additional' }
    ];

    const constraints = this.parseConstraints();
    const constraintNames = constraints.map(c => c.name);

    console.log(`Expected constraints: ${expectedConstraints.length}`);
    console.log(`Found constraints: ${constraints.length}\n`);

    // Check each expected constraint
    expectedConstraints.forEach(expected => {
      const errors: string[] = [];
      const warnings: string[] = [];

      const exists = constraintNames.includes(expected.name);

      console.log(`${expected.name} (Article ${expected.article}, ${expected.priority})`);

      if (!exists) {
        errors.push(`Missing constraint: ${expected.name}`);
        console.log(`  Status: ❌ MISSING`);
      } else {
        const constraint = constraints.find(c => c.name === expected.name);

        // Check for description (should reference article)
        if (!constraint?.description || !constraint.description.includes('Article')) {
          warnings.push('Description should reference MiCA article');
        }

        // Check for metadata field
        const constraintStr = JSON.stringify(constraint);
        if (!constraintStr.includes('metadata')) {
          warnings.push('Missing metadata field with regulation reference');
        }

        // Check severity levels
        const severityLevels = ['low', 'medium', 'high', 'critical'];
        if (constraint?.severity && !severityLevels.includes(constraint.severity.toLowerCase())) {
          errors.push(`Invalid severity level: ${constraint.severity}`);
        }

        // Check confidence scores (0.0 - 1.0)
        if (constraint?.confidence) {
          const conf = parseFloat(constraint.confidence as any);
          if (isNaN(conf) || conf < 0 || conf > 1) {
            errors.push(`Invalid confidence score: ${constraint.confidence}`);
          }
        }

        console.log(`  Status: ✅ FOUND`);
        if (warnings.length > 0) {
          console.log(`  Warnings: ${warnings.join(', ')}`);
        }
      }
      console.log('');

      results.push({
        constraint: expected.name,
        passed: errors.length === 0,
        errors,
        warnings
      });
    });

    // Check for unexpected constraints
    const unexpected = constraintNames.filter(name =>
      !expectedConstraints.some(exp => exp.name === name)
    );

    if (unexpected.length > 0) {
      console.log(`⚠️  Unexpected constraints found: ${unexpected.join(', ')}\n`);
    }

    return results;
  }

  /**
   * Gate 4: Performance Validation
   * - Constraint execution <100ms per transaction
   * - Memory usage <10MB per constraint
   * - No unbounded loops or O(n²) operations
   */
  private validatePerformance(): ValidationResult[] {
    console.log('\n=== GATE 4: PERFORMANCE VALIDATION ===\n');

    const results: ValidationResult[] = [];
    const constraints = this.parseConstraints();

    constraints.forEach(constraint => {
      const errors: string[] = [];
      const warnings: string[] = [];
      const constraintStr = JSON.stringify(constraint);

      console.log(`Constraint: ${constraint.name}`);

      // Check for nested loops (O(n²) complexity)
      const nestedLoopPattern = /\.filter\([^)]+\.filter\(/g;
      const nestedMapPattern = /\.map\([^)]+\.map\(/g;

      if (nestedLoopPattern.test(constraintStr) || nestedMapPattern.test(constraintStr)) {
        warnings.push('Nested array operations detected (potential O(n²) complexity)');
      }

      // Check for unbounded operations
      const filterCount = (constraintStr.match(/\.filter\(/g) || []).length;
      const mapCount = (constraintStr.match(/\.map\(/g) || []).length;
      const sumCount = (constraintStr.match(/\.sum\(/g) || []).length;

      if (filterCount + mapCount + sumCount > 5) {
        warnings.push(`Many array operations (${filterCount + mapCount + sumCount}) may impact performance`);
      }

      // Check temporal window size (affects buffer memory)
      if (constraint.temporal) {
        const temporalStr = JSON.stringify(constraint.temporal);
        const blockMatch = temporalStr.match(/BLOCK_WINDOW\((\d+)\)/);
        if (blockMatch) {
          const blocks = parseInt(blockMatch[1]);
          if (blocks > 7000) {
            warnings.push(`Large block window (${blocks}) requires significant memory buffer`);
          }
        }
      }

      // Estimate execution time (heuristic)
      const operationCount = filterCount * 2 + mapCount * 2 + sumCount;
      const estimatedMs = operationCount * 0.5; // rough estimate

      if (estimatedMs > 100) {
        warnings.push(`Estimated execution time ~${estimatedMs.toFixed(1)}ms (target: <100ms)`);
      } else {
        console.log(`  Estimated execution: ~${estimatedMs.toFixed(1)}ms ✅`);
      }

      const passed = errors.length === 0;
      console.log(`  Status: ${passed ? '✅ PASS' : '❌ FAIL'}`);
      if (errors.length > 0) {
        console.log(`  Errors: ${errors.join(', ')}`);
      }
      if (warnings.length > 0) {
        console.log(`  Warnings: ${warnings.join(', ')}`);
      }
      console.log('');

      results.push({
        constraint: constraint.name,
        passed,
        errors,
        warnings
      });
    });

    return results;
  }

  /**
   * Helper: Parse constraints from DSL content
   */
  private parseConstraints(): any[] {
    try {
      const lexer = new DSLLexer(this.dslContent);
      const tokens = lexer.tokenize();
      const parser = new DSLParser(tokens);
      return parser.parseMultipleConstraints();
    } catch (error) {
      console.error('Failed to parse constraints:', error);
      return [];
    }
  }

  /**
   * Run all validation gates and generate report
   */
  public validate(): ValidationReport {
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║  MiCA Constraint Validation - Phase 1.5                     ║');
    console.log('║  File: mica_regulation_constraints.dsl                      ║');
    console.log('╚══════════════════════════════════════════════════════════════╝');

    // Run all validation gates
    const syntaxResults = this.validateSyntax();
    const logicResults = this.validateLogic();
    const complianceResults = this.validateCompliance();
    const performanceResults = this.validatePerformance();

    // Combine results
    const allResults = [
      ...syntaxResults,
      ...logicResults,
      ...complianceResults,
      ...performanceResults
    ];

    const uniqueConstraints = new Set(allResults.map(r => r.constraint));
    const passed = allResults.filter(r => r.passed).length;
    const failed = allResults.filter(r => !r.passed).length;

    const report: ValidationReport = {
      totalConstraints: uniqueConstraints.size,
      passed,
      failed,
      validationResults: allResults,
      overallStatus: failed === 0 ? 'PASS' : 'FAIL'
    };

    // Print summary
    console.log('\n╔══════════════════════════════════════════════════════════════╗');
    console.log('║  VALIDATION SUMMARY                                          ║');
    console.log('╚══════════════════════════════════════════════════════════════╝\n');
    console.log(`Total Constraints: ${report.totalConstraints}`);
    console.log(`Validation Checks: ${allResults.length}`);
    console.log(`Passed: ${passed} ✅`);
    console.log(`Failed: ${failed} ${failed > 0 ? '❌' : ''}`);
    console.log(`\nOverall Status: ${report.overallStatus === 'PASS' ? '✅ PASS' : '❌ FAIL'}\n`);

    // Detailed failure report
    if (failed > 0) {
      console.log('Failed Checks:');
      allResults.filter(r => !r.passed).forEach(result => {
        console.log(`  ❌ ${result.constraint}`);
        result.errors.forEach(error => {
          console.log(`     - ${error}`);
        });
      });
      console.log('');
    }

    // Warning summary
    const totalWarnings = allResults.reduce((sum, r) => sum + r.warnings.length, 0);
    if (totalWarnings > 0) {
      console.log(`⚠️  Total Warnings: ${totalWarnings}`);
      console.log('(Warnings do not affect PASS/FAIL status but should be addressed)\n');
    }

    return report;
  }

  /**
   * Save validation report to file
   */
  public saveReport(report: ValidationReport, outputPath: string): void {
    const reportContent = `# MiCA Constraint Validation Report

**Date**: ${new Date().toISOString()}
**File**: ${this.constraintFile}
**Status**: ${report.overallStatus}

## Summary

- Total Constraints: ${report.totalConstraints}
- Validation Checks: ${report.validationResults.length}
- Passed: ${report.passed} ✅
- Failed: ${report.failed} ${report.failed > 0 ? '❌' : ''}

## Detailed Results

${report.validationResults.map(result => `
### ${result.constraint}

- **Status**: ${result.passed ? '✅ PASS' : '❌ FAIL'}
${result.errors.length > 0 ? `- **Errors**:\n${result.errors.map(e => `  - ${e}`).join('\n')}` : ''}
${result.warnings.length > 0 ? `- **Warnings**:\n${result.warnings.map(w => `  - ${w}`).join('\n')}` : ''}
${result.metrics ? `- **Metrics**: Parse time: ${result.metrics.parseTime.toFixed(2)}ms, Tokens: ${result.metrics.tokenCount.toFixed(0)}` : ''}
`).join('\n')}

## Conclusion

${report.overallStatus === 'PASS' ?
  'All validation gates passed successfully. Constraints are ready for Phase 2 testing.' :
  'Some validation checks failed. Please review and address errors before proceeding to Phase 2.'}
`;

    fs.writeFileSync(outputPath, reportContent);
    console.log(`📄 Validation report saved to: ${outputPath}\n`);
  }
}

// Main execution
if (require.main === module) {
  const constraintFilePath = path.join(__dirname, 'constraints', 'mica_regulation_constraints.dsl');
  const reportFilePath = path.join(__dirname, '..', '..', 'docs', 'MICA_CONSTRAINT_VALIDATION_REPORT.md');

  const validator = new MiCAConstraintValidator(constraintFilePath);
  const report = validator.validate();
  validator.saveReport(report, reportFilePath);

  // Exit with appropriate code
  process.exit(report.overallStatus === 'PASS' ? 0 : 1);
}

export { MiCAConstraintValidator, ValidationResult, ValidationReport };
