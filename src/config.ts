/**
 * wagmi configuration — Arc Testnet + Arc Mainnet + Ethereum mainnet (ENS).
 */
import { http, createConfig } from 'wagmi'
import { mainnet } from 'wagmi/chains'
import { injected } from 'wagmi/connectors'
import { registerChain } from './tracing'
import { arcTestnet, arcMainnet } from './chains'

registerChain(arcTestnet.id, arcTestnet.rpcUrls.default.http[0])
registerChain(arcMainnet.id, arcMainnet.rpcUrls.default.http[0])

export const config = createConfig({
  chains: [arcTestnet, arcMainnet, mainnet],
  connectors: [injected()],
  transports: {
    [arcTestnet.id]: http(),
    [arcMainnet.id]: http(),
    [mainnet.id]: http(),
  },
})
