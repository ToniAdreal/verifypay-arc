/**
 * Live escrow table — reads up to nextEscrowId escrows from the contract.
 */
import React from 'react'
import { useReadContract, useReadContracts } from 'wagmi'
import { useAccount } from 'wagmi'
import { formatUnits } from 'viem'
import { ExternalLink } from 'lucide-react'
import { ESCROW_ABI } from '../escrow-abi'
import { STATUS_LABELS, STATUS_COLORS } from '../types'
import { explorerAddr } from '../chains'

interface Props {
  contractAddress: string
}

interface EscrowRow {
  id: number
  payer: string
  payee: string
  verifier: string
  amount: bigint
  deadline: bigint
  status: number
  deliverableHash: string
}

export function EscrowTable({ contractAddress }: Props) {
  const { chainId } = useAccount()

  const { data: nextId } = useReadContract({
    address: contractAddress as `0x${string}`,
    abi: ESCROW_ABI,
    functionName: 'nextEscrowId',
    chainId: chainId as number,
    query: { enabled: !!contractAddress && !!chainId, refetchInterval: 5000 },
  })

  const count = nextId ? Number(nextId) - 1 : 0
  const ids = Array.from({ length: count }, (_, i) => i + 1)

  const calls = ids.map((id) => ({
    address: contractAddress as `0x${string}`,
    abi: ESCROW_ABI,
    functionName: 'getEscrow' as const,
    args: [BigInt(id)] as [bigint],
    chainId: chainId as number,
  }))

  const { data: results } = useReadContracts({
    contracts: calls,
    query: { enabled: count > 0, refetchInterval: 6000 },
  })

  const escrows: EscrowRow[] = (results ?? []).flatMap((r, i) => {
    if (r.status !== 'success' || !r.result) return []
    const e = r.result as {
      payer: string; payee: string; verifier: string
      amount: bigint; deadline: bigint; status: number; deliverableHash: string
    }
    return [{
      id: ids[i],
      payer: e.payer,
      payee: e.payee,
      verifier: e.verifier,
      amount: e.amount,
      deadline: e.deadline,
      status: e.status,
      deliverableHash: e.deliverableHash,
    }]
  })

  // Pre-compute per-row derived state outside JSX to keep render pure
  const escrowRows = React.useMemo(() => {
    const now = performance.timeOrigin + performance.now()
    return escrows.map((e) => ({
      ...e,
      deadlineDate: new Date(Number(e.deadline) * 1000),
      expired: Number(e.deadline) * 1000 < now,
    }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results])

  if (!chainId) return null

  return (
    <div className="card flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-sm text-[var(--ink)]">Escrows</h2>
        <span className="text-xs text-[var(--muted)] tabular-nums">{count} total</span>
      </div>

      {count === 0 ? (
        <p className="text-xs text-[var(--muted)] py-3 text-center">No escrows yet</p>
      ) : (
        <div className="overflow-x-auto -mx-1">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="text-left text-[var(--muted)] border-b border-[var(--border)]">
                <th className="pb-2 pr-3 font-medium">ID</th>
                <th className="pb-2 pr-3 font-medium">Amount</th>
                <th className="pb-2 pr-3 font-medium">Status</th>
                <th className="pb-2 pr-3 font-medium">Deadline</th>
                <th className="pb-2 pr-3 font-medium">Payee</th>
                <th className="pb-2 font-medium">Verifier</th>
              </tr>
            </thead>
            <tbody>
              {escrowRows.map((e) => {
                const addrUrl = (addr: string) => explorerAddr(chainId, addr)
                return (
                  <tr key={e.id} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--surface-muted)]/40">
                    <td className="py-2 pr-3 tabular-nums font-medium">#{e.id}</td>
                    <td className="py-2 pr-3 tabular-nums">
                      {formatUnits(e.amount, 6)} USDC
                    </td>
                    <td className={`py-2 pr-3 font-medium ${STATUS_COLORS[e.status]}`}>
                      {STATUS_LABELS[e.status] ?? '?'}
                    </td>
                    <td className={`py-2 pr-3 tabular-nums ${e.expired && e.status === 1 ? 'text-[var(--danger)]' : 'text-[var(--ink-2)]'}`}>
                      {e.deadlineDate.toLocaleString()}
                    </td>
                    <td className="py-2 pr-3 font-mono">
                      <a href={addrUrl(e.payee)} target="_blank" rel="noopener"
                         className="text-[var(--muted)] hover:text-[var(--ink)] flex items-center gap-1">
                        {e.payee.slice(0, 8)}…{e.payee.slice(-4)}
                        <ExternalLink size={9} />
                      </a>
                    </td>
                    <td className="py-2 font-mono">
                      <a href={addrUrl(e.verifier)} target="_blank" rel="noopener"
                         className="text-[var(--muted)] hover:text-[var(--ink)] flex items-center gap-1">
                        {e.verifier.slice(0, 8)}…{e.verifier.slice(-4)}
                        <ExternalLink size={9} />
                      </a>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
