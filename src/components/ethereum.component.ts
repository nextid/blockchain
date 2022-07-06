import Web3 from "web3";
import { TransactionConfig } from "web3-core"
import { AbiItem } from 'web3-utils';
import { ContractSendMethod } from 'web3-eth-contract';
import { Transaction, TxData } from 'ethereumjs-tx'
import { ETH_MAINNET, ETH_ROPSTEN } from "../constants";
import documentStoreBuiltEthereumContract from '../contracts/ethereum/DocumentStoreBuiltEthereumContract.json';
import { SmartContract } from "./blockchain.component";
import { EmailComponent } from "./email.component";
import { HttpErrors } from "@loopback/rest";

export class EthereumSmartContract implements SmartContract {
  private rpc: string;
  private chainId: number;
  private adminAddress: string;
  private adminPrivKey: string;
  private priceMultiplier: number;
  private limitMultiplier: number;
  private web3: Web3;
  private emailComponent: EmailComponent
  constructor(
    networkName: string) {
    this.emailComponent = new EmailComponent();
    this.priceMultiplier = +(process.env.GAS_PRICE_MULTIPLIER || 1);
    this.limitMultiplier = +(process.env.GAS_LIMIT_MULTIPLIER || 1);
    switch (networkName) {
      case 'ropsten':
        this.rpc = ETH_ROPSTEN.RPC;
        this.chainId = ETH_ROPSTEN.CHAIN_ID;
        this.adminAddress = ETH_ROPSTEN.ADDRESS;
        this.adminPrivKey = process.env.ETH_ROPSTEN_KEY;
        break;
      case 'mainnet':
        this.rpc = ETH_MAINNET.RPC;
        this.chainId = ETH_MAINNET.CHAIN_ID;
        this.adminAddress = ETH_MAINNET.ADDRESS;
        this.adminPrivKey = process.env.ETH_MAIN_NET_KEY;
        break;
      default:
        this.rpc = ETH_ROPSTEN.RPC;
        this.chainId = ETH_ROPSTEN.CHAIN_ID;
        this.adminAddress = ETH_ROPSTEN.ADDRESS;
        this.adminPrivKey = process.env.ETH_ROPSTEN_KEY;
        break;
    }
    this.web3 = new Web3(this.rpc);
    this.web3.eth.accounts.wallet.add({
      address: this.adminAddress,
      privateKey: `0x${this.adminPrivKey}`
    })
  }

  public getContractAddress = async (hash: string): Promise<any> => {
    const web3 = new Web3(this.rpc);
    const receipt = await web3.eth.getTransactionReceipt(hash);
    return receipt.contractAddress;
  }

  public issueCertificate = async (payload: any): Promise<any> => {
    const { contractAddress, merkleTreeRootHash, issuerAdminEmail } = payload;

    const { abi } = documentStoreBuiltEthereumContract;

    const proxyContract = new this.web3.eth.Contract(abi as AbiItem[], contractAddress, {
      from: this.adminAddress
    });

    let rootHashHex = merkleTreeRootHash;
    if (rootHashHex.substring(0, 2) != '0x') {
      rootHashHex = '0x' + rootHashHex;
    }

    const issueMsg = proxyContract.methods.issue(rootHashHex);
    const tx = await this.processMethod(issueMsg, issuerAdminEmail, contractAddress);
    return tx.transactionHash;
  }

  public revokeCertificate = async (payload: any): Promise<any> => {
    const { contractAddress, merkleTreeRootHash, issuerAdminEmail } = payload;

    const { abi } = documentStoreBuiltEthereumContract;

    const proxyContract = new this.web3.eth.Contract(abi as AbiItem[], contractAddress, {
      from: this.adminAddress
    });

    let rootHashHex = merkleTreeRootHash;
    if (rootHashHex.substring(0, 2) != '0x') {
      rootHashHex = '0x' + rootHashHex;
    }

    const revokeMsg = proxyContract.methods.revoke(rootHashHex);
    const tx = await this.processMethod(revokeMsg, issuerAdminEmail, contractAddress);
    return tx.transactionHash;
  }

  public deployStore = async (payload: any): Promise<any> => {
    const { name, issuerAdminEmail } = payload;
    const web3 = new Web3(this.rpc);

    const { abi, bytecode } = documentStoreBuiltEthereumContract;

    const proxyContract = new web3.eth.Contract(abi as AbiItem[]);

    const deployment = proxyContract.deploy({
      data: bytecode,
      arguments: [name]
    });

    const tx = await this.processMethod(deployment, issuerAdminEmail, '0x00');
    return {
      hash: tx.transactionHash,
      address: tx.contractAddress
    }
  }

  private processMethod = async (contractSendMethod: ContractSendMethod, issuerAdminEmail: string, to?: string) => {
    let gasPrice = +(await this.web3.eth.getGasPrice()) * this.priceMultiplier;
    let gasLimit = (await contractSendMethod.estimateGas()) * this.limitMultiplier;
    const nonceCount = await this.web3.eth.getTransactionCount(this.adminAddress, 'pending');

    const params: TransactionConfig = {
      nonce: nonceCount,
      gas: gasLimit,
      gasPrice,
      data: contractSendMethod.encodeABI(),
      from: this.adminAddress
    };

    if (to) params.to = to;

    try {
      let signedTransaction = await this.web3.eth.accounts.signTransaction(params, this.adminPrivKey);
      if (signedTransaction && signedTransaction.rawTransaction) {
        const tx = await this.web3.eth.sendSignedTransaction(signedTransaction.rawTransaction);
        return tx;
      } else {
        throw new HttpErrors[503]
      }
    } catch (error) {
      this.emailComponent.reportBlockchainIssue(issuerAdminEmail, error);
      throw new HttpErrors[503]
    }
  }

}
