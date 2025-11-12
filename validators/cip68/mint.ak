use aiken/crypto.{ScriptHash, VerificationKeyHash}
use cardano/address.{Address}
use cardano/addresses
use cardano/assets.{AssetName, PolicyId, without_lovelace}
use cardano/minting
use cardano/transaction.{Transaction, TransactionId}
use cardano/tx as signing
use cardano/value
use core/types.{BurnTokens, MintRedeemer, MintTokens}
use types/cip68.{CIP68}
use validation/find
use validation/payout
use core/common.{is_signed_by,check_asset_mint}


// This allows a hot key to mint 1 reference and 1 nft for a cip 68 token or
// the hot key may be either the reference or nft.
validator mint(
  // this key controls everything
  hot_key: VerificationKeyHash,
  // the cip 68 and stake data
  cip68_hash: ScriptHash,
) {
  mint(
    redeemer: MintRedeemer,
    currency_symbol: PolicyId,
    transaction: Transaction,
  ) {
    // this transaction
    let Transaction { inputs, outputs, extra_signatories, mint, .. } =
      transaction
    // the minted value from the tx
    let mint: List<(PolicyId, AssetName, Int)> =
      mint
        |> without_lovelace()
        |> assets.flatten()
    // mint only
    when redeemer is {
      MintTokens -> {
        // // cip68 address know at compile time
        let cip68_addr: Address =
          addresses.create_script_address(cip68_hash, #"")
        // this should prevent utxos without cip68 datum to go to the cip68 storage contract
        // This Forces An Inline Datum!
        expect _: CIP68 = find.output_datum_by_addr(outputs, cip68_addr)
        
        and {
          // cornucopias must sign it
          signing.verify_signature(extra_signatories, hot_key)?,
          // must mint 1 reference token
          check_asset_mint(
            mint,
            currency_symbol,
            cip68.prefix_100,
            cip68.prefix_222,
            outputs,
            cip68_addr,
          )?,
        }
      }
      // burn the ref or the nft or both at the same time
      BurnTokens -> {
          // cornucopias must sign it
          // // this allows optional burning of either or both
          or {
            signing.verify_signature(extra_signatories, hot_key)?,
            // burn only 1 ref token
            minting.by_prefix(mint, currency_symbol, cip68.prefix_100, -1)?,
            // burn only 1 nft
            minting.by_prefix(mint, currency_symbol, cip68.prefix_222, -1)?,
          }?,
        }
    }
  }

  else(_) {
    fail
  }
}