import {
    MeshTxBuilder,
    IFetcher,
    IWallet,
    LanguageVersion,
} from "@meshsdk/core";

export type MeshTxInitiatorInput = {
    mesh: MeshTxBuilder;
    fetcher?: IFetcher;
    wallet?: IWallet;
    networkId?: number;
    stakeCredential?: string;
    version?: number;
};

export class MeshTxInitiator {
    mesh: MeshTxBuilder;
    fetcher?: IFetcher;
    wallet?: IWallet;
    stakeCredential?: string;
    networkId = 0;
    version = 2;
    languageVersion: LanguageVersion = "V2";

    constructor({
        mesh,
        fetcher,
        wallet,
        networkId = 0,
        stakeCredential = "c08f0294ead5ab7ae0ce5471dd487007919297ba95230af22f25e575",
        version = 2,
    }: MeshTxInitiatorInput) {
        this.mesh = mesh;
        if (fetcher) {
            this.fetcher = fetcher;
        }
        if (wallet) {
            this.wallet = wallet;
        }

        this.networkId = networkId;
        switch (this.networkId) {
            case 1:
                this.mesh.setNetwork("mainnet");
                break;
            default:
                this.mesh.setNetwork("preview");
        }

        this.version = version;
        switch (this.version) {
            case 1:
                this.languageVersion = "V2";
                break;
            default:
                this.languageVersion = "V3";
        }

        if (stakeCredential) {
            this.stakeCredential = stakeCredential;
        }
    }
}