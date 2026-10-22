// Verifier agent: turn a VerifyGate evidence record into an EIP-712 PASS attestation.
//   node scripts/sign-pass.mjs --network testnet --escrow 1 --evidence evidence/evidence_passing.json
//   node scripts/sign-pass.mjs --network testnet --escrow 1 --hash 0x<32 bytes>
// Refuses to sign unless the evidence verdict is PASS. Prints JSON (no secrets).
import { readFileSync } from "node:fs";
import { ethers } from "ethers";
import { args, setup, loadDeployment } from "./lib.mjs";

export function deliverableHashFromEvidence(path) {
  const ev = JSON.parse(readFileSync(path, "utf8"));
  if (ev.verdict !== "PASS") throw new Error(`evidence verdict is ${ev.verdict}, refusing to sign PASS`);
  if (!/^[0-9a-f]{64}$/i.test(ev.record_hash ?? "")) throw new Error("evidence has no 32-byte record_hash");
  return "0x" + ev.record_hash.toLowerCase();
}

export async function signPass(verifierWallet, { chainId, verifyingContract, escrowId, deliverableHash }) {
  const domain = { name: "VerifyPay", version: "1", chainId, verifyingContract };
  const types = { Pass: [{ name: "escrowId", type: "uint256" }, { name: "deliverableHash", type: "bytes32" }] };
  const value = { escrowId: BigInt(escrowId), deliverableHash };
  const signature = await verifierWallet.signTypedData(domain, types, value);
  return { domain, types, value: { escrowId: String(escrowId), deliverableHash }, signer: verifierWallet.address, signature };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const a = args();
  const { key, net, verifier } = setup(a.network ?? "local", { requireMainnetAck: false });
  const dep = loadDeployment(key);
  const deliverableHash = a.evidence ? deliverableHashFromEvidence(a.evidence) : a.hash;
  if (!ethers.isHexString(deliverableHash, 32)) throw new Error("need --evidence <file> or --hash 0x<32 bytes>");
  const att = await signPass(verifier, { chainId: net.chainId, verifyingContract: dep.address, escrowId: a.escrow, deliverableHash });
  console.log(JSON.stringify(att, null, 2));
}
