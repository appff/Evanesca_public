/**
 * Master Attack Registry by Year
 * 
 * Centralized registry of all DeFi attacks organized by year.
 * This provides a comprehensive overview of the evolution of DeFi attacks.
 */

import { ATTACKS_2020, TOTAL_LOSS_2020 } from './2020';
import { ATTACKS_2021, TOTAL_LOSS_2021 } from './2021';
import { ATTACKS_2022, TOTAL_LOSS_2022 } from './2022';
import { ATTACKS_2023, TOTAL_LOSS_2023 } from './2023';
import { ATTACKS_2024, TOTAL_LOSS_2024 } from './2024';

/**
 * Complete attack history organized by year
 */
export const ALL_ATTACKS_BY_YEAR = {
  2020: ATTACKS_2020,
  2021: ATTACKS_2021,
  2022: ATTACKS_2022,
  2023: ATTACKS_2023,
  2024: ATTACKS_2024
};

/**
 * Total losses by year (in USD)
 */
export const TOTAL_LOSSES_BY_YEAR = {
  2020: TOTAL_LOSS_2020,
  2021: TOTAL_LOSS_2021,
  2022: TOTAL_LOSS_2022,
  2023: TOTAL_LOSS_2023,
  2024: TOTAL_LOSS_2024
};

/**
 * Attack statistics
 */
export const ATTACK_STATISTICS = {
  totalAttacks: Object.values(ALL_ATTACKS_BY_YEAR).reduce((sum, attacks) => sum + attacks.length, 0),
  totalLoss: Object.values(TOTAL_LOSSES_BY_YEAR).reduce((sum, loss) => sum + loss, 0),
  
  byYear: {
    2020: { count: ATTACKS_2020.length, loss: TOTAL_LOSS_2020 },
    2021: { count: ATTACKS_2021.length, loss: TOTAL_LOSS_2021 },
    2022: { count: ATTACKS_2022.length, loss: TOTAL_LOSS_2022 },
    2023: { count: ATTACKS_2023.length, loss: TOTAL_LOSS_2023 },
    2024: { count: ATTACKS_2024.length, loss: TOTAL_LOSS_2024 }
  },
  
  peakYear: '2022', // Year with highest losses
  averageLossPerAttack: 0, // Will be calculated
  
  attackTypes: {
    flashLoan: 0,
    reentrancy: 0,
    oracleManipulation: 0,
    priceManipulation: 0,
    bridgeExploit: 0,
    governance: 0,
    other: 0
  },
  
  chains: {
    ethereum: 0,
    bsc: 0,
    arbitrum: 0,
    optimism: 0,
    avalanche: 0,
    moonriver: 0,
    multiple: 0
  }
};

// Calculate statistics
(() => {
  const allAttacks = Object.values(ALL_ATTACKS_BY_YEAR).flat();
  
  // Calculate average loss per attack
  ATTACK_STATISTICS.averageLossPerAttack = 
    ATTACK_STATISTICS.totalLoss / ATTACK_STATISTICS.totalAttacks;
  
  // Count attack types
  allAttacks.forEach(attack => {
    const type = attack.type.toLowerCase();
    if (type.includes('flash')) {
      ATTACK_STATISTICS.attackTypes.flashLoan++;
    } else if (type.includes('reentrancy')) {
      ATTACK_STATISTICS.attackTypes.reentrancy++;
    } else if (type.includes('oracle')) {
      ATTACK_STATISTICS.attackTypes.oracleManipulation++;
    } else if (type.includes('price')) {
      ATTACK_STATISTICS.attackTypes.priceManipulation++;
    } else if (type.includes('bridge')) {
      ATTACK_STATISTICS.attackTypes.bridgeExploit++;
    } else if (type.includes('governance')) {
      ATTACK_STATISTICS.attackTypes.governance++;
    } else {
      ATTACK_STATISTICS.attackTypes.other++;
    }
    
    // Count chains (only for attacks that have chain property)
    if ('chain' in attack) {
      const chain = attack.chain.toLowerCase();
      if (chain.includes('ethereum')) {
        ATTACK_STATISTICS.chains.ethereum++;
      } else if (chain.includes('bsc')) {
        ATTACK_STATISTICS.chains.bsc++;
      } else if (chain.includes('arbitrum')) {
        ATTACK_STATISTICS.chains.arbitrum++;
      } else if (chain.includes('optimism')) {
        ATTACK_STATISTICS.chains.optimism++;
      } else if (chain.includes('avalanche')) {
        ATTACK_STATISTICS.chains.avalanche++;
      } else if (chain.includes('moonriver')) {
        ATTACK_STATISTICS.chains.moonriver++;
      } else if (chain.includes('multiple')) {
        ATTACK_STATISTICS.chains.multiple++;
      }
    }
  });
})();

/**
 * Display formatted summary
 */
export function displayAttackSummary(): void {
  console.log('='.repeat(60));
  console.log('📊 DeFi ATTACK HISTORY SUMMARY (2020-2024)');
  console.log('='.repeat(60));
  
  console.log('\n📅 ATTACKS BY YEAR:');
  Object.entries(ATTACK_STATISTICS.byYear).forEach(([year, stats]) => {
    const loss = (stats.loss / 1_000_000).toFixed(1);
    console.log(`  ${year}: ${stats.count} attacks, $${loss}M loss`);
  });
  
  console.log('\n💰 FINANCIAL IMPACT:');
  console.log(`  Total Loss: $${(ATTACK_STATISTICS.totalLoss / 1_000_000).toFixed(1)}M`);
  console.log(`  Average Loss: $${(ATTACK_STATISTICS.averageLossPerAttack / 1_000_000).toFixed(1)}M per attack`);
  console.log(`  Peak Year: ${ATTACK_STATISTICS.peakYear} ($${(TOTAL_LOSS_2022 / 1_000_000).toFixed(1)}M)`);
  
  console.log('\n🎯 ATTACK TYPES:');
  Object.entries(ATTACK_STATISTICS.attackTypes).forEach(([type, count]) => {
    if (count > 0) {
      const percentage = ((count / ATTACK_STATISTICS.totalAttacks) * 100).toFixed(1);
      console.log(`  ${type}: ${count} (${percentage}%)`);
    }
  });
  
  console.log('\n🌐 AFFECTED CHAINS:');
  Object.entries(ATTACK_STATISTICS.chains).forEach(([chain, count]) => {
    if (count > 0) {
      const percentage = ((count / ATTACK_STATISTICS.totalAttacks) * 100).toFixed(1);
      console.log(`  ${chain}: ${count} (${percentage}%)`);
    }
  });
  
  console.log('\n' + '='.repeat(60));
}

/**
 * Get attacks for a specific year
 */
export function getAttacksByYear(year: number): any[] {
  return ALL_ATTACKS_BY_YEAR[year] || [];
}

/**
 * Get attacks by type across all years
 */
export function getAttacksByType(type: string): any[] {
  const allAttacks = Object.values(ALL_ATTACKS_BY_YEAR).flat();
  return allAttacks.filter(attack => 
    attack.type.toLowerCase().includes(type.toLowerCase())
  );
}

/**
 * Get attacks by chain across all years
 */
export function getAttacksByChain(chain: string): any[] {
  const allAttacks = Object.values(ALL_ATTACKS_BY_YEAR).flat();
  return allAttacks.filter(attack => 
    'chain' in attack && attack.chain.toLowerCase().includes(chain.toLowerCase())
  );
}