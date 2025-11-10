use aiken/crypto.{VerificationKeyHash}
use cardano/address.{Address}
use cardano/transaction.{Input, OutputReference, Transaction}
use cardano/tx as signing
use core/types.{CIP68Redeemer, RemoveMeta, UpdateMeta}
use types/cip68.{CIP68}
use validation/count
use validation/find

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
