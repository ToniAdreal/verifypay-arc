// End-to-end VerifyPay demo, fully from the box (no browser wallet).
//   node scripts/demo.mjs --network local|testnet            (mainnet: add --i-understand-this-is-mainnet)
// Options: --amount 1  --refund-amount 0.5  --refund-ttl 20  --skip-refund  --sweep-back
// Flow:
//   A) PAYER escrows --amount USDC for AGENT, verifier = VERIFIER, spec = evidence/spec.json
//      → FAIL evidence: verifier refuses to sign  → forged sig (AGENT key) rejected by eth_call
//      → VERIFIER signs EIP-712 PASS over VerifyGate record_hash → AGENT relays release → paid
//      → replay of the same PASS rejected (eth_call)
//   B) PAYER escrows --refund-amount with a short deadline, no PASS arrives → refund after deadline
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ethers } from "ethers";
import {
  ROOT, args, setup, artifact, ERC20_ABI, feeOverrides, send, step, ok, info, bad, usdc, usdcFmt,
  loadDeployment, decodeRevert, txLink, addrLink, MAINNET_MAX_USDC,
} from "./lib.mjs";
import { deliverableHashFromEvidence, signPass } from "./sign-pass.mjs";

const a = args();
const { key, net, provider, payer, agent, verifier } = setup(a.network ?? "local");
const amount = usdc(a.amount ?? "1");
const refundAmount = usdc(a["refund-amount"] ?? "0.5");
const refundTtl = Number(a["refund-ttl"] ?? 20);
if (key === "arcMainnet" && (amount > usdc(MAINNET_MAX_USDC) || refundAmount > usdc(MAINNET_MAX_USDC))) {
  throw new Error(`mainnet demo capped at ${MAINNET_MAX_USDC} USDC per escrow`);
}
const dep = loadDeployment(key);
const { abi } = artifact();
const token = new ethers.Contract(net.usdc, ERC20_ABI, provider);
const escrow = new ethers.Contract(dep.address, abi, provider);
const results = [];
const record = (label, r) => results.push({ label, hash: r.tx.hash, link: txLink(net, r.tx.hash), gasUsdc: ethers.formatUnits(r.gasCost, 18) });

async function balances(title) {
  info(title);
  for (const [r, addr] of [["PAYER", payer.address], ["AGENT", agent.address], ["VERIFIER", verifier.address], ["ESCROW", dep.address]]) {
    info(`  ${r.padEnd(8)} ${addr}  ${usdcFmt(await token.balanceOf(addr))}`);
  }
}

console.log(`\x1b[1mVerifyPay demo on ${net.name} (chain ${net.chainId})\x1b[0m`);
info(`contract ${dep.address}  ${addrLink(net, dep.address)}`);
await step("Starting balances");
await balances("USDC (ERC-20 view, 6 decimals):");

// AGENT needs a little native USDC for gas to relay its own release.
const minAgentGas = ethers.parseUnits("0.02", 18);
if ((await provider.getBalance(agent.address)) < minAgentGas) {
  await step("Top up AGENT with 0.05 USDC so it can pay gas for its own release");
  const r = await send("gas top-up (USDC.transfer)", key, net, token.connect(payer).transfer(agent.address, usdc("0.05"), await feeOverrides(provider)));
  record("Gas top-up PAYER→AGENT 0.05 USDC", r);
}

// ---------------- A) attested release ----------------
const specBytes = readFileSync(join(ROOT, "evidence/spec.json"));
const workSpecHash = ethers.keccak256(specBytes);
await step(`Payer approves ${usdcFmt(amount)} and opens escrow A for the AI coding agent`);
info(`workSpecHash = keccak256(evidence/spec.json) = ${workSpecHash}`);
if ((await token.allowance(payer.address, dep.address)) < amount) {
  record("approve (escrow A)", await send("approve", key, net, token.connect(payer).approve(dep.address, amount, await feeOverrides(provider))));
}
const latest = await provider.getBlock("latest");
const deadlineA = BigInt(latest.timestamp + 3600);
const idA = await escrow.nextEscrowId();
const rA = await send("createEscrow A", key, net, escrow.connect(payer).createEscrow(agent.address, verifier.address, amount, deadlineA, workSpecHash, await feeOverrides(provider)));
record(`createEscrow #${idA} (${usdcFmt(amount)} locked)`, rA);
ok(`escrow #${idA} open: payee AGENT, verifier VERIFIER, deadline ${new Date(Number(deadlineA) * 1000).toISOString()}`);

await step("Verifier checks the FAILING evidence record first: no signature");
try {
  deliverableHashFromEvidence(join(ROOT, "evidence/evidence_failing.json"));
  bad("unexpected: signed a FAIL");
} catch (e) {
  ok(`verifier refused: ${e.message}`);
}

const deliverableHash = deliverableHashFromEvidence(join(ROOT, "evidence/evidence_passing.json"));
await step("The agent tries to pay itself with its OWN signature (forged PASS), dry-run");
const forged = await signPass(agent, { chainId: net.chainId, verifyingContract: dep.address, escrowId: idA, deliverableHash });
const forgedErr = await decodeRevert(escrow, () => escrow.connect(agent).release.staticCall(idA, deliverableHash, forged.signature));
forgedErr ? ok(`rejected by contract: ${forgedErr}`) : bad("forged signature was NOT rejected");

await step("Verifier signs an EIP-712 PASS over (escrowId, VerifyGate record_hash)");
const att = await signPass(verifier, { chainId: net.chainId, verifyingContract: dep.address, escrowId: idA, deliverableHash });
info(`deliverableHash = ${deliverableHash}`);
info(`signer ${att.signer}`);
info(`signature ${att.signature.slice(0, 20)}…${att.signature.slice(-8)}`);
writeFileSync(join(ROOT, "deployments", `${key}-attestation-${idA}.json`), JSON.stringify(att, null, 2) + "\n");

await step("The agent relays the PASS: contract checks the signature and pays out");
const rRel = await send("release A", key, net, escrow.connect(agent).release(idA, deliverableHash, att.signature, await feeOverrides(provider)));
record(`release #${idA} → AGENT (${usdcFmt(amount)})`, rRel);
ok(`escrow #${idA} status = ${["None", "Open", "Released", "Refunded"][Number((await escrow.getEscrow(idA)).status)]}`);

await step("Replay the same PASS: dry-run");
const replayErr = await decodeRevert(escrow, () => escrow.connect(agent).release.staticCall(idA, deliverableHash, att.signature));
replayErr ? ok(`rejected by contract: ${replayErr}`) : bad("replay NOT rejected");

// ---------------- B) refund after deadline ----------------
if (!a["skip-refund"]) {
  await step(`Escrow B: ${usdcFmt(refundAmount)} with a ${refundTtl}s deadline, and no PASS ever arrives`);
  if ((await token.allowance(payer.address, dep.address)) < refundAmount) {
    record("approve (escrow B)", await send("approve", key, net, token.connect(payer).approve(dep.address, refundAmount, await feeOverrides(provider))));
  }
  const nowB = (await provider.getBlock("latest")).timestamp;
  const deadlineB = BigInt(nowB + refundTtl);
  const idB = await escrow.nextEscrowId();
  record(`createEscrow #${idB} (${usdcFmt(refundAmount)}, short deadline)`, await send("createEscrow B", key, net, escrow.connect(payer).createEscrow(agent.address, verifier.address, refundAmount, deadlineB, workSpecHash, await feeOverrides(provider))));
  const early = await decodeRevert(escrow, () => escrow.connect(payer).refund.staticCall(idB));
  early ? ok(`refund before deadline rejected: ${early}`) : bad("early refund NOT rejected");
  info(`waiting until chain time > deadline (${refundTtl}s)…`);
  for (;;) {
    if (key === "local") { await provider.send("evm_increaseTime", [refundTtl + 1]); await provider.send("evm_mine", []); }
    const t = (await provider.getBlock("latest")).timestamp;
    if (BigInt(t) > deadlineB) break;
    await new Promise((r) => setTimeout(r, 2000));
  }
  record(`refund #${idB} → PAYER (${usdcFmt(refundAmount)})`, await send("refund B", key, net, escrow.connect(payer).refund(idB, await feeOverrides(provider))));
  ok(`escrow #${idB} status = ${["None", "Open", "Released", "Refunded"][Number((await escrow.getEscrow(idB)).status)]}`);
}

if (a["sweep-back"]) {
  await step("Agent sends its earned USDC back to the payer (recover demo funds)");
  const bal = await token.balanceOf(agent.address);
  const keep = usdc("0.01");
  // Arc: native and ERC-20 USDC are one balance, so gas comes out of the same funds being moved.
  // Pass an explicit gasLimit; otherwise eth_estimateGas reserves gas against the whole balance and fails.
  if (bal > keep) record("sweep AGENT→PAYER", await send("sweep", key, net, token.connect(agent).transfer(payer.address, bal - keep, { ...(await feeOverrides(provider)), gasLimit: 100000n })));
}

await step("Final balances");
await balances("USDC (ERC-20 view, 6 decimals):");
const md = [
  `# VerifyPay demo run: ${net.name} (chain ${net.chainId}), ${new Date().toISOString()}`,
  `Contract: [${dep.address}](${addrLink(net, dep.address)}) (deploy tx ${txLink(net, dep.txHash)})`,
  "",
  "| Step | Tx | Gas (USDC) |",
  "|---|---|---|",
  ...results.map((r) => `| ${r.label} | [${r.hash.slice(0, 10)}…](${r.link}) | ${r.gasUsdc} |`),
  "",
].join("\n");
const out = join(ROOT, "deployments", `${key}-demo-${Date.now()}.md`);
writeFileSync(out, md);
console.log(`\n\x1b[1;32mDone.\x1b[0m Tx table written to ${out}`);
