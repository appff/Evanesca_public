/**
 * Structured Debug Logger - Enhanced logging system with metadata and formatting
 * 
 * Provides categorized, structured logging with metadata, timestamps, and integration
 * with the EvanescaError system for comprehensive debugging and monitoring.
 */

export enum DebugCategory {
  PATTERN = 'PATTERN',        // MultiStepPatternDetector 관련
  PROFIT = 'PROFIT',          // CumulativeProfitAnalyzer, VaultProfitAnalyzer 관련
  FLASHLOAN = 'FLASHLOAN',    // FlashLoanFeeAnalyzer, FlashLoanCycleAnalyzer 관련
  PRICE = 'PRICE',            // DynamicPriceTracker 관련
  GROUNDTRUTH = 'GROUNDTRUTH', // GroundTruthValidator 관련
  SOLVER = 'SOLVER',          // DSLConstraintSolver 관련
  CORE = 'CORE',              // 핵심 결과 메시지 (항상 출력)
  RESULT = 'RESULT',          // 최종 공격 탐지 결과만 (가장 간결)
  PERFORMANCE = 'PERFORMANCE', // 성능 관련 로깅
  CACHE = 'CACHE',            // 캐시 관련 로깅
  CONFIG = 'CONFIG',          // 설정 관련 로깅
}

export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO', 
  WARN = 'WARN',
  ERROR = 'ERROR'
}

export interface LogMetadata {
  component?: string;
  operation?: string;
  transactionHash?: string;
  blockNumber?: number;
  tokenSymbol?: string;
  contractAddress?: string;
  userId?: string;
  duration?: number;
  [key: string]: any;
}

export interface StructuredLogEntry {
  timestamp: string;
  level: LogLevel;
  category: DebugCategory;
  message: string;
  metadata?: LogMetadata;
}

export class DebugConfig {
  private enabledCategories: Set<DebugCategory>;
  private static instance: DebugConfig;

  private constructor() {
    this.enabledCategories = new Set();
    this.loadConfig();
  }

  public static getInstance(): DebugConfig {
    if (!DebugConfig.instance) {
      DebugConfig.instance = new DebugConfig();
    }
    return DebugConfig.instance;
  }

  // 환경 변수에서 설정 로드
  private loadConfig(): void {
    // DEBUG_EVANESCA=all 또는 DEBUG_EVANESCA=pattern,profit,flashloan 형태
    const debugEnv = process.env.DEBUG_EVANESCA?.toUpperCase();
    
    if (!debugEnv) {
      // 기본적으로 CORE 카테고리만 활성화 (핵심 결과)
      this.enabledCategories.add(DebugCategory.CORE);
      return;
    }

    // 항상 CORE는 활성화
    this.enabledCategories.add(DebugCategory.CORE);

    if (debugEnv === 'ALL') {
      // 모든 카테고리 활성화
      Object.values(DebugCategory).forEach(category => {
        this.enabledCategories.add(category);
      });
    } else {
      // 쉼표로 구분된 카테고리들 파싱
      const categories = debugEnv.split(',').map(cat => cat.trim());
      categories.forEach(category => {
        if (Object.values(DebugCategory).includes(category as DebugCategory)) {
          this.enabledCategories.add(category as DebugCategory);
        }
      });
    }
  }

  // 카테고리 활성화 여부 확인
  public isEnabled(category: DebugCategory): boolean {
    return this.enabledCategories.has(category);
  }

  // 런타임에 카테고리 토글
  public enable(category: DebugCategory): void {
    this.enabledCategories.add(category);
  }

  public disable(category: DebugCategory): void {
    if (category !== DebugCategory.CORE) { // CORE는 비활성화 불가
      this.enabledCategories.delete(category);
    }
  }

  // 현재 활성화된 카테고리들 반환
  public getEnabledCategories(): string[] {
    return Array.from(this.enabledCategories);
  }
}

export class DebugLogger {
  private static debugConfig = DebugConfig.getInstance();

  /**
   * Core structured logging method
   */
  private static logStructured(entry: StructuredLogEntry): void {
    // Large-scale evaluation can be extremely verbose; allow a global quiet mode.
    if (process.env.EVANESCA_QUIET === 'true' && entry.level !== LogLevel.ERROR) {
      return;
    }
    if (!this.debugConfig.isEnabled(entry.category) && entry.level !== LogLevel.ERROR) {
      return;
    }

    const formattedMessage = this.formatLogEntry(entry);
    
    switch (entry.level) {
      case LogLevel.ERROR:
        console.error(formattedMessage);
        break;
      case LogLevel.WARN:
        console.warn(formattedMessage);
        break;
      default:
        console.log(formattedMessage);
    }
  }

  /**
   * Format log entry with timestamp and metadata
   */
  private static formatLogEntry(entry: StructuredLogEntry): string {
    const timestamp = new Date().toISOString();
    let formatted = entry.message;

    // Add metadata if available
    if (entry.metadata && Object.keys(entry.metadata).length > 0) {
      const metadataStr = Object.entries(entry.metadata)
        .filter(([_, value]) => value !== undefined)
        .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
        .join(' ');
      
      if (metadataStr) {
        formatted += ` | ${metadataStr}`;
      }
    }

    return formatted;
  }

  /**
   * Enhanced logging with metadata support
   */
  public static log(category: DebugCategory, message: string, metadata?: LogMetadata): void {
    this.logStructured({
      timestamp: new Date().toISOString(),
      level: LogLevel.INFO,
      category,
      message,
      metadata
    });
  }

  /**
   * Debug level logging
   */
  public static debug(category: DebugCategory, message: string, metadata?: LogMetadata): void {
    this.logStructured({
      timestamp: new Date().toISOString(),
      level: LogLevel.DEBUG,
      category,
      message,
      metadata
    });
  }

  /**
   * Info level logging
   */
  public static info(category: DebugCategory, message: string, metadata?: LogMetadata): void {
    this.logStructured({
      timestamp: new Date().toISOString(),
      level: LogLevel.INFO,
      category,
      message,
      metadata
    });
  }

  /**
   * Warning level logging
   */
  public static warn(category: DebugCategory, message: string, metadata?: LogMetadata): void {
    this.logStructured({
      timestamp: new Date().toISOString(),
      level: LogLevel.WARN,
      category,
      message,
      metadata
    });
  }

  /**
   * Error level logging (always shown)
   */
  public static error(message: string, metadata?: LogMetadata): void {
    this.logStructured({
      timestamp: new Date().toISOString(),
      level: LogLevel.ERROR,
      category: DebugCategory.CORE,
      message,
      metadata
    });
  }

  /**
   * Performance logging helper
   */
  public static performance(message: string, duration?: number, metadata?: LogMetadata): void {
    const perfMetadata = { ...metadata };
    if (duration !== undefined) {
      perfMetadata.duration = duration;
    }
    
    this.log(DebugCategory.PERFORMANCE, message, perfMetadata);
  }

  // 여러 라인 로깅
  public static logMultiple(category: DebugCategory, messages: string[]): void {
    if (this.debugConfig.isEnabled(category)) {
      messages.forEach(message => console.log(message));
    }
  }

  // 조건부 로깅 (더 복잡한 로직용)
  public static logIf(category: DebugCategory, condition: boolean, message: string): void {
    if (this.debugConfig.isEnabled(category) && condition) {
      console.log(message);
    }
  }

  // Enhanced convenience methods with metadata support
  
  /**
   * Core results (always shown)
   */
  public static core(message: string, metadata?: LogMetadata): void {
    this.log(DebugCategory.CORE, message, metadata);
  }

  /**
   * Pattern detection logging
   */
  public static pattern(message: string, metadata?: LogMetadata): void {
    this.log(DebugCategory.PATTERN, message, metadata);
  }

  /**
   * Profit analysis logging
   */
  public static profit(message: string, metadata?: LogMetadata): void {
    this.log(DebugCategory.PROFIT, message, metadata);
  }

  /**
   * Flash loan analysis logging
   */
  public static flashloan(message: string, metadata?: LogMetadata): void {
    this.log(DebugCategory.FLASHLOAN, message, metadata);
  }

  /**
   * Price tracking logging
   */
  public static price(message: string, metadata?: LogMetadata): void {
    this.log(DebugCategory.PRICE, message, metadata);
  }

  /**
   * Ground truth validation logging
   */
  public static groundtruth(message: string, metadata?: LogMetadata): void {
    this.log(DebugCategory.GROUNDTRUTH, message, metadata);
  }

  /**
   * Constraint solver logging
   */
  public static solver(message: string, metadata?: LogMetadata): void {
    this.log(DebugCategory.SOLVER, message, metadata);
  }

  /**
   * Final results logging (most concise)
   */
  public static result(message: string, metadata?: LogMetadata): void {
    this.log(DebugCategory.RESULT, message, metadata);
  }

  /**
   * Cache operations logging
   */
  public static cache(message: string, metadata?: LogMetadata): void {
    this.log(DebugCategory.CACHE, message, metadata);
  }

  /**
   * Configuration logging
   */
  public static configLog(message: string, metadata?: LogMetadata): void {
    this.log(DebugCategory.CONFIG, message, metadata);
  }

  /**
   * Integration with EvanescaError system
   */
  public static logError(error: any, metadata?: LogMetadata): void {
    if (error && typeof error === 'object' && 'getDeveloperMessage' in error) {
      // This is an EvanescaError
      this.error(error.getDeveloperMessage(), {
        ...metadata,
        errorId: error.errorId,
        category: error.category,
        severity: error.severity
      });
    } else if (error instanceof Error) {
      // Standard Error
      this.error(error.message, {
        ...metadata,
        errorName: error.name,
        errorStack: error.stack
      });
    } else {
      // Unknown error type
      this.error(String(error), metadata);
    }
  }

  /**
   * Timed operation logging helper
   */
  public static timeOperation<T>(
    category: DebugCategory,
    operationName: string,
    operation: () => T,
    metadata?: LogMetadata
  ): T {
    const startTime = performance.now();
    this.debug(category, `⏱️ Starting ${operationName}`, metadata);
    
    try {
      const result = operation();
      const duration = performance.now() - startTime;
      this.performance(`✅ Completed ${operationName} in ${duration.toFixed(2)}ms`, duration, {
        ...metadata,
        operation: operationName
      });
      return result;
    } catch (error) {
      const duration = performance.now() - startTime;
      this.error(`❌ Failed ${operationName} after ${duration.toFixed(2)}ms`, {
        ...metadata,
        operation: operationName,
        duration,
        error: String(error)
      });
      throw error;
    }
  }

  /**
   * Async timed operation logging helper
   */
  public static async timeAsyncOperation<T>(
    category: DebugCategory,
    operationName: string,
    operation: () => Promise<T>,
    metadata?: LogMetadata
  ): Promise<T> {
    const startTime = performance.now();
    this.debug(category, `⏱️ Starting async ${operationName}`, metadata);
    
    try {
      const result = await operation();
      const duration = performance.now() - startTime;
      this.performance(`✅ Completed async ${operationName} in ${duration.toFixed(2)}ms`, duration, {
        ...metadata,
        operation: operationName
      });
      return result;
    } catch (error) {
      const duration = performance.now() - startTime;
      this.error(`❌ Failed async ${operationName} after ${duration.toFixed(2)}ms`, {
        ...metadata,
        operation: operationName,
        duration,
        error: String(error)
      });
      throw error;
    }
  }

  /**
   * Show current configuration
   */
  public static showConfig(): void {
    const enabledCategories = this.debugConfig.getEnabledCategories();
    this.configLog('🔧 [DebugLogger] Configuration', {
      enabledCategories,
      totalCategories: Object.keys(DebugCategory).length
    });
  }

  /**
   * Get structured log entry for external logging systems
   */
  public static createLogEntry(
    category: DebugCategory,
    level: LogLevel,
    message: string,
    metadata?: LogMetadata
  ): StructuredLogEntry {
    return {
      timestamp: new Date().toISOString(),
      level,
      category,
      message,
      metadata
    };
  }
}

/**
 * Usage Examples:
 * 
 * Environment Variables:
 * export DEBUG_EVANESCA=all                    # All debug messages
 * export DEBUG_EVANESCA=pattern,profit         # Pattern and profit analysis only
 * export DEBUG_EVANESCA=core                   # Core results only (default)
 * export DEBUG_EVANESCA=performance,cache      # Performance and cache logging
 * 
 * Basic Usage:
 * DebugLogger.pattern("🔍 [PatternDetector] Analyzing patterns...");
 * DebugLogger.profit("💰 [ProfitAnalyzer] Calculating profit...");
 * DebugLogger.core("🚨 [ATTACK] Attack detected!");
 * 
 * With Metadata:
 * DebugLogger.pattern("Pattern detected", {
 *   component: "MultiStepPatternDetector",
 *   transactionHash: "0x123...",
 *   confidence: 0.95
 * });
 * 
 * Performance Timing:
 * const result = DebugLogger.timeOperation(
 *   DebugCategory.SOLVER,
 *   "DSL Constraint Solving",
 *   () => solver.solve(data),
 *   { edgeCount: data.length }
 * );
 * 
 * Error Logging:
 * try {
 *   // some operation
 * } catch (error) {
 *   DebugLogger.logError(error, { component: "MyComponent" });
 * }
 */ 
