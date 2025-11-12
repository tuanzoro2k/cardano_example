import {
    BlockfrostProvider,
    CIP68_100,
    CIP68_222,
    deserializeAddress,
    mConStr0,
    mConStr1,
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

export class MintContract extends MeshTxInitiator {
    scriptCbor: string;
    scriptStoreCbor: string;
    scriptAddress: string;
    scriptStoreAddress: string;
    policyId: string;
    hotKeyHash: string;
    cip68ScriptHash: string;

    constructor(inputs: MeshTxInitiatorInput & { hotKeyHash?: string }) {
        super(inputs);

        // If hotKeyHash is provided, use it
        this.hotKeyHash = inputs.hotKeyHash || "";

        // Initialize scripts
        this.scriptStoreCbor = "";
        this.cip68ScriptHash = "";
        this.scriptCbor = "";
        this.scriptAddress = "";
        this.scriptStoreAddress = "";
        this.policyId = "";
    }

    async initialize() {
        // STEP 1: Get wallet address and extract hot key hash if not provided
        if (!this.hotKeyHash) {
            const walletAddress = await this.getWalletDappAddress();
            if (!walletAddress) {
                throw new Error("Could not get wallet address");
            }

            const addressDetails = deserializeAddress(walletAddress);
            this.hotKeyHash = addressDetails.pubKeyHash;
        }
        console.log("🔑 Hot Key Hash:", this.hotKeyHash);

        // STEP 2: Get store script CBOR (no parameters)
        this.scriptStoreCbor = this.getScriptStoreCbor();

        // STEP 3: Get store script hash
        this.cip68ScriptHash = resolveScriptHash(this.scriptStoreCbor, "V3");
        console.log("📦 CIP68 Store Script Hash:", this.cip68ScriptHash);

        // STEP 4: Apply parameters to mint script
        this.scriptCbor = this.getScriptCbor();
        console.log("📜 Mint Script CBOR length:", this.scriptCbor.length);

        // STEP 5: Calculate policy ID and addresses
        this.policyId = resolveScriptHash(this.scriptCbor, "V3");
        this.scriptAddress = this.getScriptAddress(this.scriptCbor);
        this.scriptStoreAddress = this.getStoreAddress(this.scriptStoreCbor);

        console.log("🎫 Policy ID:", this.policyId);
        console.log("📍 Mint Script Address:", this.scriptAddress);
        console.log("📍 Store Address:", this.scriptStoreAddress);

        return this;
    }

    getScriptStoreCbor = () => {
        const storeValidator = blueprint.validators.find(
            v => v.title === "cip68/store.store.spend"
        );
        if (!storeValidator) {
            throw new Error("Store validator not found in blueprint");
        }

        console.log("📄 Store validator found:", storeValidator.title);

        // Check if store validator has parameters
        const hasParams = storeValidator.parameters && storeValidator.parameters.length > 0;
        console.log("   Has parameters:", hasParams);

        // Apply empty parameters if none needed
        return applyParamsToScript(storeValidator.compiledCode, []);
    };

    getScriptCbor = () => {
        const mintValidator = blueprint.validators.find(
            v => v.title === "cip68/mint.mint.mint"
        );
        if (!mintValidator) {
            throw new Error("Mint validator not found in blueprint");
        }

        console.log("📄 Mint validator found:", mintValidator.title);
        console.log("   Parameters:", mintValidator.parameters);

        // Check the expected parameter types from blueprint
        if (mintValidator.parameters && mintValidator.parameters.length > 0) {
            console.log("   Expected parameter count:", mintValidator.parameters.length);
            mintValidator.parameters.forEach((param: any, idx: number) => {
                console.log(`   Param ${idx}: ${param.title} (${param.schema?.$ref || param.schema?.type})`);
            });
        }

        // Apply parameters in correct format
        // MeshJS expects parameters as hex strings
        const params = [
            this.hotKeyHash,      // VerificationKeyHash (already hex)
            this.cip68ScriptHash, // ScriptHash (already hex)
        ];

        console.log("   Applying parameters:");
        console.log("   - hotKeyHash:", this.hotKeyHash);
        console.log("   - cip68ScriptHash:", this.cip68ScriptHash);

        try {
            const compiled = applyParamsToScript(mintValidator.compiledCode, params);
            console.log("   ✅ Parameters applied successfully");
            return compiled;
        } catch (error) {
            console.error("   ❌ Failed to apply parameters:", error);
            throw error;
        }
    };

    getScriptAddress = (scriptCbor: string) => {
        return serializePlutusScript(
            { code: scriptCbor, version: "V3" },
            undefined,
            0
        ).address;
    };

    getStoreAddress = (scriptStoreCbor: string) => {
        return serializePlutusScript(
            { code: scriptStoreCbor, version: "V3" },
            undefined,
            0
        ).address;
    };

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
    };

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

    getStoreUtxoByTxHash = async (txHash: string) => {
        const utxos = await this.fetcher?.fetchUTxOs(txHash);
        if (!utxos || utxos.length === 0) throw new Error("No UTxOs found");

        const storeUtxo = utxos.find(
            (u) => u.output.address === this.scriptStoreAddress
        );

        if (!storeUtxo) {
            throw new Error("No store UTxO found for given txHash (must be script address)");
        }
        return storeUtxo;
    };


    mint = async (params: {
        assetName: string;
        metadata: Record<string, string>;
    }) => {
        const { utxos, walletAddress, collateral } = await this.getWalletInfoForTx();

        console.log("\n🏗️  Building transaction...");
        console.log("   Wallet:", walletAddress);
        console.log("   UTXOs available:", utxos.length);
        console.log("   First UTXO:", utxos[0]?.input.txHash);

        const datum = metadataToCip68(params.metadata);
        console.log("   Datum created");

        // Generate CIP-68 asset names
        const nftAssetName = CIP68_222(stringToHex(params.assetName));
        const refAssetName = CIP68_100(stringToHex(params.assetName));

        console.log("   NFT asset name:", nftAssetName);
        console.log("   Ref asset name:", refAssetName);

        await this.mesh
            .txIn(
                utxos[0]?.input.txHash!,
                utxos[0]?.input.outputIndex!,
                utxos[0]?.output.amount!,
                utxos[0]?.output.address!
            )
            // Mint the Reference token FIRST (important for Aiken's minting.exact checks)
            .mintPlutusScriptV3()
            .mint("1", this.policyId, refAssetName)
            .mintingScript(this.scriptCbor)
            .mintRedeemerValue(mConStr0([]))
            // Then mint the NFT
            .mintPlutusScriptV3()
            .mint("1", this.policyId, nftAssetName)
            .mintingScript(this.scriptCbor)
            .mintRedeemerValue(mConStr0([]))
            // Send reference token to store with inline datum
            .txOut(this.scriptStoreAddress, [
                {
                    unit: this.policyId + refAssetName,
                    quantity: "1",
                },
            ])
            .txOutInlineDatumValue(datum)
            // Change goes back to wallet
            .changeAddress(walletAddress)
            .selectUtxosFrom(utxos)
            // CRITICAL: Must sign with the hot key
            .requiredSignerHash(deserializeAddress(walletAddress).pubKeyHash)
            .txInCollateral(
                collateral.input.txHash,
                collateral.input.outputIndex,
                collateral.output.amount,
                collateral.output.address
            )
            .complete();

        console.log("   ✅ Transaction built successfully\n");
        return this.mesh.txHex;
    };
    burn = async (params: {
        assetName: string;
        txHash: string;
    }) => {
        const { utxos, walletAddress, collateral } = await this.getWalletInfoForTx();

        console.log("\n🏗️  Building transaction...");
        console.log("   Wallet:", walletAddress);
        console.log("   UTXOs available:", utxos.length);

        const storeUtxo = await this.getStoreUtxoByTxHash(params.txHash);
        console.log("storeUtxo:", storeUtxo.output.address);
        console.log("expected script address:", this.scriptStoreAddress);

        // Generate CIP-68 asset names
        const nftAssetName = CIP68_222(stringToHex(params.assetName));
        const refAssetName = CIP68_100(stringToHex(params.assetName));

        console.log("   NFT asset name:", nftAssetName);
        console.log("   Ref asset name:", refAssetName);

        await this.mesh

            // Mint the Reference token FIRST (important for Aiken's minting.exact checks)
            .mintPlutusScriptV3()
            .mint("-1", this.policyId, refAssetName)
            .mintingScript(this.scriptCbor)
            .mintRedeemerValue(mConStr1([]))


            .spendingPlutusScriptV3()
            .txIn(
                storeUtxo.input.txHash,
                storeUtxo.input.outputIndex,
                storeUtxo.output.amount,
                storeUtxo.output.address
            )
            .txInInlineDatumPresent()
            .txInRedeemerValue(mConStr1([]))
            .txInScript(this.scriptStoreCbor)
            // Change goes back to wallet
            .changeAddress(walletAddress)
            .selectUtxosFrom(utxos)
            // CRITICAL: Must sign with the hot key
            .requiredSignerHash(deserializeAddress(walletAddress).pubKeyHash)
            .txInCollateral(
                collateral.input.txHash,
                collateral.input.outputIndex,
                collateral.output.amount,
                collateral.output.address
            )
            .complete();

        console.log("   ✅ Transaction built successfully\n");
        return this.mesh.txHex;
    };

    updateMetadata = async (params: {
        txHash: string;
        assetName: string;
        metadata: Record<string, string>;
    }) => {
        const { utxos, walletAddress, collateral } = await this.getWalletInfoForTx();
        const storeUtxo = await this.getStoreUtxoByTxHash(params.txHash);
        await this.mesh
            .spendingPlutusScriptV3()
            .txIn(storeUtxo.input.txHash, storeUtxo.input.outputIndex)
            .txInInlineDatumPresent()
            .txInRedeemerValue(mConStr0([]))
            .txInScript(this.scriptStoreCbor)
            .txOut(this.scriptStoreAddress, [
                {
                    unit: this.policyId + CIP68_100(stringToHex(params.assetName)),
                    quantity: "1",
                },
            ])
            .txOutInlineDatumValue(metadataToCip68(params.metadata))
            .changeAddress(walletAddress)
            .selectUtxosFrom(utxos)
            .requiredSignerHash(deserializeAddress(walletAddress).pubKeyHash)
            .txInCollateral(
                collateral.input.txHash,
                collateral.input.outputIndex,
                collateral.output.amount,
                collateral.output.address
            )
            .complete();
        return this.mesh.txHex;
    }
}

async function main() {
    console.log("🚀 Starting CIP-68 Minting Process\n");

    const assets = {
        assetName: "abc",  // Remove the "1" prefix
        metadata: {
            name: "hcd #099",
            image: "ipfs://QmQK3ZfKnwg772ZUhSodoyaqTMPazG2Ni3V4ydifYaYzdV",
            mediaType: "image/png",
            description: "Hello world - CIP68",
        },
    };

    const burnAssets = {
        assetName: "abc",
        txHash: "fdb5a1913363b806fc998d357e7d0eddd436be4504215cce821f0dd0cc907809", // Example tx hash
    }

    const updateMetadata = {
        assetName: "abc",
        txHash: "fdb5a1913363b806fc998d357e7d0eddd436be4504215cce821f0dd0cc907809",
        metadata: {
            name: "hcd #099 UPDATED",
            image: "ipfs://QmQK3ZfKnwg772ZUhSodoyaqTMPazG2Ni3V4ydifYaYzdV",
            mediaType: "image/png",
            description: "Hello world - CIP68 UPDATED",
        }
    }
    const provider = new BlockfrostProvider(
        process.env.BLOCKFROST_API_KEY || ""
    );

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
            words: [process.env.MNEMONIC || ""],
        },
    });

    const contract = new MintContract({
        mesh: meshTxBuilder,
        fetcher: provider,
        wallet: wallet,
        networkId: 0,
    });

    // Initialize the contract (gets hot key and script hashes)
    console.log("🔧 Initializing contract...\n");
    await contract.initialize();

    console.log("\n💎 Minting asset:", assets.assetName);

    try {
        const unsignedTx = await contract.updateMetadata(updateMetadata);
        console.log("✅ Transaction built");

        const signedTx = await wallet.signTx(unsignedTx, true);
        console.log("✅ Transaction signed");

        const txHash = await wallet.submitTx(signedTx);
        console.log("\n🎉 SUCCESS! Transaction submitted!");
        console.log("🔗 https://preview.cexplorer.io/tx/" + txHash);
    } catch (error: any) {
        console.error("\n❌ ERROR:", error.message || error);
        if (error.data?.message) {
            console.error("Details:", error.data.message.substring(0, 500));
        }
        throw error;
    }
}

main().catch((error) => {
    console.error("\n💥 Fatal error:", error);
    process.exit(1);
});