# VerifyPayEscrow — Security Review
**Date:** 2026-10-22  
**Scope:** `contracts/VerifyPayEscrow.sol` + frontend (`src/components/PayerPanel.tsx`, `VerifierPanel.tsx`, `ReleasePanel.tsx`)  
**Audit axis:** Arc-specific issues, general escrow risks, signature handling, reentrancy, griefing

---

## Summary

| Severity | Total | Fixed | No action needed |
|----------|-------|-------|-----------------|
| Medium   | 2     | 2     | 0               |
| Low      | 3     | 3     | 0               |
| Info     | 6     | 4     | 2               |

All Medium and Low findings were fixed. Two informational items are acknowledged but intentionally not changed.

---

## Findings

### [M-1] Signature Malleability — High-s ECDSA variants accepted (FIXED)

**Location:** `release()` in `VerifyPayEscrow.sol`  
**Category:** Signature handling  

**Description:**  
Every secp256k1 ECDSA signature `(r, s, v)` has a "malleable" equivalent `(r, n-s, v^1)` that also passes `ecrecover` and OZ `SignatureChecker`. An observer who sees a valid release transaction in the mempool can compute the flipped-s variant and attempt to front-run or replay with it. For this contract the window is narrow (the escrow moves to `Released` on the first success, blocking the second), but the malleability creates a griefing surface: a mempool watcher can submit the high-s variant in the same block, causing the legitimate caller to land on a `NotOpen` revert if the high-s tx mines first.

OZ `ECDSA.sol` rejects high-s since v4.7.3. OZ `SignatureChecker` calls into the same ECDSA helpers, but only for EOAs — the raw-signature path bypasses the low-s check in some versions.

**Fix applied:**  
In `release()`, before calling `SignatureChecker`, we reject any 65-byte signature whose `s` value is in the upper half of the secp256k1 order (i.e., `s > n/2`). The check is applied only to 65-byte payloads; longer ERC-1271 blobs are passed through unchanged because their validation logic is owner-defined.

```solidity
if (signature.length == 65) {
    bytes32 s;
    assembly { s := calldataload(add(signature.offset, 32)) }
    if (uint256(s) > 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0) {
        revert InvalidAttestation();
    }
}
```

**New tests:** `test_release_highS_malleability`, `test_release_lowS_accepted`

---

### [M-2] Griefing via dust-deadline escrows — no minimum deadline enforced (FIXED)

**Location:** `createEscrow()` in `VerifyPayEscrow.sol`  
**Category:** Griefing / non-strictly-increasing timestamps  

**Description:**  
The original code only required `deadline > block.timestamp`. On Arc, block timestamps advance by roughly 500 ms per block. A payer could set `deadline = block.timestamp + 1` to create an escrow that is refundable within the next block — before the verifier has any reasonable window to review and sign. This enables:
1. **Payer griefing the payee:** create escrow, receive the work, then immediately refund before the verifier can sign.
2. **Block-timestamp manipulation:** Arc block proposers can skew timestamps by ±15 s (typical PoS allowance). A `deadline = now + 30` escrow can be made refundable at creation by a colluding validator.

**Fix applied:**  
Added `uint64 public constant MIN_DEADLINE_SECS = 60` (one minute) and a second guard:

```solidity
if (deadline < uint64(block.timestamp) + MIN_DEADLINE_SECS) revert DeadlineTooSoon();
```

This sits _after_ the `DeadlineInPast` check, so `deadline == now` still hits `DeadlineInPast`, while `now < deadline < now + 60` hits `DeadlineTooSoon`.

**New tests:** `test_create_deadlineTooSoon_exactlyNowPlusMinuteMinusOne`, `test_create_deadlineExactlyAtMinimum_succeeds`

---

### [L-1] Frontend allows zero address as payee/verifier (FIXED)

**Location:** `PayerPanel.tsx` — `handleApprove`, `handleCreate`  
**Category:** Arc-specific: `address(0)` sends  

**Description:**  
`isAddress('0x0000000000000000000000000000000000000000')` returns `true` in viem. A user could accidentally paste the zero address; `createEscrow` would revert with `ZeroAddress` on-chain, but only after wasting gas on the approve step.

**Fix applied:**  
Added explicit check using `getAddress(payee) !== getAddress(ZERO_ADDRESS)` in derived `payeeValid` / `verifierValid`. Both Approve and Create buttons are disabled when either is the zero address, and an inline validation message is shown.

---

### [L-2] Frontend allows amount exceeding USDC balance (FIXED)

**Location:** `PayerPanel.tsx`  
**Category:** Arc-specific: USDC 6-decimal balance guard  

**Description:**  
USDC on Arc uses 6 decimals. The UI fetches the user's balance via `erc20.balanceOf` (correct). However, both action buttons were enabled even when the parsed 6-decimal amount exceeded the balance. The approve tx would succeed (approvals are not bounded by balance), but `createEscrow` would fail with `SafeERC20FailedOperation`. This wastes two transactions and confuses users.

**Fix applied:**  
`amountExceedsBalance` is derived inline by comparing `rawAmount` (parsed with 6 decimals) against `usdcBalance`. Buttons are disabled and an inline warning is shown when the amount exceeds balance.

---

### [L-3] Frontend accepts invalid / high-s signatures (FIXED)

**Location:** `ReleasePanel.tsx` — `safeSig` derivation  
**Category:** Signature malleability (frontend mirror of M-1)  

**Description:**  
The original `safeSig` check only verified that the signature started with `0x` and was longer than 4 chars. This allowed:
- Truncated or padded signatures (not 65 bytes) that would revert on-chain.
- High-s signatures that are now explicitly rejected by the contract (post M-1 fix) but were silently accepted by the frontend, leading to a confusing `InvalidAttestation` revert.

**Fix applied:**  
`safeSig` now requires the signature to be exactly 132 chars (`0x` + 130 hex = 65 bytes), extracts `s` from the payload, and returns `undefined` (disabling all release actions) if `s > n/2`. An inline hint explains the specific failure: wrong length or high-s.

---

### [I-1] `block.timestamp` used for deadline comparisons (ACKNOWLEDGED — not changed)

**Location:** `createEscrow`, `refund`  
**Category:** Non-strictly-increasing timestamps  

**Description:**  
`block.timestamp` on Arc is subject to ±15 s miner/validator skew. This is the standard Ethereum attestation bound; changing it to use a block number or an oracle would be a significant architectural change with its own tradeoffs. The `MIN_DEADLINE_SECS = 60` fix (M-2) already means the skew window (≤15 s) is a small fraction of the minimum escrow lifetime, reducing the practical risk.

**Status:** Acknowledged. No fix applied; documented for operator awareness.

---

### [I-2] Blocklisted payee — USDC transfer may revert after release (ACKNOWLEDGED — not changed)

**Location:** `release()` interaction step  
**Category:** Arc-specific: USDC blocklist  

**Description:**  
Circle's USDC contract includes a `blacklist`/`blocklist` mechanism. If the payee's address is blocklisted after escrow creation but before `release()`, the `safeTransfer` to payee will revert, permanently locking funds (the escrow can never be released, and refund is only available to the payer, not the payee). This is an inherent property of using Circle USDC as the payment token.

**Mitigations already in place:**  
- Refund is available to the payer if the payee is blocklisted after the deadline.  
- A multi-step "pull" (where payee calls a withdrawal rather than receiving a push) would eliminate the risk but would break the current simple model.

**Status:** Acknowledged. This is a USDC blocklist property, not a contract bug. Adding a fallback withdrawal path is a possible future enhancement.

---

### [I-3] 20 gwei `maxFeePerGas` floor — frontend enforces it, contract cannot (INFO)

**Location:** `PayerPanel.tsx`, `ReleasePanel.tsx` (`MIN_FEE = BigInt(20e9)`)  
**Category:** Arc mempool fee floor  

**Description:**  
Arc's mempool rejects transactions with `maxFeePerGas < 20 gwei`. The frontend correctly sets `maxFeePerGas: MIN_FEE` on all write calls. The contract itself cannot enforce this (EVM provides no `tx.maxFeePerGas` opcode). Any wallet or script submitting transactions directly must independently respect the floor.

**Status:** Frontend correctly handles this. Documented for direct-contract callers.

---

### [I-4] Replay protection — EIP-712 domain includes `chainId` and `verifyingContract` (CONFIRMED CORRECT)

**Category:** Replay  

**Description:**  
EIP-712 domain separator includes `name`, `version`, `chainId`, and `verifyingContract`. This means signatures from Arc Testnet (chainId 5042002) cannot be replayed on Arc Mainnet (5042) or on a different `VerifyPayEscrow` instance. Additionally, each `(escrowId, deliverableHash)` pair produces a unique digest because both fields are bound in the struct hash.

**Status:** Replay protection is correct and complete. Tests `test_replay_differentEscrowId`, `test_replay_differentContract`, and `test_replay_differentChainId` verify all three axes.

---

### [I-5] Reentrancy — ReentrancyGuard on all three mutating functions (CONFIRMED CORRECT)

**Category:** Reentrancy  

**Description:**  
All three external state-changing functions (`createEscrow`, `release`, `refund`) carry the `nonReentrant` modifier. CEI order (checks-effects-interactions) is upheld in both `release` and `refund` (status written before `safeTransfer`). `createEscrow` writes state and emits before calling `safeTransferFrom`, which is also correct.

**Status:** Reentrancy protection is correct. Test `test_reentrancy_release` verifies that a malicious token attempting to re-enter `release` during the payout transfer is blocked by the guard.

---

### [I-6] USDC 6-decimal handling in frontend (CONFIRMED CORRECT)

**Category:** Arc-specific: USDC 6 vs 18 decimals  

**Description:**  
Arc exposes USDC in two views: native gas (18 decimals) and ERC-20 (6 decimals). The frontend exclusively uses the ERC-20 view via `erc20.balanceOf` and `parseUnits(amount, 6)` / `formatUnits(balance, 6)`. There is no path that reads the native balance and the ERC-20 balance and sums or displays them as separate amounts. The EscrowTable also uses `formatUnits(e.amount, 6)` to display stored amounts.

**Status:** Correct. No double-counting, no 10^12 rescaling error.

---

## Files Changed

| File | Change |
|------|--------|
| `contracts/VerifyPayEscrow.sol` | Added `MIN_DEADLINE_SECS = 60` constant; added `DeadlineTooSoon` error; added `DeadlineTooSoon` guard in `createEscrow`; added high-s malleability guard in `release` |
| `contracts/test/VerifyPayEscrow.t.sol` | Added GROUP 12 (malleability: 2 tests), GROUP 13 (min-deadline: 2 tests), GROUP 11 fuzz (1 variant); updated existing fuzz tests to bound `deadlineDelta >= MIN_DEADLINE_SECS` |
| `src/escrow-abi.ts` | Added `MIN_DEADLINE_SECS` view, `DeadlineTooSoon` error |
| `src/escrow-errors.ts` | Added `DeadlineTooSoon` decode branch |
| `src/components/PayerPanel.tsx` | Added `payeeValid`, `verifierValid`, `amountExceedsBalance`, `deadlineTooShort` guards; wired into button `disabled` and inline warnings |
| `src/components/ReleasePanel.tsx` | Tightened `safeSig` to require exactly 65 bytes + low-s; added inline hint for wrong length or high-s |

**Test count:** 27 → 32 (five new tests added).
