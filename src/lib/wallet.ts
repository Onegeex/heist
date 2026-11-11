"use client";

import { setupWalletSelector, type WalletSelector } from "@near-wallet-selector/core";
import { setupModal, type WalletSelectorModal } from "@near-wallet-selector/modal-ui";
import { setupMyNearWallet } from "@near-wallet-selector/my-near-wallet";
import { setupMeteorWallet } from "@near-wallet-selector/meteor-wallet";
import { actionCreators } from "@near-js/transactions";

const fc = (method: string, args: object, gas: string, deposit: string) =>
  actionCreators.functionCall(method, args, BigInt(gas), BigInt(deposit));

export type Net = "testnet" | "mainnet";
const TGAS = "000000000000";

let selector: Promise<WalletSelector> | null = null;
let modal: WalletSelectorModal | null = null;

export function getSelector(network: Net) {
  selector ??= setupWalletSelector({ network, modules: [setupMyNearWallet(), setupMeteorWallet()] });
  return selector;
}

/** Sign in without a function-call key: every heist action attaches NEAR, so the wallet confirms each one. */
export async function connect(network: Net, vault: string) {
  const s = await getSelector(network);
  modal ??= setupModal(s, { contractId: vault, methodNames: ["attempts_left"], theme: "dark" });
  modal.show();
}

export async function currentAccount(network: Net): Promise<string | null> {
  const s = await getSelector(network);
  return s.store.getState().accounts.find((a) => a.active)?.accountId ?? null;
}

export async function disconnect(network: Net) {
  const s = await getSelector(network);
  const w = await s.wallet();
  await w.signOut();
}

type Outcome = { transaction?: { hash?: string }; transaction_outcome?: { id?: string } } | void;
const hashOf = (o: Outcome) => (o && (o.transaction?.hash || o.transaction_outcome?.id)) || null;

/** Remember what we were doing, for wallets that redirect away and back. */
function setPending(v: string) {
  try {
    localStorage.setItem("heist-pending", v);
  } catch {}
}
export function takePending(): string | null {
  try {
    const v = localStorage.getItem("heist-pending");
    localStorage.removeItem("heist-pending");
    return v;
  } catch {
    return null;
  }
}

export async function openAttempt(network: Net, vault: string, feeYocto: string): Promise<string | null> {
  const w = await (await getSelector(network)).wallet();
  setPending("open");
  const out = (await w.signAndSendTransaction({
    receiverId: vault,
    actions: [fc("open_attempt", {}, `30${TGAS}`, feeYocto)],
  })) as Outcome;
  return hashOf(out);
}

export async function claim(network: Net, vault: string, attemptId: number, signature: string): Promise<string | null> {
  const w = await (await getSelector(network)).wallet();
  setPending(`claim:${attemptId}`);
  const out = (await w.signAndSendTransaction({
    receiverId: vault,
    actions: [
      fc("claim", { attempt_id: String(attemptId), signature, payout_to: null }, `60${TGAS}`, "0"),
    ],
  })) as Outcome;
  return hashOf(out);
}

/** Mainnet: wrap the winnings and send wNEAR to a NEAR Intents 1Click deposit address. */
export async function cashOut(depositAddress: string, amountYocto: string) {
  const w = await (await getSelector("mainnet")).wallet();
  await w.signAndSendTransaction({
    receiverId: "wrap.near",
    actions: [
      fc("storage_deposit", { account_id: depositAddress, registration_only: true }, `10${TGAS}`, "1250000000000000000000"),
      fc("near_deposit", {}, `10${TGAS}`, amountYocto),
      fc("ft_transfer", { receiver_id: depositAddress, amount: amountYocto }, `20${TGAS}`, "1"),
    ],
  });
}
