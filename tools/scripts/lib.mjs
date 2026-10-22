// Shared helpers for VerifyPay box scripts. Private keys are read from .wallet.env
// (chmod 600, git-ignored) and are never printed.
import { readFileSync, existsSync, writeFileSync, mkdirSync, appendFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ethers } from "ethers";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const NETWORKS = JSON.parse(readFileSync(join(ROOT, "config/networks.json"), "utf8"));
export const MAINNET_MAX_USDC = 2.0; // hard cap per escrow on mainnet for the demo
export const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address,address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
  "function transfer(address,uint256) returns (bool)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
];

export function args() {
  const a = process.argv.slice(2);
  const out = { _: [] };
  for (let i = 0; i < a.length; i++) {
    if (a[i].startsWith("--")) {
      const k = a[i].slice(2);
      const v = a[i + 1] && !a[i + 1].startsWith("--") ? a[++i] : true;
      out[k] = v;
    } else out._.push(a[i]);
  }
  return out;
}

export function netKey(name = "local") {
  const map = { mainnet: "arcMainnet", testnet: "arcTestnet", local: "local", arcMainnet: "arcMainnet", arcTestnet: "arcTestnet" };
  const k = map[name];
  if (!k) throw new Error(`unknown --network ${name} (use local | testnet | mainnet)`);
  return k;
}

export function loadWalletEnv() {
  const p = join(ROOT, ".wallet.env");
  if (!existsSync(p)) throw new Error("tools/.wallet.env not found; copy .wallet.env.example and fill in throwaway keys");
  const env = {};
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].trim();
  }
  return env;
}

export function setup(network, { requireMainnetAck = true } = {}) {
  const key = netKey(network);
  const net = NETWORKS[key];
  if (key === "arcMainnet" && requireMainnetAck && !process.argv.includes("--i-understand-this-is-mainnet")) {
    throw new Error("Refusing to touch Arc MAINNET without --i-understand-this-is-mainnet");
  }
  const provider = new ethers.JsonRpcProvider(net.rpcUrl, net.chainId, { staticNetwork: true, cacheTimeout: -1, pollingInterval: 500 });
  const env = loadWalletEnv();
  const w = (r) => new ethers.Wallet(env[`${r}_PRIVATE_KEY`], provider);
  return { key, net, provider, payer: w("PAYER"), agent: w("AGENT"), verifier: w("VERIFIER"), env };
}

// Arc: mempool silently drops txs with maxFeePerGas < 20 gwei
// (docs.arc.io/arc/references/gas-and-fees). Use max(2*base, 20 gwei) + 1 gwei tip.
export async function feeOverrides(provider) {
  const block = await provider.getBlock("latest");
  const floor = ethers.parseUnits("20", "gwei");
  const base = block?.baseFeePerGas ?? floor;
  const tip = ethers.parseUnits("1", "gwei");
  let maxFee = base * 2n + tip;
  if (maxFee < floor + tip) maxFee = floor + tip;
  return { maxFeePerGas: maxFee, maxPriorityFeePerGas: tip };
}

export function artifact() {
  // Default: the exact artifact Arc Studio compiled (and that is deployed on Arc Mainnet).
  // VERIFYPAY_ARTIFACT can point at a fresh build, e.g. ../contracts/out/VerifyPayEscrow.sol/VerifyPayEscrow.json
  const p = process.env.VERIFYPAY_ARTIFACT ?? join(ROOT, "artifacts/VerifyPayEscrow.arcstudio.json");
  const j = JSON.parse(readFileSync(p, "utf8"));
  return { abi: j.abi, bytecode: j.bytecode.object };
}

export const usdcFmt = (v) => `${ethers.formatUnits(v, 6)} USDC`;
export const usdc = (s) => ethers.parseUnits(String(s), 6);

export function txLink(net, hash) {
  return net.explorer ? `${net.explorer}/tx/${hash}` : `(local) ${hash}`;
}
export function addrLink(net, a) {
  return net.explorer ? `${net.explorer}/address/${a}` : `(local) ${a}`;
}

export function deploymentPath(key) {
  return join(ROOT, "deployments", `${key}.json`);
}
export function loadDeployment(key) {
  const p = deploymentPath(key);
  if (!existsSync(p)) throw new Error(`No deployment for ${key}. Run: node scripts/deploy.mjs --network ...`);
  return JSON.parse(readFileSync(p, "utf8"));
}
export function saveDeployment(key, data) {
  mkdirSync(join(ROOT, "deployments"), { recursive: true });
  writeFileSync(deploymentPath(key), JSON.stringify(data, null, 2) + "\n");
}

export function logTx(key, entry) {
  mkdirSync(join(ROOT, "deployments"), { recursive: true });
  appendFileSync(join(ROOT, "deployments", `${key}-txlog.jsonl`), JSON.stringify({ at: new Date().toISOString(), ...entry }) + "\n");
}

// Pretty step printer for the terminal recording.
// --pace <seconds> (or VERIFYPAY_PACE) pauses before each step so a screen recording is readable.
let stepNo = 0;
const PACE = Number(process.env.VERIFYPAY_PACE ?? (process.argv.includes("--pace") ? process.argv[process.argv.indexOf("--pace") + 1] : 0)) || 0;
export async function step(title) {
  if (PACE && stepNo > 0) await new Promise((r) => setTimeout(r, PACE * 1000));
  stepNo += 1;
  console.log(`\n\x1b[1;36m━━ Step ${stepNo}: ${title}\x1b[0m`);
}
export const ok = (s) => console.log(`  \x1b[32m✔\x1b[0m ${s}`);
export const info = (s) => console.log(`  · ${s}`);
export const bad = (s) => console.log(`  \x1b[31m✘\x1b[0m ${s}`);

export async function send(label, key, net, txPromise) {
  const tx = await txPromise;
  info(`${label}: sent ${tx.hash}`);
  const rc = await tx.wait();
  if (rc.status !== 1) throw new Error(`${label} reverted: ${tx.hash}`);
  const gasCost = rc.gasUsed * (rc.gasPrice ?? 0n); // native USDC, 18 decimals
  ok(`${label}: block ${rc.blockNumber}, gas ${rc.gasUsed} (${ethers.formatUnits(gasCost, 18)} USDC)`);
  info(txLink(net, tx.hash));
  logTx(key, { label, hash: tx.hash, block: rc.blockNumber, gasUsed: rc.gasUsed.toString(), gasCostUsdc: ethers.formatUnits(gasCost, 18), link: txLink(net, tx.hash) });
  return { tx, rc, gasCost };
}

export async function decodeRevert(contract, fn) {
  try {
    await fn();
    return null;
  } catch (e) {
    const data = e?.data ?? e?.info?.error?.data ?? e?.error?.data;
    if (data) {
      try {
        const parsed = contract.interface.parseError(data);
        if (parsed) return `${parsed.name}(${parsed.args.map(String).join(", ")})`;
      } catch {}
    }
    return e?.revert?.name ?? e?.shortMessage ?? String(e);
  }
}
