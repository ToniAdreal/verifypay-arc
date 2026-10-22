/**
 * Returns EIP-1559 fee parameters for the connected chain.
 *
 * Strategy (Arc mempool rules):
 *   maxFeePerGas        = max(2 * latestBaseFee, 20 gwei) + 1 gwei tip
 *   maxPriorityFeePerGas = 1 gwei
 *
 * Falls back to { maxFeePerGas: 21n gwei, maxPriorityFeePerGas: 1n gwei }
 * if the RPC call has not returned yet or fails.
 *
 * Refreshes every 4 seconds (Arc blocks are ~1 s, 4 s gives 4 samples of
 * headroom before a stale value would matter).
 */
import { usePublicClient } from 'wagmi'
import { useEffect, useRef, useState } from 'react'

const GWEI = 1_000_000_000n
const MIN_BASE_FEE = 20n * GWEI   // Arc mempool floor
const TIP = 1n * GWEI             // priority fee

export interface FeeParams {
  maxFeePerGas: bigint
  maxPriorityFeePerGas: bigint
}

const FALLBACK: FeeParams = {
  maxFeePerGas: MIN_BASE_FEE + TIP,   // 21 gwei
  maxPriorityFeePerGas: TIP,
}

export function useDynamicFees(): FeeParams {
  const client = usePublicClient()
  const [fees, setFees] = useState<FeeParams>(FALLBACK)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!client) return

    async function refresh() {
      try {
        const block = await client!.getBlock({ blockTag: 'latest' })
        const baseFee = block.baseFeePerGas ?? 0n
        // max(2 * baseFee, MIN_BASE_FEE) + TIP
        const doubled = baseFee * 2n
        const maxBase = doubled > MIN_BASE_FEE ? doubled : MIN_BASE_FEE
        setFees({
          maxFeePerGas: maxBase + TIP,
          maxPriorityFeePerGas: TIP,
        })
      } catch {
        // leave current value; don't thrash on transient RPC errors
      }
    }

    void refresh()
    timerRef.current = setInterval(() => { void refresh() }, 4_000)
    return () => {
      if (timerRef.current !== null) clearInterval(timerRef.current)
    }
  }, [client])

  return fees
}
