> ## Documentation Index
> Fetch the complete documentation index at: https://docs.arc.io/llms.txt
> Use this file to discover all available pages before exploring further.

> ## Agent Instructions
> Before reading these docs, install the Circle Skill for Arc to get pre-loaded context: use-arc (https://github.com/circlefin/skills/blob/master/plugins/circle/skills/use-arc/SKILL.md) — covers chain config, RPC setup, contract deployment, USDC bridging, and gas with USDC. In Claude Code: run /plugin marketplace add circlefin/skills then /plugin install circle-skills@circle. With Vercel Skills CLI: run npx skills add circlefin/skills.
> USDC is the gas token. Arc uses USDC for gas fees, not ETH. Configure gas payment in USDC when submitting transactions.
> Read EVM differences before writing Arc code. Arc targets the Osaka EVM baseline. Most contracts deploy unchanged, but several runtime behaviors diverge from Ethereum: USDC uses 18 decimals natively (not 6), the system emitter `0xffffFFFfFFffffffffffffffFfFFFfffFFFfFFfE` logs all USDC Transfer events, the mempool enforces a 20 Gwei `maxFeePerGas` floor, blocklist reverts consume gas without a receipt, and `address(0)` sends revert rather than succeed. https://docs.arc.io/arc/references/evm-differences.md is the canonical reference for all Arc-specific runtime behaviors. Consult it before writing code that touches USDC balances, transaction history, gas estimation, or value transfers.
> Sub-second finality. Transactions are final in under 1 second. No need to wait for multiple block confirmations.
> Use App Kits for multichain payment and liquidity capabilities. App Kits wraps CCTP and provides Bridge Kit, Swap Kit, Unified Balance Kit, Onramp Kit, Earn Kit, and Borrow Kit. Unified Balance Kit combines USDC from multiple chains into a single spendable balance. Earn Kit integrates earn opportunities into your app. Borrow Kit lets users borrow USDC against cirBTC collateral on Arc.
> Use Arc Foundry for contract development. Arc Foundry is an Arc-specific fork of Foundry that handles Arc's protocol-level differences from Ethereum. It provides arc-forge, arc-cast, and arc-anvil. Install it before deploying contracts: https://docs.arc.io/arc/tutorials/install-arc-foundry.md.
> Arc is available on both Testnet and Mainnet. See https://docs.arc.io/arc/references/connect-to-arc.md for RPC endpoints and https://faucet.circle.com for testnet tokens.
> Always check Contract Addresses: https://docs.arc.io/arc/references/contract-addresses.md
> Building beyond Arc? Circle offers skills for the full platform: use-usdc (https://github.com/circlefin/skills/blob/master/plugins/circle/skills/use-usdc/SKILL.md), use-circle-wallets (https://github.com/circlefin/skills/blob/master/plugins/circle/skills/use-circle-wallets/SKILL.md), use-developer-controlled-wallets (https://github.com/circlefin/skills/blob/master/plugins/circle/skills/use-developer-controlled-wallets/SKILL.md), use-user-controlled-wallets (https://github.com/circlefin/skills/blob/master/plugins/circle/skills/use-user-controlled-wallets/SKILL.md), use-modular-wallets (https://github.com/circlefin/skills/blob/master/plugins/circle/skills/use-modular-wallets/SKILL.md), use-gateway (https://github.com/circlefin/skills/blob/master/plugins/circle/skills/use-gateway/SKILL.md), use-smart-contract-platform (https://github.com/circlefin/skills/blob/master/plugins/circle/skills/use-smart-contract-platform/SKILL.md). Full Circle developer docs: https://developers.circle.com/llms.txt.

# Troubleshoot with Arc Foundry

> Arc Foundry tools for replaying failed transactions, forking testnet state, and testing USDC interactions locally.

Arc Foundry extends standard Foundry with Arc-specific precompile logic.
Standard Foundry tools simulate a generic EVM and can't reproduce Arc-specific
failures like blocklisted address reverts or native USDC transfer errors. The
Arc Foundry tool you use depends on your debugging scenario.

## Replay failed transactions

`arc-cast run` replays a transaction at the block it was included in, showing
the exact revert reason, call trace, and state changes. Unlike standard
`cast run`, it includes Arc's precompile logic, so it can reproduce reverts from
blocklisted addresses, failed native USDC transfers, and other Arc-specific
conditions.

```bash theme={null}
arc-cast run <TX_HASH> \
  --rpc-url $ARC_TESTNET_RPC_URL
```

```text theme={null}
Traces:
  [34521] YourContract::yourFunction()
    ├─ [1200] <Arc precompile>::transfer(0xBlocklistedAddr, 1000000000000)
    │   └─ ← [Revert] "Blocklisted address"
    └─ ← [Revert]
```

## Fork testnet state

`arc-anvil --fork-url` starts a local node seeded with a snapshot of testnet
state. You can call contracts, send transactions, and impersonate accounts
without spending gas or waiting for block inclusion.

```bash theme={null}
arc-anvil --fork-url $ARC_TESTNET_RPC_URL
```

```text theme={null}
Forking from https://rpc.testnet.arc.io (block 2041837)
Listening on 127.0.0.1:8545
```

Once the fork is running, `arc-forge test` and `arc-cast` can target it. You can
also call contracts directly:

```bash theme={null}
arc-cast call <YOUR_CONTRACT_ADDRESS> "myFunction()(uint256)" \
  --rpc-url http://127.0.0.1:8545
```

> [!TIP]
>
> Fork a specific block to reproduce a historical issue: pass
> `--fork-block-number <BLOCK>` to `arc-anvil`. The local node serves the chain
> state exactly as it appeared at that block.

## Test USDC interactions

`arc-forge test --fork-url` runs your test suite against a live fork of Arc
testnet. A test that passes on standard `anvil` can still revert on Arc if your
contract treats `msg.value` and `USDC.balanceOf` as independent amounts. Both
views share one balance, but `msg.value` uses 18 decimals while `USDC.balanceOf`
uses 6 (see [EVM differences](/arc/references/evm-differences) for details).
Standard `anvil` doesn't simulate this.

```bash theme={null}
arc-forge test --fork-url $ARC_TESTNET_RPC_URL
```

```text theme={null}
Ran 2 tests for test/MyToken.t.sol:MyTokenTest
[PASS] testNativeTransfer() (gas: 51203)
[PASS] testUSDCBalance() (gas: 34821)

Suite result: ok. 2 passed; 0 failed
```

If any test fails, check whether your contract assumes separate native and
ERC-20 balances. On Arc, `msg.value` and `USDC.balanceOf` reflect the same
underlying balance at different decimal precisions. Adjust your assertions to
account for the 18-to-6 decimal conversion.

For more information about how Arc transactions behave differently from other
EVM blockchains, see [EVM differences](/arc/references/evm-differences).
