# How Arc Studio was used (run of 2026-10-21, PDT)

- Arc Studio app: https://studio.arc.io/app/6185d069-8204-45b9-b8ac-ddb2cde7bd5b ("Solidity Escrow Verification Agent"), CLI session `verifypay`, thread 201d6ab3-d06a-4971-8db5-72841ff12b6b, account toniadreal11@gmail.com, arc-studio CLI 1.2.1.
- Every prompt, status and outcome: `arc-studio/SESSION_LOG.md`. Arc Studio's own end-of-turn summaries: `arc-studio/turn-summaries/*.final.txt`.
- The Arc Studio workspace (contract, tests, React app, security review) is the root of this repo (`contracts/`, `src/`, `docs/security-review.md`).

## Who wrote what
- Contract `contracts/VerifyPayEscrow.sol`, its 32-test Foundry suite, the React/Vite frontend and `docs/security-review.md` were all generated and iterated **by Arc Studio** from prompts 01–07. No line was hand-edited.
- The earlier local reference/spec lives in `arc-studio/reference-yardstick/`. They were used only to check Arc Studio's output:
  - Our 26-test reference suite against Arc Studio's v01 contract: **did not compile** (hard-coded USDC constant, no constructor arg) → fed back as prompt 02b; Arc Studio switched to an immutable `usdc` ctor arg + `nonReentrant` create.
  - Against Arc Studio's final contract: 24/26 → the 2 fuzz tests failed only because Arc Studio's hardening (prompt 05) added a 60 s minimum deadline (`DeadlineTooSoon`). With the reference fuzz bounds raised to ≥60 s (crosscheck copy only): **26/26 pass**; `ArcFork` real-USDC fork test passes on testnet and mainnet forks. Logs in `arc-studio/test-logs/`.
  - Note: Arc Studio's [M-1] "high-s malleability" finding is redundant with OZ v5 (SignatureChecker → ECDSA.tryRecover already rejects high-s); its extra check is harmless.
- Line diff reference → Arc Studio: `arc-studio/diff-reference-vs-arcstudio.diff`.

## Deployments
| Network | Address | Deployed by | Tx |
|---|---|---|---|
| Arc Testnet (current) | 0x82842c7df122d8d4a5e37f0e46404e42a251f6ee | Arc Studio (prompt 06) | https://explorer.testnet.arc.io/tx/0x7c2480f292eabc7d1eec30348cbb66287e78ae9e6fd0c572e6dee3ee3ac5bc3a |
| Arc Testnet (stale, pre-hardening) | 0x019f2212cc5b91d18f51816814b027afa4918582 | Arc Studio (prompt 03) | https://explorer.testnet.arc.io/tx/0x2a074e0fff3558732f3c3c88ab39a31a17720e9ca59c2dd2ed950380c2eb3f02 |
| Arc Mainnet | 0x3622FfDCFE88c542aB1203a00282e128159edDE7 | PAYER via `tools/scripts/deploy.mjs` with Arc Studio's compiled artifact (`tools/artifacts/VerifyPayEscrow.arcstudio.json`, solc 0.8.28, source keccak 0x0d3f84d5…) | https://explorer.arc.io/tx/0x17d7c9eb7d232c014473516b1a66d5c59318daa00ea1afcd902c51eedd6b1590 |

Mainnet runtime bytecode equals the Arc Studio testnet deployment byte-for-byte except the EIP-712 immutables (contract address, chainId, cached domain separator). Arc Studio itself deploys to testnet only.

## Testnet flow: blocked
Arc Studio's faucet tool refused: "Faucet drip requires the DEVELOPER_ADMIN_DEFAULT_ROLE on at least one available entity for this user." It also asked to create a Circle Standard Developer API key (all developer products) for developer-controlled wallets; we answered Deny. The platform deployer key is Circle-managed, so no testnet escrow flow ran. To finish: fund Arc Studio's sandbox payer 0x92607EdA480f717434fdD4588B1361Bc9517Dc51 with testnet USDC (e.g. "Get test USDC" in the Arc Studio web UI, then send), and tell Arc Studio to continue.

## Mainnet demo (2026-10-21 22:01–22:03 PDT)
See `tools/deployments/arcMainnet-demo-1792645422217.md` (tx table). Escrow #1 1.0 USDC released on a verifier PASS; escrow #2 0.5 USDC refunded after a 70 s deadline (60 s minimum now enforced); agent swept back.

## Reproducibility
`forge build` of `contracts/VerifyPayEscrow.sol` in this repo (solc 0.8.28, paris, 200 runs, OZ 5.1.0) yields creation bytecode identical to `tools/artifacts/VerifyPayEscrow.arcstudio.json`, the artifact deployed on mainnet.
