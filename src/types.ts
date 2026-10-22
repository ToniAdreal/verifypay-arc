export interface LogEntry {
  id: number
  ts: number
  kind: 'success' | 'error' | 'info'
  label: string
  txHash?: `0x${string}`
  chainId?: number
  detail?: string
}

export const STATUS_LABELS: Record<number, string> = {
  0: 'None',
  1: 'Open',
  2: 'Released',
  3: 'Refunded',
}

export const STATUS_COLORS: Record<number, string> = {
  0: 'text-[var(--muted)]',
  1: 'text-[var(--accent)]',
  2: 'text-[var(--success)]',
  3: 'text-[var(--muted)]',
}
