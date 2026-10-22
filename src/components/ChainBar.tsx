/**
 * Chain-selector bar + wallet connect button.
 * Works whether or not a wallet is connected: selectedChainId drives the
 * active highlight; clicking calls onSelectChain (which also calls switchChain
 * when connected). The ConnectKit button appears to the right.
 */
import React from 'react'
import { ConnectKitButton } from 'connectkit'
import { arcTestnet, arcMainnet } from '../chains'

const CHAINS = [arcTestnet, arcMainnet]

interface Props {
  selectedChainId: number
  onSelectChain: (id: number) => void
}

export function ChainBar({ selectedChainId, onSelectChain }: Props) {
  return (
    <div className="flex items-center gap-3 flex-wrap">
      <div className="flex rounded-lg overflow-hidden border border-[var(--border)] bg-[var(--surface-muted)]">
        {CHAINS.map((c) => {
          const active = selectedChainId === c.id
          return (
            <button
              key={c.id}
              onClick={() => !active && onSelectChain(c.id)}
              className={[
                'px-3 py-1.5 text-xs font-medium transition-colors',
                active
                  ? 'bg-[var(--accent)] text-white'
                  : 'text-[var(--muted)] hover:text-[var(--ink)] hover:bg-[var(--surface)]',
              ].join(' ')}
            >
              {c.testnet ? 'Testnet' : 'Mainnet'}
            </button>
          )
        })}
      </div>
      <ConnectKitButton />
    </div>
  )
}
