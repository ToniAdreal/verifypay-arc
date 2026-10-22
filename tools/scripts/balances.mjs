// node scripts/balances.mjs --network testnet|mainnet|local   (read-only)
import { ethers } from "ethers";
import { args, setup, ERC20_ABI, usdcFmt, addrLink, NETWORKS, netKey } from "./lib.mjs";
import { existsSync } from "node:fs";
import { deploymentPath, loadDeployment } from "./lib.mjs";
const a = args();
const { key, net, provider, payer, agent, verifier } = setup(a.network ?? "local", { requireMainnetAck: false });
const token = new ethers.Contract(net.usdc, ERC20_ABI, provider);
console.log(`${net.name} (chain ${net.chainId}) via ${net.rpcUrl}`);
const rows = [["PAYER", payer.address], ["AGENT", agent.address], ["VERIFIER", verifier.address]];
if (existsSync(deploymentPath(key))) rows.push(["ESCROW", loadDeployment(key).address]);
for (const [r, addr] of rows) {
  const [erc, nat] = await Promise.all([token.balanceOf(addr), provider.getBalance(addr)]);
  console.log(`${r.padEnd(9)} ${addr}  ${usdcFmt(erc).padStart(16)}  (native ${ethers.formatUnits(nat, 18)})  ${addrLink(net, addr)}`);
}
