/**
 * Unified Error Handling System for Evanesca
 * 
 * Provides structured error handling with categorization, context, and debugging information.
 * Replaces generic Error usage across the codebase with contextual, actionable error types.
 */

export enum ErrorCategory {
  // Configuration and Setup Errors
  CONFIGURATION = 'CONFIGURATION',
  INITIALIZATION = 'INITIALIZATION',
  
  // Data Processing Errors  
  PARSING = 'PARSING',
  VALIDATION = 'VALIDATION',
  TRANSFORMATION = 'TRANSFORMATION',
  
  // External Service Errors
  NETWORK = 'NETWORK',
  BLOCKCHAIN = 'BLOCKCHAIN',
  API = 'API',
  
  // Business Logic Errors
  CONSTRAINT = 'CONSTRAINT',
  ANALYSIS = 'ANALYSIS',
  PATTERN_DETECTION = 'PATTERN_DETECTION',
  
  // System Errors
  MEMORY = 'MEMORY',
  PERFORMANCE = 'PERFORMANCE',
  INTERNAL = 'INTERNAL'
}

export enum ErrorSeverity {
  LOW = 'LOW',           // Non-critical, system can continue
  MEDIUM = 'MEDIUM',     // Important, may affect accuracy
  HIGH = 'HIGH',         // Critical, affects core functionality
  CRITICAL = 'CRITICAL'  // System-breaking, requires immediate attention
}

export interface ErrorContext {
  component?: string;      // Which component/module caused the error
  operation?: string;      // What operation was being performed
  transactionHash?: string; // Related transaction (if applicable)
  blockNumber?: number;    // Related block (if applicable)
  tokenSymbol?: string;    // Related token (if applicable)
  contractAddress?: string; // Related contract (if applicable)
  userId?: string;         // User/participant involved (if applicable)
  metadata?: Record<string, any>; // Additional context data
}

export interface ErrorSolution {
  description: string;     // What the user should do
  actionItems?: string[];  // Specific steps to resolve
  documentationLink?: string; // Link to relevant docs
  configExample?: string;  // Example configuration fix
}

export class EvanescaError extends Error {
  public readonly category: ErrorCategory;
  public readonly severity: ErrorSeverity;
  public readonly context: ErrorContext;
  public readonly solution?: ErrorSolution;
  public readonly timestamp: Date;
  public readonly errorId: string;
  public readonly cause?: Error;

  constructor(
    message: string,
    category: ErrorCategory,
    severity: ErrorSeverity = ErrorSeverity.MEDIUM,
    context: ErrorContext = {},
    solution?: ErrorSolution,
    cause?: Error
  ) {
    super(message);
    
    this.name = 'EvanescaError';
    this.category = category;
    this.severity = severity;
    this.context = context;
    this.solution = solution;
    this.timestamp = new Date();
    this.errorId = this.generateErrorId();
    
    // Preserve the original error if provided
    if (cause) {
      this.cause = cause;
      this.stack = cause.stack;
    }
    
    // Ensure proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, EvanescaError.prototype);
  }

  /**
   * Generate a unique error ID for tracking and debugging
   */
  private generateErrorId(): string {
    const timestamp = this.timestamp.getTime().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `EVA-${this.category}-${timestamp}-${random}`.toUpperCase();
  }

  /**
   * Get a structured representation of the error for logging
   */
  toStructuredLog(): Record<string, any> {
    return {
      errorId: this.errorId,
      message: this.message,
      category: this.category,
      severity: this.severity,
      timestamp: this.timestamp.toISOString(),
      context: this.context,
      solution: this.solution,
      stack: this.stack,
      cause: this.cause ? {
        message: this.cause.message,
        name: this.cause.name,
        stack: this.cause.stack
      } : undefined
    };
  }

  /**
   * Get a user-friendly error message with context
   */
  getUserMessage(): string {
    let message = `[${this.category}] ${this.message}`;
    
    if (this.context.component) {
      message += ` (Component: ${this.context.component})`;
    }
    
    if (this.context.operation) {
      message += ` (Operation: ${this.context.operation})`;
    }
    
    if (this.solution) {
      message += `\n💡 Solution: ${this.solution.description}`;
    }
    
    return message;
  }

  /**
   * Get developer-focused error message with debugging info
   */
  getDeveloperMessage(): string {
    let message = `🚨 ${this.errorId}: ${this.message}\n`;
    message += `📂 Category: ${this.category} | ⚠️ Severity: ${this.severity}\n`;
    message += `🕒 Timestamp: ${this.timestamp.toISOString()}\n`;
    
    if (Object.keys(this.context).length > 0) {
      message += `🔍 Context:\n`;
      for (const [key, value] of Object.entries(this.context)) {
        if (value !== undefined) {
          message += `   ${key}: ${JSON.stringify(value)}\n`;
        }
      }
    }
    
    if (this.solution) {
      message += `💡 Solution: ${this.solution.description}\n`;
      if (this.solution.actionItems) {
        message += `📋 Action Items:\n`;
        this.solution.actionItems.forEach((item, index) => {
          message += `   ${index + 1}. ${item}\n`;
        });
      }
    }
    
    return message;
  }
}

/**
 * Factory functions for common error types
 */
export class EvanescaErrorFactory {
  
  static configurationError(
    message: string, 
    context: ErrorContext = {},
    solution?: ErrorSolution
  ): EvanescaError {
    return new EvanescaError(
      message,
      ErrorCategory.CONFIGURATION,
      ErrorSeverity.HIGH,
      context,
      solution
    );
  }

  static parsingError(
    message: string,
    context: ErrorContext = {},
    cause?: Error
  ): EvanescaError {
    return new EvanescaError(
      message,
      ErrorCategory.PARSING,
      ErrorSeverity.MEDIUM,
      context,
      {
        description: "Check the input format and ensure all required fields are present",
        actionItems: [
          "Verify input data structure",
          "Check for missing or malformed fields",
          "Review the input specification"
        ]
      },
      cause
    );
  }

  static networkError(
    message: string,
    context: ErrorContext = {},
    cause?: Error
  ): EvanescaError {
    return new EvanescaError(
      message,
      ErrorCategory.NETWORK,
      ErrorSeverity.HIGH,
      context,
      {
        description: "Check network connectivity and service availability",
        actionItems: [
          "Verify internet connection",
          "Check if external services are operational",
          "Review API endpoints and credentials",
          "Consider implementing retry logic"
        ]
      },
      cause
    );
  }

  static analysisError(
    message: string,
    context: ErrorContext = {},
    cause?: Error
  ): EvanescaError {
    return new EvanescaError(
      message,
      ErrorCategory.ANALYSIS,
      ErrorSeverity.MEDIUM,
      context,
      {
        description: "Review the transaction data and analysis parameters",
        actionItems: [
          "Verify transaction hash is valid",
          "Check if all required data is available",
          "Review constraint definitions",
          "Ensure proper token configuration"
        ]
      },
      cause
    );
  }

  static constraintError(
    message: string,
    context: ErrorContext = {},
    cause?: Error
  ): EvanescaError {
    return new EvanescaError(
      message,
      ErrorCategory.CONSTRAINT,
      ErrorSeverity.MEDIUM,
      context,
      {
        description: "Check constraint syntax and execution context",
        actionItems: [
          "Verify DSL constraint syntax",
          "Check variable availability in context",
          "Review constraint logic",
          "Ensure proper data types"
        ]
      },
      cause
    );
  }

  static memoryError(
    message: string,
    context: ErrorContext = {}
  ): EvanescaError {
    return new EvanescaError(
      message,
      ErrorCategory.MEMORY,
      ErrorSeverity.HIGH,
      context,
      {
        description: "Optimize memory usage and implement cleanup",
        actionItems: [
          "Clear unused caches",
          "Implement memory pressure handling",
          "Reduce batch sizes",
          "Add garbage collection triggers"
        ]
      }
    );
  }

  static internalError(
    message: string,
    context: ErrorContext = {},
    cause?: Error
  ): EvanescaError {
    return new EvanescaError(
      message,
      ErrorCategory.INTERNAL,
      ErrorSeverity.CRITICAL,
      context,
      {
        description: "This appears to be an internal system error",
        actionItems: [
          "Report this issue to the development team",
          "Include the full error context and stack trace",
          "Check system logs for additional information",
          "Consider restarting the analysis process"
        ]
      },
      cause
    );
  }
}

/**
 * Error handler utility for consistent error processing
 */
export class ErrorHandler {
  
  /**
   * Handle an error with appropriate logging and optional recovery
   */
  static handle(error: Error | EvanescaError, context?: ErrorContext): EvanescaError {
    let evanescaError: EvanescaError;
    
    if (error instanceof EvanescaError) {
      // If additional context provided, create new error with merged context
      if (context) {
        const mergedContext = { ...error.context, ...context };
        evanescaError = new EvanescaError(
          error.message,
          error.category,
          error.severity,
          mergedContext,
          error.solution,
          error.cause
        );
      } else {
        evanescaError = error;
      }
    } else {
      // Convert generic Error to EvanescaError
      evanescaError = EvanescaErrorFactory.internalError(
        error.message || 'Unknown error occurred',
        context || {},
        error
      );
    }
    
    // Log the error using structured logging
    const { DebugLogger } = require('./DebugLogger');
    DebugLogger.error(evanescaError.getDeveloperMessage());
    
    return evanescaError;
  }

  /**
   * Wrap async operations with error handling
   */
  static async withErrorHandling<T>(
    operation: () => Promise<T>,
    context: ErrorContext,
    errorMessage: string = 'Operation failed'
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      throw ErrorHandler.handle(error as Error, {
        ...context,
        operation: context.operation || 'async_operation'
      });
    }
  }

  /**
   * Wrap sync operations with error handling
   */
  static withSyncErrorHandling<T>(
    operation: () => T,
    context: ErrorContext,
    errorMessage: string = 'Operation failed'
  ): T {
    try {
      return operation();
    } catch (error) {
      throw ErrorHandler.handle(error as Error, {
        ...context,
        operation: context.operation || 'sync_operation'
      });
    }
  }
}