/**
 * Shared test setup for individual attack tests
 * Ensures proper cleanup and test termination
 */

import { cleanupAfterTests } from './testUtils';

/**
 * Register cleanup hooks for individual test files
 * This ensures tests properly terminate after completion
 */
export function registerTestCleanup(): void {
  // Register after hook if we're in a test environment
  if (typeof after === 'function') {
    after(() => {
      console.log('✅ Test completed, cleaning up resources...');
      cleanupAfterTests();
    });
  }
}

/**
 * Alternative: Direct process exit for simpler tests
 * Use this when the test doesn't need complex cleanup
 */
export function forceTestExit(delay: number = 1000): void {
  setTimeout(() => {
    console.log('✅ Force exiting test process...');
    process.exit(0);
  }, delay);
}

// Auto-register cleanup when this module is imported
// This ensures all tests that import this module will have cleanup
registerTestCleanup();