import { DSLLexer } from './DSLParser';

const testDSL = `
constraint D2_ABNORMAL_SWAP {
  when: edge.type == "DEX" && edge.action == "Swap" && !edge.isFirstSwap
  condition: {
    total_in_usd: 100,
    total_out_usd: 200,
    profit_ratio: (total_out_usd / total_in_usd) * 100
  }
  violation: total_in_usd < total_out_usd && profit_ratio > 105
  message: "Abnormal swap detected: output exceeds input value"
}
`;

const lexer = new DSLLexer(testDSL);
const tokens = lexer.tokenize();

console.log('Tokens:');
tokens.forEach((token, index) => {
  console.log(`${index}: ${token.type} '${token.value}'`);
}); 