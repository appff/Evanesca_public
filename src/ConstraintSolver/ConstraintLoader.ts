/**
 * DSL Constraint File Loader
 * 
 * Loads and parses DSL constraint files from the filesystem
 * and converts them into executable constraint objects.
 */

import fs from 'fs';
import path from 'path';

export interface ParsedConstraint {
  name: string;
  description: string;
  condition: string;
  violationIndex: number;
  message: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  enabled: boolean;
}

export class ConstraintLoader {
  private constraintsDir: string;
  private loadedConstraints: Map<string, ParsedConstraint[]> = new Map();
  
  constructor(constraintsDir?: string) {
    this.constraintsDir = constraintsDir || path.join(__dirname, 'constraints');
  }
  
  /**
   * Load all constraint files from the constraints directory
   */
  public async loadAllConstraints(): Promise<ParsedConstraint[]> {
    const allConstraints: ParsedConstraint[] = [];
    
    try {
      // Get all .dsl files in the constraints directory
      const files = fs.readdirSync(this.constraintsDir)
        .filter(file => file.endsWith('.dsl'));
      
      console.log(`📚 Loading ${files.length} constraint files...`);
      
      for (const file of files) {
        const filePath = path.join(this.constraintsDir, file);
        const constraints = await this.loadConstraintFile(filePath);
        
        console.log(`  ✅ Loaded ${constraints.length} constraints from ${file}`);
        
        this.loadedConstraints.set(file, constraints);
        allConstraints.push(...constraints);
      }
      
      console.log(`📊 Total constraints loaded: ${allConstraints.length}`);
      
      return allConstraints;
    } catch (error) {
      console.error('Failed to load constraints:', error);
      return [];
    }
  }
  
  /**
   * Load constraints from a specific file
   */
  public async loadConstraintFile(filePath: string): Promise<ParsedConstraint[]> {
    const constraints: ParsedConstraint[] = [];
    
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const parsedConstraints = this.parseDSLFile(content);
      constraints.push(...parsedConstraints);
    } catch (error) {
      console.error(`Failed to load constraint file ${filePath}:`, error);
    }
    
    return constraints;
  }
  
  /**
   * Parse a DSL file content into constraint objects
   */
  private parseDSLFile(content: string): ParsedConstraint[] {
    const constraints: ParsedConstraint[] = [];
    
    // Remove comments
    const lines = content.split('\n')
      .map(line => {
        const commentIndex = line.indexOf('#');
        if (commentIndex >= 0) {
          return line.substring(0, commentIndex).trim();
        }
        return line.trim();
      })
      .filter(line => line.length > 0);
    
    // Parse constraint blocks
    let currentConstraint: any = null;
    let inWhenBlock = false;
    let inThenBlock = false;
    let whenCondition = '';
    let thenAction = '';
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Start of constraint
      if (line.startsWith('constraint ')) {
        if (currentConstraint) {
          // Save previous constraint
          constraints.push(this.finalizeConstraint(currentConstraint, whenCondition, thenAction));
        }
        
        const name = line.substring('constraint '.length).replace('{', '').trim();
        currentConstraint = {
          name,
          description: '',
          severity: 'MEDIUM' as const,
          enabled: true
        };
        whenCondition = '';
        thenAction = '';
        inWhenBlock = false;
        inThenBlock = false;
      }
      // Description
      else if (line.startsWith('description:')) {
        if (currentConstraint) {
          currentConstraint.description = this.extractQuotedString(line.substring('description:'.length));
        }
      }
      // When block
      else if (line.startsWith('when:')) {
        inWhenBlock = true;
        inThenBlock = false;
        whenCondition = line.substring('when:'.length).trim();
      }
      // Then block
      else if (line.startsWith('then:')) {
        inWhenBlock = false;
        inThenBlock = true;
        thenAction = line.substring('then:'.length).trim();
      }
      // Severity
      else if (line.startsWith('severity:')) {
        if (currentConstraint) {
          currentConstraint.severity = line.substring('severity:'.length).trim() as any;
        }
      }
      // End of constraint
      else if (line === '}') {
        if (currentConstraint) {
          constraints.push(this.finalizeConstraint(currentConstraint, whenCondition, thenAction));
          currentConstraint = null;
          whenCondition = '';
          thenAction = '';
        }
      }
      // Continuation of when/then blocks
      else if (inWhenBlock && !line.startsWith('then:')) {
        whenCondition += ' ' + line;
      }
      else if (inThenBlock && !line.startsWith('severity:')) {
        thenAction += ' ' + line;
      }
    }
    
    // Handle last constraint if file doesn't end with }
    if (currentConstraint) {
      constraints.push(this.finalizeConstraint(currentConstraint, whenCondition, thenAction));
    }
    
    return constraints;
  }
  
  /**
   * Finalize a constraint object
   */
  private finalizeConstraint(constraint: any, whenCondition: string, thenAction: string): ParsedConstraint {
    // Parse violation from then action
    const violationMatch = thenAction.match(/violation\((\d+),\s*"([^"]+)"\)/);
    const violationIndex = violationMatch ? parseInt(violationMatch[1]) : 0;
    const message = violationMatch ? violationMatch[2] : constraint.description;
    
    return {
      name: constraint.name,
      description: constraint.description || '',
      condition: this.cleanCondition(whenCondition),
      violationIndex,
      message,
      severity: constraint.severity || 'MEDIUM',
      enabled: constraint.enabled !== false
    };
  }
  
  /**
   * Clean and format condition string
   */
  private cleanCondition(condition: string): string {
    return condition
      .replace(/\s+/g, ' ')
      .replace(/\s*&&\s*/g, ' && ')
      .replace(/\s*\|\|\s*/g, ' || ')
      .replace(/\s*==\s*/g, ' == ')
      .replace(/\s*!=\s*/g, ' != ')
      .replace(/\s*>\s*/g, ' > ')
      .replace(/\s*<\s*/g, ' < ')
      .replace(/\s*>=\s*/g, ' >= ')
      .replace(/\s*<=\s*/g, ' <= ')
      .trim();
  }
  
  /**
   * Extract quoted string
   */
  private extractQuotedString(str: string): string {
    const match = str.match(/"([^"]+)"/);
    return match ? match[1] : str.trim();
  }
  
  /**
   * Get constraints by category
   */
  public getConstraintsByCategory(category: string): ParsedConstraint[] {
    const categoryFile = `${category}-constraints.dsl`;
    return this.loadedConstraints.get(categoryFile) || [];
  }
  
  /**
   * Get constraints by severity
   */
  public getConstraintsBySeverity(severity: string): ParsedConstraint[] {
    const allConstraints: ParsedConstraint[] = [];
    
    for (const constraints of this.loadedConstraints.values()) {
      allConstraints.push(...constraints.filter(c => c.severity === severity));
    }
    
    return allConstraints;
  }
  
  /**
   * Get constraint by name
   */
  public getConstraintByName(name: string): ParsedConstraint | undefined {
    for (const constraints of this.loadedConstraints.values()) {
      const found = constraints.find(c => c.name === name);
      if (found) return found;
    }
    return undefined;
  }
}