/**
 * Payer panel: approve USDC allowance then createEscrow.
 * Work spec text is keccak256'd client-side via viem.
 */
import React, { useState } from 'react'
import {
  useAccount,
  useWriteContract,
  useWaitForTransactionReceipt,
  useReadContract,
  useSwitchChain,
} from 'wagmi'
import { erc20Abi, isAddress, getAddress, keccak256, toHex, parseUnits, formatUnits } from 'viem'
import { Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
import { ESCROW_ABI } from '../escrow-abi'
import { ARC_USDC } from '../chains'
import { decodeEscrowError } from '../escrow-errors'
import { useDynamicFees } from '../hooks/useDynamicFees'
import type { LogEntry } from '../types'

interface Props {
  contractAddress: string
  addLog: (entry: Omit<LogEntry, 'id' | 'ts'>) => void
  onEscrowCreated: (id: bigint) => void
}

const MIN_DEADLINE_SECS = 60        // must match VerifyPayEscrow.MIN_DEADLINE_SECS
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

export function PayerPanel({ contractAddress, addLog, onEscrowCreated }: Props) {
  const { address, chainId, isConnected } = useAccount()
  const { switchChain } = useSwitchChain()
  const fees = useDynamicFees()

  const [payee, setPayee] = useState('')
  const [verifier, setVerifier] = useState('')
  const [amount, setAmount] = useState('1')
  const [deadlineMins, setDeadlineMins] = useState('10')
  const [workSpec, setWorkSpec] = useState('')

  // ── USDC balance ──────────────────────────────────────────────────────────
  const { data: usdcBalance } = useReadContract({
    address: ARC_USDC,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: chainId as number,
    query: { enabled: !!address },
  })

  // ── Step 1: approve ───────────────────────────────────────────────────────
  const { writeContract: approve, data: approveTxHash, isPending: approving, error: approveErr } =
    useWriteContract()
  const { isLoading: approvingConfirm, isSuccess: approveSuccess } =
    useWaitForTransactionReceipt({ hash: approveTxHash })

  React.useEffect(() => {
    if (approveSuccess && approveTxHash) {
      addLog({ kind: 'success', label: 'USDC approved', txHash: approveTxHash, chainId: chainId! })
    }
    // approveTxHash and chainId are stable when approveSuccess flips; addLog is memoised in parent
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [approveSuccess])

  // ── Step 2: createEscrow ──────────────────────────────────────────────────
  const { writeContract: create, data: createTxHash, isPending: creating, error: createErr } =
    useWriteContract()
  const { isLoading: creatingConfirm, isSuccess: createSuccess, data: createReceipt } =
    useWaitForTransactionReceipt({ hash: createTxHash })

  React.useEffect(() => {
    if (createSuccess && createTxHash) {
      addLog({ kind: 'success', label: 'Escrow created', txHash: createTxHash, chainId: chainId! })
      // Parse EscrowCreated event to get id
      const found = createReceipt?.logs.find((l) =>
        l.topics[0] === '0x1fc791b92c52de1c5ef7b56e89a4e3da28f56cd0bcfe59b9c3d2e8ce18b4f75e'
      )
      if (found?.topics[1]) {
        const id = BigInt(found.topics[1])
        onEscrowCreated(id)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [createSuccess])

  // ── Derived validation ────────────────────────────────────────────────────
  const payeeValid  = isAddress(payee)  && getAddress(payee)  !== getAddress(ZERO_ADDRESS)
  const verifierValid = isAddress(verifier) && getAddress(verifier) !== getAddress(ZERO_ADDRESS)
  const rawAmount = parseUnits(amount || '0', 6)
  const amountExceedsBalance = usdcBalance !== undefined && rawAmount > usdcBalance
  const deadlineMinsNum = Number(deadlineMins)
  const deadlineTooShort = deadlineMinsNum * 60 < MIN_DEADLINE_SECS

  function handleApprove() {
    if (!isConnected || !chainId) return
    if (chainId !== 5042002 && chainId !== 5042) {
      switchChain({ chainId: 5042002 as const })
      return
    }
    if (!payeeValid || !verifierValid || rawAmount === 0n || deadlineTooShort) return
    const arcId = chainId
    approve({
      address: ARC_USDC,
      abi: erc20Abi,
      functionName: 'approve',
      args: [contractAddress as `0x${string}`, rawAmount],
      maxFeePerGas: fees.maxFeePerGas,
      maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
      chainId: arcId,
    })
  }

  function handleCreate() {
    if (!isConnected || !chainId || !payeeValid || !verifierValid || rawAmount === 0n || deadlineTooShort) return
    if (chainId !== 5042002 && chainId !== 5042) {
      switchChain({ chainId: 5042002 as const })
      return
    }
    const arcId = chainId
    const deadlineSec = BigInt(Math.floor(Date.now() / 1000) + deadlineMinsNum * 60)
    const workSpecHash = keccak256(toHex(workSpec || 'work spec'))
    create({
      address: contractAddress as `0x${string}`,
      abi: ESCROW_ABI,
      functionName: 'createEscrow',
      args: [payee, verifier, rawAmount, deadlineSec, workSpecHash],
      maxFeePerGas: fees.maxFeePerGas,
      maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
      chainId: arcId,
    })
  }

  const onWrongChain = isConnected && chainId !== 5042002 && chainId !== 5042
  const balanceFormatted = usdcBalance !== undefined ? formatUnits(usdcBalance, 6) : '—'

  return (
    <div className="card flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-sm text-[var(--ink)]">Payer — Create Escrow</h2>
        <span className="text-xs text-[var(--muted)] tabular-nums">{balanceFormatted} USDC</span>
      </div>

      {onWrongChain && (
        <div className="flex items-center gap-2 rounded-lg bg-[var(--surface-muted)] p-2 text-xs text-[var(--danger)]">
          <AlertCircle size={13} />
          Switch to Arc Testnet or Arc Mainnet
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="label">Payee address</span>
          <input className="field" value={payee} onChange={(e) => setPayee(e.target.value)} placeholder="0x…" />
          {payee && !isAddress(payee) && <span className="text-xs text-[var(--danger)]">Invalid address</span>}
          {payee && isAddress(payee) && !payeeValid && <span className="text-xs text-[var(--danger)]">Cannot send to zero address</span>}
        </label>
        <label className="flex flex-col gap-1">
          <span className="label">Verifier address</span>
          <input className="field" value={verifier} onChange={(e) => setVerifier(e.target.value)} placeholder="0x…" />
          {verifier && !isAddress(verifier) && <span className="text-xs text-[var(--danger)]">Invalid address</span>}
          {verifier && isAddress(verifier) && !verifierValid && <span className="text-xs text-[var(--danger)]">Cannot use zero address as verifier</span>}
        </label>
        <label className="flex flex-col gap-1">
          <span className="label">Amount (USDC)</span>
          <input className="field tabular-nums" type="number" min="0" step="0.000001" value={amount} onChange={(e) => setAmount(e.target.value)} />
          {amountExceedsBalance && <span className="text-xs text-[var(--danger)]">Amount exceeds your USDC balance</span>}
        </label>
        <label className="flex flex-col gap-1">
          <span className="label">Deadline (minutes from now)</span>
          <input className="field tabular-nums" type="number" min="1" value={deadlineMins} onChange={(e) => setDeadlineMins(e.target.value)} />
          {deadlineTooShort && <span className="text-xs text-[var(--danger)]">Minimum deadline is 1 minute (60 s)</span>}
        </label>
        <label className="flex flex-col gap-1 sm:col-span-2">
          <span className="label">Work spec text → keccak256</span>
          <textarea
            className="field resize-none h-16 text-xs"
            value={workSpec}
            onChange={(e) => setWorkSpec(e.target.value)}
            placeholder="Describe the deliverable…"
          />
          {workSpec && (
            <span className="mono text-[10px] text-[var(--muted)] break-all">
              {keccak256(toHex(workSpec))}
            </span>
          )}
        </label>
      </div>

      <div className="flex gap-2 flex-wrap">
        <button
          className="btn flex items-center gap-2"
          onClick={handleApprove}
          disabled={approving || approvingConfirm || !isConnected || !payeeValid || !verifierValid || rawAmount === 0n || amountExceedsBalance || deadlineTooShort}
        >
          {(approving || approvingConfirm) && <Loader2 size={13} className="animate-spin" />}
          {approveSuccess && !approving && <CheckCircle2 size={13} />}
          1. Approve USDC
        </button>
        <button
          className="btn flex items-center gap-2"
          onClick={handleCreate}
          disabled={creating || creatingConfirm || !approveSuccess || !payeeValid || !verifierValid || rawAmount === 0n || amountExceedsBalance || deadlineTooShort}
        >
          {(creating || creatingConfirm) && <Loader2 size={13} className="animate-spin" />}
          {createSuccess && !creating && <CheckCircle2 size={13} />}
          2. Create Escrow
        </button>
      </div>

      {(approving || approvingConfirm) && (
        <p className="status-info">{approving ? 'Waiting for wallet…' : 'Confirming approve…'}</p>
      )}
      {(creating || creatingConfirm) && (
        <p className="status-info">{creating ? 'Waiting for wallet…' : 'Confirming createEscrow…'}</p>
      )}
      {approveErr && <p className="status-error">{decodeEscrowError(approveErr)}</p>}
      {createErr && <p className="status-error">{decodeEscrowError(createErr)}</p>}
    </div>
  )
}
