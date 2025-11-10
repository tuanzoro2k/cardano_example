import {
  deserializeAddress,
  serializePlutusScript,
  UTxO,
  mConStr0,
  Asset,
  BlockfrostProvider,
  MeshTxBuilder,
  MeshWallet,
} from "@meshsdk/core";
import blueprint from "../../plutus.json";

import { applyParamsToScript } from "@meshsdk/core-cst";
import { MeshTxInitiator, MeshTxInitiatorInput } from "../core/transaction-builder";

export class EscrowContract extends MeshTxInitiator {
  scriptCbor: string;
  scriptAddress: string;

  constructor(inputs: MeshTxInitiatorInput) {
    super(inputs);
    this.scriptCbor = this.getScriptCbor();
    this.scriptAddress = this.getScriptAddress(this.scriptCbor);
  }

  getScriptCbor = () => {
    const escrowValidator = blueprint.validators.find(v => v.title === "escrow.escrow.spend");
    return applyParamsToScript(escrowValidator.compiledCode, []);
  };

  getScriptAddress = (scriptCbor: string) => {
    return serializePlutusScript(
      { code: scriptCbor, version: "V3" },
      undefined,
      0
    ).address;
  }

  getWalletInfoForTx = async () => {
    const utxos = await this.wallet?.getUtxos();
    const collateral = await this.getWalletCollateral();
    const walletAddress = await this.getWalletDappAddress();
    if (!utxos || utxos?.length === 0) {
      throw new Error("No utxos found");
    }
    if (!collateral) {
      throw new Error("No collateral found");
    }
    if (!walletAddress) {
      throw new Error("No wallet address found");
    }
    return { utxos, collateral, walletAddress };
  }

  getWalletCollateral = async (): Promise<UTxO> => {
    if (this.wallet) {
      const utxos = await this.wallet.getCollateral();
      return utxos[0];
    }
    throw new Error("No wallet collateral found");
  };

  getWalletDappAddress = async () => {
    if (this.wallet) {
      const usedAddresses = await this.wallet.getUsedAddresses();
      if (usedAddresses.length > 0) {
        return usedAddresses[0];
      }
      const unusedAddresses = await this.wallet.getUnusedAddresses();
      if (unusedAddresses.length > 0) {
        return unusedAddresses[0];
      }
    }
    return "";
  };
  getUtxoByTxHash = async (txHash: string) => {
    const utxos = await this.fetcher?.fetchUTxOs(txHash);
    if (utxos.length === 0) {
      throw new Error("UTxO not found");
    }
    return utxos[0];
  }

  createJobAndFund = async (escrowAmount: Asset[], genieAddress: string) => {
    const { utxos, walletAddress: aladinAddress } = await this.getWalletInfoForTx();
    const { pubKeyHash: geniePubKeyHash } = deserializeAddress(
      genieAddress
    );
    const { pubKeyHash: aladinPubKeyHash } = deserializeAddress(
      aladinAddress
    );
    const datum = mConStr0([aladinPubKeyHash, geniePubKeyHash, Number(escrowAmount[0].quantity), mConStr0([])]);
    await this.mesh
      .txOut(this.scriptAddress, escrowAmount)
      .txOutInlineDatumValue(datum)
      .changeAddress(aladinAddress)
      .selectUtxosFrom(utxos)
      .complete();

    return this.mesh.txHex;
  }

  payJobAndWithdraw = async (txHash: string, genieAddress: string) => {
    const { utxos, walletAddress: aladinAddress } = await this.getWalletInfoForTx();
    const scriptUtxo = await this.getUtxoByTxHash(txHash);
    const { pubKeyHash: aladinPubKeyHash } = deserializeAddress(
      aladinAddress
    );
    const collateral = await this.getWalletCollateral();
    await this.mesh
      .spendingPlutusScript("V3")
      .txIn(scriptUtxo.input.txHash, scriptUtxo.input.outputIndex, scriptUtxo.output.amount, this.scriptAddress)
      .spendingReferenceTxInInlineDatumPresent()
      .spendingReferenceTxInRedeemerValue(mConStr0([]))
      .txInScript(this.scriptCbor)
      .txOut(genieAddress, scriptUtxo.output.amount)
      .txInCollateral(
        collateral.input.txHash,
        collateral.input.outputIndex,
        collateral.output.amount,
        collateral.output.address
      )
      .changeAddress(aladinAddress)
      .requiredSignerHash(aladinPubKeyHash)
      .selectUtxosFrom(utxos)
      .complete();
    return this.mesh.txHex;
  }
}
async function main() {
  const provider = new BlockfrostProvider("previewj8GkcM7jDTBVmv2gTMXzgtKwHMv4M0rb");

  const meshTxBuilder = new MeshTxBuilder({
    fetcher: provider,
    submitter: provider,
  });
  const wallet = new MeshWallet({
    networkId: 0,
    fetcher: provider,
    submitter: provider,
    key: {
      type: "mnemonic",
      words: ["copper point yellow output length usual depth true merge local aisle human live agree gas absent yellow satisfy claim radio foam addict quantum column"],
    },
  });
  const contract = new EscrowContract({
    mesh: meshTxBuilder,
    fetcher: provider,
    wallet: wallet,
    networkId: 0,
  });
  const { utxos, walletAddress: aladinAddress } = await contract.getWalletInfoForTx();
  const geniePubKeyHash = "somepubkeyhash";
  const { pubKeyHash: aladinPubKeyHash } = deserializeAddress(
    aladinAddress
  );
  const datum = mConStr0([aladinPubKeyHash, geniePubKeyHash, Number(1), mConStr0([])]);
  console.log(datum)
}
main()