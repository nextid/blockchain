import { MichelsonMap, TezosToolkit, OriginationOperation } from '@taquito/taquito';
import { InMemorySigner } from '@taquito/signer';
import { errors } from "ethers";
import { Tzip16Module, tzip16, bytes2Char, MichelsonStorageView, char2Bytes } from '@taquito/tzip16';
import { ETH_MAINNET, ETH_ROPSTEN, TEZOS_ITHACANET, TEZOS_MAINNET } from "../constants";
import documentStoreJson from '../contracts/tezos/documentStore.json';
import documentNftStoreJson from '../contracts/tezos/documentNftStore.json';
import { ICertificateNftPayload, IDeploySmartContractPayload, IIssueCertificatePayload, IRevokeCertificatePayload, ISmartContract } from "./blockchain.component";
import { EmailComponent } from "./email.component";
import { HttpErrors } from "@loopback/rest";
import { defaultDnsResolvers, queryDns, parseOpenAttestationRecord, IDNSRecord } from "@govtechsg/dnsprove";
import { openAttestationVerifiers, Verifier, VerificationFragmentType, VerificationFragment, OpenAttestationEthereumDocumentStoreStatusCode, DocumentStoreIssuanceStatus, InvalidDocumentStoreIssuanceStatus, ValidDocumentStoreIssuanceStatusArray, CodedError, OpenAttestationEthereumDocumentStoreStatusFragment, OpenAttestationDnsTxtCode, VerifierOptions, DnsTxtVerificationStatus, InvalidDnsTxtVerificationStatus, ValidDnsTxtVerificationStatusArray, OpenAttestationDnsTxtIdentityProofVerificationFragment, DocumentsToVerify, PromiseCallback } from "@govtechsg/oa-verify";
import { getData, OpenAttestationDocument, utils, v2, v3, WrappedDocument } from '@govtechsg/open-attestation';
import { InvalidRevocationStatus, RevocationStatus, ValidRevocationStatusArray } from '../constants/revocation.types';

interface GenericObject {
  [key: string]: string;
}

const verificationBuilder = (
  verifiers: any[]
) => (document: DocumentsToVerify, promisesCallback?: PromiseCallback): Promise<VerificationFragment[]> => {
  // if the user didn't configure an API key and didn't configure a provider or a resolver, then he will likely use a development key. We then warn him once, that he may need to configure things properly, especially for production
  const promises = verifiers.map((verifier) => {
    if (verifier.test(document)) {
      return verifier.verify(document);
    }
    return verifier.skip(document);
  });

  promisesCallback?.(promises);
  return Promise.all(promises);
};

const getIssuersDocumentStores = (document: WrappedDocument<v2.OpenAttestationDocument>): string[] => {
  const data = getData(document);
  return data.issuers.map((issuer) => {
    const documentStoreAddress = issuer.documentStore || issuer.certificateStore;
    if (!documentStoreAddress)
      throw new CodedError(
        `Document store address not found in issuer ${issuer.name}`,
        OpenAttestationEthereumDocumentStoreStatusCode.INVALID_ISSUERS,
        OpenAttestationEthereumDocumentStoreStatusCode[OpenAttestationEthereumDocumentStoreStatusCode.INVALID_ISSUERS]
      );
    return documentStoreAddress;
  });
};

const decodeError = (error: any) => {
  const reason = error.reason && Array.isArray(error.reason) ? error.reason[0] : error.reason ?? "";
  switch (true) {
    case !error.reason &&
      (error.method?.toLowerCase() === "isRevoked(bytes32)".toLowerCase() ||
        error.method?.toLowerCase() === "isIssued(bytes32)".toLowerCase()) &&
      error.code === errors.CALL_EXCEPTION:
      return "Contract is not found";
    case reason.toLowerCase() === "ENS name not configured".toLowerCase() &&
      error.code === errors.UNSUPPORTED_OPERATION:
      return "ENS name is not configured";
    case reason.toLowerCase() === "bad address checksum".toLowerCase() && error.code === errors.INVALID_ARGUMENT:
      return "Bad document store address checksum";
    case error.message?.toLowerCase() === "name not found".toLowerCase():
      return "ENS name is not found";
    case reason.toLowerCase() === "invalid address".toLowerCase() && error.code === errors.INVALID_ARGUMENT:
      return "Invalid document store address";
    case error.code === errors.INVALID_ARGUMENT:
      return "Invalid call arguments";
    case error.code === errors.SERVER_ERROR:
      throw new CodedError(
        "Unable to connect to the Ethereum network, please try again later",
        OpenAttestationEthereumDocumentStoreStatusCode.SERVER_ERROR,
        OpenAttestationEthereumDocumentStoreStatusCode[OpenAttestationEthereumDocumentStoreStatusCode.SERVER_ERROR]
      );
    default:
      throw error;
  }
};

const isOpenAttestationRecord = (txtDataString: string) => {
  return txtDataString.startsWith("openatts");
};

const trimDoubleQuotes = (record: string) => {
  return record.startsWith('"') ? record.slice(1, -1) : record;
};

const parseOpenAttestationRecords = (recordSet: IDNSRecord[] = []): GenericObject[] => {
  return recordSet
    .map((record) => record.data)
    .map(trimDoubleQuotes) // removing leading and trailing quotes if they exist
    .filter(isOpenAttestationRecord)
    .map(parseOpenAttestationRecord);
};

const resolveIssuerIdentity = async (
  location: string,
  smartContractAddress: string,
  network: string,
  net: string
): Promise<DnsTxtVerificationStatus> => {
  const results = await queryDns(location, defaultDnsResolvers);
  const records = parseOpenAttestationRecords(results.Answer || []);
  const matchingRecord = records.find(
    (record) =>
      record.addr.toLowerCase() === smartContractAddress.toLowerCase() &&
      record.netId === network &&
      record.type === "openatts" &&
      record.net === net
  );
  return matchingRecord
    ? {
      status: "VALID",
      location,
      value: smartContractAddress,
    }
    : {
      status: "INVALID",
      location,
      value: smartContractAddress,
      reason: {
        message: `Matching DNS record not found for ${smartContractAddress}`,
        code: OpenAttestationDnsTxtCode.MATCHING_RECORD_NOT_FOUND,
        codeString: OpenAttestationDnsTxtCode[OpenAttestationDnsTxtCode.MATCHING_RECORD_NOT_FOUND],
      },
    };
};


export class TezosSmartContract implements ISmartContract {
  private rpc: string;
  private publicKey: string;
  private adminPrivKey: string;
  private url: string;
  private tokenUrl: string;
  private emailComponent: EmailComponent
  private tezos: TezosToolkit;
  private networkName: string;
  constructor(
    networkName: string) {
    this.emailComponent = new EmailComponent();
    switch (networkName) {
      case 'ithacanet':
        this.rpc = TEZOS_ITHACANET.RPC;
        this.publicKey = TEZOS_ITHACANET.PUBLIC_KEY;
        this.tokenUrl = TEZOS_ITHACANET.TOKEN_URL;
        this.adminPrivKey = process.env.TEZOS_ITHACANET_KEY;
        break;
      case 'mainnet':
        this.rpc = TEZOS_MAINNET.RPC;
        this.publicKey = TEZOS_MAINNET.PUBLIC_KEY;
        this.tokenUrl = TEZOS_ITHACANET.TOKEN_URL;
        this.adminPrivKey = process.env.TEZOS_MAINNET_KEY;
        break;
      default:
        this.rpc = TEZOS_ITHACANET.RPC;
        this.publicKey = TEZOS_ITHACANET.PUBLIC_KEY;
        this.url = TEZOS_ITHACANET.URL;
        this.adminPrivKey = process.env.TEZOS_ITHACANET_KEY;
        break;
    }
    this.networkName = networkName;
    this.url = process.env.TEZOS_METADA_URL;
    this.tezos = new TezosToolkit(this.rpc);
    this.tezos.addExtension(new Tzip16Module());
    this.tezos.setProvider({
      signer: new InMemorySigner(this.adminPrivKey)
    });
  }

  public getOwner(): string {
    return this.publicKey;
  }

  public getContractAddress(_hash: string): Promise<any> {
    return Promise.resolve('');
  }

  public issueCertificate = async (payload: IIssueCertificatePayload): Promise<any> => {
    const { contractAddress, merkleTreeRootHash, issuerAdminEmail } = payload;

    try {
      const contract = await this.tezos.contract.at(contractAddress);
      const tx = await contract.methods.issue(merkleTreeRootHash).send()
      await tx.confirmation(1)
      return tx.hash
    } catch (error) {
      this.emailComponent.reportBlockchainIssue(issuerAdminEmail, error);
      throw new HttpErrors[503];
    }
  }

  private isVerified = async (payload: any): Promise<DocumentStoreIssuanceStatus> => {
    const { documentStore, merkleRoot } = payload;

    try {
      const contract = await this.tezos.contract.at(documentStore, tzip16);
      const views = await contract.tzip16().metadataViews();
      const result = await views.isIssued().executeView(merkleRoot);
      if (result) {
        return {
          issued: true,
          address: documentStore,
        }
      }
      return {
        issued: false,
        address: documentStore,
        reason: {
          message: `Document ${merkleRoot} has not been issued under contract ${documentStore}`,
          code: OpenAttestationEthereumDocumentStoreStatusCode.DOCUMENT_NOT_ISSUED,
          codeString:
            OpenAttestationEthereumDocumentStoreStatusCode[
            OpenAttestationEthereumDocumentStoreStatusCode.DOCUMENT_NOT_ISSUED
            ],
        },
      }
    } catch (error) {
      return {
        issued: false,
        address: merkleRoot,
        reason: {
          message: decodeError(error),
          code: OpenAttestationEthereumDocumentStoreStatusCode.DOCUMENT_NOT_ISSUED,
          codeString:
            OpenAttestationEthereumDocumentStoreStatusCode[
            OpenAttestationEthereumDocumentStoreStatusCode.DOCUMENT_NOT_ISSUED
            ],
        },
      };
    }
  }

  private isRevoked = async (payload: any): Promise<RevocationStatus> => {
    const { documentStore, merkleRoot } = payload;

    try {
      const contract = await this.tezos.contract.at(documentStore, tzip16);
      const views = await contract.tzip16().metadataViews();
      const result = await views.isRevoked().executeView(merkleRoot);
      if (result) {
        return {
          revoked: true,
          address: documentStore,
          reason: {
            message: `Document ${merkleRoot} has been revoked under contract ${documentStore}`,
            code: OpenAttestationEthereumDocumentStoreStatusCode.DOCUMENT_REVOKED,
            codeString:
              OpenAttestationEthereumDocumentStoreStatusCode[
              OpenAttestationEthereumDocumentStoreStatusCode.DOCUMENT_REVOKED
              ],
          },
        }
      }
      return {
        revoked: false,
        address: documentStore,
      }
    } catch (error) {
      // this.emailComponent.reportBlockchainIssue(issuerAdminEmail, error);
      return {
        revoked: true,
        address: documentStore,
        reason: {
          message: decodeError(error),
          code: OpenAttestationEthereumDocumentStoreStatusCode.DOCUMENT_REVOKED,
          codeString:
            OpenAttestationEthereumDocumentStoreStatusCode[
            OpenAttestationEthereumDocumentStoreStatusCode.DOCUMENT_REVOKED
            ],
        },
      };
    }
  }

  public verify = async (issuedDocument: v2.WrappedDocument<v2.OpenAttestationDocument>): Promise<VerificationFragment[]> => {

    const verify = verificationBuilder(
      [openAttestationVerifiers[0], this.documentStoreStatusVerifier(), this.dnsTxtVerifier()]
    );
    const fragments = await verify(issuedDocument);
    return fragments;
  }

  private dnsTxtVerifier = (): Verifier<OpenAttestationDnsTxtIdentityProofVerificationFragment> => {
    const name = "TezosDnsTxtIdentityProof";
    const type: VerificationFragmentType = "ISSUER_IDENTITY";
    return {
      skip: async () => {
        return {
          status: "SKIPPED",
          type,
          name,
          reason: {
            code: OpenAttestationDnsTxtCode.SKIPPED,
            codeString: OpenAttestationDnsTxtCode[OpenAttestationDnsTxtCode.SKIPPED],
            message: `Document issuers doesn't have "documentStore" / "tokenRegistry" property or doesn't use ${v3.IdentityProofType.DNSTxt} type`,
          },
        };
      },
      test: (document) => {
        if (utils.isWrappedV2Document(document)) {
          const documentData = getData(document);
          // at least one issuer uses DNS-TXT
          return documentData.issuers.some((issuer) => {
            return (
              (issuer.documentStore || issuer.tokenRegistry || issuer.certificateStore) &&
              issuer.identityProof?.type === v2.IdentityProofType.DNSTxt
            );
          });
        } else if (utils.isWrappedV3Document(document)) {
          return document.openAttestationMetadata.identityProof.type === v3.IdentityProofType.DNSTxt;
        }
        return false;
      },
      verify: async (document: DocumentsToVerify) => {
        if (!utils.isWrappedV2Document(document)) {
          throw new CodedError(
            "Document does not match either v2 formats",
            OpenAttestationDnsTxtCode.UNRECOGNIZED_DOCUMENT,
            OpenAttestationDnsTxtCode[OpenAttestationDnsTxtCode.UNRECOGNIZED_DOCUMENT]
          );
        }
        const documentData = getData(document);
        const identities = await Promise.all(
          documentData.issuers.map((issuer) => {
            if (issuer.identityProof?.type === v2.IdentityProofType.DNSTxt) {
              const { location } = issuer.identityProof;
              const smartContractAddress = issuer.documentStore || issuer.tokenRegistry || issuer.certificateStore;

              if (!location)
                throw new CodedError(
                  "Location not found in identity proof",
                  OpenAttestationDnsTxtCode.INVALID_ISSUERS,
                  OpenAttestationDnsTxtCode[OpenAttestationDnsTxtCode.INVALID_ISSUERS]
                );

              if (!smartContractAddress)
                throw new CodedError(
                  "Smart contract address not found in identity proof",
                  OpenAttestationDnsTxtCode.INVALID_ISSUERS,
                  OpenAttestationDnsTxtCode[OpenAttestationDnsTxtCode.INVALID_ISSUERS]
                );
              return resolveIssuerIdentity(location, smartContractAddress, this.networkName, 'tezos');
            }
            const invalidResponse: InvalidDnsTxtVerificationStatus = {
              status: "INVALID",
              reason: {
                message: "Issuer is not using DNS-TXT identityProof type",
                code: OpenAttestationDnsTxtCode.INVALID_ISSUERS,
                codeString: OpenAttestationDnsTxtCode[OpenAttestationDnsTxtCode.INVALID_ISSUERS],
              },
            };
            return invalidResponse; // eslint is happy, so am I (https://github.com/bradzacher/eslint-plugin-typescript/blob/master/docs/rules/no-object-literal-type-assertion.md)
          })
        );

        if (ValidDnsTxtVerificationStatusArray.guard(identities)) {
          return {
            name,
            type,
            data: identities,
            status: "VALID",
          };
        }

        const invalidIdentity = identities.find(InvalidDnsTxtVerificationStatus.guard);
        if (InvalidDnsTxtVerificationStatus.guard(invalidIdentity)) {
          return {
            name,
            type,
            data: identities,
            reason: invalidIdentity.reason,
            status: "INVALID",
          };
        }
        throw new CodedError(
          "Unable to retrieve the reason of the failure",
          OpenAttestationDnsTxtCode.UNEXPECTED_ERROR,
          "UNEXPECTED_ERROR"
        );
      },
    }
  }

  private documentStoreStatusVerifier = (): Verifier<VerificationFragment> => {
    const name = "TezosDocumentStoreStatus";
    const type: VerificationFragmentType = "DOCUMENT_STATUS";
    return {
      skip: async () => {
        return {
          status: "SKIPPED",
          type,
          name,
          reason: {
            code: OpenAttestationEthereumDocumentStoreStatusCode.SKIPPED,
            codeString: OpenAttestationEthereumDocumentStoreStatusCode[
              OpenAttestationEthereumDocumentStoreStatusCode.SKIPPED
            ],
            message: `Document issuers doesn't have "documentStore" or "certificateStore"`,
          },
        };
      },
      test: (document) => {
        if (utils.isWrappedV2Document(document)) {
          const documentData = getData(document);
          return documentData.issuers.some((issuer) => "documentStore" in issuer || "certificateStore" in issuer);
        } else if (utils.isWrappedV3Document(document)) {
          return document.openAttestationMetadata.proof.method === v3.Method.DocumentStore;
        }
        return false;
      },
      verify: async (document: WrappedDocument<OpenAttestationDocument>) => {
        if (!utils.isWrappedV2Document(document)) {
          throw new CodedError(
            `Document does not match either v2 formats. Consider using \`utils.diagnose\` from open-attestation to find out more.`,
            OpenAttestationEthereumDocumentStoreStatusCode.UNRECOGNIZED_DOCUMENT,
            OpenAttestationEthereumDocumentStoreStatusCode[OpenAttestationEthereumDocumentStoreStatusCode.UNRECOGNIZED_DOCUMENT]
          );
        }
        const documentStores = getIssuersDocumentStores(document);
        const merkleRoot = document.signature.merkleRoot;
        const issuanceStatuses = await Promise.all(
          documentStores.map((documentStore) =>
            this.isVerified({
              documentStore, merkleRoot
            })
          )
        );
        const notIssued = issuanceStatuses.find(InvalidDocumentStoreIssuanceStatus.guard);
        if (InvalidDocumentStoreIssuanceStatus.guard(notIssued)) {
          return {
            name,
            type,
            data: {
              issuedOnAll: false,
              details: { issuance: issuanceStatuses },
            },
            reason: notIssued.reason,
            status: "INVALID",
          };
        }

        const revocationStatuses: RevocationStatus[] = await Promise.all(
          documentStores.map((documentStore) =>
            this.isRevoked({
              documentStore, merkleRoot
            })
          )
        );
        const revoked = revocationStatuses.find(InvalidRevocationStatus.guard);

        if (InvalidRevocationStatus.guard(revoked)) {
          return {
            name,
            type,
            data: {
              issuedOnAll: true,
              revokedOnAny: true,
              details: { issuance: issuanceStatuses, revocation: revocationStatuses },
            },
            reason: revoked.reason,
            status: "INVALID",
          };
        }

        if (
          ValidDocumentStoreIssuanceStatusArray.guard(issuanceStatuses) &&
          ValidRevocationStatusArray.guard(revocationStatuses)
        ) {
          return {
            name,
            type,
            data: {
              issuedOnAll: true,
              revokedOnAny: false,
              details: { issuance: issuanceStatuses, revocation: revocationStatuses },
            },
            status: "VALID",
          };
        }
        throw new CodedError(
          "Reached an unexpected state when verifying v2 document",
          OpenAttestationEthereumDocumentStoreStatusCode.UNEXPECTED_ERROR,
          "UNEXPECTED_ERROR"
        );
      },
    }
  }

  public revokeCertificate = async (payload: IRevokeCertificatePayload): Promise<any> => {
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

  public deployStore = async (payload: IDeploySmartContractPayload): Promise<any> => {
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

  public mintCertificateNft = async (payload: ICertificateNftPayload): Promise<any> => {
    const { contractId, receiverId, cid, issuerAdminEmail } = payload;
    try {
      const metadata = new MichelsonMap();
      metadata.set("", char2Bytes(cid));

      const contract = await this.tezos.wallet.at(contractId);
      const op = await contract.methods.mint(receiverId, metadata).send();
      await op.confirmation(1);

      return op.opHash;
    } catch (error) {
      this.emailComponent.reportBlockchainIssue(issuerAdminEmail, error);
      throw new HttpErrors[503];
    }
  }
  public deployStoreNft = async (payload: IDeploySmartContractPayload): Promise<any> => {
    const { name, issuerAdminEmail } = payload;
    try {
      const metadataBigMap = new MichelsonMap();
      const bytesUrl = char2Bytes(this.tokenUrl);
      metadataBigMap.set('', bytesUrl);
      const origination = await this.tezos.contract.originate({
        code: documentNftStoreJson,
        init: {
          prim: "Pair",
          args: [
            {
              prim: "Pair",
              args: [
                {
                  prim: "Pair",
                  args: [{ string: this.publicKey }, { int: "0" }],
                },
                {
                  prim: "Pair",
                  args: [
                    [],
                    [{ prim: "Elt", args: [{ string: "" }, { bytes: bytesUrl }] }],
                  ],
                },
              ],
            },
            {
              prim: "Pair",
              args: [
                { prim: "Pair", args: [[], { prim: "False" }] },
                { prim: "Pair", args: [[], []] },
              ],
            },
          ],
        },
      }
      );

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
