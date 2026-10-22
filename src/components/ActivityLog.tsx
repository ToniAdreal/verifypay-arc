/**
 * Activity log — session-scoped list of transactions with explorer links.
 */
import React from 'react'
import { ExternalLink, CheckCircle2, XCircle, Info } from 'lucide-react'
import { explorerTx } from '../chains'
import type { LogEntry } from '../types'

interface Props {
  entries: LogEntry[]
}

const icons = {
  success: <CheckCircle2 size={13} className="text-[var(--success)] shrink-0" />,
  error: <XCircle size={13} className="text-[var(--danger)] shrink-0" />,
  info: <Info size={13} className="text-[var(--muted)] shrink-0" />,
}

export function ActivityLog({ entries }: Props) {
  if (entries.length === 0) return (
    <div className="card">
      <h2 className="font-semibold text-sm text-[var(--ink)] mb-3">Activity</h2>
      <p className="text-xs text-[var(--muted)] text-center py-3">No activity yet</p>
    </div>
  )

  return (
    <div className="card flex flex-col gap-3">
      <h2 className="font-semibold text-sm text-[var(--ink)]">Activity</h2>
      <ul className="flex flex-col gap-2">
        {[...entries].reverse().map((e) => (
          <li key={e.id} className="flex items-start gap-2">
            <span className="mt-0.5">{icons[e.kind]}</span>
            <div className="flex flex-col gap-0.5 min-w-0">
              <span className="text-xs text-[var(--ink-2)] leading-tight">{e.label}</span>
              {e.detail && (
                <span className="text-[11px] text-[var(--muted)] leading-tight">{e.detail}</span>
              )}
              {e.txHash && e.chainId && (
                <a
                  href={explorerTx(e.chainId, e.txHash)}
                  target="_blank"
                  rel="noopener"
                  className="text-[11px] text-[var(--accent)] hover:underline flex items-center gap-0.5 font-mono"
                >
                  {e.txHash.slice(0, 12)}…{e.txHash.slice(-6)}
                  <ExternalLink size={9} />
                </a>
              )}
            </div>
            <span className="ml-auto text-[10px] text-[var(--muted)] tabular-nums shrink-0">
              {new Date(e.ts).toLocaleTimeString()}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
