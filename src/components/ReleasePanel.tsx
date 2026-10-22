/**
 * Release + Refund panel (callable by anyone / payer).
 * Performs a staticCall first and decodes custom errors before broadcasting.
 */
import React, { useState } from 'react'
import {
  useAccount,
  useWriteContract,
  useWaitForTransactionReceipt,
  usePublicClient,
  useSwitchChain,
} from 'wagmi'
import { Loader2 as Spin, CheckCircle2, AlertCircle } from 'lucide-react'
import { ESCROW_ABI } from '../escrow-abi'
import { decodeEscrowError } from '../escrow-errors'
import { useDynamicFees } from '../hooks/useDynamicFees'
import type { LogEntry } from '../types'

interface Props {
  contractAddress: string
  addLog: (entry: Omit<LogEntry, 'id' | 'ts'>) => void
  prefillEscrowId?: bigint
  prefillSig?: string
}

export function ReleasePanel({ contractAddress, addLog, prefillEscrowId, prefillSig }: Props) {
  const { address, chainId, isConnected } = useAccount()
  const { switchChain } = useSwitchChain()
  const publicClient = usePublicClient()
  const fees = useDynamicFees()

  const [escrowIdOverride, setEscrowIdOverride] = useState<string | undefined>()
  const [deliverableHash, setDeliverableHash] = useState('')
  const [signatureOverride, setSignatureOverride] = useState<string | undefined>()
  const [simResult, setSimResult] = useState<{ ok: boolean; msg: string } | null>(null)
  const [simulating, setSimulating] = useState(false)

  // Derived: user edits win; fall back to prefill from parent
  const escrowId = escrowIdOverride ?? prefillEscrowId?.toString() ?? ''
  const setEscrowId = (v: string) => setEscrowIdOverride(v)
  const signature = signatureOverride ?? prefillSig ?? ''
  const setSignature = (v: string) => setSignatureOverride(v)

  // ── staticCall simulation ─────────────────────────────────────────────────
  async function simulate() {
    if (!publicClient || !safeId || !safeHash || !safeSig) return
    setSimulating(true)
    setSimResult(null)
    try {
      await publicClient.simulateContract({
        address: contractAddress as `0x${string}`,
        abi: ESCROW_ABI,
        functionName: 'release',
        args: [safeId, safeHash, safeSig],
        account: address,
      })
      setSimResult({ ok: true, msg: 'Simulation passed — transaction should succeed' })
    } catch (e: unknown) {
      setSimResult({ ok: false, msg: decodeEscrowError(e) })
    } finally {
      setSimulating(false)
    }
  }

  // ── release ───────────────────────────────────────────────────────────────
  const { writeContract: doRelease, data: relHash, isPending: releasing, error: releaseErr } =
    useWriteContract()
  const { isLoading: releaseConfirming, isSuccess: releaseSuccess } =
    useWaitForTransactionReceipt({ hash: relHash })

  React.useEffect(() => {
    if (releaseSuccess && relHash) {
      addLog({ kind: 'success', label: `Released escrow #${escrowId}`, txHash: relHash, chainId: chainId! })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [releaseSuccess])

  // ── refund ────────────────────────────────────────────────────────────────
  const { writeContract: doRefund, data: refHash, isPending: refunding, error: refundErr } =
    useWriteContract()
  const { isLoading: refundConfirming, isSuccess: refundSuccess } =
    useWaitForTransactionReceipt({ hash: refHash })

  React.useEffect(() => {
    if (refundSuccess && refHash) {
      addLog({ kind: 'success', label: `Refunded escrow #${escrowId}`, txHash: refHash, chainId: chainId! })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refundSuccess])

  const safeId = escrowId.match(/^\d+$/) ? BigInt(escrowId) : undefined
  const safeHash = (deliverableHash.startsWith('0x') && deliverableHash.length === 66)
    ? (deliverableHash as `0x${string}`)
    : undefined
  // Exactly 65 bytes = 0x + 130 hex chars.
  // Reject high-s (s > n/2) before even submitting — mirrors the contract check.
  const SECP256K1_HALF_N = BigInt('0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0')
  const safeSig = (() => {
    if (!signature.startsWith('0x') || signature.length !== 132) return undefined
    // Extract s (bytes 32-64 of the 65-byte payload, i.e. hex chars 2+64 to 2+128).
    const sHex = '0x' + signature.slice(66, 130)
    try {
      if (BigInt(sHex) > SECP256K1_HALF_N) return undefined
    } catch { return undefined }
    return signature as `0x${string}`
  })()

  const arcId = (chainId === 5042002 || chainId === 5042) ? chainId : 5042002

  function handleRelease() {
    if (!isConnected || !safeId || !safeHash || !safeSig) return
    if (chainId !== 5042002 && chainId !== 5042) {
      switchChain({ chainId: 5042002 as const })
      return
    }
    doRelease({
      address: contractAddress as `0x${string}`,
      abi: ESCROW_ABI,
      functionName: 'release',
      args: [safeId, safeHash, safeSig],
      maxFeePerGas: fees.maxFeePerGas,
      maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
      chainId: arcId,
    })
  }

  function handleRefund() {
    if (!isConnected || !safeId) return
    if (chainId !== 5042002 && chainId !== 5042) {
      switchChain({ chainId: 5042002 as const })
      return
    }
    doRefund({
      address: contractAddress as `0x${string}`,
      abi: ESCROW_ABI,
      functionName: 'refund',
      args: [safeId],
      maxFeePerGas: fees.maxFeePerGas,
      maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
      chainId: arcId,
    })
  }

  return (
    <div className="card flex flex-col gap-4">
      <h2 className="font-semibold text-sm text-[var(--ink)]">Release / Refund</h2>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="label">Escrow ID</span>
          <input
            className="field tabular-nums"
            value={escrowId}
            onChange={(e) => setEscrowId(e.target.value)}
            placeholder="1"
          />
        </label>
        <label className="flex flex-col gap-1 sm:col-span-2">
          <span className="label">Deliverable hash (bytes32)</span>
          <input
            className="field mono text-xs"
            value={deliverableHash}
            onChange={(e) => setDeliverableHash(e.target.value)}
            placeholder="0x…"
          />
        </label>
        <label className="flex flex-col gap-1 sm:col-span-2">
          <span className="label">Verifier signature (65-byte hex)</span>
          <textarea
            className="field mono text-xs resize-none h-16"
            value={signature}
            onChange={(e) => setSignature(e.target.value)}
            placeholder="0x…"
          />
          {signature && !safeSig && (
            <span className="text-xs text-[var(--danger)]">
              {signature.length !== 132
                ? `Expected 132 chars (0x + 130 hex), got ${signature.length}`
                : 'High-s signature — re-sign with a compliant wallet'}
            </span>
          )}
        </label>
      </div>

      {/* Simulation */}
      <div className="flex gap-2 flex-wrap items-center">
        <button
          className="btn-ghost text-xs px-3 py-2 flex items-center gap-1.5"
          onClick={() => { void simulate() }}
          disabled={simulating || !safeId || !safeHash || !safeSig}
        >
          {simulating && <Spin size={12} className="animate-spin" />}
          Simulate (staticCall)
        </button>
        {simResult && (
          <div className={`flex items-center gap-1.5 text-xs ${simResult.ok ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>
            {simResult.ok ? <CheckCircle2 size={12} /> : <AlertCircle size={12} />}
            {simResult.msg}
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex gap-2 flex-wrap">
        <button
          className="btn flex items-center gap-2"
          onClick={handleRelease}
          disabled={releasing || releaseConfirming || !safeId || !safeHash || !safeSig || !isConnected}
        >
          {(releasing || releaseConfirming) && <Spin size={13} className="animate-spin" />}
          {releaseSuccess && <CheckCircle2 size={13} />}
          Release
        </button>
        <button
          className="btn-ghost flex items-center gap-2 text-[var(--danger)] border-[var(--danger)]/30 hover:bg-[var(--danger)]/10"
          onClick={handleRefund}
          disabled={refunding || refundConfirming || !safeId || !isConnected}
        >
          {(refunding || refundConfirming) && <Spin size={13} className="animate-spin" />}
          {refundSuccess && <CheckCircle2 size={13} />}
          Refund (payer only)
        </button>
      </div>

      {(releasing || releaseConfirming) && (
        <p className="status-info">{releasing ? 'Waiting for wallet…' : 'Confirming release…'}</p>
      )}
      {(refunding || refundConfirming) && (
        <p className="status-info">{refunding ? 'Waiting for wallet…' : 'Confirming refund…'}</p>
      )}
      {releaseErr && <p className="status-error">{decodeEscrowError(releaseErr)}</p>}
      {refundErr && <p className="status-error">{decodeEscrowError(refundErr)}</p>}
    </div>
  )
}
