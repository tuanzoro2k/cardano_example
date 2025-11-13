use aiken/crypto.{ScriptHash, VerificationKeyHash}
use cardano/address.{Address}
use cardano/addresses
use cardano/assets.{AssetName, PolicyId, without_lovelace}
use cardano/minting
use cardano/transaction.{Transaction}
use cardano/tx as signing
use core/types.{BurnTokens, MintRedeemer, MintTokens}
use types/cip68.{CIP68}
use validation/find
use core/common.{check_asset_mint}
use cardano/assets.{from_lovelace,from_asset}
use cardano/address.{from_script,from_verification_key}
use aiken/primitive/bytearray
use aiken/builtin

use mocktail.{complete, mocktail_tx, required_signer_hash, tx_out,tx_out_inline_datum, tx_in,mint as mint_test}
use mocktail/virgin_key_hash.{mock_pub_key_hash,mock_script_hash,mock_policy_id}
use mocktail/virgin_output_reference.{mock_tx_hash}
use mocktail/virgin_address.{mock_script_address}



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
    let Transaction { outputs, extra_signatories, mint, .. } =
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
      BurnTokens -> and {
          // cornucopias must sign it
           signing.verify_signature(extra_signatories, hot_key)?,
          // // this allows optional burning of either or both
          or {
           
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

test mint_success() { 
 
  // mock address of script

  let hot_key = mock_pub_key_hash(1)

  let cip68_hash = mock_script_hash(2)

 let script_addr = from_script(cip68_hash)

 let hot_key_address = from_verification_key(hot_key)

//  let datum = mock_datum(
//    "Test Asset",
//    "ipfs://QmTestImageHash",
//     "This is a test asset",
//     1
//   )
   let cip68_datum = CIP68 {
    metadata: [
      builtin.new_pair(
      builtin.b_data("name"),
      builtin.b_data("Test Asset")
    ),
    builtin.new_pair(
      builtin.b_data("image"),
      builtin.b_data("ipfs://QmTestImageHash")
    ),
    builtin.new_pair(
      builtin.b_data("description"),
      builtin.b_data("This is a test asset")
    ),
    ],
    version: 1,
  }
  // build base tx
  let tx =
    mocktail_tx()
    |> required_signer_hash(True, hot_key)
       |> tx_in(True, mock_tx_hash(0), 0, from_lovelace(5_000_000), hot_key_address)
       |> mint_test(
         True,
         1,
          mock_policy_id(0),
          bytearray.concat(cip68.prefix_100, "test"),
       )
         |> mint_test(
            True,
            1,
            mock_policy_id(0),
            bytearray.concat(cip68.prefix_222, "test"),
         )
        |> tx_out(
          True,
          script_addr,
           from_asset(
             mock_policy_id(0),
             bytearray.concat(cip68.prefix_100, "test"),
            1,
          )
        )
        |> tx_out(
          True,
          hot_key_address,
           from_asset(
             mock_policy_id(0),
             bytearray.concat(cip68.prefix_222, "test"),
            1,
          )
        )
        |> tx_out_inline_datum(
          True,
          cip68_datum
        )
      |> complete()
    let redeemer = MintRedeemer.MintTokens
    mint.mint(hot_key, cip68_hash,redeemer,mock_policy_id(0),tx)
}
