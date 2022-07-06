import { HttpErrors } from "@loopback/rest";
import { EthereumSmartContract } from "./ethereum.component";
import { TezosSmartContract } from "./tezos.component";
import { ZilliqaSmartContract } from "./zilliqa.component";

export class Blockchain {
  private smartContract: SmartContract;

  public setSmartContract = (protocolName: string, networkName: string) => {
    switch (protocolName) {
      case 'ethereum':
        this.smartContract = new EthereumSmartContract(networkName)
        break;
      case 'zilliqa':
        this.smartContract = new ZilliqaSmartContract(networkName)
        break;

      case 'tezos':
        this.smartContract = new TezosSmartContract(networkName)
        break;

      default:
        throw new HttpErrors.UnprocessableEntity(`does not support protocol ${protocolName}`);
    }
  }

  public getSmartContract = () => {
    return this.smartContract;
  }
}

export interface SmartContract {
  getContractAddress(hash: string): Promise<any>;
  deployStore(payload: any): Promise<{
    hash?: string,
    address?: string
  }>;
  issueCertificate(payload: any): Promise<any>;
  revokeCertificate(payload: any): Promise<any>;
}

