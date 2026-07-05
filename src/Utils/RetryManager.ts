export interface RetryOptions {
  maxAttempts: number;
  baseDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
  jitter: boolean;
}

export class RetryManager {
  private options: RetryOptions;

  constructor(options: Partial<RetryOptions> = {}) {
    this.options = {
      maxAttempts: 3,
      baseDelay: 1000,
      maxDelay: 30000,
      backoffMultiplier: 2,
      jitter: true,
      ...options
    };
  }

  /**
   * Execute a function with exponential backoff retry logic
   */
  async execute<T>(
    fn: () => Promise<T>,
    context?: string
  ): Promise<T> {
    let lastError: Error;
    
    for (let attempt = 1; attempt <= this.options.maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;
        
        if (attempt === this.options.maxAttempts) {
          throw new Error(
            `Failed after ${this.options.maxAttempts} attempts${context ? ` (${context})` : ''}: ${lastError.message}`
          );
        }
        
        const delay = this.calculateDelay(attempt);
        console.warn(
          `Attempt ${attempt} failed${context ? ` (${context})` : ''}, retrying in ${delay}ms: ${lastError.message}`
        );
        
        await this.sleep(delay);
      }
    }
    
    throw lastError!;
  }

  /**
   * Calculate delay with exponential backoff and optional jitter
   */
  private calculateDelay(attempt: number): number {
    let delay = this.options.baseDelay * Math.pow(this.options.backoffMultiplier, attempt - 1);
    
    // Cap at max delay
    delay = Math.min(delay, this.options.maxDelay);
    
    // Add jitter to prevent thundering herd
    if (this.options.jitter) {
      const jitter = delay * 0.1 * Math.random();
      delay += jitter;
    }
    
    return Math.floor(delay);
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Create a retry manager with specific options
   */
  static create(options: Partial<RetryOptions> = {}): RetryManager {
    return new RetryManager(options);
  }

  /**
   * Predefined retry configurations
   */
  static readonly CONFIGURATIONS = {
    FAST: { maxAttempts: 2, baseDelay: 500, maxDelay: 2000 },
    STANDARD: { maxAttempts: 3, baseDelay: 1000, maxDelay: 10000 },
    AGGRESSIVE: { maxAttempts: 5, baseDelay: 2000, maxDelay: 60000 },
    CONSERVATIVE: { maxAttempts: 3, baseDelay: 2000, maxDelay: 30000 }
  };
} 