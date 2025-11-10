import {
    BlockfrostProvider,
    CIP68_100,
    CIP68_222,
    deserializeAddress,
    mConStr,
    mConStr0,
    MeshTxBuilder,
    MeshWallet,
    metadataToCip68,
    resolveScriptHash,
    serializePlutusScript,
    stringToHex,
    UTxO,
} from "@meshsdk/core";
import blueprint from "../../plutus.json";

import { applyParamsToScript } from "@meshsdk/core";
import { MeshTxInitiator, MeshTxInitiatorInput } from "../core/transaction-builder";
import dotenv from "dotenv";
dotenv.config();

// type MeshData =
//   | number
//   | string
//   | MeshData[]
//   | { type: "Map"; entries: [MeshData, MeshData][] }
//   | { type: "Mesh"; content: { alternative: number; fields: MeshData[] } };

// export const metadataToCip68 = (metadata: any): MeshData => {
//   if (metadata === null || metadata === undefined) {
//     throw new Error("Invalid metadata value");
//   }

//   // Arrays -> convert recursively
//   if (Array.isArray(metadata)) {
//     return metadata.map((item) => metadataToCip68(item));
//   }

//   // Objects -> convert to Map
//   if (typeof metadata === "object") {
//     const entries: [MeshData, MeshData][] = Object.entries(metadata).map(
//       ([key, value]) => [
//         { type: "Bytes", content: key },       // keys as bytes
//         metadataToCip68(value),               // recursive conversion
//       ]
//     );
//     return { type: "Map", entries };
//   }

//   // Strings -> encode as bytes
//   if (typeof metadata === "string") {
//     return { type: "Bytes", content: metadata };
//   }

//   // Numbers -> keep as-is
//   if (typeof metadata === "number" || typeof metadata === "bigint") {
//     return metadata;
//   }

//   throw new Error(`Unsupported metadata type: ${typeof metadata}`);
// };

export class MintContract extends MeshTxInitiator {
    scriptCbor: string;
    scriptStoreCbor: string;
    scriptAddress: string;
    scriptStoreAddress: string;

    policyId: string;
    constructor(inputs: MeshTxInitiatorInput) {
        super(inputs);
        this.scriptCbor = this.getScriptCbor();
        this.scriptStoreCbor = this.getScriptStoreCbor();
        this.scriptAddress = this.getScriptAddress(this.scriptCbor);
        this.scriptStoreAddress = this.getStoreAddress(this.scriptStoreCbor);
        this.policyId = resolveScriptHash(this.scriptCbor, "V3")
    }

    getScriptCbor = () => {
        const mintValidator = blueprint.validators.find(v => v.title === "cip68/mint.mint.mint");
        return applyParamsToScript(mintValidator.compiledCode, []);
    };

    getScriptStoreCbor = () => {
        const storeValidator = blueprint.validators.find(v => v.title === "cip68/store.store.spend");
        return applyParamsToScript(storeValidator.compiledCode, []);
    }

    getScriptAddress = (scriptCbor: string) => {
        return serializePlutusScript(
            { code: scriptCbor, version: "V3" },
            undefined,
            0
        ).address;
    }

    getStoreAddress = (scriptStoreCbor: string) => {
        return serializePlutusScript(
            { code: scriptStoreCbor, version: "V3" },
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

    getAddressUTXOAsset = async (address: string, unit: string) => {
        const utxos = await this.fetcher?.fetchAddressUTxOs(address, unit);
        if (!utxos || utxos.length === 0) {
            throw new Error("No UTxO found for the given asset at the address");
        }
        return utxos[utxos.length - 1];
    };

    mint = async (params: { assetName: string; metadata: Record<string, string>; quantity: string; receiver: string; }, utxosInput?: UTxO[],) => {
        const { utxos, walletAddress, collateral } = await this.getWalletInfoForTx();
        // if (utxosInput != null && utxosInput != undefined && Array.isArray(utxosInput)) {
        //     utxosInput.forEach((utxo) => {
        //         unsignedTx.txIn(utxo.input.txHash, utxo.input.outputIndex);
        //     });
        // }
        const datum = metadataToCip68(params.metadata);
        console.log(datum);

        // const metadataEntries = Object.entries(params.metadata).map(([key, value]) => [
        //     stringToHex(key),
        //     stringToHex(value)
        // ]);

        // const cip68Datum = mConStr(0, [
        //     metadataEntries,  // metadata as array of [key, value] pairs
        //     1,                // version
        //     []                // extra (empty list)
        // ]);

        await this.mesh.txIn(utxos[0]?.input.txHash!,
            utxos[0]?.input.outputIndex!,
            utxos[0]?.output.amount!,
            utxos[0]?.output.address!)

            .mintPlutusScriptV3()
            .mint("1", this.policyId, CIP68_222(stringToHex(params.assetName)))
            .mintingScript(this.scriptCbor)
            .mintRedeemerValue(mConStr0([]))
            .mintPlutusScriptV3()
            .mint("1", this.policyId, CIP68_100(stringToHex(params.assetName)))
            .mintingScript(this.scriptCbor)
            .mintRedeemerValue(mConStr0([]))
            .txOut(this.scriptStoreAddress, [
                {
                    unit: this.policyId + CIP68_100(stringToHex(params.assetName)),
                    quantity: "1",
                },
            ])
            .txOutInlineDatumValue(datum)
            .changeAddress(walletAddress)
            .selectUtxosFrom(utxos)
            .requiredSignerHash(deserializeAddress(walletAddress).pubKeyHash)
            .txInCollateral(collateral.input.txHash, collateral.input.outputIndex, collateral.output.amount, collateral.output.address)
            .complete();
        return this.mesh.txHex
    }
}

async function main() {
    const assets =
    {
        assetName: "1hcd11",
        quantity: "1",
        receiver: "addr_test1qzr058he2g4ulqn7pd0xjeejkaa2kmf5ak6aa9psqtycc98y7tj6wypp0ezp257naukqyd6026r32dfzq79anlnf0pes7n99lf",
        metadata: {
            name: "hcd #009",
            image: "ipfs://QmQK3ZfKnwg772ZUhSodoyaqTMPazG2Ni3V4ydifYaYzdV",
            mediaType: "image/png",
            description: "Hello world - CIP68",
        },
    }

    const provider = new BlockfrostProvider(process.env.BLOCKFROST_API_KEY ? process.env.BLOCKFROST_API_KEY : "");

    const meshTxBuilder = new MeshTxBuilder({
        fetcher: provider,
        verbose: true,
    });
    const wallet = new MeshWallet({
        networkId: 0,
        fetcher: provider,
        submitter: provider,
        key: {
            type: "mnemonic",
            words: [process.env.MNEMONIC ? process.env.MNEMONIC : ""],
        },
    });
    const contract = new MintContract({
        mesh: meshTxBuilder,
        fetcher: provider,
        wallet: wallet,
        networkId: 0,
    });
    const unsignedTx = await contract.mint(assets);
    const signedTx = await wallet.signTx(unsignedTx, true);
    const txHash = await wallet.submitTx(signedTx);
    console.log("https://preview.cexplorer.io/tx/" + txHash);
}
main()