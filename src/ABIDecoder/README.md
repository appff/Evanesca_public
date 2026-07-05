# ABI Decoder System

## Overview
The ABI Decoder system automatically loads and manages ABI (Application Binary Interface) definitions for various DeFi protocols. The system uses a registry-based approach to eliminate manual updates when adding new protocols.

## Architecture

### Key Components
1. **abiRegistry.json** - Central registry mapping service names to ABI files
2. **defaultABIs.ts** - Dynamic loader that reads the registry and creates Coders
3. **abis/** - Directory containing individual ABI definition files
4. **LogDecoder.ts** - Uses the loaded Coders to decode blockchain event logs

## Adding a New Protocol

### Step 1: Create ABI File
Create a new TypeScript file in the `abis/` directory:

```typescript
// abis/NewProtocolABI.ts
export const ABINewProtocol = [
  // ABI definition array
];
```

### Step 2: Update Registry
Add an entry to `abiRegistry.json`:

```json
{
  "NewProtocol": {
    "file": "NewProtocolABI",
    "exports": ["ABINewProtocol"]
  }
}
```

### Step 3: Map Contract Addresses
Update the appropriate ABImap file:
- **Ethereum**: `jsons/ABImap.json`
- **BSC**: `jsons/BSCABImap.json`

Map contract addresses to the service name:
```json
{
  "0xcontractaddress": "NewProtocol"
}
```

### Step 4: Add to Semantic Model
Update `jsons/semanticModel.json` to include the protocol:

```json
{
  "Service": "NewProtocol",
  "ServiceType": "DEX",  // or "Lending", "Bridge", etc.
  "Address": ["0xcontractaddress"],
  "Events": ["Swap", "Transfer", ...]
}
```

## How It Works

1. **Automatic Loading**: When `defaultABIs.ts` is imported, it automatically:
   - Reads the `abiRegistry.json` file
   - Dynamically loads each ABI file using `require()`
   - Creates a `Coder` instance for each service
   - Populates the `ABIs` and `Coders` export objects

2. **Event Decoding**: When decoding events:
   - `LogDecoder` gets the contract address from the log
   - Looks up the service name in ABImap
   - Gets the corresponding Coder from the loaded Coders
   - Uses the Coder to decode the event data

## Benefits

✅ **No Manual Updates**: Just update the registry, no need to modify defaultABIs.ts  
✅ **Type Safety**: TypeScript ensures ABI definitions are properly typed  
✅ **Automatic Validation**: System warns about missing or invalid ABIs  
✅ **Backward Compatible**: Maintains compatibility with existing code  
✅ **Performance**: ABIs are loaded once at startup  

## Troubleshooting

### Common Issues

1. **"Coder not found for service"**
   - Ensure the service name in abiRegistry.json matches semanticModel.json
   - Check that the ABI file exports the correct constant name

2. **"Cannot find module './abis/...'"**
   - Verify the file name in abiRegistry.json matches the actual file
   - Ensure the ABI file exists in the abis/ directory

3. **Events not decoding**
   - Check that contract addresses are properly mapped in ABImap files
   - Verify the ABI contains the event definitions

## Statistics
Current system automatically loads **67 ABI coders** covering:
- DEX protocols (Uniswap, Sushiswap, Curve, etc.)
- Lending protocols (Compound, Aave, Cream, etc.)
- Bridge protocols (Allbridge, Qubit, Meter, etc.)
- Specialized protocols (Platypus, WooFi, Gamma, etc.)