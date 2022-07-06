const documentStoreScillaSourceCode = `scilla_version 0

(***************************************************)
(*               Associated library                *)
(***************************************************)

import BoolUtils

library DocumentStore

(* Global variables *)

let zero = Uint128 0

(* Library functions *)

let one_msg =
  fun (msg : Message) =>
  let nil_msg = Nil {Message} in
  Cons {Message} msg nil_msg

let block_le =
  fun (bnum_1 : BNum) =>
  fun (bnum_2 : BNum) =>
    let bc1 = builtin blt bnum_1 bnum_2 in
    let bc2 = builtin eq bnum_1 bnum_2 in
    orb bc1 bc2

(* Error exception *)

type Error =
  | CodeNotOwner
  | CodeNotIssued
  | CodeNotRevoked
  | CodeAlreadyIssued
  | CodeAlreadyRevoked

let make_error =
  fun (result : Error) =>
    let result_code =
      match result with
      | CodeNotOwner       => Int32 -1
      | CodeNotIssued      => Int32 -2
      | CodeNotRevoked     => Int32 -3
      | CodeAlreadyIssued  => Int32 -4
      | CodeAlreadyRevoked => Int32 -5
      end
    in
    { _exception : "Error"; code : result_code }


(***************************************************)
(*             The contract definition             *)
(***************************************************)

contract DocumentStore
(
  contract_owner: ByStr20,
  name: String,
  version: String
)

(* Mutable fields *)

(* A mapping of the document hash to the block number that was issued *)
field document_issued : Map ByStr32 BNum = Emp ByStr32 BNum

(* A mapping of the hash of the claim being revoked to the revocation block number *)
field document_revoked : Map ByStr32 BNum = Emp ByStr32 BNum

(* Emit Errors *)
procedure ThrowError(err : Error)
  e = make_error err;
  throw e
end

procedure IsOwner(address: ByStr20)
  is_owner = builtin eq address contract_owner;
  match is_owner with
  | False =>
    err = CodeNotOwner;
    ThrowError err
  | True =>
  end
end

procedure IssueDocument(document: ByStr32)
  IsOwner _sender;
  is_issued <- exists document_issued[document];
  match is_issued with
  | True =>
    err = CodeAlreadyIssued;
    ThrowError err
  | False =>
    current_block_number <- & BLOCKNUMBER;
    document_issued[document] := current_block_number;
    e = {_eventname: "DocumentIssued"; document: document; block_num: current_block_number};
    event e;
    msg_to_sender = {_tag : "DocumentIssuedCallBack"; _recipient : _sender; _amount : zero;
                    document: document; block_num: current_block_number};
    msgs = one_msg msg_to_sender;
    send msgs
  end
end

procedure RevokeDocument(document: ByStr32)
  IsOwner _sender;
  is_revoked <- exists document_revoked[document];
  match is_revoked with
  | True =>
    err = CodeAlreadyRevoked;
    ThrowError err
  | False =>
    current_block_number <- & BLOCKNUMBER;
    document_revoked[document] := current_block_number;
    e = {_eventname: "DocumentRevoked"; document: document; block_num: current_block_number};
    event e;
    msg_to_sender = {_tag : "DocumentRevokedCallBack"; _recipient : _sender; _amount : zero;
                    document: document; block_num: current_block_number};
    msgs = one_msg msg_to_sender;
    send msgs
  end
end

(* Interface transitions *)
transition Issue(document: ByStr32)
  IssueDocument document
end

transition Revoke(document: ByStr32)
  RevokeDocument document
end

transition BulkIssue(documents: List ByStr32)
  forall documents IssueDocument
end

transition BulkRevoke(documents: List ByStr32)
  forall documents RevokeDocument
end

(* Getter transitions *)

transition GetIssuedBlock(document: ByStr32)
  get_issued_bnum <- document_issued[document];
  match get_issued_bnum with
  | None =>
    err = CodeNotIssued;
    ThrowError err
  | Some issued_bnum =>
    msg_to_sender = {_tag : "GetIssuedBlockCallBack"; _recipient : _sender; _amount : zero;
                    issued_bnum: issued_bnum};
    msgs = one_msg msg_to_sender;
    send msgs
  end
end

transition IsIssued(document: ByStr32)
  is_issued <- exists document_issued[document];
  msg_to_sender = {_tag : "IsIssuedCallBack"; _recipient : _sender; _amount : zero;
                    is_issued: is_issued};
  msgs = one_msg msg_to_sender;
  send msgs
end

transition IsIssuedBefore(document: ByStr32, block_number: BNum)
  get_issued_bnum <- document_issued[document];
  match get_issued_bnum with
  | None =>
    err = CodeNotIssued;
    ThrowError err
  | Some issued_bnum =>
    is_issued_before = block_le issued_bnum block_number;
    msg_to_sender = {_tag : "IsIssuedBeforeCallBack"; _recipient : _sender; _amount : zero;
                    is_issued_before: is_issued_before};
    msgs = one_msg msg_to_sender;
    send msgs
  end
end

transition IsRevoked(document: ByStr32)
  is_revoked <- exists document_revoked[document];
  msg_to_sender = {_tag : "IsRevokedCallBack"; _recipient : _sender; _amount : zero;
                    is_revoked: is_revoked};
  msgs = one_msg msg_to_sender;
  send msgs
end

transition IsRevokedBefore(document: ByStr32, block_number: BNum)
  get_revoked_bnum <- document_revoked[document];
  match get_revoked_bnum with
  | None =>
    err = CodeNotRevoked;
    ThrowError err
  | Some revoked_bnum =>
    is_revoked_before = block_le revoked_bnum block_number;
    msg_to_sender = {_tag : "IsRevokedBeforeCallBack"; _recipient : _sender; _amount : zero;
                    is_revoked_before: is_revoked_before};
    msgs = one_msg msg_to_sender;
    send msgs
  end
end`;

export default documentStoreScillaSourceCode;
