# Arc facts used by VerifyPay (verified 2026-10-21, ~9:15 PM PDT)
Raw copies of every page cited here are in `docs/sources/`, fetched from `https://docs.arc.io/<path>.md`.

## Networks
| | Mainnet | Testnet | Source |
|---|---|---|---|
| Chain ID | **5042** (`0x13b2`) | **5042002** (`0x4cef52`) | connect-to-arc |
| RPC | `https://rpc.mainnet.arc.io` | `https://rpc.testnet.arc.io` | connect-to-arc, rpc-endpoints |
| Explorer | `https://explorer.arc.io` | `https://explorer.testnet.arc.io` | connect-to-arc |
| Currency symbol | USDC | USDC | connect-to-arc |
| Faucet | n/a | https://faucet.circle.com (has reCAPTCHA) and Arc Studio's built-in faucet | contract-addresses, ai/arc-studio |

Live check from the box: `eth_chainId` returned `0x13b2` (mainnet) and `0x4cef52` (testnet). `eth_gasPrice` returned ≈20.57 gwei (mainnet) and 25 gwei (testnet).
Other mainnet RPCs listed in the docs: Alchemy, Blockdaemon `https://rpc.blockdaemon.mainnet.arc.io`, dRPC `https://rpc.drpc.mainnet.arc.io`, QuickNode `https://rpc.quicknode.mainnet.arc.io`.

## USDC: native gas token AND an ERC-20
- "USDC is the native EVM asset on Arc and is used for gas fees. An optional ERC-20 interface is also available for developers who need features such as `transferFrom`, `approve`, and allowance management… There is no wrapped USDC address on Arc." (contract-addresses)
- ERC-20 address, the **same on mainnet and testnet**: **`0x3600000000000000000000000000000000000000`**, **6 decimals**. The native balance uses **18 decimals**. "These are not two separate tokens; they share the same underlying balance." (contract-addresses, gas-and-fees, evm-differences)
- "Don't mix `msg.value` with `USDC.balanceOf()`… raw values are off by 10¹²." (evm-differences)
  - VerifyPay uses only the ERC-20 interface and never `msg.value`.
- Verified on a fork: `test/ArcFork.t.sol`, run with `arc-forge --network arc` against both testnet and mainnet state.
  - `vm.deal(payer, 5e18)` (5 native USDC) reads back as `balanceOf = 5e6` on the ERC-20.
  - The full create → release flow works against the real USDC contract.

## Runtime differences that matter here (evm-differences, gas-and-fees)
- **`maxFeePerGas` must be ≥ 20 gwei.** Lower txs are "silently dropped by the mempool". The scripts and web app use `max(2×baseFee, 20 gwei) + 1 gwei` tip.
- **Value transfers to `address(0)` revert.** The contract rejects a zero payee or verifier.
- **USDC blocklist is enforced at runtime.** A transfer to a blocklisted payee reverts. VerifyPay's refund path still lets the payer recover funds after the deadline.
- **Block timestamps are non-decreasing, 1-second granularity.** The refund check uses `block.timestamp > deadline`, and scripts wait on chain time, not wall time.
- **Deterministic finality in under 1 second.** One confirmation is enough.
- **Base fee target ≈ $0.001 per ERC-20 transfer.** Measured on the local arc-anvil fork at 41 gwei max fee: deploy 1.13M gas ≈ 0.024 USDC, createEscrow 177k gas ≈ 0.0037 USDC, release 97k ≈ 0.002, refund 61k ≈ 0.0013, approve 55k ≈ 0.0012.
- **Gas comes out of the same USDC balance you're moving.** `eth_estimateGas` without an explicit gas limit can reserve the whole balance, so `transfer(balance - x)` fails estimation. The sweep in `scripts/demo.mjs` passes `gasLimit: 100000`.

## Tooling
- **Arc Foundry** (`arc-forge`, `arc-cast`, `arc-anvil`) is an Arc fork of Foundry. Installed on the box from https://github.com/circlefin/arc-foundry/releases v0.8.0-2; the sha256 matched. "Standard anvil… can't reproduce Arc-specific behavior; use `arc-anvil --network arc`." (install-arc-foundry, troubleshoot-with-arc-foundry, evm-differences)
- **Arc Studio** "deploys to Arc testnet only… it does not deploy to mainnet on your behalf". CLI: `npm i -g @circle-fin/arc-studio-cli`, `arc-studio login [--paste]`, `arc-studio run "<prompt>" --session <name> --output json [--file local:workspace/path]`, `arc-studio pull`, `arc-studio deployments`, `arc-studio open`. The sandbox is "a Vite and Foundry app": Solidity goes under `contracts/` and web code under `src/`. Prompts are capped at 10,000 characters. (ai/arc-studio, ai/arc-studio-cli)
- ERC-8183 (agent job escrow) has a **testnet** address in contract-addresses, and the docs include a tutorial. It's related prior art: VerifyPay is a minimal verifier-attested variant on mainnet. We don't integrate it.
