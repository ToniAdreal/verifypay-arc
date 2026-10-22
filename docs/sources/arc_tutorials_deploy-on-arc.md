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

# Deploy on Arc

> Deploy and interact with a Solidity smart contract on Arc Testnet using Arc Foundry.

Try it on Arc Studio

Deploy a contract to Arc Testnet and interact with it onchain. You'll initialize
a starter project and use the generated `Counter` contract to complete the full
deploy pipeline before developing your own contracts.

## Prerequisites

Before you begin, ensure that you've:

* [Installed Arc Foundry](/arc/tutorials/install-arc-foundry)
* Installed [Git](https://git-scm.com/)

## Step 1. Initialize a project

From your working directory, initialize a new project:

```shell theme={null}
arc-forge init hello-arc && cd hello-arc
```

This generates `src/Counter.sol`, a matching test file at `test/Counter.t.sol`,
and a deployment script at `script/Counter.s.sol`. The generated `.gitignore`
already excludes `.env` from version control.

## Step 2. Configure the RPC connection

Create a `.env` file in the project root with the Arc Testnet RPC URL:

```ini theme={null}
ARC_TESTNET_RPC_URL="https://rpc.testnet.arc.io"
```

Load the variables into your shell:

```shell theme={null}
source .env
```

> [!TIP]
>
> Never commit your `.env` file to version control. Store private keys and
> sensitive variables securely.

## Step 3. Test the contract

From your `hello-arc` project directory, run the `Counter` tests against Arc's
runtime before deploying:

```shell theme={null}
arc-forge test --network arc
```

The `--network arc` flag catches Arc-specific issues that a generic EVM
simulator would miss. Use it when testing your own contracts, too.

> [!TIP]
>
> Use `arc-anvil --network arc` to run a local Arc node during development. It
> supports forking testnet state and testing contract interactions manually
> before deploying.

## Step 4. Set up your wallet

### 4.1. Create a wallet

Create a new wallet with `arc-cast`. If you already have a development wallet,
skip this and add your wallet's private key to your `.env` file in step 4.2
instead:

```shell theme={null}
arc-cast wallet new
```

The command returns an address and private key:

```text theme={null}
Successfully created new keypair.
Address:     0xB815A0c4bC23930119324d4359dB65e27A846A2d
Private key: 0xcc1b30a6af68ea9a9917f1dd••••••••••••••••••••••••••••••••••••••97c5
```

> [!WARNING]
>
> Keep your private key secure. Never share it or commit it to source control.
> Use environment variables or a secrets manager for any non-test deployment.

### 4.2. Configure your `.env`

Add the private key to your `.env` file and reload:

```ini theme={null}
PRIVATE_KEY="0x..."
```

```shell theme={null}
source .env
```

### 4.3. Fund your wallet

Visit the [Circle Faucet](https://faucet.circle.com), select **Arc Testnet**,
enter your wallet address, and request testnet USDC.
[Arc uses USDC for gas](/arc/references/gas-and-fees), so this balance covers
your deployment fees.

> [!NOTE]
>
> Testnet USDC is for testing purposes only. You can't use it in production.

## Step 5. Deploy to Arc Testnet

### 5.1. Deploy the contract

Deploy to Arc Testnet:

```shell theme={null}
arc-forge create src/Counter.sol:Counter \
  --rpc-url $ARC_TESTNET_RPC_URL \
  --private-key $PRIVATE_KEY \
  --broadcast
```

Replace `src/Counter.sol:Counter` with your own contract path and name when
deploying your own contracts.

After deployment completes, you'll see output similar to:

```text theme={null}
Deployer: 0xB815A0c4bC23930119324d4359dB65e27A846A2d
Deployed to: 0x32368037b14819C9e5Dbe96b3d67C59b8c65c4BF
Transaction hash: 0xeba0fcb5e528d586db0aeb2465a8fad0299330a9773ca62818a1827560a67346
```

Save the `Deployed to` address from the output to your `.env` file and reload:

```ini theme={null}
COUNTER_ADDRESS="0x..."
```

```shell theme={null}
source .env
```

### 5.2. Verify the contract on Arc Testnet Explorer

Arc Testnet Explorer runs Blockscout, so you can publish your contract's source
code with `arc-forge verify-contract` and Foundry's Blockscout verifier.
Verified contracts show a **Contract** tab on the explorer with source code,
ABI, and a read/write UI.

Run the verification command from your Foundry project root, using the same
compiler settings you used to deploy:

```shell theme={null}
arc-forge verify-contract $COUNTER_ADDRESS src/Counter.sol:Counter \
  --chain-id 5042002 \
  --verifier blockscout \
  --verifier-url https://explorer.testnet.arc.io/api/
```

If your contract's constructor takes arguments, ABI-encode them with
`arc-cast abi-encode` and pass the result with `--constructor-args`. For
example:

```shell theme={null}
arc-forge verify-contract $CONTRACT_ADDRESS src/MyToken.sol:MyToken \
  --chain-id 5042002 \
  --verifier blockscout \
  --verifier-url https://explorer.testnet.arc.io/api/ \
  --constructor-args $(arc-cast abi-encode "constructor(string,string)" "MyToken" "MTK")
```

> [!TIP]
>
> You can also submit source code manually from the [contract verification
> page](https://explorer.testnet.arc.io/contract-verification) on the explorer
> if you didn't deploy with Foundry.

After verification succeeds, open the deployed address on
[explorer.testnet.arc.io](https://explorer.testnet.arc.io) to confirm the
**Contract** tab now shows the verified source and lets you call functions
directly from the UI.

## Step 6. Interact with your contract

Confirm the deployment on the
[Arc Testnet Explorer](https://explorer.testnet.arc.io) by entering the
transaction hash from step 5.1.

Read the current counter value with `arc-cast call`:

```shell theme={null}
arc-cast call $COUNTER_ADDRESS "number()(uint256)" \
  --rpc-url $ARC_TESTNET_RPC_URL
```

A freshly deployed `Counter` returns `0`. Increment it onchain with
`arc-cast send`:

```shell theme={null}
arc-cast send $COUNTER_ADDRESS "increment()" \
  --rpc-url $ARC_TESTNET_RPC_URL \
  --private-key $PRIVATE_KEY
```

Re-run the `arc-cast call` command. The returned value is now `1`.

You now have a working deployment pipeline on Arc Testnet. To deploy
production-ready tokens or NFTs without writing Solidity, see
[Deploy contracts](/arc/tutorials/deploy-contracts).

> [!NOTE]
>
> If you encounter unexpected behavior after deploying, see [Troubleshoot with
> Arc Foundry](/arc/tutorials/troubleshoot-with-arc-foundry).
