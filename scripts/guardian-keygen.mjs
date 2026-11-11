// Generates the guardian server's ed25519 signing key.
// Public key (base64, 32 bytes) goes to the contract's `new`/`set_guardian_key`.
// Secret seed goes ONLY into the server env as GUARDIAN_SECRET_B64. Never commit it.
import { generateKeyPairSync } from "node:crypto";

const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const pub = publicKey.export({ format: "der", type: "spki" }).subarray(-32);
const seed = privateKey.export({ format: "der", type: "pkcs8" }).subarray(-32);

console.log(`GUARDIAN_PK_B64=${pub.toString("base64")}`);
console.log(`GUARDIAN_SECRET_B64=${seed.toString("base64")}`);
