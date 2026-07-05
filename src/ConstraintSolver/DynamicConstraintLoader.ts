/**
 * Dynamic Constraint Loader
 * Loads DSL constraints from file system instead of hardcoded constants
 */

import * as fs from 'fs';
import * as path from 'path';
import { DebugLogger } from '../Utils/DebugLogger';

export class DynamicConstraintLoader {
  private constraintsDir: string;
  private constraintsCache: string | null = null;
  private lastLoadTime: number = 0;
  private cacheTimeout: number = 60000; // 1 minute cache
  private enabledCategories: Set<string>;

  constructor(constraintsDir?: string, categories?: string[]) {
    // Default to DSL/constraints directory
    this.constraintsDir = constraintsDir || path.join(__dirname, '../DSL/constraints');
    // Default enabled categories based on operation mode
    this.enabledCategories = new Set(categories || this.getDefaultCategories());
  }

  /**
   * Get default categories based on operation mode
   */
  private getDefaultCategories(): string[] {
    // MiCA Regulation Mode (uses mica_regulation_constraints.dsl)
    if (process.env.MICA_REGULATION_MODE === 'true') {
      return ['mica_regulation'];
    }
    if (process.env.PROTOCOL_VERIFICATION_MODE === 'true') {
      return ['protocol_invariants'];
    }
    // DSL parser upgraded with lambda expressions, let statements, and method calls
    // Note: hidden_behaviors requires execution context with 'edges' array and 'edge' object
    // Currently disabled until context is properly configured in Driver.ts
    return ['attack_detection'];  // TODO: Re-enable 'hidden_behaviors' after context setup
  }

  /**
   * Enable or disable constraint categories
   * @param categories - Array of category names to enable
   */
  public setEnabledCategories(categories: string[]): void {
    this.enabledCategories = new Set(categories);
    this.clearCache(); // Clear cache when categories change
  }

  /**
   * Add constraint categories to the enabled set
   * @param categories - Array of category names to add
   */
  public addCategories(categories: string[]): void {
    categories.forEach(cat => this.enabledCategories.add(cat));
    this.clearCache(); // Clear cache when categories change
  }

  /**
   * Remove constraint categories from the enabled set
   * @param categories - Array of category names to remove
   */
  public removeCategories(categories: string[]): void {
    categories.forEach(cat => this.enabledCategories.delete(cat));
    this.clearCache(); // Clear cache when categories change
  }

  /**
   * Get currently enabled categories
   */
  public getEnabledCategories(): string[] {
    return Array.from(this.enabledCategories);
  }

  /**
   * Load all constraints from DSL files
   * @param forceReload - Force reload even if cached
   * @returns Combined DSL rules string
   */
  public loadConstraints(forceReload: boolean = false): string {
    const now = Date.now();
    
    // Return cached constraints if still valid
    if (!forceReload && this.constraintsCache && (now - this.lastLoadTime) < this.cacheTimeout) {
      DebugLogger.core('🎯 [DynamicConstraintLoader] Using cached constraints');
      return this.constraintsCache;
    }

    try {
      // Look for constraint files
      const constraintFiles = this.findConstraintFiles();
      
      if (constraintFiles.length === 0) {
        throw new Error(`No constraint files found in ${this.constraintsDir}`);
      }

      DebugLogger.core(`📚 [DynamicConstraintLoader] Loading ${constraintFiles.length} constraint files`);
      
      // Load and combine all constraint files
      const allConstraints: string[] = [];
      
      for (const file of constraintFiles) {
        const content = this.loadConstraintFile(file);
        if (content) {
          allConstraints.push(content);
          DebugLogger.core(`  ✅ Loaded: ${path.basename(file)}`);
        }
      }

      // Combine all constraints
      this.constraintsCache = allConstraints.join('\n\n');
      this.lastLoadTime = now;
      
      // Count total constraints
      const constraintCount = (this.constraintsCache.match(/constraint\s+\w+\s*{/g) || []).length;
      DebugLogger.core(`📊 [DynamicConstraintLoader] Loaded ${constraintCount} total constraints`);
      
      return this.constraintsCache;
      
    } catch (error) {
      console.error('[DynamicConstraintLoader] Error loading constraints:', error);
      throw error; // Propagate error instead of using fallback
    }
  }

  /**
   * Find all DSL constraint files based on enabled categories and legacy modes
   */
  private findConstraintFiles(): string[] {
    const files: string[] = [];
    
    // Check if we're in MiCA regulation mode (only use mica_regulation_constraints.dsl)
    if (process.env.MICA_REGULATION_MODE === 'true') {
      const micaRegPath = path.join(__dirname, '../DSL/constraints/mica_regulation_constraints.dsl');
      if (fs.existsSync(micaRegPath)) {
        files.push(micaRegPath);
        DebugLogger.core('📜 [DynamicConstraintLoader] MiCA Regulation Mode: Using ONLY mica_regulation_constraints.dsl');
      }
      return files; // Return early, don't load any other DSL files
    }

    // If a specific DSL file is set, load only that file
    const dslFileEnv = process.env.DSL_FILE;
    if (dslFileEnv) {
      const resolvedPath = path.isAbsolute(dslFileEnv)
        ? dslFileEnv
        : path.resolve(process.cwd(), dslFileEnv);

      if (fs.existsSync(resolvedPath)) {
        files.push(resolvedPath);
        DebugLogger.core(`📜 [DynamicConstraintLoader] DSL_FILE set: Using ONLY ${resolvedPath}`);
        return files; // Return early, don't load any other DSL files
      }

      DebugLogger.core(`⚠️ [DynamicConstraintLoader] DSL_FILE not found: ${resolvedPath}, falling back to categories`);
    }

    // Check if we're in protocol verification mode (only use protocol_invariants.dsl)
    if (process.env.DSL_FILE === 'src/DSL/constraints/protocol_invariants.dsl' ||
        process.env.PROTOCOL_VERIFICATION_MODE === 'true') {
      // Only load protocol_invariants.dsl for protocol verification
      const protocolInvariantsPath = path.join(__dirname, '../DSL/constraints/protocol_invariants.dsl');
      if (fs.existsSync(protocolInvariantsPath)) {
        files.push(protocolInvariantsPath);
        DebugLogger.core('📜 [DynamicConstraintLoader] Protocol Verification Mode: Using ONLY protocol_invariants.dsl');
      }
      return files; // Return early, don't load any other DSL files
    }
    
    
    // Category-based loading system
    const categoryFileMap: { [key: string]: string[] } = {
      'attack_detection': ['attack_detection_constraints.dsl'],
      'regulatory_compliance': ['regulatory_compliance_constraints.dsl'],
      'mica_regulation': ['mica_regulation_constraints.dsl'], // Phase 2.8 MiCA regulation (dual-mode)
      'protocol_invariants': ['protocol_invariants.dsl'],
      'protocol_verification': ['protocol_invariants.dsl'], // In constraints dir
      'hidden_behaviors': ['hidden_behavior_constraints.dsl'],
      'defiranger_pma': ['experimental/defiranger_pma_constraints.dsl'], // DEFIRANGER scope annotations (not executable baseline; see paper §4.4 limitations)
      'default': ['default_constraints.dsl']
    };

    DebugLogger.core(`🎯 [DynamicConstraintLoader] Enabled categories: ${Array.from(this.enabledCategories).join(', ')}`);

    // Load files for each enabled category
    for (const category of this.enabledCategories) {
      const categoryFiles = categoryFileMap[category] || [];
      
      for (const filename of categoryFiles) {
        const filepath = filename.startsWith('../') 
          ? path.join(__dirname, '../DSL', filename.substring(3))
          : path.join(this.constraintsDir, filename);
          
        if (fs.existsSync(filepath)) {
          files.push(filepath);
          DebugLogger.core(`📚 [DynamicConstraintLoader] Category '${category}': Loaded ${path.basename(filename)}`);
        } else {
          DebugLogger.core(`⚠️ [DynamicConstraintLoader] Category '${category}': File not found - ${filename}`);
        }
      }
    }

    // Fallback for backward compatibility: If no files found and legacy mode detection
    if (files.length === 0) {
      DebugLogger.core('🔄 [DynamicConstraintLoader] No category files found, falling back to legacy mode');
      
      const legacyFiles = [
        'attack_detection_constraints.dsl',   // Attack detection constraints (priority)
        'default_constraints.dsl'             // Default production constraints (fallback)
      ];

      for (const filename of legacyFiles) {
        const filepath = path.join(this.constraintsDir, filename);
        if (fs.existsSync(filepath)) {
          files.push(filepath);
          DebugLogger.core(`🎯 [DynamicConstraintLoader] Legacy fallback: Using ${filename}`);
          break; // Use only the first found file in legacy mode
        }
      }
      
      // Final fallback: load all .dsl files from constraints directory
      if (files.length === 0 && fs.existsSync(this.constraintsDir)) {
        const allFiles = fs.readdirSync(this.constraintsDir);
        for (const file of allFiles) {
          if (file.endsWith('.dsl')) {
            files.push(path.join(this.constraintsDir, file));
          }
        }
      }
    }

    return files;
  }

  /**
   * Load a single constraint file
   */
  private loadConstraintFile(filepath: string): string {
    try {
      const content = fs.readFileSync(filepath, 'utf8');
      
      // Don't filter out lines - the DSL parser handles comments properly
      // Just ensure the file ends with a newline for proper concatenation
      const cleanedContent = content.trimEnd() + '\n';
      
      return cleanedContent;
      
    } catch (error) {
      console.error(`[DynamicConstraintLoader] Error loading ${filepath}:`, error);
      return '';
    }
  }


  /**
   * Clear the cache to force reload
   */
  public clearCache(): void {
    this.constraintsCache = null;
    this.lastLoadTime = 0;
    DebugLogger.core('🔄 [DynamicConstraintLoader] Cache cleared');
  }

  /**
   * Get current constraints directory
   */
  public getConstraintsDir(): string {
    return this.constraintsDir;
  }

  /**
   * Set new constraints directory
   */
  public setConstraintsDir(dir: string): void {
    this.constraintsDir = dir;
    this.clearCache();
  }
}
