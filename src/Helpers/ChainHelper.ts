import { HttpProvider } from 'web3-core';
import { Contract } from "web3-eth-contract";

function trim(str: string) {
  return str.replace(/\s/g, "");
}

async function getETH(addr: string): Promise<string> {
  return await this.web3.eth.getBalance(addr);
}

async function getERC20Balance(cont: Contract, addr: string) {
  return await cont.methods.balanceOf(addr).call();
}

async function getERC20Symbol(cont: Contract) {
  return await cont.methods.symbol().call();
}

async function getERC20Decimal(cont: Contract) {
  return await cont.methods.decimals().call();
}

function refineBal(bal: number) {
  return bal < 0 ? 0 : bal;
}

async function compile(contPath: string): Promise<[string, string]> {
  try {
    const source = this.fs.readFileSync(contPath, 'utf8');
    const filename = contPath.replace(/^.*[\\\/]/, '');
    const input = {
      language: 'Solidity',
      sources: { [filename]: { content: source, }, },
      settings: { outputSelection: { '*': { '*': ['*'], }, }, },
    };
    
    // Validate input before passing to solc
    if (!source || typeof source !== 'string') {
      throw new Error('Invalid source code');
    }
    
    if (!filename || typeof filename !== 'string') {
      throw new Error('Invalid filename');
    }
    
    // Lazy load solc
    const solc = this.getSolc ? this.getSolc() : require('solc');
    if (!solc || typeof solc.compile !== 'function') {
      throw new Error('Solc compiler not available');
    }
    
    const inputString = JSON.stringify(input);
    if (!inputString) {
      throw new Error('Failed to stringify input');
    }
    
    const tempFile = JSON.parse(solc.compile(inputString));
    
    // Validate compilation result
    if (!tempFile || !tempFile.contracts || !tempFile.contracts[filename]) {
      throw new Error('Compilation failed: no contracts found');
    }
    
    const compiledContract = tempFile.contracts[filename]['Test'];
    if (!compiledContract) {
      throw new Error('Compilation failed: Test contract not found');
    }
    
    const bytecode = compiledContract.evm?.bytecode?.object;
    const abi = compiledContract.abi;
    
    if (!bytecode || !abi) {
      throw new Error('Compilation failed: missing bytecode or ABI');
    }
    
    return [abi, bytecode];
  } catch (error) {
    console.error('Compilation error:', error);
    throw new Error(`Compilation failed: ${error.message}`);
  }
}

async function deploy(ABI: any[] | any, Bytecode: string) {
  let accounts = await this.web3.eth.getAccounts();
  let testContract = new
    this.web3.eth.Contract(ABI);
  let deployedContract: string;
  // deploy test contract
  const newInst = await testContract.deploy({ data: Bytecode })
    .send({ from: accounts[0], gas: 1500000, gasPrice: '1' });
  deployedContract = newInst.options.address;
  return deployedContract;
}

async function getIndirectionMap() {
  return new Promise((resolve, _) => {
    (this.web3.currentProvider as HttpProvider).send({
      method: "evm_getIndirectionMap",
      params: null,
      jsonrpc: "2.0"
    }, function (_: Error | null, result?: any) {
      resolve(result.result);
    });
  });
}

async function setIndirectinMap(JSONmap: string[]) {
  return new Promise((resolve, _) => {
    (this.web3.currentProvider as HttpProvider).send({
      method: "evm_setIndirectionMap",
      params: [JSONmap],
      jsonrpc: "2.0"
    }, function (_: Error | null, result?: any) {
      resolve(result.result)
    });
  });
}
