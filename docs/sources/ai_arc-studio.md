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

# Arc Studio

> Idea to app in minutes.

Arc Studio is an AI coding agent for building internet financial infrastructure:
stablecoins, smart contracts, and payments. Describe what you want to build in
natural language, and Arc Studio writes, previews, and deploys a working
full-stack onchain app for you. It defaults to [Arc](/arc-chain) and
[USDC](/arc/concepts/stablecoin-native-model), so your app is ready for onchain
money out of the box.

Use Arc Studio in the browser, where a live preview, editable code and file
workbench, and terminal are built in. You can also paste the Arc Studio setup
prompt into your preferred editor: Claude, Codex, or Cursor. Arc Studio builds
and deploys to Arc testnet, so you can ship and iterate safely (it does not
deploy to mainnet on your behalf).

## Capabilities

* **Build apps from a prompt.** Turn a natural-language description into a
  working full-stack onchain app in minutes.
* **Generate and deploy smart contracts.** Plan, generate, compile, and deploy
  Solidity contracts to Arc testnet.
* **Build on existing contracts.** Create a frontend on top of a contract that's
  already deployed.
* **Preview live and iterate.** Run your app in a live sandbox, submit real
  testnet transactions, and refine it through chat.
* **Start from a template.** Remix prebuilt sample apps like a prediction
  market, a USDC checkout flow, a crosschain bridge, or an onchain profile.
* **Move USDC out of the box.** USDC and a built-in Arc testnet faucet are ready
  by default, so you can fund a wallet and move money without leaving Arc
  Studio.
* **Connect a wallet.** Sign and send transactions from the live preview with a
  connected wallet.
* **Export your code.** Push to GitHub to keep building or deploy elsewhere.

> **[Start Building](https://studio.arc.io/)**
>
> Open Arc Studio and build your first onchain app on Arc.
