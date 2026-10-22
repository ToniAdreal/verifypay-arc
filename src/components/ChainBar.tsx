/**
 * Top chain-selector bar + wallet connect button.
 * Shows Arc Testnet / Arc Mainnet toggle and the ConnectKit button.
 */
import React from 'react'
import { useAccount, useSwitchChain } from 'wagmi'
import { ConnectKitButton } from 'connectkit'
import { arcTestnet, arcMainnet } from '../chains'

const CHAINS = [arcTestnet, arcMainnet]

export function ChainBar() {
  const { chainId } = useAccount()
  const { switchChain, isPending } = useSwitchChain()

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <div className="flex rounded-lg overflow-hidden border border-[var(--border)] bg-[var(--surface-muted)]">
        {CHAINS.map((c) => {
          const active = chainId === c.id
          return (
            <button
              key={c.id}
              onClick={() => !active && switchChain({ chainId: c.id })}
              disabled={isPending}
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

      {chainId && !CHAINS.find((c) => c.id === chainId) && (
        <span className="text-xs text-[var(--danger)]">Wrong network</span>
      )}

      <ConnectKitButton />
    </div>
  )
}
