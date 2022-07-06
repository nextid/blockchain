import { BN, bytes, getAddressFromPrivateKey, Long, toBech32Address, units, Zilliqa } from "@zilliqa-js/zilliqa";
import { Contracts } from "@zilliqa-js/contract";
import { SmartContract } from "./blockchain.component";
import { EmailComponent } from "./email.component";
import { ZIL_MAINNET, ZIL_TESTNET } from "../constants";
import documentStoreScillaSourceCode from '../contracts/zilliqa/documentStore.scillaSourceCode';
import { HttpErrors } from "@loopback/rest";

export class ZilliqaSmartContract implements SmartContract {
  private apiUrl: string;
  private chainId: number;
  private publicKey: string;
  private privateKey: string;
  private gasPrice: BN;
  private version: number;
  private zilliqa: Zilliqa;
  private emailComponent: EmailComponent
  constructor(
    networkName: string) {
    this.emailComponent = new EmailComponent();
    switch (networkName) {
      case 'd24':
        this.apiUrl = ZIL_TESTNET.API_URL;
        this.chainId = ZIL_TESTNET.CHAIN_ID;
        this.privateKey = process.env.ZIL_TEST_NET_KEY;
        break;
      case 'mainnet':
        this.apiUrl = ZIL_MAINNET.API_URL;
        this.chainId = ZIL_MAINNET.CHAIN_ID;
        this.privateKey = process.env.ZIL_MAIN_NET_KEY;
        break;
      default:
        this.apiUrl = ZIL_TESTNET.API_URL;
        this.chainId = ZIL_TESTNET.CHAIN_ID;
        this.privateKey = process.env.ZIL_TEST_NET_KEY;
        break;
    }
    this.zilliqa = new Zilliqa(this.apiUrl);
    this.zilliqa.wallet.addByPrivateKey(this.privateKey);
    this.publicKey = getAddressFromPrivateKey(this.privateKey);
  }

  private setupGasPrice = async () => {
    const msgVersion = 1;
    this.version = bytes.pack(this.chainId, msgVersion);
    const minGasPrice = await this.zilliqa.blockchain.getMinimumGasPrice();
    this.gasPrice = units.toQa('2000', units.Units.Li);
    if (minGasPrice.result) {
      this.gasPrice = new BN(minGasPrice.result)
    }
  }

  public getContractAddress = async (hash: string): Promise<any> => {
    let zilliqa = new Zilliqa(this.apiUrl);
    const txn = await zilliqa.blockchain.getTransaction(hash);

    return toBech32Address(Contracts.getAddressForContract(txn));
  }

  public issueCertificate = async (payload: any): Promise<any> => {
    await this.setupGasPrice();
    const { contractAddress, merkleTreeRootHash, issuerAdminEmail } = payload;

    let rootHashHex = merkleTreeRootHash;
    if (rootHashHex.substring(0, 2) != '0x') {
      rootHashHex = '0x' + rootHashHex;
    }

    try {
      const contract = this.zilliqa.contracts.at(contractAddress);
      const callTx = await contract.call(
        'Issue',
        [
          {
            vname: 'document',
            type: 'ByStr32',
            value: rootHashHex
          }
        ],
        {
          version: this.version,
          amount: new BN(0),
          gasPrice: this.gasPrice,
          gasLimit: Long.fromNumber(10000),
        }
      );
      return callTx.hash;
    } catch (err) {
      this.emailComponent.reportBlockchainIssue(issuerAdminEmail, err);
    }
  }

  public revokeCertificate = async (payload: any): Promise<any> => {
    await this.setupGasPrice();
    const { contractAddress, merkleTreeRootHash, issuerAdminEmail } = payload;

    let rootHashHex = merkleTreeRootHash;
    if (rootHashHex.substring(0, 2) != '0x') {
      rootHashHex = '0x' + rootHashHex;
    }

    try {
      const contract = this.zilliqa.contracts.at(contractAddress);
      const callTx = await contract.call(
        'Revoke',
        [
          {
            vname: 'document',
            type: 'ByStr32',
            value: rootHashHex
          }
        ],
        {
          version: this.version,
          amount: new BN(0),
          gasPrice: this.gasPrice,
          gasLimit: Long.fromNumber(10000),
        }
      );
      return callTx.hash;
    } catch (err) {
      this.emailComponent.reportBlockchainIssue(issuerAdminEmail, err);
    }
  }

  public deployStore = async (payload: any): Promise<any> => {
    await this.setupGasPrice();
    const { issuerAdminEmail, name } = payload;

    const contract = this.zilliqa.contracts.new(
      documentStoreScillaSourceCode,
      [
        {
          type: 'ByStr20',
          value: this.publicKey,
          vname: 'contract_owner'
        },
        {
          type: 'String',
          value: name,
          vname: 'name'
        },
        {
          type: 'String',
          value: '1.0',
          vname: 'version'
        },
        {
          vname: '_scilla_version',
          type: 'Uint32',
          value: '0',
        }
      ]
    );

    try {
      const [deployTx, deployedContract] = await contract.deployWithoutConfirm(
        {
          version: this.version,
          gasPrice: this.gasPrice,
          gasLimit: Long.fromNumber(10000),
        },
        false
      );
      // const pendingStatus = await this.zilliqa.contracts.
      if (deployTx.id) {
        try {
          const tx = await deployTx.confirm(deployTx.id)
          return {
            hash: tx.id,
            address: toBech32Address(Contracts.getAddressForContract(tx))
          };
        } catch (error) {
          this.emailComponent.reportBlockchainIssue(issuerAdminEmail, error);
        }
      } else {
        this.emailComponent.reportBlockchainIssue(issuerAdminEmail, {
          message: 'cant find hash'
        });
        throw new HttpErrors[503];
      }
    } catch (error) {
      this.emailComponent.reportBlockchainIssue(issuerAdminEmail, error);
      throw new HttpErrors[503];
    }
  }
}
