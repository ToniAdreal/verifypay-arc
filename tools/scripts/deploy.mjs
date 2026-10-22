// node scripts/deploy.mjs --network testnet|local   (mainnet needs --i-understand-this-is-mainnet)
import { ethers } from "ethers";
import { args, setup, artifact, feeOverrides, send, saveDeployment, step, ok, info, addrLink, ERC20_ABI } from "./lib.mjs";
const a = args();
const { key, net, provider, payer } = setup(a.network ?? "local");
const { abi, bytecode } = artifact();
await step(`Deploy VerifyPayEscrow to ${net.name} (chain ${net.chainId}) from PAYER ${payer.address}`);
const token = new ethers.Contract(net.usdc, ERC20_ABI, provider);
info(`USDC ERC-20 at ${net.usdc}: decimals=${await token.decimals()}`);
const factory = new ethers.ContractFactory(abi, bytecode, payer);
const fees = await feeOverrides(provider);
const deployTx = await factory.getDeployTransaction(net.usdc);
const gas = await provider.estimateGas({ ...deployTx, from: payer.address });
info(`estimated gas ${gas}, maxFeePerGas ${ethers.formatUnits(fees.maxFeePerGas, "gwei")} gwei → ≤ ${ethers.formatUnits(gas * fees.maxFeePerGas, 18)} USDC`);
const { rc } = await send("deploy", key, net, payer.sendTransaction({ ...deployTx, ...fees, gasLimit: (gas * 12n) / 10n }));
const address = rc.contractAddress;
ok(`VerifyPayEscrow deployed at ${address}`);
info(addrLink(net, address));
saveDeployment(key, { contract: "VerifyPayEscrow", address, txHash: rc.hash, block: rc.blockNumber, deployer: payer.address, usdc: net.usdc, chainId: net.chainId, deployedAt: new Date().toISOString(), artifact: process.env.VERIFYPAY_ARTIFACT ?? "artifacts/VerifyPayEscrow.arcstudio.json" });
