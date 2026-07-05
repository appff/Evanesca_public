/**
 * Structured logging system for Evanesca
 * Replaces console.log with proper logging levels and formatting
 */

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  FATAL = 4,
  SILENT = 5
}

export interface LogContext {
  [key: string]: any;
}

export interface LogEntry {
  level: LogLevel;
  timestamp: string;
  message: string;
  context?: LogContext;
  error?: Error;
  category?: string;
}

export class Logger {
  private static instance: Logger;
  private level: LogLevel = LogLevel.INFO;
  private enableColors: boolean = true;
  private enableTimestamps: boolean = true;
  private logHistory: LogEntry[] = [];
  private maxHistorySize: number = 1000;
  private category: string = 'DEFAULT';

  private constructor() {
    // Set log level from environment
    const envLevel = process.env.LOG_LEVEL?.toUpperCase();
    if (envLevel && LogLevel[envLevel as keyof typeof LogLevel] !== undefined) {
      this.level = LogLevel[envLevel as keyof typeof LogLevel];
    }
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  /**
   * Create a logger with specific category
   */
  public static getLogger(category: string): Logger {
    const logger = Object.create(Logger.getInstance());
    logger.category = category;
    return logger;
  }

  /**
   * Set global log level
   */
  public setLevel(level: LogLevel): void {
    this.level = level;
  }

  /**
   * Get current log level
   */
  public getLevel(): LogLevel {
    return this.level;
  }

  /**
   * Core logging method
   */
  private log(level: LogLevel, message: string, context?: LogContext, error?: Error): void {
    if (level < this.level) {
      return;
    }

    const entry: LogEntry = {
      level,
      timestamp: new Date().toISOString(),
      message,
      context,
      error,
      category: this.category
    };

    // Store in history
    this.logHistory.push(entry);
    if (this.logHistory.length > this.maxHistorySize) {
      this.logHistory.shift();
    }

    // Format and output
    this.output(entry);
  }

  /**
   * Output formatted log entry
   */
  private output(entry: LogEntry): void {
    const levelName = LogLevel[entry.level];
    const color = this.getColor(entry.level);
    const reset = '\x1b[0m';
    
    let output = '';

    if (this.enableTimestamps) {
      output += `[${entry.timestamp}] `;
    }

    if (this.enableColors) {
      output += `${color}[${levelName}]${reset} `;
    } else {
      output += `[${levelName}] `;
    }

    if (entry.category !== 'DEFAULT') {
      output += `[${entry.category}] `;
    }

    output += entry.message;

    // Add context if present
    if (entry.context && Object.keys(entry.context).length > 0) {
      output += ' ' + JSON.stringify(entry.context, null, 2);
    }

    // Output based on level
    switch (entry.level) {
      case LogLevel.ERROR:
      case LogLevel.FATAL:
        console.error(output);
        if (entry.error) {
          console.error(entry.error.stack || entry.error);
        }
        break;
      case LogLevel.WARN:
        console.warn(output);
        break;
      default:
        console.log(output);
    }
  }

  /**
   * Get color for log level
   */
  private getColor(level: LogLevel): string {
    switch (level) {
      case LogLevel.DEBUG: return '\x1b[90m'; // Gray
      case LogLevel.INFO: return '\x1b[36m';  // Cyan
      case LogLevel.WARN: return '\x1b[33m';  // Yellow
      case LogLevel.ERROR: return '\x1b[31m'; // Red
      case LogLevel.FATAL: return '\x1b[35m'; // Magenta
      default: return '\x1b[0m';
    }
  }

  /**
   * Logging methods
   */
  public debug(message: string, context?: LogContext): void {
    this.log(LogLevel.DEBUG, message, context);
  }

  public info(message: string, context?: LogContext): void {
    this.log(LogLevel.INFO, message, context);
  }

  public warn(message: string, context?: LogContext): void {
    this.log(LogLevel.WARN, message, context);
  }

  public error(message: string, error?: Error | LogContext, context?: LogContext): void {
    if (error instanceof Error) {
      this.log(LogLevel.ERROR, message, context, error);
    } else {
      this.log(LogLevel.ERROR, message, error as LogContext);
    }
  }

  public fatal(message: string, error?: Error | LogContext, context?: LogContext): void {
    if (error instanceof Error) {
      this.log(LogLevel.FATAL, message, context, error);
    } else {
      this.log(LogLevel.FATAL, message, error as LogContext);
    }
  }

  /**
   * Performance logging
   */
  public time(label: string): void {
    console.time(label);
  }

  public timeEnd(label: string): void {
    console.timeEnd(label);
  }

  /**
   * Get log history
   */
  public getHistory(level?: LogLevel): LogEntry[] {
    if (level === undefined) {
      return [...this.logHistory];
    }
    return this.logHistory.filter(entry => entry.level >= level);
  }

  /**
   * Clear log history
   */
  public clearHistory(): void {
    this.logHistory = [];
  }

  /**
   * Export logs to file (for debugging)
   */
  public exportLogs(): string {
    return this.logHistory
      .map(entry => {
        const levelName = LogLevel[entry.level];
        let line = `[${entry.timestamp}] [${levelName}] [${entry.category}] ${entry.message}`;
        if (entry.context) {
          line += ' ' + JSON.stringify(entry.context);
        }
        if (entry.error) {
          line += '\n' + (entry.error.stack || entry.error.toString());
        }
        return line;
      })
      .join('\n');
  }
}

// Convenience exports
export const logger = Logger.getInstance();
export const getLogger = Logger.getLogger;

// Global convenience functions
export const debug = (message: string, context?: LogContext) => logger.debug(message, context);
export const info = (message: string, context?: LogContext) => logger.info(message, context);
export const warn = (message: string, context?: LogContext) => logger.warn(message, context);
export const error = (message: string, error?: Error | LogContext, context?: LogContext) => logger.error(message, error, context);
export const fatal = (message: string, error?: Error | LogContext, context?: LogContext) => logger.fatal(message, error, context);