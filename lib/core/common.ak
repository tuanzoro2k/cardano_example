use cardano/transaction.{Transaction, Output}
use cardano/address.{Address}
use aiken/crypto.{VerificationKeyHash}
use aiken/collection/list
use aiken/primitive/bytearray
use cardano/assets.{AssetName, PolicyId, without_lovelace, flatten as fnflatten }
use cardano/minting
use validation/find
use types/cip68.{CIP68}


pub fn is_signed_by(tx: Transaction, hash: VerificationKeyHash) -> Bool {
    list.has(tx.extra_signatories, hash)
}

pub fn check_asset_mint(
  flatten: List<(PolicyId, AssetName, Int)>,
  policy_id: PolicyId,
  prefix100: ByteArray,
  prefix222: ByteArray,
  outputs: List<Output>,
  store_address: Address,
) -> Bool {
  // --- Find the reference and user asset from the flatten list ---

  // find CIP-68 reference (100)
  let maybe_ref = list.find(flatten, fn((pid, name, _amt)) {
    pid == policy_id && bytearray.starts_with(name, prefix100)
  })

  // find CIP-68 user (222)
  let maybe_user = list.find(flatten, fn((pid, name, _amt)) {
    pid == policy_id && bytearray.starts_with(name, prefix222)
  })

  // --- Check both exist ---
  when (maybe_ref, maybe_user) is {
    (Some((_, ref_asset_name, ref_amount)), Some((_, user_asset_name, user_amount))) -> {
    
        let reference_value =
          assets.from_asset(policy_id, ref_asset_name, 1)

        let output_utxo_store =
          find.output_by_addr_value(outputs, store_address, reference_value)
         let output_value =
    output_utxo_store.value
      |> without_lovelace()
      |> fnflatten()

        and {
          check_pair_asset_name(ref_asset_name, user_asset_name),
          minting.exact(flatten, policy_id, ref_asset_name, 1)?,
          minting.by_prefix(flatten, policy_id, cip68.prefix_100, 1),
          minting.exact(flatten, policy_id, user_asset_name, 1)?,
          minting.by_prefix(flatten, policy_id, prefix222, 1)?,
          list.length(output_value) == 1,
      }
    }
    _ -> False// If either reference or user not found
  }
}
 

pub fn check_pair_asset_name(
  reference_asset_name: AssetName,
  user_asset_name: AssetName,
) -> Bool {
  bytearray.compare(
    bytearray.drop(reference_asset_name, 4),
    bytearray.drop(user_asset_name, 4),
  ) == Equal
}