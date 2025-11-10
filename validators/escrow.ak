use aiken/crypto.{VerificationKeyHash}

use cardano/transaction.{Transaction, OutputReference,find_input}
use cardano/transaction.{Output,Input,InlineDatum}
use cardano/assets.{lovelace_of,from_lovelace}
use core/common.{is_signed_by}
use core/types.{Datum, ContractState, Redeemer}
use cardano/address.{from_verification_key}

use vodka_outputs.{outputs_at}
use vodka_inputs.{inputs_at}

use mocktail.{complete, mocktail_tx, required_signer_hash, tx_out,tx_out_inline_datum, tx_in, tx_in_inline_datum}
use mocktail/virgin_key_hash.{mock_pub_key_hash}
use mocktail/virgin_output_reference.{mock_utxo_ref, mock_tx_hash}
use mocktail/virgin_address.{mock_script_address}

validator escrow {
    spend(
        _datum_opt: Option<Datum>,
        redeemer: Redeemer,
        ref: OutputReference,
        tx: Transaction
    ) -> Bool {
                let Transaction { inputs, outputs,.. } = tx
                expect Some(own_input) = find_input(inputs, ref)
                let own_address = own_input.output.address
                trace own_address
                when redeemer is {
                    Redeemer.ApprovePayment -> {
                        expect ([input], []) = (inputs_at(inputs, own_address),  outputs_at(outputs, own_address))
                        expect InlineDatum(raw_input_datum) = input.output.datum
                        expect input_datum: Datum = raw_input_datum
                        expect input_datum.state == ContractState.Funded
                        expect lovelace_of(input.output.value) >= input_datum.payment_amount
                        let must_be_signed = is_signed_by(tx, input_datum.aladin)
                        must_be_signed
                    }
                }

            }
        }

// test create_success() { 
 
//   // mock address of script
//   let script_addr = mock_script_address(0, None)

//   // create datum for contract
//   let datum = mock_datum(
//     mock_pub_key_hash(1),
//     mock_pub_key_hash(2),
//     ContractState.Funded,
//     2_000_000,
//   )

//   // reference to current UTXO being spent
//   let utxo_ref = mock_utxo_ref(0, 1)

//   // build base tx
//   let tx =
//     mocktail_tx()
//     |> required_signer_hash(True, mock_pub_key_hash(1))
//        |> tx_in(True, mock_tx_hash(0), 1, from_lovelace(2_000_000), script_addr)
//     |> tx_in_inline_datum(True, datum)
//     |> tx_out(True,script_addr, from_lovelace(2_000_000)) 
//     |> tx_out_inline_datum(
//         True,
//         datum,
//       )
//       |> complete()
//   let redeemer = Redeemer.Fund

//    escrow.spend(Some(datum), redeemer, utxo_ref, tx)
// }

test approve_payment_success() { 
 
  // mock address of script
  let script_addr = mock_script_address(0, None)

  // create datum for contract
  let datum = mock_datum(
    mock_pub_key_hash(1),
    mock_pub_key_hash(2),
    ContractState.Funded,
    2_000_000,
  )

  // reference to current UTXO being spent
  let utxo_ref = mock_utxo_ref(0, 1)

  // build base tx
  let tx =
    mocktail_tx()
    |> required_signer_hash(True, mock_pub_key_hash(1))
       |> tx_in(True, mock_tx_hash(0), 1, from_lovelace(2_000_000), script_addr)
    |> tx_in_inline_datum(True, datum)
    |> tx_out(True,from_verification_key(datum.genie), from_lovelace(2_000_000))
      |> complete()
  let redeemer = Redeemer.ApprovePayment

   escrow.spend(Some(datum), redeemer, utxo_ref, tx)
}

fn mock_datum(
    aladin: VerificationKeyHash,
    genie: VerificationKeyHash,
    state: ContractState,
    payment_amount: Int,
) -> Datum {
    Datum {
        aladin: aladin,
        genie: genie,
        payment_amount: payment_amount,
        state: state,
    }
}


