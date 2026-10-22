/**
 * Arc chain definitions.
 * Arc's native currency IS USDC (18-decimal native view, same pool as the
 * 6-decimal ERC-20 view). We expose both for wagmi (which needs the native
 * decimals) and for our USDC logic (which uses 6-decimal ERC-20 balanceOf).
 */
import { defineChain } from 'viem'

export const ARC_USDC = '0x3600000000000000000000000000000000000000' as const

export const arcTestnet = defineChain({
  id: 5042002,
  name: 'Arc Testnet',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.testnet.arc.io'] } },
  blockExplorers: {
    default: { name: 'Arc Explorer', url: 'https://explorer.testnet.arc.io' },
  },
  testnet: true,
})

export const arcMainnet = defineChain({
  id: 5042,
  name: 'Arc',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.mainnet.arc.io'] } },
  blockExplorers: {
    default: { name: 'Arc Explorer', url: 'https://explorer.arc.io' },
  },
})

export const ARC_CHAINS = [arcTestnet, arcMainnet] as const
export type ArcChain = (typeof ARC_CHAINS)[number]

export function explorerTx(chainId: number, hash: string) {
  const chain = ARC_CHAINS.find((c) => c.id === chainId)
  const base = chain?.blockExplorers.default.url ?? 'https://explorer.testnet.arc.io'
  return `${base}/tx/${hash}`
}

export function explorerAddr(chainId: number, addr: string) {
  const chain = ARC_CHAINS.find((c) => c.id === chainId)
  const base = chain?.blockExplorers.default.url ?? 'https://explorer.testnet.arc.io'
  return `${base}/address/${addr}`
}
