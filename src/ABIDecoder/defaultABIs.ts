import { Coder } from 'abi-coder';
const abiRegistry = require('./abiRegistry.json');

// Type definitions
type ABIRegistry = {
  [service: string]: {
    file: string;
    exports: string[];
  };
};

// Export objects that will be populated dynamically
export const ABIs: Record<string, any> = {};
export const Coders: Record<string, Coder> = {};

// Individual ABI exports for backward compatibility
// These will be populated during initialization
export let ABIERC20: any;
export let ABIERC20Derivative: any;
export let ABICompound: any;
export let ABIHarvestPool: any;
export let ABIUniPair: any;
export let ABICurvePool: any;
export let ABIUniPool: any;
export let ABIUniV3Pool: any;
export let ABIUniV3Router: any;
export let ABIAkropolis: any;
export let ABICreamFi: any;
export let ABIKyber: any;
export let ABISynthetix: any;
export let ABIProxy: any;
export let ABIbZx: any;
export let ABIdYdX: any;
export let ABIRikkeiFinance: any;

// Initialization flag
let isInitialized = false;

/**
 * Initialize ABIs and Coders from the registry
 * This function must be called before using any ABIs or Coders
 */
export async function initializeABIs(): Promise<void> {
  if (isInitialized) {
    return;
  }

  const registry = abiRegistry as ABIRegistry;
  
  for (const [service, config] of Object.entries(registry)) {
    try {
      // Dynamic import of ABI module
      const module = await import(`./abis/${config.file}`);
      
      // Get the main export (first one in the list)
      const mainExport = config.exports[0];
      const abi = module[mainExport];
      
      if (!abi) {
        console.warn(`Warning: ABI export ${mainExport} not found in ${config.file}`);
        continue;
      }
      
      // Add to ABIs object
      ABIs[service] = abi;
      
      // Create and add Coder
      Coders[service] = new Coder(abi);
      
      // Set individual exports for backward compatibility
      if (mainExport === 'ABIERC20') ABIERC20 = abi;
      if (mainExport === 'ABIERC20Derivative') ABIERC20Derivative = abi;
      if (mainExport === 'ABICompound') ABICompound = abi;
      if (mainExport === 'ABIHarvestPool') ABIHarvestPool = abi;
      if (mainExport === 'ABIUniPair') ABIUniPair = abi;
      if (mainExport === 'ABICurvePool') ABICurvePool = abi;
      if (mainExport === 'ABIUniPool') ABIUniPool = abi;
      if (mainExport === 'ABIUniV3Pool') ABIUniV3Pool = abi;
      if (mainExport === 'ABIUniV3Router') ABIUniV3Router = abi;
      if (mainExport === 'ABIAkropolis') ABIAkropolis = abi;
      if (mainExport === 'ABICreamFi') ABICreamFi = abi;
      if (mainExport === 'ABIKyber') ABIKyber = abi;
      if (mainExport === 'ABISynthetix') ABISynthetix = abi;
      if (mainExport === 'ABIbZx') ABIbZx = abi;
      if (mainExport === 'ABIdYdX') ABIdYdX = abi;
      if (mainExport === 'ABIRikkeiFinance') ABIRikkeiFinance = abi;
      
    } catch (error) {
      console.error(`Failed to load ABI for ${service}:`, error);
    }
  }
  
  isInitialized = true;
  console.log(`✅ Loaded ${Object.keys(Coders).length} ABI coders automatically from registry`);
}

/**
 * Synchronous initialization using require for backward compatibility
 * This is called automatically when the module is imported
 */
function initializeABIsSync(): void {
  if (isInitialized) {
    return;
  }

  const registry = abiRegistry as ABIRegistry;
  
  for (const [service, config] of Object.entries(registry)) {
    // Skip invalid entries
    if (!config || !config.file || !config.exports) {
      console.warn(`Skipping invalid registry entry for service: ${service}`);
      continue;
    }
    
    try {
      // Skip files that don't exist
      if (['KyberABI', 'SynthetixABI', 'ChainlinkABI'].includes(config.file.replace('.ts', ''))) {
        console.log(`Skipping removed ABI file: ${config.file}`);
        continue;
      }
      
      // Use require for synchronous loading
      const module = require(`./abis/${config.file}`);
      
      // Get the main export (first one in the list)
      const mainExport = config.exports[0];
      const abi = module[mainExport];
      
      if (!abi) {
        console.warn(`Warning: ABI export ${mainExport} not found in ${config.file}`);
        continue;
      }
      
      // Add to ABIs object
      ABIs[service] = abi;
      
      // Create and add Coder
      Coders[service] = new Coder(abi);
      
      // Set individual exports for backward compatibility
      if (mainExport === 'ABIERC20') ABIERC20 = abi;
      if (mainExport === 'ABIERC20Derivative') ABIERC20Derivative = abi;
      if (mainExport === 'ABICompound') ABICompound = abi;
      if (mainExport === 'ABIHarvestPool') ABIHarvestPool = abi;
      if (mainExport === 'ABIUniPair') ABIUniPair = abi;
      if (mainExport === 'ABICurvePool') ABICurvePool = abi;
      if (mainExport === 'ABIUniPool') ABIUniPool = abi;
      if (mainExport === 'ABIUniV3Pool') ABIUniV3Pool = abi;
      if (mainExport === 'ABIUniV3Router') ABIUniV3Router = abi;
      if (mainExport === 'ABIAkropolis') ABIAkropolis = abi;
      if (mainExport === 'ABICreamFi') ABICreamFi = abi;
      if (mainExport === 'ABIKyber') ABIKyber = abi;
      if (mainExport === 'ABISynthetix') ABISynthetix = abi;
      if (mainExport === 'ABIbZx') ABIbZx = abi;
      if (mainExport === 'ABIdYdX') ABIdYdX = abi;
      if (mainExport === 'ABIRikkeiFinance') ABIRikkeiFinance = abi;
      
    } catch (error) {
      console.error(`Failed to load ABI for ${service}:`, error);
    }
  }
  
  isInitialized = true;
  console.log(`✅ Loaded ${Object.keys(Coders).length} ABI coders automatically from registry`);
}

// Auto-initialize on module load for backward compatibility
initializeABIsSync();

/**
 * Add a new ABI dynamically at runtime
 * @param service Service name
 * @param abi ABI definition
 */
export function addABI(service: string, abi: any): void {
  ABIs[service] = abi;
  Coders[service] = new Coder(abi);
}

/**
 * Get a Coder for a specific service
 * @param service Service name
 * @returns Coder instance or undefined
 */
export function getCoder(service: string): Coder | undefined {
  return Coders[service];
}

/**
 * Check if a service has an ABI loaded
 * @param service Service name
 * @returns true if ABI is loaded
 */
export function hasABI(service: string): boolean {
  return service in Coders;
}

/**
 * Get list of all loaded services
 * @returns Array of service names
 */
export function getLoadedServices(): string[] {
  return Object.keys(Coders);
}