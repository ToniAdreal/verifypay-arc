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

# Connect to Arc

> Set up your wallet and configure your development environment for Arc.

Connect a wallet to Arc using one-click setup or manual configuration.

**Mainnet**

## Wallet setup

Use the following button to add Arc Mainnet to your wallet automatically.

### Manual setup

> [!TIP]
>
> Arc uses USDC as the native gas token (18 decimals). If your wallet supports
> **custom gas tokens**, ensure display/decimals are set correctly. Wallets that
> don't support custom gas tokens still work for signing and sending
> transactions; balances may display as "ETH" but the underlying token is USDC.
> See [Gas and fees](/arc/references/gas-and-fees) for details.

**MetaMask**

**1. Open network settings**

Open MetaMask → **Settings** → **Networks** → **Add network** → **Add a network manually**.

**2. Enter network details**

| Field | Value |
| :- | :- |
| **Network name** | Arc |
| **New RPC URL** | `https://rpc.mainnet.arc.io` |
| **Chain ID** | 5042 |
| **Currency symbol** | USDC |
| **Explorer URL** | `https://explorer.arc.io` |

**3. Save and switch**

Click **Save**, then switch to Arc.

**Rabby**

**1. Open network settings**

Open Rabby → click the **network selector** (top-left) → **Add Custom Network**.

**2. Enter network details**

| Field | Value |
| :- | :- |
| **Chain Name** | Arc |
| **Chain ID** | 5042 |
| **RPC URL** | `https://rpc.mainnet.arc.io` |
| **Currency** | USDC |
| **Block Explorer** | `https://explorer.arc.io` |

**3. Confirm and switch**

Click **Confirm**, then select Arc from the network list.

**Coinbase Wallet**

**1. Open network settings**

Open Coinbase Wallet → **Settings** → **Networks** → **Add custom network**.

**2. Enter network details**

| Field | Value |
| :- | :- |
| **Network name** | Arc |
| **RPC URL** | `https://rpc.mainnet.arc.io` |
| **Chain ID** | 5042 |
| **Currency symbol** | USDC |
| **Block explorer** | `https://explorer.arc.io` |

**3. Save and switch**

Click **Save**, then switch to Arc.

**Rainbow**

**1. Open network settings**

Open Rainbow → **Settings** (gear icon) → **Networks** → **Custom Network**.

**2. Enter network details**

| Field | Value |
| :- | :- |
| **Network name** | Arc |
| **RPC URL** | `https://rpc.mainnet.arc.io` |
| **Chain ID** | 5042 |
| **Symbol** | USDC |
| **Block explorer** | `https://explorer.arc.io` |

**3. Save and switch**

Click **Save**, then switch to Arc.

## Network details

| Parameter | Value |
| :- | :- |
| Chain ID | `5042` |
| Currency | USDC |
| Explorer | [explorer.arc.io](https://explorer.arc.io) |

### RPC endpoints

```text Primary theme={null}
https://rpc.mainnet.arc.io
```

```text Alchemy theme={null}
https://arc-mainnet.g.alchemy.com/v2/YOUR_API_KEY
```

```text Blockdaemon theme={null}
https://rpc.blockdaemon.mainnet.arc.io
```

```text dRPC theme={null}
https://rpc.drpc.mainnet.arc.io
```

```text QuickNode theme={null}
https://rpc.quicknode.mainnet.arc.io
```

### WebSocket endpoints

```text Alchemy theme={null}
wss://arc-mainnet.g.alchemy.com/v2/YOUR_API_KEY
```

```text Blockdaemon theme={null}
wss://rpc.blockdaemon.mainnet.arc.io/websocket
```

```text QuickNode theme={null}
wss://rpc.quicknode.mainnet.arc.io
```

**Testnet**

## Wallet setup

Use the following button to add Arc Testnet to your wallet automatically.

### Manual setup

> [!TIP]
>
> Arc uses USDC as the native gas token (18 decimals). If your wallet supports
> **custom gas tokens**, ensure display/decimals are set correctly. Wallets that
> don't support custom gas tokens still work for signing and sending
> transactions; balances may display as "ETH" but the underlying token is USDC.
> See [Gas and fees](/arc/references/gas-and-fees) for details.

**MetaMask**

**1. Open network settings**

Open MetaMask → **Settings** → **Networks** → **Add network** → **Add a network manually**.

**2. Enter network details**

| Field | Value |
| :- | :- |
| **Network name** | Arc Testnet |
| **New RPC URL** | `https://rpc.testnet.arc.io` |
| **Chain ID** | 5042002 |
| **Currency symbol** | USDC |
| **Explorer URL** | `https://explorer.testnet.arc.io` |

**3. Save and switch**

Click **Save**, then switch to Arc Testnet.

**Rabby**

**1. Open network settings**

Open Rabby → click the **network selector** (top-left) → **Add Custom Network**.

**2. Enter network details**

| Field | Value |
| :- | :- |
| **Chain Name** | Arc Testnet |
| **Chain ID** | 5042002 |
| **RPC URL** | `https://rpc.testnet.arc.io` |
| **Currency** | USDC |
| **Block Explorer** | `https://explorer.testnet.arc.io` |

**3. Confirm and switch**

Click **Confirm**, then select Arc Testnet from the network list.

**Coinbase Wallet**

**1. Open network settings**

Open Coinbase Wallet → **Settings** → **Networks** → **Add custom network**.

**2. Enter network details**

| Field | Value |
| :- | :- |
| **Network name** | Arc Testnet |
| **RPC URL** | `https://rpc.testnet.arc.io` |
| **Chain ID** | 5042002 |
| **Currency symbol** | USDC |
| **Block explorer** | `https://explorer.testnet.arc.io` |

**3. Save and switch**

Click **Save**, then switch to Arc Testnet.

**Rainbow**

**1. Open network settings**

Open Rainbow → **Settings** (gear icon) → **Networks** → **Custom Network**.

**2. Enter network details**

| Field | Value |
| :- | :- |
| **Network name** | Arc Testnet |
| **RPC URL** | `https://rpc.testnet.arc.io` |
| **Chain ID** | 5042002 |
| **Symbol** | USDC |
| **Block explorer** | `https://explorer.testnet.arc.io` |

**3. Save and switch**

Click **Save**, then switch to Arc Testnet.

## Network details

| Parameter | Value |
| :- | :- |
| Chain ID | `5042002` |
| Currency | USDC |
| Explorer | [explorer.testnet.arc.io](https://explorer.testnet.arc.io) |
| Faucet | [faucet.circle.com](https://faucet.circle.com) |

### RPC endpoints

```text Primary theme={null}
https://rpc.testnet.arc.io
```

```text Blockdaemon theme={null}
https://rpc.blockdaemon.testnet.arc.io
```

```text dRPC theme={null}
https://rpc.drpc.testnet.arc.io
```

```text QuickNode theme={null}
https://rpc.quicknode.testnet.arc.io
```

### WebSocket endpoints

```text Primary theme={null}
wss://rpc.testnet.arc.io
```

```text Blockdaemon theme={null}
wss://rpc.blockdaemon.testnet.arc.io:443/websocket
```

```text dRPC theme={null}
wss://rpc.drpc.testnet.arc.io
```

```text QuickNode theme={null}
wss://rpc.quicknode.testnet.arc.io
```

## Frontend wallet libraries

Use `wagmi` and `viem` to integrate Arc into
[ConnectKit](https://family.co/docs/connectkit),
[Reown AppKit](https://docs.reown.com/appkit/overview), or a bare
[WalletConnect](https://docs.walletconnect.com) connector.

> [!WARNING]
>
> Don't display native USDC and ERC-20 USDC as separate balance rows. They're
> the same balance; always show a single USDC balance.

### Chain definition

&#x20;

**Mainnet**

`viem` ships Arc Mainnet as a built-in chain. No manual definition is needed.

```typescript theme={null}
import { arc } from "viem/chains";
```

**Testnet**

`viem` ships Arc Testnet as a built-in chain. No manual definition is needed.

```typescript theme={null}
import { arcTestnet } from "viem/chains";
```

### Configure wallet connection

Pick the tab that matches your setup.

&#x20;

**ConnectKit**

```bash theme={null}
npm install connectkit wagmi viem
```

```typescript theme={null}
import { arc, arcTestnet, mainnet } from "viem/chains";
import { createConfig, http } from "wagmi";
import { getDefaultConfig } from "connectkit";

const config = createConfig(
  getDefaultConfig({
    chains: [arc, arcTestnet, mainnet],
    transports: {
      [arc.id]: http("https://rpc.mainnet.arc.io"),
      [arcTestnet.id]: http("https://rpc.testnet.arc.io"),
      [mainnet.id]: http("https://cloudflare-eth.com"),
    },
    walletConnectProjectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID,
    appName: "Your App Name",
  }),
);
```

> [!WARNING]
>
> When `mainnet` is omitted from `chains`, ConnectKit falls back to its own
> `eth.merkle.io` endpoint for ENS name lookups, which blocks cross-origin
> browser requests. Include `mainnet` with a CORS-safe transport (such as the
> Cloudflare endpoint shown earlier) to prevent this.

**Reown AppKit**

```bash theme={null}
npm install @reown/appkit @reown/appkit-adapter-wagmi wagmi viem @tanstack/react-query
```

> [!WARNING]
>
> Import `defineChain` from `@reown/appkit/networks`, not from `viem`. AppKit
> requires two additional fields (`caipNetworkId` and `chainNamespace`) that
> `viem`'s version omits; using the wrong import causes a runtime error.

```typescript theme={null}
import { defineChain } from "@reown/appkit/networks";
import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import { createAppKit } from "@reown/appkit/react";

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;

const arc = defineChain({
  id: 5042,
  caipNetworkId: "eip155:5042",
  chainNamespace: "eip155",
  name: "Arc",
  nativeCurrency: { decimals: 18, name: "USDC", symbol: "USDC" },
  rpcUrls: {
    default: {
      http: ["https://rpc.mainnet.arc.io"],
      webSocket: ["wss://rpc.quicknode.mainnet.arc.io"],
    },
  },
  blockExplorers: {
    default: { name: "Arc Explorer", url: "https://explorer.arc.io" },
  },
});

const arcTestnet = defineChain({
  id: 5042002,
  caipNetworkId: "eip155:5042002",
  chainNamespace: "eip155",
  name: "Arc Testnet",
  nativeCurrency: { decimals: 18, name: "USDC", symbol: "USDC" },
  rpcUrls: {
    default: {
      http: ["https://rpc.testnet.arc.io"],
      webSocket: ["wss://rpc.testnet.arc.io"],
    },
  },
  blockExplorers: {
    default: { name: "Block Explorer", url: "https://explorer.testnet.arc.io" },
  },
  testnet: true,
});

const wagmiAdapter = new WagmiAdapter({
  networks: [arc, arcTestnet],
  projectId,
});

createAppKit({
  adapters: [wagmiAdapter],
  networks: [arc, arcTestnet],
  projectId,
  metadata: {
    name: "Your App Name",
    description: "Your App Description",
    url: "https://yourdomain.com",
    icons: ["https://yourdomain.com/icon.png"],
  },
});
```

> [!NOTE]
>
> Get a project ID at [dashboard.reown.com](https://dashboard.reown.com). The
> same project ID works for the bare WalletConnect connector.

**WalletConnect**

For `wagmi` apps that need WalletConnect sessions without Reown AppKit's full modal UI.

```typescript theme={null}
import { arc, arcTestnet } from "viem/chains";
import { createConfig, http } from "wagmi";
import { walletConnect } from "wagmi/connectors";

const config = createConfig({
  chains: [arc, arcTestnet],
  connectors: [
    walletConnect({
      projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID,
      metadata: {
        name: "Your App",
        description: "Your App Description",
        url: "https://yourdomain.com",
        icons: ["https://yourdomain.com/icon.png"],
      },
    }),
  ],
  transports: {
    [arc.id]: http("https://rpc.mainnet.arc.io"),
    [arcTestnet.id]: http("https://rpc.testnet.arc.io"),
  },
});
```

> [!NOTE]
>
> Arc Testnet (chain ID 5042002) is not registered in the WalletConnect chain
> registry. On first connection, WalletConnect issues a
> `wallet_addEthereumChain` call per user.
