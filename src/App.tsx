import React, { useState, useCallback } from 'react'
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

// ── Per-chain canonical contract addresses ────────────────────────────────────
export const CHAIN_DEFAULTS: Record<number, `0x${string}`> = {
  5042002: '0x82842c7df122d8d4a5e37f0e46404e42a251f6ee', // Arc Testnet (hardened v2)
  5042:    '0x3622FfDCFE88c542aB1203a00282e128159edDE7', // Arc Mainnet
}

const ARC_TESTNET_ID = 5042002
const ARC_MAINNET_ID = 5042

// ── Parse URL params once ─────────────────────────────────────────────────────
function parseUrlParams(): { chainId: number; contract?: `0x${string}` } {
  const p = new URLSearchParams(window.location.search)
  const net = p.get('net')
  const contract = p.get('contract')
  const chainId = net === 'arcMainnet' ? ARC_MAINNET_ID : ARC_TESTNET_ID
  const addr = contract?.match(/^0x[0-9a-fA-F]{40}$/) ? (contract as `0x${string}`) : undefined
  return { chainId, contract: addr }
}

let _logId = 0

export default function App() {
  const { chainId: walletChainId, isConnected } = useAccount()
  const { switchChain } = useSwitchChain()

  // ── Selected network ──────────────────────────────────────────────────────
  // `userPick` tracks what the user last clicked in the chain bar (or the URL
  // param). It is undefined until the user makes an explicit choice.
  // The effective chain is: wallet chain (if Arc) > userPick > URL default.
  // This avoids setState-in-effect by deriving the value during render.
  const [urlInit] = useState(parseUrlParams)
  const [userPick, setUserPick] = useState<number | undefined>(undefined)

  const walletIsArc = walletChainId === ARC_TESTNET_ID || walletChainId === ARC_MAINNET_ID
  const selectedChainId: number = (walletIsArc ? walletChainId : undefined) ?? userPick ?? urlInit.chainId

  // When the user clicks the chain selector, record their choice AND switch wallet.
  function handleSelectChain(id: number) {
    setUserPick(id)
    if (isConnected) switchChain({ chainId: id })
  }

  // ── Contract address ──────────────────────────────────────────────────────
  const [contractOverride, setContractOverride] = useState<`0x${string}` | undefined>(
    urlInit.contract
  )

  // Clear a known-default override when the chain changes, so the new chain's
  // default takes over automatically.
  const [prevChain, setPrevChain] = useState(selectedChainId)
  if (selectedChainId !== prevChain) {
    setPrevChain(selectedChainId)
    if (contractOverride) {
      const isKnownDefault = Object.values(CHAIN_DEFAULTS).some(
        (a) => a.toLowerCase() === contractOverride.toLowerCase()
      )
      if (isKnownDefault) setContractOverride(undefined)
    }
  }

  const effectiveAddress: `0x${string}` =
    contractOverride ?? CHAIN_DEFAULTS[selectedChainId] ?? CHAIN_DEFAULTS[ARC_TESTNET_ID]

  const isMainnet = selectedChainId === ARC_MAINNET_ID

  // ── Activity log ──────────────────────────────────────────────────────────
  const [log, setLog] = useState<LogEntry[]>([])
  const [lastEscrowId, setLastEscrowId] = useState<bigint | undefined>()

  const addLog = useCallback((entry: Omit<LogEntry, 'id' | 'ts'>) => {
    setLog((prev) => [...prev, { ...entry, id: ++_logId, ts: Date.now() }])
  }, [])

  return (
    <div className="min-h-dvh" style={{ background: 'var(--bg-gradient)' }}>
      {/* ── Mainnet warning banner ───────────────────────────────────────── */}
      {isMainnet && (
        <div className="w-full bg-amber-500/15 border-b border-amber-500/30 px-4 py-2 flex items-center justify-center gap-2 flex-wrap">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-400 uppercase tracking-widest">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            MAINNET — real USDC
          </span>
          <span className="text-xs text-amber-400/70">
            Transactions on this network use real funds and are irreversible.
          </span>
        </div>
      )}

      {/* ── Header ──────────────────────────────────────────────────────── */}
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
          <ChainBar
            selectedChainId={selectedChainId}
            onSelectChain={handleSelectChain}
          />
        </div>
      </header>

      {/* ── Main layout ─────────────────────────────────────────────────── */}
      <main className="max-w-6xl mx-auto px-4 py-6 grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Left column */}
        <div className="flex flex-col gap-4 lg:col-span-2">
          <ContractBar
            contractAddress={effectiveAddress}
            selectedChainId={selectedChainId}
            onAddressChange={(addr) => setContractOverride(addr)}
          />

          <PayerPanel
            contractAddress={effectiveAddress}
            selectedChainId={selectedChainId}
            addLog={addLog}
            onEscrowCreated={(id) => setLastEscrowId(id)}
          />

          <VerifierPanel
            contractAddress={effectiveAddress}
            selectedChainId={selectedChainId}
            prefillEscrowId={lastEscrowId}
          />

          <ReleasePanel
            contractAddress={effectiveAddress}
            selectedChainId={selectedChainId}
            addLog={addLog}
            prefillEscrowId={lastEscrowId}
          />
        </div>

        {/* Right column */}
        <div className="flex flex-col gap-4">
          <EscrowTable
            contractAddress={effectiveAddress}
            selectedChainId={selectedChainId}
          />
          <ActivityLog entries={log} />
        </div>
      </main>
    </div>
  )
}
