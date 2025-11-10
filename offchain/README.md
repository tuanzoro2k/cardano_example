# Escrow

Escrow contract facilitates the secure exchange of assets between two parties by acting as a trusted intermediary that holds the assets until the conditions of the agreement are met.

The escrow smart contract allows two parties to exchange assets securely. The contract holds the assets until the job is done 

There are 2 actions available to interact with this smart contract:

- create job and deposit assets
- pay job and withdraw

## Usage

To initialize the escrow, we need to initialize a provider, MeshTxBuilder and MeshEscrowContract.

```
import { BlockfrostProvider, MeshTxBuilder } from '@meshsdk/core';
import { EscrowContract } from 'tuan-escrow-contract';
import { useWallet } from '@meshsdk/react';

const { connected, wallet } = useWallet();

const provider = new BlockfrostProvider(APIKEY);

const meshTxBuilder = new MeshTxBuilder({
  fetcher: provider,
  submitter: provider,
});

const contract = new MeshEscrowContract({
  mesh: meshTxBuilder,
  fetcher: provider,
  wallet: wallet,
  networkId: 0,
});

//example create job and deposit 
const escrowAmount = [{ unit: 'lovelace', quantity: '2000000' }];
const unsignedTx = await contract.createJobAndFund(escrowAmount, "addr_test1qzr058he2g4ulqn7pd0xjeejkaa2kmf5ak6aa9psqtycc98y7tj6wypp0ezp257naukqyd6026r32dfzq79anlnf0pes7n99lf");

const signedTx = await wallet.signTx(unsignedTx);
const txHash = await wallet.submitTx(signedTx);
console.log("Submitted transaction hash:", txHash);

//example pay and withdraw

const unsignedTx = await contract.payJobAndWithdraw("e1b47844d89962fff1c39581cc3ee3b53974973414d10f2f353737127a3334c4", "addr_test1qzr058he2g4ulqn7pd0xjeejkaa2kmf5ak6aa9psqtycc98y7tj6wypp0ezp257naukqyd6026r32dfzq79anlnf0pes7n99lf")
const signedTx = await wallet.signTx(unsignedTx);
const txHash = await wallet.submitTx(signedTx);
console.log("Submitted transaction hash:", txHash);
```