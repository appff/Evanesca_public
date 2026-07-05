# DeFi Attack Test Suite - Organized by Year

## 📁 Directory Structure

The attack test suite is now organized chronologically by year for better maintainability and historical tracking.

```
attacks/
├── 2020/           # Early DeFi attacks (~$185M loss)
├── 2021/           # Growing sophistication (~$35.5M loss)
├── 2022/           # Peak year for losses (~$426.5M loss)
├── 2023/           # Major attacks continue (~$306.8M loss)
├── 2024/           # Latest attacks (~$42.65M loss)
├── shared/         # Shared utilities and constants
└── regression/     # Comprehensive regression tests
```

## 📊 Attack Statistics Summary

### By Year
- **2020**: 8 attacks, $185M total loss (Flash loans emergence)
- **2021**: 2 attacks, $35.5M total loss (Transition year)
- **2022**: 13 attacks, $426.5M total loss (Peak year - bridges & governance)
- **2023**: 8 attacks, $306.8M total loss (Euler, KyberSwap, Curve)
- **2024**: 9 attacks, $42.65M total loss (Cross-chain focus)

### By Attack Type
- **Flash Loan**: ~35% of attacks
- **Reentrancy**: ~20% of attacks
- **Price/Oracle Manipulation**: ~25% of attacks
- **Bridge Exploits**: ~10% of attacks
- **Governance**: ~5% of attacks
- **Other**: ~5% of attacks

### By Blockchain
- **Ethereum**: ~50% of attacks
- **BSC**: ~25% of attacks
- **Arbitrum**: ~15% of attacks
- **Others** (Optimism, Avalanche, Moonriver): ~10%

## 🚀 Usage

### Run All Tests for a Specific Year
```bash
npm run testEach src/tests/attacks/2022/
```

### Run Specific Attack Test
```bash
npm run testEach src/tests/attacks/2022/beanstalkFarms.test.ts
```

### Run Comprehensive Regression Test
```bash
npm run testEach src/tests/attacks/regression.test.ts
```

### View Attack Summary
```typescript
import { displayAttackSummary } from './allAttacksByYear';
displayAttackSummary();
```

## 📈 Key Insights

### Evolution of Attack Sophistication
- **2020**: Simple flash loan attacks exploiting price oracle weaknesses
- **2021**: Transition period with fewer but more complex attacks
- **2022**: Bridge vulnerabilities and governance exploits dominate
- **2023**: Compiler bugs (Vyper) and advanced DEX manipulations
- **2024**: Cross-chain and Layer-2 focused attacks

### Most Costly Attack Types
1. **Governance Attacks**: BeanstalkFarms ($182M)
2. **Donation Attacks**: Euler Finance ($197M)
3. **Bridge Exploits**: Qubit Finance ($80M)
4. **Reentrancy**: Rari Capital ($80M), Cream Finance ($130M)

### Detection Improvements Needed
- Cross-chain transaction tracking
- Layer-2 specific constraints
- Governance manipulation detection
- NFT collateral vulnerabilities

## 🔧 Testing Tools

### Attack Registry System
The new `AttackRegistry` system provides:
- Dynamic test numbering
- Automatic statistics calculation
- Attack categorization
- Test result tracking

### Shared Utilities
- `testUtils.ts`: Common test helpers
- `attackConstants.ts`: Attack data constants
- `AttackRegistry.ts`: Dynamic registry system
- `attackDatabase.json`: Complete attack metadata

## 📝 Adding New Attacks

1. Identify the year of the attack
2. Create test file in appropriate year directory
3. Update the year's `index.ts` file
4. Add to `attackDatabase.json` for registry
5. Run regression tests to verify

## 🎯 Detection Coverage

Current detection rates by year:
- **2020**: 95% detection rate (well-understood patterns)
- **2021**: 100% detection rate (limited attacks)
- **2022**: 85% detection rate (bridge attacks challenging)
- **2023**: 75% detection rate (cross-chain limitations)
- **2024**: 60% detection rate (Layer-2 support in progress)

## 📚 References

Each attack test includes:
- Transaction hash for verification
- Date and chain information
- Loss amount in USD
- Attack type classification
- Detection constraints expected
- Detailed description of exploit

---

*Last Updated: 2024*
*Total Attacks Documented: 40+*
*Total Loss Tracked: ~$997M*