import { MichelsonMap, TezosToolkit, OriginationOperation } from '@taquito/taquito';
import { InMemorySigner } from '@taquito/signer';
import { Tzip16Module, tzip16, bytes2Char, MichelsonStorageView, char2Bytes } from '@taquito/tzip16';
import { ETH_MAINNET, ETH_ROPSTEN, TEZOS_ITHACANET, TEZOS_MAINNET } from "../constants";
import documentStoreJson from '../contracts/tezos/documentStore.json';
import { SmartContract } from "./blockchain.component";
import { EmailComponent } from "./email.component";
import { HttpErrors } from "@loopback/rest";

export class TezosSmartContract implements SmartContract {
  private rpc: string;
  private publicKey: string;
  private adminPrivKey: string;
  private url: string;
  private emailComponent: EmailComponent
  private tezos: TezosToolkit;
  constructor(
    networkName: string) {
    this.emailComponent = new EmailComponent();
    switch (networkName) {
      case 'ithacanet':
        this.rpc = TEZOS_ITHACANET.RPC;
        this.publicKey = TEZOS_ITHACANET.PUBLIC_KEY;
        this.url = TEZOS_ITHACANET.URL;
        this.adminPrivKey = process.env.TEZOS_ITHACANET_KEY;
        break;
      case 'mainnet':
        this.rpc = TEZOS_MAINNET.RPC;
        this.publicKey = TEZOS_MAINNET.PUBLIC_KEY;
        this.url = TEZOS_MAINNET.URL;
        this.adminPrivKey = process.env.TEZOS_MAINNET_KEY;
        break;
      default:
        this.rpc = TEZOS_ITHACANET.RPC;
        this.publicKey = TEZOS_ITHACANET.PUBLIC_KEY;
        this.url = TEZOS_ITHACANET.URL;
        this.adminPrivKey = process.env.TEZOS_ITHACANET_KEY;
        break;
    }
    this.tezos = new TezosToolkit(this.rpc);
    this.tezos.addExtension(new Tzip16Module());
    this.tezos.setProvider({
      signer: new InMemorySigner(this.adminPrivKey)
    });
  }

  public getContractAddress(_hash: string): Promise<any> {
    return Promise.resolve('');
  }


  public issueCertificate = async (payload: any): Promise<any> => {
    const { contractAddress, merkleTreeRootHash, issuerAdminEmail } = payload;

    try {
      const contract = await this.tezos.contract.at(contractAddress);
      const tx = await contract.methods.issue(merkleTreeRootHash).send()
      await tx.confirmation(3)
      return tx.hash
    } catch (error) {
      this.emailComponent.reportBlockchainIssue(issuerAdminEmail, error);
      throw new HttpErrors[503];
    }
  }

  public revokeCertificate = async (payload: any): Promise<any> => {
    const { contractAddress, merkleTreeRootHash, issuerAdminEmail } = payload;

    try {
      const contract = await this.tezos.contract.at(contractAddress);
      const tx = await contract.methods.revoke(merkleTreeRootHash).send()
      await tx.confirmation(3)
      return tx.hash
    } catch (error) {
      this.emailComponent.reportBlockchainIssue(issuerAdminEmail, error);
      throw new HttpErrors[503];
    }
  }

  public deployStore = async (payload: any): Promise<any> => {
    const { name, issuerAdminEmail } = payload;
    try {
      const metadataBigMap = new MichelsonMap();
      const bytesUrl = char2Bytes(this.url);
      metadataBigMap.set('', bytesUrl);
      const origination = await this.tezos.contract.originate({
        code: documentStoreJson,
        storage: {
          name,
          metadata: metadataBigMap,
          documentRevoked: new MichelsonMap(),
          documentIssued: new MichelsonMap(),
          owner: this.publicKey,
        },
      });

      await origination.confirmation();
      const contract = await origination.contract();
      return {
        hash: origination.hash,
        address: contract.address
      };
    } catch (error) {
      this.emailComponent.reportBlockchainIssue(issuerAdminEmail, error);
      throw new HttpErrors[503];
    }
  }

}
