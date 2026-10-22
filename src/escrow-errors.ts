/**
 * Decode VerifyPayEscrow custom errors from a revert payload or error message.
 * Accepts a hex revert payload (0x + 4-byte selector + optional encoded args)
 * or a string that contains one.
 */
import { decodeErrorResult } from 'viem'
import { ESCROW_ABI } from './escrow-abi'

export function decodeEscrowError(raw: unknown): string {
  try {
    const str = typeof raw === 'string' ? raw : (raw as { message?: string })?.message ?? ''

    // Pull the first 0x hex run that could be a revert payload (≥ 4 bytes = 8 hex chars)
    const hexMatch = str.match(/0x[0-9a-fA-F]{8,}/)
    if (hexMatch) {
      const data = hexMatch[0] as `0x${string}`
      try {
        const decoded = decodeErrorResult({ abi: ESCROW_ABI, data })
        const { errorName, args } = decoded
        if (errorName === 'NotOpen') return `Not open: escrow #${args?.[0] ?? '?'} is already settled`
        if (errorName === 'DeadlineNotReached') {
          const ts = Number(args?.[0] ?? 0)
          const dt = new Date(ts * 1000).toLocaleString()
          return `Deadline not reached — refund available after ${dt}`
        }
        if (errorName === 'InvalidAttestation') return 'Invalid attestation — wrong verifier or deliverable hash'
        if (errorName === 'NotPayer') return 'Only the payer can refund this escrow'
        if (errorName === 'ZeroAddress') return 'Address cannot be zero'
        if (errorName === 'ZeroAmount') return 'Amount must be greater than zero'
        if (errorName === 'DeadlineInPast') return 'Deadline must be in the future'
        if (errorName === 'DeadlineTooSoon') return 'Deadline must be at least 60 seconds from now'
        if (errorName === 'SafeERC20FailedOperation') return 'USDC transfer failed — check balance and allowance'
        if (errorName === 'ReentrancyGuardReentrantCall') return 'Reentrancy detected'
        return errorName ?? 'Unknown contract error'
      } catch {
        // decodeErrorResult threw — not a known selector
      }
    }

    // Fallback: surface the raw message, cleaned up
    if (str.includes('user rejected') || str.includes('User rejected')) return 'Transaction cancelled.'
    if (str.includes('insufficient funds') || str.includes('exceeds balance'))
      return 'Insufficient USDC balance or allowance.'
    if (str.length > 0) return str.slice(0, 120)
  } catch {
    // ignore
  }
  return 'Transaction failed.'
}
