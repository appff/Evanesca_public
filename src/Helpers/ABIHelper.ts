import * as fs from 'fs';
import * as path from 'path';
import { CONFIG } from '../config/constants';

interface ABIMapEntry {
  key: string;
  value: JSON;
}

export class ABIHelper {
  ETHERSCAN_API_KEY: string;
  decoder: any;
  XMLHttpRequest: any;
  ABImap: Map<string, JSON> = new Map<string, JSON>();
  fABIPath: string;
  baseUrl: string;

  constructor(isETH: boolean) {
    if (!isETH) {
      this.baseUrl = "https://api.bscscan.com";
      this.ETHERSCAN_API_KEY = CONFIG.API_KEYS.BSCSCAN;
      this.fABIPath = path.join(__dirname, "../jsons/BSCABImap.json");
    }
    else {
      this.baseUrl = "https://api.etherscan.com";
      this.ETHERSCAN_API_KEY = CONFIG.API_KEYS.ETHERSCAN;
      this.fABIPath = path.join(__dirname, "../jsons/ABImap.json");
    }
    this.decoder = require('abi-decoder');
    this.XMLHttpRequest = require("xmlhttprequest").XMLHttpRequest;
    this.loadABImap();
  }

  async loadABImap() {
    const data = fs.readFileSync(this.fABIPath, 'utf-8');
    if (data === "") {
      this.ABImap = new Map<string, JSON>();
    } else {
      const parsed = JSON.parse(data);
      // Handle both object format and array format
      if (Array.isArray(parsed)) {
        this.ABImap = new Map();
        // Add both original case and lowercase keys for BSC compatibility
        for (const [addr, abi] of parsed as [string, JSON][]) {
          this.ABImap.set(addr, abi);
          // Also add lowercase version if different
          const lowerAddr = addr.toLowerCase();
          if (lowerAddr !== addr) {
            this.ABImap.set(lowerAddr, abi);
          }
        }
      } else {
        // Convert object format to Map entries
        this.ABImap = new Map(Object.entries(parsed) as [string, JSON][]);
      }
    }
  }

  async saveABImap() {
    const serialized = JSON.stringify(Array.from(this.ABImap.entries()));
    fs.writeFile(this.fABIPath, serialized, (err) => {
      if (err) { console.error(err); return; }
    });
  }

  hasABI(addr: string): boolean {
    // Check both original case and lowercase for BSC compatibility
    return this.ABImap.has(addr) || this.ABImap.has(addr.toLowerCase());
  }

  getABIfromEtherscan(addr: string): JSON | undefined | string {
    // [IMPORTANT] i don't know why this countract occur an error. (skip this)
    if (addr === "0x57f8160e1c59D16C01BbE181fD94db4E56b60495") return "";
    
    // Check both original case and lowercase for BSC compatibility
    if (this.ABImap.has(addr)) return this.ABImap.get(addr);
    const lowerAddr = addr.toLowerCase();
    if (this.ABImap.has(lowerAddr)) return this.ABImap.get(lowerAddr);
    
    const url = this.baseUrl + `/api?module=contract&action=getabi&address=${addr}&apikey=${this.ETHERSCAN_API_KEY}`;
    console.log(`getABIfromEtherscan: ${url}`);
    const request = new this.XMLHttpRequest();
    request.open('GET', url, false);  // `false` makes the request synchronous
    request.send(null);

    if (request.status === 200) {
      try {
        const response = JSON.parse(request.responseText).result;
        if (response.indexOf("Contract source code not verified") > -1) return undefined;
        const ABI = JSON.parse(response) as JSON;
        this.ABImap.set(addr, ABI);
        this.saveABImap();
        return ABI;
      } catch (e) {
        console.error(e);
        return undefined;
      }
    }
    return "http request error";
  }
}
