use aiken/crypto.{VerificationKeyHash}
use cardano/address.{Address}
use cardano/transaction.{Input, OutputReference, Transaction}
use cardano/tx as signing
use core/types.{CIP68Redeemer, RemoveMeta, UpdateMeta}
use types/cip68.{CIP68}
use validation/count
use validation/find
use cardano/assets.{from_lovelace,from_asset}
use cardano/address.{from_script,from_verification_key}
use aiken/primitive/bytearray
use aiken/builtin

use mocktail.{complete, mocktail_tx, required_signer_hash, tx_out,tx_out_inline_datum,tx_in_inline_datum,tx_in,mint as mint_test}
use mocktail/virgin_key_hash.{mock_pub_key_hash,mock_script_hash,mock_policy_id}
use mocktail/virgin_output_reference.{mock_tx_hash, mock_utxo_ref}
use mocktail/virgin_address.{mock_script_address}
validator store(
  // The hot key controls the metadatum
  hot_key: VerificationKeyHash,
) {
  spend(
    _datum: Option<Data>,
    redeemer: CIP68Redeemer,
    output_reference: OutputReference,
    transaction: Transaction,
  ) {
        let Transaction { inputs, outputs, extra_signatories, .. } = transaction
        let this_input: Input = find.input_by_ref(inputs, output_reference)
        let this_addr: Address = this_input.output.address
        when redeemer is {
         
          // updates the metadata 
          UpdateMeta -> {           
            // This should prevent utxos without cip68 datum to go to the cip68 storage contract
            // This Forces An Inline Datum!
            expect _: CIP68 = find.output_datum_by_addr(outputs, this_addr)

            and {
              // cornucopias must sign it
              signing.verify_signature(extra_signatories, hot_key)?,
              // single script input
              count.inputs_by_addr(inputs, this_addr, 1)?,
              // single script output
              count.outputs_by_addr(outputs, this_addr, 1)?,
            }
          }

           RemoveMeta -> and {
              // cornucopias must sign it
              signing.verify_signature(extra_signatories, hot_key)?,
              // single script input
              count.inputs_by_addr(inputs, this_addr, 1)?,
              // no script output
              count.outputs_by_addr(outputs, this_addr, 0)?,
            }
        }
      }
  }


test update_metadata_success() { 
 
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
       |> tx_in(True, mock_tx_hash(0), 0, from_lovelace(5_000_000), script_addr) //hash, index, amount, address
        |> tx_out(
          True,
          script_addr,
           from_asset(
             mock_policy_id(0),
             bytearray.concat(cip68.prefix_100, "test"), //address, amount
            1,
          )
        )
         |> tx_out_inline_datum(
          True,
          cip68_datum
        )
       
      |> complete()
    let redeemer = CIP68Redeemer.UpdateMeta
    store.spend(hot_key,None,redeemer,mock_utxo_ref(0, 0),tx)
}