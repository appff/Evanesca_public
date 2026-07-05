/**
 * Web3 Provider Manager
 * 
 * Manages multiple Web3 RPC providers with automatic failover,
 * load balancing, and health monitoring.
 */

import Web3 from 'web3';
import { DebugLogger } from '../DebugLogger';

export interface ProviderConfig {
  name: string;
  url: string;
  // Optional chain id for multi-chain setups. If set, failover can be scoped
  // to a specific chain to avoid accidentally using the wrong network endpoint.
  chainId?: number;
  priority: number; // Lower number = higher priority
  timeout?: number; // Request timeout in ms
  maxRetries?: number;
  healthCheckInterval?: number; // Health check interval in ms
}

export interface ProviderStats {
  name: string;
  url: string;
  isHealthy: boolean;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageResponseTime: number;
  lastError?: string;
  lastErrorTime?: Date;
  lastSuccessTime?: Date;
}

export class Web3ProviderManager {
  private providers: Map<string, Web3> = new Map();
  private providerConfigs: Map<string, ProviderConfig> = new Map();
  private providerStats: Map<string, ProviderStats> = new Map();
  private currentProvider: string | null = null;
  private healthCheckIntervals: Map<string, NodeJS.Timeout> = new Map();
  
  // Default configuration - optimized for batch processing
  private readonly DEFAULT_TIMEOUT = 5000; // 5 seconds for faster batch processing
  private readonly DEFAULT_MAX_RETRIES = 2; // Reduced retries for faster failover
  private readonly DEFAULT_HEALTH_CHECK_INTERVAL = 60000; // 1 minute
  
  constructor() {
    DebugLogger.core('🌐 [Web3Manager] Initializing Web3 Provider Manager');
  }

  private redactUrl(url: string): string {
    try {
      const u = new URL(url);
      // Common API-key-bearing shapes:
      // - Infura: /v3/<projectId>
      // - Alchemy: /v2/<apiKey>
      // - AllThatNode: /archive/evm/<apiKey>
      const redactedPath = u.pathname
        .replace(/\/v3\/[^/]+/g, "/v3/<redacted>")
        .replace(/\/v2\/[^/]+/g, "/v2/<redacted>")
        .replace(/\/archive\/evm\/[^/]+/g, "/archive/evm/<redacted>");
      return `${u.protocol}//${u.host}${redactedPath}`;
    } catch {
      return url
        .replace(/(\/v3\/)[^/]+/g, "$1<redacted>")
        .replace(/(\/v2\/)[^/]+/g, "$1<redacted>")
        .replace(/(\/archive\/evm\/)[^/]+/g, "$1<redacted>");
    }
  }

  /**
   * Add a Web3 provider to the manager
   */
  addProvider(config: ProviderConfig): void {
    try {
      const web3 = new Web3(config.url);
      
      // Apply timeout configuration if available
      if (config.timeout && web3.currentProvider && typeof web3.currentProvider === 'object') {
        (web3.currentProvider as any).timeout = config.timeout;
      }

      this.providers.set(config.name, web3);
      this.providerConfigs.set(config.name, {
        ...config,
        timeout: config.timeout || this.DEFAULT_TIMEOUT,
        maxRetries: config.maxRetries || this.DEFAULT_MAX_RETRIES,
        healthCheckInterval: config.healthCheckInterval || this.DEFAULT_HEALTH_CHECK_INTERVAL
      });

      // Initialize stats
      this.providerStats.set(config.name, {
        name: config.name,
        url: config.url,
        isHealthy: true,
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        averageResponseTime: 0
      });

      // Start health check
      this.startHealthCheck(config.name);

      DebugLogger.core(
        `✅ [Web3Manager] Added provider: ${config.name} (${this.redactUrl(config.url)})`,
      );
      
      // Set as current provider if it's the first one or has higher priority
      if (!this.currentProvider || config.priority < (this.providerConfigs.get(this.currentProvider)?.priority || Infinity)) {
        this.currentProvider = config.name;
        DebugLogger.core(`🎯 [Web3Manager] Set current provider: ${config.name}`);
      }
    } catch (error) {
      DebugLogger.error(`❌ [Web3Manager] Failed to add provider ${config.name}: ${error}`);
      throw error;
    }
  }

  /**
   * Get the current active Web3 instance
   */
  getWeb3(): Web3 {
    if (!this.currentProvider) {
      throw new Error('No Web3 provider available');
    }

    const web3 = this.providers.get(this.currentProvider);
    if (!web3) {
      throw new Error(`Current provider ${this.currentProvider} not found`);
    }

    return web3;
  }

  /**
   * Get a specific Web3 provider by name
   */
  getProviderByName(name: string): Web3 | null {
    const web3 = this.providers.get(name);
    const stats = this.providerStats.get(name);
    
    // Check if provider exists and is healthy
    if (web3 && stats?.isHealthy) {
      return web3;
    }
    
    return null;
  }

  /**
   * Execute a Web3 method with automatic failover
   */
  async executeWithFailover<T>(
    method: (web3: Web3) => Promise<T>,
    methodName: string = 'unknown',
    options?: { chainId?: number }
  ): Promise<T> {
    const sortedProviders = this.getSortedHealthyProviders(options?.chainId);
    
    if (sortedProviders.length === 0) {
      throw new Error('No healthy Web3 providers available');
    }

    let lastError: Error | null = null;

    for (const providerName of sortedProviders) {
      const web3 = this.providers.get(providerName);
      const config = this.providerConfigs.get(providerName);
      
      if (!web3 || !config) continue;

      const stats = this.providerStats.get(providerName)!;
      const startTime = Date.now();

      try {
        DebugLogger.core(`🔄 [Web3Manager] Executing ${methodName} via ${providerName}`);
        
        // Execute with timeout
        const result = await Promise.race([
          method(web3),
          new Promise<never>((_, reject) => 
            setTimeout(() => reject(new Error('Request timeout')), config.timeout)
          )
        ]);

        // Update stats on success
        const responseTime = Date.now() - startTime;
        this.updateStats(providerName, true, responseTime);
        
        // Update current provider if this one worked and has higher priority
        if (config.priority < (this.providerConfigs.get(this.currentProvider!)?.priority || Infinity)) {
          this.currentProvider = providerName;
        }

        DebugLogger.core(`✅ [Web3Manager] ${methodName} successful via ${providerName} (${responseTime}ms)`);
        return result;

      } catch (error) {
        const responseTime = Date.now() - startTime;
        lastError = error as Error;
        
        // Update stats on failure
        this.updateStats(providerName, false, responseTime, lastError.message);
        
        DebugLogger.core(`❌ [Web3Manager] ${methodName} failed via ${providerName}: ${lastError.message}`);
        
        // Mark provider as unhealthy if too many failures
        if (stats.failedRequests > config.maxRetries!) {
          stats.isHealthy = false;
          DebugLogger.core(`⚠️ [Web3Manager] Marking ${providerName} as unhealthy`);
        }
        
        continue; // Try next provider
      }
    }

    throw new Error(`All Web3 providers failed. Last error: ${lastError?.message}`);
  }

  /**
   * Get sorted list of healthy providers by priority
   */
  private getSortedHealthyProviders(chainId?: number): string[] {
    return Array.from(this.providerConfigs.entries())
      .filter(([name, cfg]) => {
        if (!this.providerStats.get(name)?.isHealthy) return false;
        if (chainId === undefined) return true;
        // If chainId is requested, only use providers explicitly tagged with it.
        return cfg.chainId === chainId;
      })
      .sort(([, a], [, b]) => a.priority - b.priority)
      .map(([name]) => name);
  }

  /**
   * Update provider statistics
   */
  private updateStats(
    providerName: string, 
    success: boolean, 
    responseTime: number, 
    error?: string
  ): void {
    const stats = this.providerStats.get(providerName);
    if (!stats) return;

    stats.totalRequests++;
    
    if (success) {
      stats.successfulRequests++;
      stats.lastSuccessTime = new Date();
      stats.lastError = undefined;
      stats.lastErrorTime = undefined;
    } else {
      stats.failedRequests++;
      stats.lastError = error;
      stats.lastErrorTime = new Date();
    }

    // Update average response time
    stats.averageResponseTime = 
      (stats.averageResponseTime * (stats.totalRequests - 1) + responseTime) / stats.totalRequests;
  }

  /**
   * Start periodic health check for a provider
   */
  private startHealthCheck(providerName: string): void {
    const config = this.providerConfigs.get(providerName);
    if (!config) return;

    const interval = setInterval(async () => {
      await this.performHealthCheck(providerName);
    }, config.healthCheckInterval!);

    this.healthCheckIntervals.set(providerName, interval);
  }

  /**
   * Perform health check on a provider
   */
  private async performHealthCheck(providerName: string): Promise<void> {
    const web3 = this.providers.get(providerName);
    const stats = this.providerStats.get(providerName);
    
    if (!web3 || !stats) return;

    try {
      await web3.eth.getBlockNumber();
      
      if (!stats.isHealthy) {
        stats.isHealthy = true;
        DebugLogger.core(`✅ [Web3Manager] Provider ${providerName} is now healthy`);
      }
      
      // Update stats but don't count health checks in regular stats
      stats.lastSuccessTime = new Date();
      
    } catch (error) {
      if (stats.isHealthy) {
        stats.isHealthy = false;
        stats.lastError = (error as Error).message;
        stats.lastErrorTime = new Date();
        DebugLogger.core(`❌ [Web3Manager] Provider ${providerName} health check failed: ${stats.lastError}`);
      }
    }
  }

  /**
   * Get provider statistics
   */
  getProviderStats(): ProviderStats[] {
    return Array.from(this.providerStats.values());
  }

  /**
   * Get current provider name
   */
  getCurrentProviderName(): string | null {
    return this.currentProvider;
  }

  /**
   * Force switch to a specific provider
   */
  switchToProvider(providerName: string): void {
    if (!this.providers.has(providerName)) {
      throw new Error(`Provider ${providerName} not found`);
    }
    
    const stats = this.providerStats.get(providerName);
    if (!stats?.isHealthy) {
      DebugLogger.core(`⚠️ [Web3Manager] Warning: Switching to unhealthy provider ${providerName}`);
    }

    this.currentProvider = providerName;
    DebugLogger.core(`🔄 [Web3Manager] Switched to provider: ${providerName}`);
  }

  /**
   * Remove a provider
   */
  removeProvider(providerName: string): void {
    // Clear health check interval
    const interval = this.healthCheckIntervals.get(providerName);
    if (interval) {
      clearInterval(interval);
      this.healthCheckIntervals.delete(providerName);
    }

    // Remove from all maps
    this.providers.delete(providerName);
    this.providerConfigs.delete(providerName);
    this.providerStats.delete(providerName);

    // Update current provider if needed
    if (this.currentProvider === providerName) {
      const healthyProviders = this.getSortedHealthyProviders();
      this.currentProvider = healthyProviders.length > 0 ? healthyProviders[0] : null;
    }

    DebugLogger.core(`🗑️ [Web3Manager] Removed provider: ${providerName}`);
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    // Clear all health check intervals
    for (const interval of this.healthCheckIntervals.values()) {
      clearInterval(interval);
    }
    
    this.healthCheckIntervals.clear();
    this.providers.clear();
    this.providerConfigs.clear();
    this.providerStats.clear();
    this.currentProvider = null;

    DebugLogger.core('🧹 [Web3Manager] Provider manager destroyed');
  }
}
