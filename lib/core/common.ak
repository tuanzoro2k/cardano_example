use cardano/transaction.{Transaction}
use aiken/crypto.{VerificationKeyHash}
use aiken/collection/list


pub fn is_signed_by(tx: Transaction, hash: VerificationKeyHash) -> Bool {
    list.has(tx.extra_signatories, hash)
}