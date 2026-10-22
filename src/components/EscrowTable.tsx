/**
 * Live escrow table — reads from the selected chain with no wallet required.
 * Shows: id, payer, payee, verifier, amount, deadline, status, deliverableHash.
 */
import React from 'react'
import { useReadContract, useReadContracts } from 'wagmi'
import { formatUnits } from 'viem'
import { ExternalLink } from 'lucide-react'
import { ESCROW_ABI } from '../escrow-abi'
import { STATUS_LABELS, STATUS_COLORS } from '../types'
import { explorerAddr, explorerTx } from '../chains'

interface Props {
  contractAddress: string
  selectedChainId: number
}

interface EscrowRow {
  id: number
  payer: string
  payee: string
  verifier: string
  amount: bigint
  deadline: bigint
  workSpecHash: string
  deliverableHash: string
  status: number
}

const ZERO_HASH = '0x0000000000000000000000000000000000000000000000000000000000000000'

export function EscrowTable({ contractAddress, selectedChainId }: Props) {
  const { data: nextId } = useReadContract({
    address: contractAddress as `0x${string}`,
    abi: ESCROW_ABI,
    functionName: 'nextEscrowId',
    chainId: selectedChainId,
    query: { enabled: !!contractAddress, refetchInterval: 5000 },
  })

  const count = nextId ? Number(nextId) - 1 : 0
  const ids = Array.from({ length: count }, (_, i) => i + 1)

  const calls = ids.map((id) => ({
    address: contractAddress as `0x${string}`,
    abi: ESCROW_ABI,
    functionName: 'getEscrow' as const,
    args: [BigInt(id)] as [bigint],
    chainId: selectedChainId,
  }))

  const { data: results } = useReadContracts({
    contracts: calls,
    query: { enabled: count > 0, refetchInterval: 6000 },
  })

  const escrows: EscrowRow[] = (results ?? []).flatMap((r, i) => {
    if (r.status !== 'success' || !r.result) return []
    const e = r.result as {
      payer: string; payee: string; verifier: string
      amount: bigint; deadline: bigint; status: number
      workSpecHash: string; deliverableHash: string
    }
    return [{
      id: ids[i],
      payer: e.payer,
      payee: e.payee,
      verifier: e.verifier,
      amount: e.amount,
      deadline: e.deadline,
      workSpecHash: e.workSpecHash,
      deliverableHash: e.deliverableHash,
      status: e.status,
    }]
  })

  const escrowRows = React.useMemo(() => {
    const now = performance.timeOrigin + performance.now()
    return escrows.map((e) => ({
      ...e,
      deadlineDate: new Date(Number(e.deadline) * 1000),
      expired: Number(e.deadline) * 1000 < now,
    }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results])

  const addrUrl = (addr: string) => explorerAddr(selectedChainId, addr)
  // explorerTx is available for future use; suppress unused-var by referencing it
  void explorerTx

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
          <table className="w-full text-xs border-collapse min-w-[640px]">
            <thead>
              <tr className="text-left text-[var(--muted)] border-b border-[var(--border)]">
                <th className="pb-2 pr-3 font-medium">ID</th>
                <th className="pb-2 pr-3 font-medium">Amount</th>
                <th className="pb-2 pr-3 font-medium">Status</th>
                <th className="pb-2 pr-3 font-medium">Deadline</th>
                <th className="pb-2 pr-3 font-medium">Payer</th>
                <th className="pb-2 pr-3 font-medium">Payee</th>
                <th className="pb-2 pr-3 font-medium">Verifier</th>
                <th className="pb-2 font-medium">Deliverable hash</th>
              </tr>
            </thead>
            <tbody>
              {escrowRows.map((e) => (
                <tr
                  key={e.id}
                  className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--surface-muted)]/40"
                >
                  <td className="py-2 pr-3 tabular-nums font-medium">#{e.id}</td>

                  <td className="py-2 pr-3 tabular-nums whitespace-nowrap">
                    {formatUnits(e.amount, 6)} USDC
                  </td>

                  <td className={`py-2 pr-3 font-medium whitespace-nowrap ${STATUS_COLORS[e.status]}`}>
                    {STATUS_LABELS[e.status] ?? '?'}
                  </td>

                  <td className={`py-2 pr-3 tabular-nums whitespace-nowrap ${
                    e.expired && e.status === 1 ? 'text-[var(--danger)]' : 'text-[var(--ink-2)]'
                  }`}>
                    {e.deadlineDate.toLocaleString()}
                  </td>

                  {/* Payer */}
                  <td className="py-2 pr-3 font-mono">
                    <a
                      href={addrUrl(e.payer)}
                      target="_blank"
                      rel="noopener"
                      className="text-[var(--muted)] hover:text-[var(--ink)] flex items-center gap-1"
                    >
                      {e.payer.slice(0, 6)}…{e.payer.slice(-4)}
                      <ExternalLink size={9} />
                    </a>
                  </td>

                  {/* Payee */}
                  <td className="py-2 pr-3 font-mono">
                    <a
                      href={addrUrl(e.payee)}
                      target="_blank"
                      rel="noopener"
                      className="text-[var(--muted)] hover:text-[var(--ink)] flex items-center gap-1"
                    >
                      {e.payee.slice(0, 6)}…{e.payee.slice(-4)}
                      <ExternalLink size={9} />
                    </a>
                  </td>

                  {/* Verifier */}
                  <td className="py-2 pr-3 font-mono">
                    <a
                      href={addrUrl(e.verifier)}
                      target="_blank"
                      rel="noopener"
                      className="text-[var(--muted)] hover:text-[var(--ink)] flex items-center gap-1"
                    >
                      {e.verifier.slice(0, 6)}…{e.verifier.slice(-4)}
                      <ExternalLink size={9} />
                    </a>
                  </td>

                  {/* Deliverable hash — only meaningful for Released escrows */}
                  <td className="py-2 font-mono">
                    {e.deliverableHash && e.deliverableHash !== ZERO_HASH ? (
                      <span
                        className="text-[var(--muted)] text-[10px] break-all"
                        title={e.deliverableHash}
                      >
                        {e.deliverableHash.slice(0, 10)}…{e.deliverableHash.slice(-6)}
                      </span>
                    ) : (
                      <span className="text-[var(--surface-muted)]">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
