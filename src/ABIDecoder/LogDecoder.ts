import { DecodedLog, DecodedEvent, getServicefromMap, SemanticModel, sModels, compareAddrs } from '../SemanticFinancialGraph/SemanticFinancialGraphUtils';
import { Coders } from "./defaultABIs";
import { Event } from 'abi-coder';
import { EvanescaErrorFactory } from '../Utils/EvanescaError';

interface LogInput {
  logs: any[];
}

export function makeLogs({logs}: LogInput) {
  const dlogs: DecodedLog[] = new Array<DecodedLog>();
  
  // Debug: show first few addresses being processed
  if (process.env.DEBUG_DECODING === 'true' && logs.length > 0) {
    console.log(`  🔍 [LogDecoder] Processing ${logs.length} logs`);
    const uniqueAddresses = [...new Set(logs.map(l => l.address))];
    console.log(`  🔍 [LogDecoder] Unique addresses: ${uniqueAddresses.slice(0, 5).join(', ')}...`);
  }
  
  for (let log of logs) {
    try {
      let evt: Event = getCoder(log.address).decodeEvent(log.topics, log.data);
      dlogs.push({ name: evt.name, events: convertDecodedEvents(evt), address: log.address });
    } catch (e: any) { 
      // Log decoding errors for debugging (only in test/debug mode)
      if (process.env.DEBUG_DECODING === 'true') {
        console.log(`  ⚠️ [LogDecoder] Failed to decode log at ${log.address}: ${e.message}`);
      }
    }
  }
  return dlogs;
}

function getCoder(address: string) {
  const serviceIndex = getServicefromMap(address);
  
  if (serviceIndex === undefined) {
    throw EvanescaErrorFactory.configurationError(
      `Service not found for address: ${address}`,
      {
        component: 'LogDecoder',
        operation: 'getCoder',
        contractAddress: address
      },
      {
        description: "Add the contract address to the semantic model configuration",
        actionItems: [
          "Check if the contract address is correct",
          "Add the address to jsons/semanticModel.json",
          "Verify the protocol type and ABI mapping"
        ],
        documentationLink: "See CLAUDE.md for semantic model configuration"
      }
    );
  }
  
  const serviceModel = sModels[serviceIndex];
  
  if (!serviceModel) {
    throw EvanescaErrorFactory.configurationError(
      `Service model not found for index: ${serviceIndex}`,
      {
        component: 'LogDecoder',
        operation: 'getCoder',
        contractAddress: address,
        metadata: { serviceIndex }
      },
      {
        description: "Semantic model configuration is corrupted or incomplete",
        actionItems: [
          "Verify jsons/semanticModel.json is properly formatted",
          "Check that service index maps to a valid model",
          "Restore semantic model from backup if necessary"
        ]
      }
    );
  }
  
  const coder = Coders[serviceModel.Service as keyof typeof Coders];
  
  if (!coder) {
    throw EvanescaErrorFactory.configurationError(
      `Coder not found for service: ${serviceModel.Service}`,
      {
        component: 'LogDecoder',
        operation: 'getCoder',
        contractAddress: address,
        metadata: { 
          serviceIndex,
          serviceName: serviceModel.Service
        }
      },
      {
        description: "ABI coder is missing for the specified service type",
        actionItems: [
          "Verify the service name in the semantic model",
          "Check if the ABI coder exists in defaultABIs.ts",
          "Add the missing ABI definition if needed",
          "Ensure proper import and export of the coder"
        ],
        configExample: `// Add to ABIDecoder/defaultABIs.ts:\nexport const ${serviceModel.Service}ABI = [ /* ABI definition */ ];`
      }
    );
  }
  
  return coder;
}

function convertDecodedEvents(evt: Event): DecodedEvent[] {
  const dEvents: DecodedEvent[] = [];
  for (let key of Object.keys(evt.values)) {
    let v: unknown = evt.values[key];
    if (v && typeof v === 'object' && (v as any)["_isBigNumber"]) {
      dEvents.push({name: key, value: (v as any).toString(), type: "number"});
    } else {
      dEvents.push({name: key, value: String(v), type: "string"});
    }
  }
  return dEvents;
}
