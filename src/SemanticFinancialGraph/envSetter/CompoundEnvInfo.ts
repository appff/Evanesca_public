import { AbiItem } from "web3-utils";

export const ABIassetsIn: AbiItem = {"constant":true,"inputs":[{"internalType":"address","name":"account","type":"address"}],"name":"getAssetsIn","outputs":[{"internalType":"contract CToken[]","name":"","type":"address[]"}],"payable":false,"stateMutability":"view","type":"function"}; 
export const ABIbalanceOfUnderlying: AbiItem = {"constant":false,"inputs":[{"internalType":"address","name":"owner","type":"address"}],"name":"balanceOfUnderlying","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"payable":false,"stateMutability":"nonpayable","type":"function"};
export const ABIsymbol: AbiItem = {"constant":true,"inputs":[],"name":"symbol","outputs":[{"internalType":"string","name":"","type":"string"}],"payable":false,"stateMutability":"view","type":"function"};
export const ABIdemicals: AbiItem = {"constant":true,"inputs":[],"name":"decimals","outputs":[{"internalType":"uint8","name":"","type":"uint8"}],"payable":false,"stateMutability":"view","type":"function"};

export const rtnStrAssetsIn: string = 'address[]';
export const rtnStrbalanceOfUnderlying: string[] = ['uint256'];
export const rtnStrsymbol: string = 'string';
export const rtnStrdecimals: string = 'uint8';