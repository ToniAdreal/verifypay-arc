# VerifyPayEscrow

> Built with Arc Studio - money-powered apps in minutes

USDC escrow app on Arc Testnet. Funds are released to the payee only when a designated verifier signs an EIP-712 PASS attestation. Payer can refund after deadline.

---

## Deployed Contracts

| Version | Address | Tx Hash | Chain | Notes |
|---|---|---|---|---|
| v2 (hardened) | `0x3622FfDCFE88c542aB1203a00282e128159edDE7` | `0x17d7c9eb7d232c014473516b1a66d5c59318daa00ea1afcd902c51eedd6b1590` | Arc Mainnet | Same bytecode as testnet v2 |
| v2 (hardened) | `0x82842c7df122d8d4a5e37f0e46404e42a251f6ee` | `0x7c2480f292eabc7d1eec30348cbb66287e78ae9e6fd0c572e6dee3ee3ac5bc3a` | Arc Testnet | High-s guard + MIN_DEADLINE_SECS=60 + DeadlineTooSoon |
| v1 (stale) | `0x019f2212cc5b91d18f51816814b027afa4918582` | `0x2a074e0fff3558732f3c3c88ab39a31a17720e9ca59c2dd2ed950380c2eb3f02` | Arc Testnet | Pre-hardening, do not use |

Constructor arg: `USDC = 0x3600000000000000000000000000000000000000` (Arc Testnet USDC, 6 decimals)

## What This App Does

## Tech Stack

- Frontend: React 18, Vite, TypeScript, Tailwind CSS
- Web3: wagmi v2, viem v2, ConnectKit
- Contracts: Solidity 0.8.28 + Foundry. Sources in `contracts/`, unit tests in `contracts/test/*.t.sol`. Build with `bun run contracts:build` (`forge build`), test with `bun run contracts:test` (`forge test`).
- Wallet: injected (MetaMask, etc.)
- Chain: Arc Testnet (Chain ID: 5042002, imported from `viem/chains`)
- Token: USDC (6 decimals) (Address: 0x3600000000000000000000000000000000000000, Chain: Arc Testnet)
- Toasts: Sonner

## Key Files

- `src/App.tsx` - Main application logic
- `src/components/` - UI components
- `src/config.ts` - wagmi config (chains, connectors, transports)

## To Run

```bash
bun install
bun run dev
```
