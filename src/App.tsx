import React, { useState, useCallback, useEffect } from 'react'
import { Shield } from 'lucide-react'
import { useAccount, useSwitchChain } from 'wagmi'
import { ChainBar } from './components/ChainBar'
import { ContractBar } from './components/ContractBar'
import { PayerPanel } from './components/PayerPanel'
import { VerifierPanel } from './components/VerifierPanel'
import { ReleasePanel } from './components/ReleasePanel'
import { EscrowTable } from './components/EscrowTable'
import { ActivityLog } from './components/ActivityLog'
import type { LogEntry } from './types'

// ── Per-chain default contract addresses ──────────────────────────────────────
export const CHAIN_DEFAULTS: Record<number, `0x${string}`> = {
  5042002: '0x82842c7df122d8d4a5e37f0e46404e42a251f6ee', // Arc Testnet (hardened)
  5042:    '0x3622FfDCFE88c542aB1203a00282e128159edDE7', // Arc Mainnet
}

const ARC_TESTNET_ID = 5042002
const ARC_MAINNET_ID = 5042

// ── URL-param helpers ─────────────────────────────────────────────────────────
function readUrlParams(): { chainId?: number; contract?: `0x${string}` } {
  const p = new URLSearchParams(window.location.search)
  const net = p.get('net')
  const contract = p.get('contract')

  let chainId: number | undefined
  if (net === 'arcMainnet') chainId = ARC_MAINNET_ID
  else if (net === 'arcTestnet') chainId = ARC_TESTNET_ID

  const addr = contract?.match(/^0x[0-9a-fA-F]{40}$/) ? (contract as `0x${string}`) : undefined

  return { chainId, contract: addr }
}

let _logId = 0

export default function App() {
  const { chainId } = useAccount()
  const { switchChain } = useSwitchChain()

  // ── Initialise from URL params (once) ────────────────────────────────────
  const [urlInit] = useState(() => readUrlParams())

  // Apply ?net= on mount
  useEffect(() => {
    if (urlInit.chainId && urlInit.chainId !== chainId) {
      switchChain({ chainId: urlInit.chainId })
    }
  // Only run once on mount; urlInit is stable
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Contract address: URL param > chain default ───────────────────────────
  const defaultForChain = (id: number | undefined): `0x${string}` =>
    CHAIN_DEFAULTS[id ?? ARC_TESTNET_ID] ?? CHAIN_DEFAULTS[ARC_TESTNET_ID]

  const [contractOverride, setContractOverride] = useState<`0x${string}` | undefined>(
    urlInit.contract
  )

  // When the chain changes (and no user override), reset to that chain's default
  const [prevChainId, setPrevChainId] = useState(chainId)
  if (chainId !== prevChainId) {
    setPrevChainId(chainId)
    if (!contractOverride) {
      // nothing to do — effectiveAddress already picks the new default
    } else {
      // If the override is one of our known defaults for a *different* chain, clear it
      const isKnownDefault = Object.values(CHAIN_DEFAULTS).some(
        (a) => a.toLowerCase() === contractOverride.toLowerCase()
      )
      if (isKnownDefault) setContractOverride(undefined)
    }
  }

  const effectiveAddress: `0x${string}` = contractOverride ?? defaultForChain(chainId)

  const isMainnet = chainId === ARC_MAINNET_ID

  // ── Activity log ─────────────────────────────────────────────────────────
  const [log, setLog] = useState<LogEntry[]>([])
  const [lastEscrowId, setLastEscrowId] = useState<bigint | undefined>()

  const addLog = useCallback((entry: Omit<LogEntry, 'id' | 'ts'>) => {
    setLog((prev) => [...prev, { ...entry, id: ++_logId, ts: Date.now() }])
  }, [])

  return (
    <div className="min-h-dvh" style={{ background: 'var(--bg-gradient)' }}>
      {/* ── Mainnet warning banner ────────────────────────────────────────── */}
      {isMainnet && (
        <div className="w-full bg-amber-500/15 border-b border-amber-500/30 px-4 py-2 flex items-center justify-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-400 uppercase tracking-widest">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            MAINNET — real USDC
          </span>
          <span className="text-xs text-amber-400/70">Transactions on this network use real funds and are irreversible.</span>
        </div>
      )}

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-20 border-b border-[var(--border)] bg-[var(--surface)] backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 mr-auto">
            <Shield size={18} className="text-[var(--accent)]" />
            <span className="display font-semibold text-sm text-[var(--ink)] tracking-tight">
              VerifyPay Escrow
            </span>
            {isMainnet && (
              <span className="ml-1 inline-flex items-center gap-1 rounded-md bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-400 uppercase tracking-widest border border-amber-500/30">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                Mainnet
              </span>
            )}
          </div>
          <ChainBar />
        </div>
      </header>

      {/* ── Main layout ───────────────────────────────────────────────────── */}
      <main className="max-w-6xl mx-auto px-4 py-6 grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Left column */}
        <div className="flex flex-col gap-4 lg:col-span-2">
          <ContractBar
            contractAddress={effectiveAddress}
            chainId={chainId}
            onAddressChange={(addr) => setContractOverride(addr)}
          />

          <PayerPanel
            contractAddress={effectiveAddress}
            addLog={addLog}
            onEscrowCreated={(id) => setLastEscrowId(id)}
          />

          <VerifierPanel
            contractAddress={effectiveAddress}
            prefillEscrowId={lastEscrowId}
          />

          <ReleasePanel
            contractAddress={effectiveAddress}
            addLog={addLog}
            prefillEscrowId={lastEscrowId}
          />
        </div>

        {/* Right column */}
        <div className="flex flex-col gap-4">
          <EscrowTable contractAddress={effectiveAddress} />
          <ActivityLog entries={log} />
        </div>
      </main>
    </div>
  )
}
