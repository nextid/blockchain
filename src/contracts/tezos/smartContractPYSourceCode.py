import smartpy as sp

ContractOwner = sp.address("tz1NXLfpxJ2bF7ehyvwQN69AUZh8FCGPgjmn")
nullAddress   = sp.address("tz1Ke2h7sDdakHJQh8WX4Z372du1KChsksyU")

class DocumentStore(sp.Contract):
    def __init__(self, owner, **kargs):
        metadata = {
            "name": "Document Store",
            "description": "The world's most trusted certificates. NextCert helps you produce next-generation academic and professional certificates, that are cryptographically secure and ...",
            "version": "2.2.0",
            "views": [ self.owner, 
                        self.getIssuedBlock, self.isIssued, self.isIssuedBefore,
                        self.isRevoked, self.isRevokedBefore
                    ],
        }

        self.init_metadata("metadata", metadata)
        
        self.init(
            owner = owner, 
            documentIssued = sp.big_map(tkey = sp.TBytes, tvalue = sp.TNat),
            documentRevoked = sp.big_map(tkey = sp.TBytes, tvalue = sp.TNat),
            **kargs
        )

    def onlyOwner(self):
        sp.verify_equal(sp.sender, self.data.owner, 'Invalid Owner')
    def onlyIssued(self, document):
        sp.verify(self.data.documentIssued.contains(document), 'Error: Only issued document hashes can be revoked')
    def onlyNotIssued(self, document):
        sp.verify_equal(self.data.documentIssued.contains(document), False, 'Error: Only hashes that have not been issued can be issued')
    def onlyNotRevoked(self, claim):
        sp.verify_equal(self.data.documentRevoked.contains(claim), False, 'Error: Hash has been revoked previously')
    
    @sp.entry_point
    def transferOwnership(self, newOwner):
        self.onlyOwner()
        self.data.owner = newOwner

    @sp.entry_point
    def renounceOwnership(self):
        self.onlyOwner()
        self.data.owner = nullAddress

    @sp.entry_point
    def issue(self, document):
        self.onlyOwner()
        self.onlyNotIssued(document)
        self.data.documentIssued[document] = sp.level

    @sp.entry_point
    def revoke(self, document):
        self.onlyOwner()
        self.onlyNotRevoked(document)
        self.data.documentRevoked[document] = sp.level

    @sp.offchain_view(pure = True, doc = "Get owner address")
    def owner(self):
        sp.result(self.data.owner)

    @sp.offchain_view(pure = True, doc = "Get issued level")
    def getIssuedBlock(self, document):
        self.onlyIssued(document)
        sp.result(self.data.documentIssued[document])

    @sp.offchain_view(pure = True, doc = "Check issued existence")
    def isIssued(self, document):
        sp.result(self.data.documentIssued.contains(document))

    @sp.offchain_view(pure = True, doc = "Check issued before")
    def isIssuedBefore(self, params):
        a = self.data.documentIssued.contains(params.document)
        b = self.data.documentIssued[params.document] < params.blockNumber
        r = a & b
        sp.result(r)

    @sp.offchain_view(pure = True, doc = "Check revoked existence")
    def isRevoked(self, document):
        sp.result(self.data.documentRevoked.contains(document))

    @sp.offchain_view(pure = True, doc = "Check revoked before")
    def isRevokedBefore(self, params):
        a = self.data.documentRevoked.contains(params.document)
        b = self.data.documentRevoked[params.document] < params.blockNumber
        r = a & b
        sp.result(r)

@sp.add_target(name = "orig", kind = "origination")
def origin():
    scenario = sp.test_scenario()
    c1 = DocumentStore(
        ContractOwner, 
        metadata = sp.utils.metadata_of_url("https://gateway.pinata.cloud/ipfs/")
    )
    scenario += c1

@sp.add_test(name = "test owner")
def test():
    # init accounts
    owner = sp.test_account("Owner")
    newOwner = sp.test_account("NewOwner")

    # init contract & scenario
    scenario = sp.test_scenario()
    c1 = DocumentStore(
        owner.address, 
        metadata = sp.utils.metadata_of_url("https://gateway.pinata.cloud/ipfs/")
    )
    scenario += c1
    
    # check owner
    scenario.verify(c1.owner() == owner.address)

    # transferOwnership
    c1.transferOwnership(newOwner.address).run(sender=owner.address)
    scenario.verify(c1.owner() == newOwner.address)

    # renounceOwnership
    c1.renounceOwnership().run(sender=newOwner.address)
    scenario.verify(c1.owner() == nullAddress)


@sp.add_test(name = "test function")
def test():
    # init accounts
    owner = sp.test_account("Owner")

    # init contract & scenario
    scenario = sp.test_scenario()
    c2 = DocumentStore(
        owner.address, 
        metadata = sp.utils.metadata_of_url("https://gateway.pinata.cloud/ipfs/")
    )
    scenario += c2
    
    # check owner
    scenario.verify(c2.owner() == owner.address)

    # init document
    bytes_document = sp.bytes("0x517fbae26bb7b66dd2f7155078e063ae37f77079681e7f5a5f7288ffa78fee00")
    blockNumber = 1235
    param1 = sp.record(document=bytes_document, blockNumber=blockNumber)

    # issue
    c2.issue(bytes_document).run(sender=owner.address, level=1234)

    scenario.verify(c2.getIssuedBlock(bytes_document) == 1234)

    scenario.verify(c2.isIssued(bytes_document))
    
    

    scenario.verify(c2.isIssuedBefore(param1))
  
    # revoke
    c2.revoke(bytes_document).run(sender=owner.address, level=1234)

    scenario.verify(c2.isRevoked(bytes_document))

    scenario.verify(c2.isRevokedBefore(param1))


sp.add_compilation_target(
    "DocumentStore", 
    DocumentStore(
        ContractOwner,
        metadata = sp.utils.metadata_of_url(
            "https://gateway.pinata.cloud/ipfs/"
        )
    )
)

