/**
 * Contract address field with per-chain defaults.
 * The input shows the parent's effective address by default; an explicit
 * user edit takes over until the reset button is pressed.
 */
import { useState } from 'react'
import { useWaitForTransactionReceipt } from 'wagmi'
import { ExternalLink, RefreshCw } from 'lucide-react'
import { isAddress } from 'viem'
import { explorerAddr } from '../chains'
import { CHAIN_DEFAULTS } from '../App'

interface Props {
  contractAddress: string
  chainId: number | undefined
  onAddressChange: (addr: `0x${string}`) => void
}

export function ContractBar({ contractAddress, chainId, onAddressChange }: Props) {
  // When the user has not typed anything, mirror the parent's effective address.
  // When they start typing, their input takes over until they reset.
  const [draft, setDraft] = useState<string | null>(null)
  const displayed = draft ?? contractAddress

  // Placeholder — browser deploy requires bundled bytecode
  const deployHash = undefined as `0x${string}` | undefined
  const { isLoading: isConfirming } = useWaitForTransactionReceipt({ hash: deployHash })

  const addrValid = isAddress(displayed)
  const explorerUrl = addrValid && chainId ? explorerAddr(chainId, displayed) : undefined

  const defaultAddr = CHAIN_DEFAULTS[chainId ?? 5042002] ?? CHAIN_DEFAULTS[5042002]
  const chainLabel = chainId === 5042 ? 'Mainnet default' : 'Testnet default'

  return (
    <div className="card flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="label">Contract</span>
        {explorerUrl && (
          <a href={explorerUrl} target="_blank" rel="noopener"
             className="text-[var(--muted)] hover:text-[var(--ink)] ml-auto">
            <ExternalLink size={13} />
          </a>
        )}
      </div>

      <div className="flex gap-2">
        <input
          className="field flex-1 mono text-xs"
          value={displayed}
          onChange={(e) => {
            const v = e.target.value
            setDraft(v)
            if (isAddress(v)) onAddressChange(v)
          }}
          placeholder="0x…"
          spellCheck={false}
        />
        <button
          className="btn-ghost text-xs px-3 py-2 flex items-center gap-1 whitespace-nowrap"
          onClick={() => {
            setDraft(null)
            onAddressChange(defaultAddr)
          }}
          title={`Reset to ${chainLabel}`}
        >
          <RefreshCw size={12} />
          {chainLabel}
        </button>
      </div>

      {!addrValid && displayed.length > 2 && (
        <p className="text-xs text-[var(--danger)]">Not a valid address</p>
      )}

      {/* Self-deploy guide */}
      <details className="text-xs text-[var(--muted)]">
        <summary className="cursor-pointer hover:text-[var(--ink)] select-none">
          Deploy a new instance from my wallet
        </summary>
        <div className="mt-2 p-3 rounded-lg bg-[var(--surface-muted)] text-[var(--ink-2)] leading-relaxed">
          <p>Run the following in your local checkout, then paste the resulting address above:</p>
          <pre className="mono text-[11px] mt-2 whitespace-pre-wrap break-all bg-[var(--surface)] p-2 rounded">
{`forge build
bun run deploy:self VerifyPayEscrow \\
  '["0x3600000000000000000000000000000000000000"]'`}
          </pre>
        </div>
      </details>

      {isConfirming && <p className="text-xs text-[var(--muted)]">Deploying…</p>}
    </div>
  )
}
