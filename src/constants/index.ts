import { ValueOrPromise, Constructor } from "@loopback/core";

export enum ROLE {
	ORG_ADMIN = 'org admin',
	ISSUER_ADMIN = 'issuer admin',
	SUPER_ADMIN = 'super admin'
}

export enum MEMBER_STATUS {
	INVITED = 'invited',
	JOINED = 'joined',
}

export enum MESSAGE {
	RESOURCE_ALREADY_EXISTS = 'resource already exists',
	INVALID_USER_ROLE = 'invalid user role',
	ROLE_MISSING = 'cannot find role for user',
	ISSUER_ROLE_EXISTS = 'role already exists',
	INVALID_MEMBER_STATUS = 'invalid member status',
	INVALID_ADMIN_KEY = 'invalid admin key',
	INVALID_EMAIL = 'invalid email',
	INVALID_TOKEN = 'invalid token',
	INVALID_ID = 'invalid id',
	EXISTED_EMAIL = 'existed email',
	UNCONFIRMED_PASSWORD = 'confirmed password is not matched',
	USER_NOT_FOUND = 'user is not found',
	WRONG_PASSWORD = 'wrong password',
	ISSUER_NOT_EXISTED = 'issuer is not existed',
	ORGANIZATION_NOT_EXISTED = 'organization is not existed',
	TEMPLATE_NOT_EXISTED = 'template is not existed',
	NO_NEW_BATCH_FOR_USER = 'no new batches for user',
	INVALID_PIN = 'invalid pin',
	AD_HOC_CERT_REQ_NOT_TALLIED = "organization, template or user don't match",
	ORGS_NOT_TIED_TO_ISSUER = "organisations not tied to one issuer",
	NOT_INVITED_USER = "not a newly invited user",
	CERTIFICATION_NOT_EXISTED = "certification is not existed",
	BATCH_NOT_EXISTED = "batch is not existed",
	GAS_PRICE_NOT_FOUND = 'gas price multiplier is not found, default value used',
	GAS_LIMIT_NOT_FOUND = 'gas limit multiplier is not found, default value used',
	BATCH_NOT_REVIEWED = 'the batch you are trying to issue has not been reviewd',
	INVALID_CODE = 'code is not correct',
	VALID_CODE = 'code is correct',
	CODE_EXPIRED = 'code is expired',
	CODE_NOT_EXPIRED = 'code is not expired',
	EXIST_TOKEN = 'token is existed'
}

export enum JSONWEBTOKEN {
	LOGIN = 'login',
	FORGOT_PASSWORD = 'forgot_password',
	INVITE_USER = 'invite_user'
}

export const SECURITY_REQUESTED_API = [
	{
		bearerAuth: []
	}
];

export enum USER_ACTION_TYPE {
	CREATED = 'created',
	READ = 'read',
	UPDATED = 'updated',
	DELETED = 'deleted',
	INGESTED = 'ingested',
	ISSUED = 'issued',
	PUBLISHED = 'published',
	NOTIFIED = 'notified',
	REVOKED = 'revoked',
	EXPORTED = 'exported',
	INVITED = "invited",
	REGISTERED = "registered"
}

export enum BATCH_STATUS {
	PROCESSING = 'processing',
	TOKEN_PROCESSING = 'token processing',
	NEW = 'new',
	ISSUED = 'issued',
	REVIEWED = 'reviewed',
	REVOKED = 'revoked',
	EMAILED = 'emailed',
	TOKENISED = 'tokenised',
	INVITED = 'invited',
	DELIVERED = 'delivered'
}

/**
	new (certificate is unsigned)
	issued (certificate is signed and anchored to blockchain)
	revoked (revocation published to blockchain)
	processing (timeout status or permanent error)
	emailed (certificate notification has been sent)
	tokenised (token data has been produced)
	invited (token transfer invite has been sent)
	delivered (token has been minted & transferred)
 */
export enum CERTIFICATION_STATUS {
	PROCESSING = 'processing',
	TOKEN_PROCESSING = 'token processing',
	NEW = 'new',
	READY = 'ready',
	ISSUED = 'issued',
	REVOKED = 'revoked',
	EMAILED = 'emailed',
	TOKENISED = 'tokenised',
	INVITED = 'invited',
	DELIVERED = 'delivered',
	FAIL_TOKENISED = 'fail tokenised'
}

export enum ORIENTATION_TYPE {
	LANDSCAPE = 'landscape',
	PORTRAIT = 'portrait',
	SQUARE = 'square'
}

export enum RENDERER_TYPE {
	EMBEDDED_RENDERER = 'EMBEDDED_RENDERER',
}

export enum LAYOUT_TYPE {
	NEXTCERT = 'nextcert-layout'
}

export enum AUTH_CODE {
	SUSPEND = '01',
	CAN_PROCESS = '02',
	CAN_ISSUE = '03',
	CAN_PUBLISH = '04',
	CAN_NOTIFY = '05',
	CAN_DELETE = '06',
	CAN_REVOKE = '07'
}

export enum STATUS_CODE {
	SUSPENDED = '01',
	PROCESSED = '02',
	ISSUED = '03',
	PUBLISHED = '04',
	NOTIFIED = '05',
	DELETED = '06',
	REVOKED = '07'
}

export enum UPDATE_CERT_COLUMN {
	RECIPIENT_EMAIL = 'recipient_email',
	RECIPIENT_NATIONAL_ID = 'recipient_national_id'
}

export enum ETH_ROPSTEN {
	RPC = 'wss://ropsten.infura.io/ws/v3/1f1ff2b3fca04f8d99f67d465c59e4ef',
	CHAIN_ID = 3,
	ADDRESS = '0xE42383137e7814B3D8E18AD77EF48B248B08c0e5'
}

export enum ETH_MAINNET {
	RPC = 'wss://mainnet.infura.io/ws/v3/0bb844e98c654b5b809c37c6cdc2e7a0',
	CHAIN_ID = 1,
	ADDRESS = '0x375B50CA5a62D0fBBFe1fFaB1292748f5129E080'
}

export enum ZIL_TESTNET {
	API_URL = 'https://dev-api.zilliqa.com',
	CHAIN_ID = 333,
	PUBLIC_KEY = 'zil169fv6udyu50d6ts0jhar6uq0tt5up38txsfzw7'
}

export enum ZIL_MAINNET {
	API_URL = 'https://api.zilliqa.com',
	CHAIN_ID = 1,
	PUBLIC_KEY = '0x2Dd2468C5A03A9fe146391537e92Af56f1370C10'
}

export enum TEZOS_ITHACANET {
	RPC = 'https://rpc.ghostnet.teztnets.xyz/',
	PUBLIC_KEY = 'tz1U8KLnQ6iSsisss3bQxcEHLzCfy8cS51W3',
	URL = 'https://bafybeig27fkx3douw43ice5jicekof5jquj7tjgodsopmyqvgcfe4llqui.ipfs.infura-ipfs.io',
	TOKEN_URL = 'https://nextcert.mypinata.cloud/ipfs/QmWRxs4xo2fShHmg3RqVusbra9tM8tFUZbGgi5qmARzMWV',
	DOCUMENT_STORE_CONTRACT = "KT1WNPY5vbMu3EeAj5yTvNBjjWMvFoW3XQvm"
}

export enum TEZOS_MAINNET {
	RPC = 'https://mainnet.api.tez.ie',
	PUBLIC_KEY = 'tz1domubojGkHCxxX9VXnjvmXZkncFUKLviz',
	URL = 'https://bafybeig27fkx3douw43ice5jicekof5jquj7tjgodsopmyqvgcfe4llqui.ipfs.infura-ipfs.io',
	TOKEN_URL = 'https://nextcert.mypinata.cloud/ipfs/QmWRxs4xo2fShHmg3RqVusbra9tM8tFUZbGgi5qmARzMWV'
}

export const SCHEMA: any = {
	opencerts: 'opencerts/v2.0',
	healthcert: 'healthcert/v1.0'
}

export interface MigrationScript {
	version: string;
	scriptName?: string;
	description?: string;

	up(): ValueOrPromise<any>;

	down?(): ValueOrPromise<any>;
}

export enum MigrationAction {
	Upgrade = "Upgrade",
	Downgrade = "Downgrade"
}

export type MigrationConfig = {
	appVersion?: string;
	dataSourceName?: string;
	modelName?: string;
	migrationScripts?: Constructor<MigrationScript>[];
};

export type PackageInfo = {
	name: string;
	version: string;
	description: string;
};
