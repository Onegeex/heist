import { createPrivateKey, createPublicKey, sign, verify, type KeyObject } from "node:crypto";

/** Must match `release_message` in contract/src/lib.rs byte for byte. */
export function releaseMessage(vault: string, round: number, attemptId: number, player: string) {
  return `heist-v1|${vault}|round:${round}|attempt:${attemptId}|player:${player}|release`;
}

const PKCS8_ED25519_PREFIX = Buffer.from("302e020100300506032b657004220420", "hex");

export function keyFromSeed(seedB64: string): KeyObject {
  const seed = Buffer.from(seedB64, "base64");
  if (seed.length !== 32) throw new Error("GUARDIAN_SECRET_B64 must be a 32-byte seed");
  return createPrivateKey({ key: Buffer.concat([PKCS8_ED25519_PREFIX, seed]), format: "der", type: "pkcs8" });
}

export function publicKeyB64(key: KeyObject) {
  return createPublicKey(key).export({ format: "der", type: "spki" }).subarray(-32).toString("base64");
}

export function signRelease(key: KeyObject, msg: string): string {
  return sign(null, Buffer.from(msg), key).toString("base64");
}

export function verifyRelease(pubB64: string, msg: string, sigB64: string): boolean {
  const spki = Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), Buffer.from(pubB64, "base64")]);
  const pub = createPublicKey({ key: spki, format: "der", type: "spki" });
  try {
    return verify(null, Buffer.from(msg), pub, Buffer.from(sigB64, "base64"));
  } catch {
    return false;
  }
}
