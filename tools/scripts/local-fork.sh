#!/usr/bin/env bash
# Start a local Arc node forked from Arc Testnet with arc-anvil (Arc semantics: native USDC = ERC-20 USDC),
# fund the project wallets with fake local USDC, and leave it running on :8545.
# No real funds, no real transactions.
set -euo pipefail
cd "$(dirname "$0")/.."
ARC_ANVIL=${ARC_ANVIL:-$HOME/.local/bin/arc-anvil}
ARC_CAST=${ARC_CAST:-$HOME/.local/bin/arc-cast}
FORK=${FORK_URL:-https://rpc.testnet.arc.io}
"$ARC_ANVIL" --network arc --fork-url "$FORK" --port 8545 --silent &
PID=$!
for i in $(seq 1 30); do "$ARC_CAST" chain-id --rpc-url http://127.0.0.1:8545 >/dev/null 2>&1 && break; sleep 0.5; done
for v in PAYER_ADDRESS AGENT_ADDRESS VERIFIER_ADDRESS; do
  addr=$(grep "^$v=" .wallet.env | cut -d= -f2)
  # 10 USDC for PAYER, 0 for the others (18-decimal native units)
  if [ "$v" = PAYER_ADDRESS ]; then bal=0x8ac7230489e80000; else bal=0x0; fi
  "$ARC_CAST" rpc anvil_setBalance "$addr" "$bal" --rpc-url http://127.0.0.1:8545 >/dev/null
done
echo "arc-anvil fork running (pid $PID) on http://127.0.0.1:8545; PAYER funded with 10 local USDC"
wait $PID
