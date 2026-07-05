/**
 * Common constants for the Evanesca DeFi Attack Detection Framework
 * Centralized location for frequently used values to reduce redundancy
 */

import BigNumber from 'bignumber.js';

// Configure BigNumber for consistency
BigNumber.config({
  DECIMAL_PLACES: 40,
  ROUNDING_MODE: BigNumber.ROUND_DOWN,
  EXPONENTIAL_AT: [-40, 40]
});

// Common BigNumber constants
export const ZERO_BN = new BigNumber(0);
export const ONE_BN = new BigNumber(1);
export const TWO_BN = new BigNumber(2);
export const TEN_BN = new BigNumber(10);
export const HUNDRED_BN = new BigNumber(100);
export const THOUSAND_BN = new BigNumber(1000);
export const MILLION_BN = new BigNumber(1e6);
export const BILLION_BN = new BigNumber(1e9);

// Wei conversion constants
export const WEI_PER_ETH = new BigNumber(1e18);
export const GWEI_PER_ETH = new BigNumber(1e9);

// Percentage constants
export const PERCENT_100 = new BigNumber(100);
export const PERCENT_50 = new BigNumber(50);
export const PERCENT_10 = new BigNumber(10);
export const PERCENT_1 = new BigNumber(1);
export const PERCENT_0_1 = new BigNumber(0.1);
export const PERCENT_0_01 = new BigNumber(0.01);

// Common thresholds
export const DUST_THRESHOLD = new BigNumber(0.000001); // Minimum meaningful amount
export const PRICE_DEVIATION_THRESHOLD = new BigNumber(0.1); // 10% price deviation
export const SLIPPAGE_THRESHOLD = new BigNumber(0.03); // 3% slippage

// Time constants (in seconds)
export const SECONDS_PER_MINUTE = 60;
export const SECONDS_PER_HOUR = 3600;
export const SECONDS_PER_DAY = 86400;
export const SECONDS_PER_WEEK = 604800;
export const SECONDS_PER_YEAR = 31536000;

// Block time constants
export const ETH_BLOCK_TIME = 12; // seconds
export const BSC_BLOCK_TIME = 3; // seconds

// Gas constants
export const DEFAULT_GAS_LIMIT = 3000000;
export const DEFAULT_GAS_PRICE = '20'; // gwei

// Protocol-specific constants
export const UNISWAP_V2_FEE = new BigNumber(0.003); // 0.3%
export const UNISWAP_V3_FEE_LOW = new BigNumber(0.0005); // 0.05%
export const UNISWAP_V3_FEE_MEDIUM = new BigNumber(0.003); // 0.3%
export const UNISWAP_V3_FEE_HIGH = new BigNumber(0.01); // 1%

// Attack detection thresholds
export const MIN_FLASH_LOAN_AMOUNT = new BigNumber(1000); // Minimum amount to consider as flash loan
export const MAX_PRICE_IMPACT = new BigNumber(0.5); // 50% max price impact
export const MIN_PROFIT_RATIO = new BigNumber(0.01); // 1% minimum profit to flag as attack

// Export BigNumber for consistency
export { BigNumber };

// Helper functions for common operations
export const isZero = (value: BigNumber): boolean => value.isEqualTo(ZERO_BN);
export const isPositive = (value: BigNumber): boolean => value.isGreaterThan(ZERO_BN);
export const isNegative = (value: BigNumber): boolean => value.isLessThan(ZERO_BN);
export const max = (a: BigNumber, b: BigNumber): BigNumber => a.isGreaterThan(b) ? a : b;
export const min = (a: BigNumber, b: BigNumber): BigNumber => a.isLessThan(b) ? a : b;
export const abs = (value: BigNumber): BigNumber => value.abs();