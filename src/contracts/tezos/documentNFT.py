import smartpy as sp
FA2 = sp.io.import_script_from_url("https://smartpy.io/templates/FA2.py")

# Set address of admin
FA2_admin = sp.address("tz1NXLfpxJ2bF7ehyvwQN69AUZh8FCGPgjmn")

class DocumentNFT(FA2.FA2_change_metadata, FA2.FA2_token_metadata, FA2.FA2_mint, FA2.FA2_administrator, FA2.FA2_pause, FA2.FA2_core):
    def __init__(self, config, metadata, admin):
        list_of_views = [
            self.total_token
            , self.token_uri
            , self.administrator
            , self.is_admin
            , self.does_token_exist
            , self.is_operator
            , self.is_owner
        ]

        metadata_base = {
            "version": config.name # will be changed if using fatoo.
            , "description" : (
                "This is a didactic reference implementation of FA2,"
                + " a.k.a. TZIP-012, using SmartPy.\n\n"
                + "This particular contract uses the configuration named: "
                + config.name + "."
            )
            , "interfaces": ["TZIP-012", "TZIP-016"]
            , "authors": [
                "NextID <https://nextid.com>"
            ]
            , "homepage": "https://nextid.com"
            , "views": list_of_views
            , "source": {
                "tools": ["SmartPy"]
                , "location": "https://gitlab.com/smondet/fa2-smartpy.git"
            }
            , "permissions": {
                "operator":
                "owner-or-operator-transfer" if config.support_operator else "owner-transfer"
                , "receiver": "owner-no-hook"
                , "sender": "owner-no-hook"
            }
            , "fa2-smartpy": {
                "configuration" :
                dict([(k, getattr(config, k)) for k in dir(config) if "__" not in k and k != 'my_map'])
            }
        }
        self.init_metadata("metadata_base", metadata_base)
        FA2.FA2_core.__init__(self, config, metadata, paused = False, administrator = admin)

    def mint_mono(self, params): 
        amount = 1  
        token_id = self.data.all_tokens
        token_id_after = abs(self.data.all_tokens - 1)

        user = self.ledger_key.make(params.address, token_id)
        sp.if self.data.ledger.contains(user):
            self.data.ledger[user].balance += amount
        sp.else:
            self.data.ledger[user] = FA2.Ledger_value.make(amount)
        sp.if ~ self.token_id_set.contains(self.data.all_tokens, token_id):
            self.token_id_set.add(self.data.all_tokens, token_id)
            self.data.token_metadata[token_id_after] = sp.record(
                token_id    = token_id_after,
                token_info  = params.metadata
            )
        if self.config.store_total_supply:
            self.data.total_supply[token_id_after] = amount + self.data.total_supply.get(token_id_after, default_value = 0)
    
    @sp.entry_point
    def mint(self, params):
        sp.verify(self.is_administrator(sp.sender), message = self.error_message.not_admin())
        sp.verify( ~self.is_paused(), message = self.error_message.paused() ) # is not paused
        self.mint_mono(params)

    @sp.entry_point
    def mint_batch(self, params):
        sp.verify(self.is_administrator(sp.sender), message = self.error_message.not_admin())
        sp.verify( ~self.is_paused(), message = self.error_message.paused() ) # is not paused
        sp.for token in params:
            self.mint_mono(token)

    @sp.entry_point
    def claim(self, params):
        sp.verify(self.is_administrator(sp.sender), message = self.error_message.not_admin())
        sp.verify( ~self.is_paused(), message = self.error_message.paused() ) # is not paused
        sp.set_type(params, self.batch_transfer.get_type())

        sp.for transfer in params:
           current_from = transfer.from_
           sp.for tx in transfer.txs:
                sp.verify(
                    self.data.token_metadata.contains(tx.token_id),
                    message = self.error_message.token_undefined()
                )
                # If amount is 0 we do nothing now:
                sp.if (tx.amount > 0):
                    from_user = self.ledger_key.make(current_from, tx.token_id)
                    sp.verify(
                        (self.data.ledger[from_user].balance >= tx.amount),
                        message = self.error_message.insufficient_balance())
                    to_user = self.ledger_key.make(tx.to_, tx.token_id)
                    self.data.ledger[from_user].balance = sp.as_nat(
                        self.data.ledger[from_user].balance - tx.amount)
                    sp.if self.data.ledger.contains(to_user):
                        self.data.ledger[to_user].balance += tx.amount
                    sp.else:
                         self.data.ledger[to_user] = FA2.Ledger_value.make(tx.amount)
                sp.else:
                    pass
                    
    @sp.entry_point
    def transfer(self, params):
        sp.verify( ~self.is_paused(), message = self.error_message.paused() )
        sp.set_type(params, self.batch_transfer.get_type())
        sp.for transfer in params:
           current_from = transfer.from_
           sp.for tx in transfer.txs:
                if self.config.single_asset:
                    sp.verify(tx.token_id == 0, message = "single-asset: token-id <> 0")

                # sender_verify = ((self.is_administrator(sp.sender)) |
                #                 (current_from == sp.sender))
                sender_verify = (current_from == sp.sender)
                message = self.error_message.not_owner()
                if self.config.support_operator:
                    message = self.error_message.not_operator()
                    sender_verify |= (self.operator_set.is_member(self.data.operators,
                                                                  current_from,
                                                                  sp.sender,
                                                                  tx.token_id))
                if self.config.allow_self_transfer:
                    sender_verify |= (sp.sender == sp.self_address)
                sp.verify(sender_verify, message = message)
                sp.verify(
                    self.data.token_metadata.contains(tx.token_id),
                    message = self.error_message.token_undefined()
                )
                # If amount is 0 we do nothing now:
                sp.if (tx.amount > 0):
                    from_user = self.ledger_key.make(current_from, tx.token_id)
                    sp.verify(
                        (self.data.ledger[from_user].balance >= tx.amount),
                        message = self.error_message.insufficient_balance())
                    to_user = self.ledger_key.make(tx.to_, tx.token_id)
                    self.data.ledger[from_user].balance = sp.as_nat(
                        self.data.ledger[from_user].balance - tx.amount)
                    sp.if self.data.ledger.contains(to_user):
                        self.data.ledger[to_user].balance += tx.amount
                    sp.else:
                         self.data.ledger[to_user] = FA2.Ledger_value.make(tx.amount)
                sp.else:
                    pass

    @sp.entry_point
    def update_operators(self, params):
        sp.set_type(params, sp.TList(
            sp.TVariant(
                add_operator = self.operator_param.get_type(),
                remove_operator = self.operator_param.get_type()
            )
        ))
        if self.config.support_operator:
            sp.for update in params:
                with update.match_cases() as arg:
                    with arg.match("add_operator") as upd:
                        # sp.verify(
                        #     (upd.owner == sp.sender) | self.is_administrator(sp.sender),
                        #     message = self.error_message.not_admin_or_operator()
                        # )
                        sp.verify(
                            (upd.owner == sp.sender),
                            message = self.error_message.not_operator()
                        )
                        self.operator_set.add(self.data.operators,
                                              upd.owner,
                                              upd.operator,
                                              upd.token_id)
                    with arg.match("remove_operator") as upd:
                        # sp.verify(
                        #     (upd.owner == sp.sender) | self.is_administrator(sp.sender),
                        #     message = self.error_message.not_admin_or_operator()
                        # )
                        sp.verify(
                            (upd.owner == sp.sender),
                            message = self.error_message.not_operator()
                        )
                        self.operator_set.remove(self.data.operators,
                                                 upd.owner,
                                                 upd.operator,
                                                 upd.token_id)
        else:
            sp.failwith(self.error_message.operators_unsupported())

    @sp.offchain_view(pure = True)
    def total_token(self):
        """Get how many tokens are in this contract."""
        sp.result(self.data.all_tokens)

    @sp.offchain_view(pure = True)
    def token_uri(self, tok):
        """Get URI of token by token ID."""
        sp.set_type(tok, sp.TNat)
        metadata = self.data.token_metadata[tok]
        uri = metadata.token_info
        args = ""
        sp.result(uri[args])
    
    @sp.offchain_view(pure = True)
    def administrator(self):
        """Get administrator in this contract."""
        sp.result(self.data.administrator)

    @sp.offchain_view(pure = True)
    def is_admin(self, sender):
        """Ask sender is administrator in this contract."""
        sp.set_type(sender, sp.TAddress)
        sp.result(sender == self.data.administrator)

    @sp.offchain_view(pure = True)
    def does_token_exist(self, tok):
        "Ask whether a token ID is exists."
        sp.set_type(tok, sp.TNat)
        sp.result(self.data.token_metadata.contains(tok))

    @sp.offchain_view(pure = True)
    def is_operator(self, query):
        """Ask sender is operator of token ID."""
        sp.set_type(query,
                    sp.TRecord(token_id = sp.TNat,
                               owner = sp.TAddress,
                               operator = sp.TAddress).layout(
                                   ("owner", ("operator", "token_id"))))
        sp.result(
            self.operator_set.is_member(self.data.operators,
                                        query.owner,
                                        query.operator,
                                        query.token_id)
        )

    @sp.offchain_view(pure = True)
    def is_owner(self, user):
        """Ask user is owner of token ID."""
        # sp.set_type(user, sp.TPair)
        sp.if self.data.ledger.contains(user):
            sp.result(self.data.ledger[user].balance)
        sp.else:
            sp.result(0)
    
sp.add_compilation_target(
    "FA2_Non_Fungible_Token",
    DocumentNFT(
        admin   = FA2_admin,
        config  = FA2.FA2_config(
            non_fungible = True, 
            use_token_metadata_offchain_view = True
        ),
        metadata = sp.utils.metadata_of_url(
            "https://gateway.pinata.cloud/ipfs/"
        )
    )
)


@sp.add_target(name="FA2 non-fungible tokens", kind="origination")
def origin():
    sc = sp.test_scenario()
    sc.table_of_contents()

    documentNFT = DocumentNFT(
        FA2.FA2_config(
            non_fungible = True, 
            use_token_metadata_offchain_view = True
        ),
        admin = FA2_admin,
        metadata = sp.utils.metadata_of_url(
            "https://gateway.pinata.cloud/ipfs/QmXe4VXeZGuwbPvWxZYuUVRPjbysGzJUNE8Y6UuVzP6QP4"
        )
    )
    sc += documentNFT

@sp.add_test(name="test function")
def test():
    admin = sp.test_account("Admin")
    newAdmin = sp.test_account("NewAdmin")
    user1 = sp.test_account("User1")
    user2 = sp.test_account("User2")
    operatorUser1 = sp.test_account("OperatorUser1")
    operatorUser2 = sp.test_account("OperatorUser2")
    
    tok1 = 0
    tok2 = 1
    amount = 1
    existed = True

    # init
    sc = sp.test_scenario()
    sc.table_of_contents()

    documentNFT = DocumentNFT(
        FA2.FA2_config(
            non_fungible = True,
            use_token_metadata_offchain_view= True
        ),
        admin= admin.address,
        metadata= sp.utils.metadata_of_url(
            "https://gateway.pinata.cloud/ipfs/"
        )
    )
    sc += documentNFT

    # mint NFT
    bytes_metadata = sp.utils.bytes_of_string(
        "ipfs://QmURZgvNk5svhpVx5pTtdCeNHvttCcE5vtKGooufNiqucN")
    metadata = sp.map(l = {"" : bytes_metadata}, tkey = sp.TString, tvalue = sp.TBytes)

    documentNFT.mint(
        address = user1.address,
        metadata = metadata
        ).run(sender=admin.address)
    
    documentNFT.mint(
        address = user2.address,
        metadata = metadata
        ).run(sender=admin.address)

    # mint_batch
    documentNFT.mint_batch([
        sp.record(
            address = documentNFT.address,
            metadata = metadata
        ),
        sp.record(
            address = documentNFT.address,
            metadata = metadata
        ),
        ]).run(sender=admin.address)
    # claim
    documentNFT.claim([
            documentNFT.batch_transfer.item(from_ = documentNFT.address,
                                txs = [
                                    sp.record(to_ = user1.address,
                                                amount = 1,
                                                token_id = 2),
                                    sp.record(to_ = user2.address,
                                                amount = 1,
                                                token_id = 3)])
        ]).run(sender=admin.address)
    # add_operator
    documentNFT.update_operators([
            sp.variant("add_operator", documentNFT.operator_param.make(
                owner = user1.address,
                operator = operatorUser1.address,
                token_id = tok1))
        ]).run(sender=user1.address)  
    # check is_operator
    a = sp.record(
            owner = user1.address,
            operator = operatorUser1.address,
            token_id = tok1 )
    sc.verify(
        documentNFT.is_operator(a) == True)
    
    # transfer : from owner
    documentNFT.transfer([
            documentNFT.batch_transfer.item(from_ = user2.address,
                                txs = [
                                    sp.record(to_ = user1.address,
                                                amount = 1,
                                                token_id = 1),
                                    sp.record(to_ = user1.address,
                                                amount = 1,
                                                token_id = 3)])
        ]).run(sender=user2.address)

    # transfer : from operator
    documentNFT.transfer([
            documentNFT.batch_transfer.item(from_ = user1.address,
                                txs = [
                                    sp.record(to_ = user2.address,
                                                amount = 1,
                                                token_id = 0)])
        ]).run(sender=operatorUser1.address)

    # remove_operator
    documentNFT.update_operators([
            sp.variant("remove_operator", documentNFT.operator_param.make(
                owner = user1.address,
                operator = operatorUser1.address,
                token_id = tok1))
        ]).run(sender=user1.address)  
    # check is_operator
    a = sp.record(
            owner = user1.address,
            operator = operatorUser1.address,
            token_id = tok1 )
    sc.verify(
        documentNFT.is_operator(a) == False)

    # check administrator
    sc.verify(documentNFT.administrator() == admin.address)
    # check is_admin
    sc.verify(documentNFT.is_admin(admin.address) == existed)
    # check is_owner: owner of NFT
    user1_tok1 = sp.pair(user1.address, tok1)
    sc.verify(documentNFT.is_owner(user1_tok1) == 0)
    user2_tok2 = sp.pair(user2.address, tok2)
    sc.verify(documentNFT.is_owner(user2_tok2) == 0)
    # check does_token_exist
    sc.verify(documentNFT.does_token_exist(tok1) == existed)
    # check token_uri
    sc.verify(documentNFT.token_uri(tok1) == bytes_metadata)
    # check total_token
    sc.verify(documentNFT.total_token() == 4)


@sp.add_test(name="test admin")
def test():
    admin = sp.test_account("Admin")
    newAdmin = sp.test_account("NewAdmin")
    user1 = sp.test_account("User1")
    user2 = sp.test_account("User2")
    operatorUser1 = sp.test_account("OperatorUser1")
    operatorUser2 = sp.test_account("OperatorUser2")
    
    # init
    sc = sp.test_scenario()
    sc.table_of_contents()

    documentNFT = DocumentNFT(
        FA2.FA2_config(
            non_fungible = True,
            use_token_metadata_offchain_view= True
        ),
        admin= admin.address,
        metadata= sp.utils.metadata_of_url(
            "https://gateway.pinata.cloud/ipfs/"
        )
    )
    sc += documentNFT
    # check admin
    sc.verify(documentNFT.administrator() == admin.address)

    # transferAdmin
    documentNFT.set_administrator(newAdmin.address).run(sender=admin.address)
    sc.verify(documentNFT.administrator() == newAdmin.address)

    # # test case 
    # # check not admin cannot transferAdmin
    # documentNFT.set_administrator(user1.address).run(sender=admin.address)


    # # test case 
    # # check when pause, admin cannot mint
    # documentNFT.set_pause(True).run(sender=newAdmin.address)

    # mint NFT
    bytes_metadata = sp.utils.bytes_of_string(
        "ipfs://QmURZgvNk5svhpVx5pTtdCeNHvttCcE5vtKGooufNiqucN")
    metadata = sp.map(l = {"" : bytes_metadata}, tkey = sp.TString, tvalue = sp.TBytes)

    documentNFT.mint(
        address = user1.address,
        metadata = metadata
        ).run(sender=newAdmin.address)
    
    documentNFT.mint(
        address = user2.address,
        metadata = metadata
        ).run(sender=newAdmin.address)


    user1_tok1 = sp.pair(user1.address, 0)
    sc.verify(documentNFT.is_owner(user1_tok1) == 1)
    user2_tok2 = sp.pair(user2.address, 1)
    sc.verify(documentNFT.is_owner(user2_tok2) == 1)

    # # test case 
    # # check admin cannot transfer NFT
    # documentNFT.transfer([
    #         documentNFT.batch_transfer.item(from_ = user1.address,
    #                             txs = [
    #                                 sp.record(to_ = user2.address,
    #                                             amount = 1,
    #                                             token_id = 0),
    #                                 sp.record(to_ = user2.address,
    #                                             amount = 1,
    #                                             token_id = 1)])
    #     ]).run(sender=newAdmin.address)


    # # test case 
    # # check admin cannot approve NFT: grant operator
    # documentNFT.update_operators([
    #             sp.variant("add_operator", documentNFT.operator_param.make(
    #                 owner = user1.address,
    #                 operator = operatorUser1.address,
    #                 token_id = 0)),
    #             sp.variant("add_operator", documentNFT.operator_param.make(
    #                 owner = user2.address,
    #                 operator = operatorUser2.address,
    #                 token_id = 1))
    #         ]).run(sender=newAdmin.address)   

 


