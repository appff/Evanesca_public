import * as fs from 'fs';
import * as path from 'path';
import { CONFIG } from '../config/constants';

interface ABIMapEntry {
  key: string;
  value: JSON;
}

interface MappingIndex {
  chains: {
    ethereum: { files: string[] };
    bsc: { files: string[] };
  };
  services: { [service: string]: string };
  stats: {
    total_entries: number;
    ethereum_entries: number;
    bsc_entries: number;
  };
}

/**
 * Optimized ABI Helper with lazy loading and split file support
 * Reduces token usage by loading only necessary mapping files
 */
export class OptimizedABIHelper {
  ETHERSCAN_API_KEY: string;
  decoder: any;
  XMLHttpRequest: any;
  ABImap: Map<string, string> = new Map<string, string>();
  loadedFiles: Set<string> = new Set<string>();
  baseUrl: string;
  chainType: 'ethereum' | 'bsc';
  mappingsDir: string;
  index: MappingIndex | null = null;
  
  // Cache for service lookups
  private serviceCache: Map<string, string> = new Map<string, string>();
  
  constructor(isETH: boolean) {
    if (!isETH) {
      this.baseUrl = "https://api.bscscan.com";
      this.ETHERSCAN_API_KEY = CONFIG.API_KEYS.BSCSCAN;
      this.chainType = 'bsc';
    } else {
      this.baseUrl = "https://api.etherscan.com";
      this.ETHERSCAN_API_KEY = CONFIG.API_KEYS.ETHERSCAN;
      this.chainType = 'ethereum';
    }
    
    this.decoder = require('abi-decoder');
    this.XMLHttpRequest = require("xmlhttprequest").XMLHttpRequest;
    this.mappingsDir = path.join(__dirname, "../jsons/abi-mappings");
    
    // Load index for quick lookups
    this.loadIndex();
  }
  
  /**
   * Load the mapping index file
   */
  private loadIndex(): void {
    try {
      const indexPath = path.join(this.mappingsDir, 'index.json');
      if (fs.existsSync(indexPath)) {
        const indexData = fs.readFileSync(indexPath, 'utf-8');
        this.index = JSON.parse(indexData);
        console.log(`📁 [OptimizedABIHelper] Loaded index with ${this.index?.stats.total_entries} total entries`);
      }
    } catch (error) {
      console.warn('[OptimizedABIHelper] Could not load index, falling back to legacy mode');
      this.loadLegacyFile();
    }
  }
  
  /**
   * Load legacy ABImap file for backward compatibility
   */
  private loadLegacyFile(): void {
    try {
      const legacyPath = this.chainType === 'bsc' 
        ? path.join(__dirname, "../jsons/BSCABImap.json")
        : path.join(__dirname, "../jsons/ABImap.json");
        
      if (fs.existsSync(legacyPath)) {
        const data = fs.readFileSync(legacyPath, 'utf-8');
        const parsed = JSON.parse(data);
        
        if (Array.isArray(parsed)) {
          for (const [addr, service] of parsed as [string, string][]) {
            this.ABImap.set(addr.toLowerCase(), service);
          }
        } else {
          for (const [addr, service] of Object.entries(parsed)) {
            this.ABImap.set(addr.toLowerCase(), service as string);
          }
        }
        
        console.log(`📁 [OptimizedABIHelper] Loaded legacy file with ${this.ABImap.size} entries`);
      }
    } catch (error) {
      console.error('[OptimizedABIHelper] Error loading legacy file:', error);
    }
  }
  
  /**
   * Load a specific mapping file on demand
   */
  private loadMappingFile(filePath: string): void {
    const fullPath = path.join(this.mappingsDir, filePath);
    
    // Skip if already loaded
    if (this.loadedFiles.has(filePath)) {
      return;
    }
    
    try {
      if (fs.existsSync(fullPath)) {
        const data = fs.readFileSync(fullPath, 'utf-8');
        const mappings = JSON.parse(data);
        
        // Add to map (normalize addresses to lowercase)
        for (const [addr, service] of Object.entries(mappings)) {
          this.ABImap.set(addr.toLowerCase(), service as string);
        }
        
        this.loadedFiles.add(filePath);
        console.log(`💾 [OptimizedABIHelper] Loaded ${filePath} with ${Object.keys(mappings).length} entries`);
      }
    } catch (error) {
      console.error(`[OptimizedABIHelper] Error loading ${filePath}:`, error);
    }
  }
  
  /**
   * Get service name for a contract address
   * Uses lazy loading to load only necessary files
   */
  getService(addr: string): string | undefined {
    const normalizedAddr = addr.toLowerCase();
    
    // Check cache first
    if (this.serviceCache.has(normalizedAddr)) {
      return this.serviceCache.get(normalizedAddr);
    }
    
    // Check already loaded mappings
    if (this.ABImap.has(normalizedAddr)) {
      const service = this.ABImap.get(normalizedAddr);
      this.serviceCache.set(normalizedAddr, service!);
      return service;
    }
    
    // If index available, load relevant files
    if (this.index) {
      const files = this.index.chains[this.chainType].files;
      
      // Load files one by one until found
      for (const file of files) {
        this.loadMappingFile(file);
        
        if (this.ABImap.has(normalizedAddr)) {
          const service = this.ABImap.get(normalizedAddr);
          this.serviceCache.set(normalizedAddr, service!);
          return service;
        }
      }
    }
    
    return undefined;
  }
  
  /**
   * Check if an address has an ABI mapping
   */
  hasABI(addr: string): boolean {
    return this.getService(addr) !== undefined;
  }
  
  /**
   * Get ABI from Etherscan/BSCScan
   * Uses lazy loading for efficient memory usage
   */
  getABIfromEtherscan(addr: string): JSON | undefined | string {
    // Skip known problematic contract
    if (addr === "0x57f8160e1c59D16C01BbE181fD94db4E56b60495") return "";
    
    // Check if we have a service mapping
    const service = this.getService(addr);
    if (service) {
      // Service found in mappings
      return service as any;
    }
    
    // Fetch from Etherscan/BSCScan
    const url = this.baseUrl + `/api?module=contract&action=getabi&address=${addr}&apikey=${this.ETHERSCAN_API_KEY}`;
    console.log(`🔍 [OptimizedABIHelper] Fetching ABI from: ${url}`);
    
    const request = new this.XMLHttpRequest();
    request.open('GET', url, false);
    request.send(null);
    
    if (request.status === 200) {
      try {
        const response = JSON.parse(request.responseText).result;
        if (response.indexOf("Contract source code not verified") > -1) return undefined;
        
        const ABI = JSON.parse(response) as JSON;
        
        // Save to appropriate category file (for future use)
        this.saveNewMapping(addr, 'FETCHED_ABI');
        
        return ABI;
      } catch (e) {
        console.error(e);
        return undefined;
      }
    }
    return "http request error";
  }
  
  /**
   * Save a new mapping to the appropriate category file
   */
  private saveNewMapping(addr: string, service: string): void {
    // Add to in-memory map
    this.ABImap.set(addr.toLowerCase(), service);
    this.serviceCache.set(addr.toLowerCase(), service);
    
    // Determine category and save to file
    const category = this.determineCategory(service);
    const filePath = path.join(this.mappingsDir, this.chainType, `${category}.json`);
    
    try {
      let mappings: { [key: string]: string } = {};
      
      if (fs.existsSync(filePath)) {
        const data = fs.readFileSync(filePath, 'utf-8');
        mappings = JSON.parse(data);
      }
      
      mappings[addr.toLowerCase()] = service;
      
      fs.writeFileSync(filePath, JSON.stringify(mappings, null, 2));
      console.log(`💾 [OptimizedABIHelper] Saved new mapping to ${category}.json`);
    } catch (error) {
      console.error('[OptimizedABIHelper] Error saving mapping:', error);
    }
  }
  
  /**
   * Determine category for a service
   */
  private determineCategory(service: string): string {
    if (service.includes('ERC20') || service.includes('USDC') || service.includes('USDT')) {
      return 'tokens';
    }
    if (service.includes('Swap') || service.includes('DEX') || service.includes('Uni')) {
      return 'dex';
    }
    if (service.includes('Compound') || service.includes('Aave') || service.includes('Lending')) {
      return 'lending';
    }
    if (service.includes('Bridge')) {
      return 'bridges';
    }
    if (service.includes('Platypus') || service.includes('Woo') || service.includes('Gamma')) {
      return 'specialized';
    }
    return 'other';
  }
  
  /**
   * Get statistics about loaded mappings
   */
  getStats(): { loaded: number; cached: number; files: number } {
    return {
      loaded: this.ABImap.size,
      cached: this.serviceCache.size,
      files: this.loadedFiles.size
    };
  }
  
  /**
   * Preload specific categories for performance
   */
  preloadCategory(category: string): void {
    if (!this.index) return;
    
    const categoryFile = `${this.chainType}/${category}.json`;
    this.loadMappingFile(categoryFile);
  }
  
  /**
   * Clear cache to free memory
   */
  clearCache(): void {
    this.serviceCache.clear();
    console.log('🧹 [OptimizedABIHelper] Cache cleared');
  }
}