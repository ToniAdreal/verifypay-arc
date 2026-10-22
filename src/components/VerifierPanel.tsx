/**
 * Verifier panel: sign EIP-712 Pass over passDigest.
 * passDigest preview reads from the chain with no wallet.
 * Signing requires a connected wallet on the selected chain.
 */
import React, { useState } from 'react'
import { useAccount, useSignTypedData, useReadContract } from 'wagmi'
import { isHex, keccak256, toHex } from 'viem'
import { Copy, AlertCircle, CheckCircle2, Wallet } from 'lucide-react'
import { ESCROW_ABI } from '../escrow-abi'

interface Props {
  contractAddress: string
  selectedChainId: number
  prefillEscrowId?: bigint
}

interface VerifyGateEvidence {
  verdict: string
  record_hash: string
  [key: string]: unknown
}

export function VerifierPanel({ contractAddress, selectedChainId, prefillEscrowId }: Props) {
  const { isConnected, chainId: walletChainId } = useAccount()
  const onCorrectChain = isConnected && walletChainId === selectedChainId

  const [escrowIdOverride, setEscrowIdOverride] = useState<string | undefined>()
  const [deliverableHash, setDeliverableHash] = useState('')
  const [jsonPaste, setJsonPaste] = useState('')
  const [jsonErr, setJsonErr] = useState('')
  const [signature, setSignature] = useState('')
  const [copied, setCopied] = useState(false)

  // Derived: user override wins; fall back to prefill from parent
  const escrowId = escrowIdOverride ?? prefillEscrowId?.toString() ?? ''
  const setEscrowId = (v: string) => setEscrowIdOverride(v)

  // ── Read passDigest from contract (no wallet needed) ──────────────────────
  const safeEscrowId = escrowId.match(/^\d+$/) ? BigInt(escrowId) : undefined
  const safeHash = isHex(deliverableHash) && deliverableHash.length === 66
    ? (deliverableHash)
    : undefined

  const { data: digest } = useReadContract({
    address: contractAddress as `0x${string}`,
    abi: ESCROW_ABI,
    functionName: 'passDigest',
    args: safeEscrowId !== undefined && safeHash ? [safeEscrowId, safeHash] : undefined,
    chainId: selectedChainId,
    query: { enabled: !!safeEscrowId && !!safeHash && !!contractAddress },
  })

  // ── Sign (wallet required) ────────────────────────────────────────────────
  const { signTypedDataAsync, isPending: signing } = useSignTypedData()

  async function handleSign() {
    if (!onCorrectChain || !safeEscrowId || !safeHash) return
    try {
      const sig = await signTypedDataAsync({
        domain: {
          name: 'VerifyPay',
          version: '1',
          chainId: BigInt(selectedChainId),
          verifyingContract: contractAddress as `0x${string}`,
        },
        types: {
          Pass: [
            { name: 'escrowId', type: 'uint256' },
            { name: 'deliverableHash', type: 'bytes32' },
          ],
        },
        primaryType: 'Pass',
        message: {
          escrowId: safeEscrowId,
          deliverableHash: safeHash,
        },
      })
      setSignature(sig)
    } catch (e: unknown) {
      const msg = (e as { message?: string })?.message ?? ''
      if (!msg.toLowerCase().includes('user rejected')) {
        setSignature('')
      }
    }
  }

  function handleJson() {
    setJsonErr('')
    try {
      const parsed = JSON.parse(jsonPaste) as VerifyGateEvidence
      if (parsed.verdict !== 'PASS') {
        setJsonErr(`verdict is "${parsed.verdict}" — only PASS attestations can release`)
        return
      }
      const raw = parsed.record_hash
      const hash: `0x${string}` = raw.startsWith('0x') ? (raw as `0x${string}`) : `0x${raw}`
      setDeliverableHash(hash)
    } catch {
      setJsonErr('Invalid JSON')
    }
  }

  function copySignature() {
    if (!signature) return
    void navigator.clipboard.writeText(signature).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <div className="card flex flex-col gap-4">
      <h2 className="font-semibold text-sm text-[var(--ink)]">Verifier — Sign PASS</h2>

      {/* VerifyGate JSON paste */}
      <div className="flex flex-col gap-2">
        <span className="label">Paste VerifyGate evidence JSON (optional)</span>
        <textarea
          className="field resize-none h-20 text-xs"
          value={jsonPaste}
          onChange={(e) => setJsonPaste(e.target.value)}
          placeholder={'{"verdict":"PASS","record_hash":"0x…",…}'}
        />
        <button className="btn-ghost text-xs self-start px-3 py-1.5" onClick={handleJson}>
          Parse JSON
        </button>
        {jsonErr && (
          <div className="flex items-center gap-1.5 text-xs text-[var(--danger)]">
            <AlertCircle size={12} /> {jsonErr}
          </div>
        )}
      </div>

      <div className="border-t border-[var(--border)]" />

      {/* Manual fields */}
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
        <label className="flex flex-col gap-1">
          <span className="label">Deliverable hash (bytes32)</span>
          <input
            className="field mono text-xs"
            value={deliverableHash}
            onChange={(e) => setDeliverableHash(e.target.value)}
            placeholder="0x…"
          />
          <button
            className="btn-ghost text-[10px] self-start px-2 py-1 mt-0.5"
            onClick={() => deliverableHash && setDeliverableHash(keccak256(toHex(deliverableHash)))}
            title="keccak256 of the current value"
          >
            keccak256 →
          </button>
        </label>
      </div>

      {/* passDigest preview — shows with no wallet */}
      {digest && (
        <div className="rounded-lg bg-[var(--surface-muted)] p-2 text-[10px] text-[var(--muted)]">
          <span className="label text-[10px]">EIP-712 digest (passDigest)</span>
          <p className="mono break-all mt-0.5">{digest as string}</p>
        </div>
      )}

      {/* Wallet gate for signing */}
      {!isConnected ? (
        <div className="flex items-center gap-2 text-xs text-[var(--muted)] rounded-lg bg-[var(--surface-muted)] px-3 py-2">
          <Wallet size={13} />
          Connect a wallet to sign PASS attestations
        </div>
      ) : !onCorrectChain ? (
        <div className="flex items-center gap-2 text-xs text-[var(--danger)] rounded-lg bg-[var(--surface-muted)] px-3 py-2">
          <AlertCircle size={13} />
          Switch your wallet to the selected network to sign
        </div>
      ) : (
        <button
          className="btn flex items-center gap-2 self-start"
          onClick={() => { void handleSign() }}
          disabled={signing || !safeEscrowId || !safeHash}
        >
          {signing ? 'Waiting for wallet…' : 'Sign PASS (eth_signTypedData_v4)'}
        </button>
      )}

      {signature && (
        <div className="rounded-lg bg-[var(--surface-muted)] p-3 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="label text-[10px]">Signature</span>
            <button
              className="btn-ghost text-[10px] px-2 py-1 flex items-center gap-1"
              onClick={copySignature}
            >
              {copied ? <CheckCircle2 size={11} /> : <Copy size={11} />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <p className="mono text-[10px] break-all text-[var(--ink-2)]">{signature}</p>
        </div>
      )}
    </div>
  )
}
