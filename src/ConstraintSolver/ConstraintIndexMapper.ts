/**
 * Automatic DSL Constraint Index Mapper
 * 
 * This module automatically parses DSL files to extract constraint names and their indices,
 * eliminating manual index mapping and preventing integrity issues.
 */

import * as fs from 'fs';
import * as path from 'path';

interface ConstraintInfo {
  name: string;
  index: number;
  lineNumber: number;
}

export class ConstraintIndexMapper {
  private constraintMap: Map<string, number> = new Map();
  private constraintInfos: ConstraintInfo[] = [];
  private dslFilePath: string;
  private lastModified: number = 0;
  private explicitPath: string | undefined;
  private lastEnvironmentMode: string | undefined;

  constructor(dslFilePath?: string) {
    // Store explicit path if provided
    this.explicitPath = dslFilePath;
    this.dslFilePath = this.determineDSLPath();
    this.loadConstraints();
  }

  /**
   * Dynamically determine DSL path based on current environment mode
   */
  private determineDSLPath(): string {
    // Use explicit path if provided
    if (this.explicitPath) {
      return this.explicitPath;
    }

    // Use DSL_FILE if provided (highest priority for custom runs)
    if (process.env.DSL_FILE) {
      const dslFileEnv = process.env.DSL_FILE;
      return path.isAbsolute(dslFileEnv)
        ? dslFileEnv
        : path.resolve(process.cwd(), dslFileEnv);
    }

    // Check MICA_REGULATION_MODE at runtime to support late environment variable setting
    if (process.env.MICA_REGULATION_MODE === 'true') {
      return path.join(__dirname, '../DSL/constraints/mica_regulation_constraints.dsl');
    } else {
      return path.join(__dirname, '../DSL/constraints/attack_detection_constraints.dsl');
    }
  }

  /**
   * Parse DSL file and extract constraint names in order
   */
  private loadConstraints(): void {
    try {
      // Check if environment mode has changed and update path accordingly
      const currentEnvironmentMode = process.env.MICA_REGULATION_MODE;
      if (currentEnvironmentMode !== this.lastEnvironmentMode) {
        console.log(`🔄 [ConstraintIndexMapper] Environment mode changed: ${this.lastEnvironmentMode} → ${currentEnvironmentMode}`);
        this.lastEnvironmentMode = currentEnvironmentMode;
        this.dslFilePath = this.determineDSLPath();
        // Force reload by resetting lastModified
        this.lastModified = 0;
      }

      const stats = fs.statSync(this.dslFilePath);
      const currentModified = stats.mtimeMs;

      // Only reload if file has been modified or environment changed
      if (currentModified === this.lastModified && this.constraintMap.size > 0 && this.lastEnvironmentMode === currentEnvironmentMode) {
        return;
      }

      const content = fs.readFileSync(this.dslFilePath, 'utf-8');
      this.parseConstraints(content);
      this.lastModified = currentModified;

      console.log(`🔧 [ConstraintIndexMapper] Loaded ${this.constraintInfos.length} constraints from ${this.dslFilePath}`);

    } catch (error) {
      console.error(`❌ [ConstraintIndexMapper] Failed to load DSL file: ${error}`);
      throw new Error(`Failed to load DSL constraint file: ${this.dslFilePath}`);
    }
  }

  /**
   * Parse constraint definitions from DSL content
   */
  private parseConstraints(content: string): void {
    this.constraintMap.clear();
    this.constraintInfos = [];

    const lines = content.split('\n');
    const constraintRegex = /^constraint\s+([A-Z_][A-Z0-9_]*)\s*\{/;
    
    let index = 0;
    
    for (let lineNumber = 0; lineNumber < lines.length; lineNumber++) {
      const line = lines[lineNumber].trim();
      const match = line.match(constraintRegex);
      
      if (match) {
        const constraintName = match[1];
        
        const constraintInfo: ConstraintInfo = {
          name: constraintName,
          index: index,
          lineNumber: lineNumber + 1
        };
        
        this.constraintInfos.push(constraintInfo);
        this.constraintMap.set(constraintName, index);
        
        console.log(`  📋 [${index.toString().padStart(2, '0')}] ${constraintName} (line ${lineNumber + 1})`);
        index++;
      }
    }

    console.log(`✅ [ConstraintIndexMapper] Parsed ${index} constraints successfully`);
  }

  /**
   * Get constraint index by name
   */
  public getConstraintIndex(constraintName: string): number {
    // Reload if file has been modified
    this.loadConstraints();
    
    const index = this.constraintMap.get(constraintName);
    if (index === undefined) {
      console.warn(`⚠️ [ConstraintIndexMapper] Constraint not found: ${constraintName}`);
      return -1; // Return -1 for missing constraints instead of throwing
    }
    
    return index;
  }

  /**
   * Get all constraint names in order
   */
  public getConstraintNames(): string[] {
    this.loadConstraints();
    return this.constraintInfos.map(info => info.name);
  }

  /**
   * Get complete constraint mapping
   */
  public getConstraintMapping(): { [key: string]: number } {
    this.loadConstraints();
    
    const mapping: { [key: string]: number } = {};
    this.constraintMap.forEach((index, name) => {
      mapping[name] = index;
    });
    
    return mapping;
  }

  /**
   * Get constraint information including line numbers
   */
  public getConstraintInfos(): ConstraintInfo[] {
    this.loadConstraints();
    return [...this.constraintInfos]; // Return copy to prevent mutation
  }

  /**
   * Get total number of constraints
   */
  public getConstraintCount(): number {
    this.loadConstraints();
    return this.constraintInfos.length;
  }

  /**
   * Validate constraint mapping integrity
   */
  public validateIntegrity(): {
    isValid: boolean;
    errors: string[];
    warnings: string[];
  } {
    this.loadConstraints();
    
    const errors: string[] = [];
    const warnings: string[] = [];
    let isValid = true;

    // Check for duplicate constraint names
    const nameCount = new Map<string, number>();
    this.constraintInfos.forEach(info => {
      nameCount.set(info.name, (nameCount.get(info.name) || 0) + 1);
    });

    nameCount.forEach((count, name) => {
      if (count > 1) {
        errors.push(`Duplicate constraint name: ${name} (appears ${count} times)`);
        isValid = false;
      }
    });

    // Check for sequential indices
    const expectedIndices = Array.from({length: this.constraintInfos.length}, (_, i) => i);
    const actualIndices = this.constraintInfos.map(info => info.index).sort((a, b) => a - b);
    
    if (JSON.stringify(expectedIndices) !== JSON.stringify(actualIndices)) {
      errors.push('Constraint indices are not sequential');
      isValid = false;
    }

    // Check constraint naming conventions
    this.constraintInfos.forEach(info => {
      if (!/^[A-Z_][A-Z0-9_]*$/.test(info.name)) {
        warnings.push(`Constraint name '${info.name}' doesn't follow naming convention`);
      }
    });

    return { isValid, errors, warnings };
  }

  /**
   * Generate mapping report for debugging
   */
  public generateReport(): string {
    this.loadConstraints();
    
    const validation = this.validateIntegrity();
    
    let report = '# Constraint Index Mapping Report\n\n';
    report += `**File**: ${this.dslFilePath}\n`;
    report += `**Last Modified**: ${new Date(this.lastModified).toISOString()}\n`;
    report += `**Total Constraints**: ${this.constraintInfos.length}\n\n`;
    
    if (!validation.isValid) {
      report += '## ❌ Validation Errors\n';
      validation.errors.forEach(error => {
        report += `- ${error}\n`;
      });
      report += '\n';
    }

    if (validation.warnings.length > 0) {
      report += '## ⚠️ Warnings\n';
      validation.warnings.forEach(warning => {
        report += `- ${warning}\n`;
      });
      report += '\n';
    }

    report += '## Constraint Mapping\n';
    report += '| Index | Constraint Name | Line Number |\n';
    report += '|-------|-----------------|-------------|\n';
    
    this.constraintInfos.forEach(info => {
      report += `| ${info.index.toString().padStart(3)} | ${info.name} | ${info.lineNumber} |\n`;
    });

    return report;
  }
}

// Create singleton instance for global use
export const constraintIndexMapper = new ConstraintIndexMapper();

// Export convenience functions
export const getConstraintIndex = (name: string): number => 
  constraintIndexMapper.getConstraintIndex(name);

export const getConstraintMapping = (): { [key: string]: number } => 
  constraintIndexMapper.getConstraintMapping();

export const getConstraintCount = (): number => 
  constraintIndexMapper.getConstraintCount();

export const validateConstraintIntegrity = () => 
  constraintIndexMapper.validateIntegrity();
