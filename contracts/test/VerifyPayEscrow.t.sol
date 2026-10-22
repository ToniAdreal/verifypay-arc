// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {VerifyPayEscrow} from "../VerifyPayEscrow.sol";
import {MockERC20} from "../test-helpers/MockERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

// ─────────────────────────────────────────────────────────────────────────────
// ERC-1271 mock: stores an approved EOA, validates its ECDSA sig.
// ─────────────────────────────────────────────────────────────────────────────
contract MockERC1271 {
    address internal _signer;

    bytes4 internal constant MAGIC_VALUE = 0x1626ba7e;

    constructor(address signer_) {
        _signer = signer_;
    }

    function isValidSignature(bytes32 hash, bytes memory signature) external view returns (bytes4) {
        // Recover ECDSA signer from the raw 65-byte sig.
        require(signature.length == 65, "bad sig len");
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := mload(add(signature, 32))
            s := mload(add(signature, 64))
            v := byte(0, mload(add(signature, 96)))
        }
        address recovered = ecrecover(hash, v, r, s);
        if (recovered == _signer) return MAGIC_VALUE;
        return 0xffffffff;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Malicious token whose transfer() re-enters release() on the escrow.
// ─────────────────────────────────────────────────────────────────────────────
contract MaliciousToken is MockERC20 {
    VerifyPayEscrow public escrow;
    uint256 public targetEscrowId;
    bytes32 public targetDeliverableHash;
    bytes public targetSignature;
    bool public attacking;

    constructor() MockERC20("MalToken", "MAL", 6) {}

    function setTarget(
        address escrow_,
        uint256 escrowId_,
        bytes32 deliverableHash_,
        bytes memory signature_
    ) external {
        escrow = VerifyPayEscrow(escrow_);
        targetEscrowId = escrowId_;
        targetDeliverableHash = deliverableHash_;
        targetSignature = signature_;
    }

    // Override transfer: when the escrow tries to pay the payee, re-enter release().
    function transfer(address to, uint256 amount) external override returns (bool) {
        if (attacking) {
            // Perform actual transfer without re-entry to avoid infinite loop.
            attacking = false;
            if (balanceOf[msg.sender] < amount) revert InsufficientBalance();
            balanceOf[msg.sender] -= amount;
            balanceOf[to] += amount;
            emit Transfer(msg.sender, to, amount);
            return true;
        }
        // Mark attacking BEFORE the reentrant call.
        attacking = true;
        // Try to re-enter; the reentrancy guard should revert this inner call.
        try escrow.release(targetEscrowId, targetDeliverableHash, targetSignature) {} catch {}
        // Now do actual transfer.
        if (balanceOf[msg.sender] < amount) revert InsufficientBalance();
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        emit Transfer(msg.sender, to, amount);
        attacking = false;
        return true;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main test contract
// ─────────────────────────────────────────────────────────────────────────────
contract VerifyPayEscrowTest is Test {
    VerifyPayEscrow internal escrow;
    MockERC20       internal usdc;

    address internal payer;
    uint256 internal payerKey;

    address internal verifier;
    uint256 internal verifierKey;

    address internal payee;
    uint256 internal payeeKey;

    address internal relayer;
    uint256 internal relayerKey;

    address internal attacker;
    uint256 internal attackerKey;

    // ── Constants ─────────────────────────────────────────────────────────────
    uint256 internal constant AMOUNT   = 1_000e6;      // 1 000 USDC
    uint64  internal constant DEADLINE_DELTA = 7 days;

    bytes32 internal constant WORK_SPEC_HASH     = keccak256("work spec v1");
    bytes32 internal constant DELIVERABLE_HASH   = keccak256("deliverable v1");

    // ── setUp ─────────────────────────────────────────────────────────────────
    function setUp() public {
        // Deterministic labelled keys.
        (payer,    payerKey)    = makeAddrAndKey("payer");
        (verifier, verifierKey) = makeAddrAndKey("verifier");
        (payee,    payeeKey)    = makeAddrAndKey("payee");
        (relayer,  relayerKey)  = makeAddrAndKey("relayer");
        (attacker, attackerKey) = makeAddrAndKey("attacker");

        // Deploy mock USDC (6 decimals) and pass it to the escrow constructor.
        usdc = new MockERC20("Mock USDC", "mUSDC", 6);

        // Deploy the contract under test with the mock token.
        escrow = new VerifyPayEscrow(IERC20(address(usdc)));

        // Fund payer.
        usdc.mint(payer, AMOUNT * 10);
    }

    // ── Internal helpers ──────────────────────────────────────────────────────

    /// Create an escrow from `payer` (approves USDC first) and return its id.
    function _createEscrow(uint256 amount, uint64 deadline) internal returns (uint256 id) {
        vm.startPrank(payer);
        usdc.approve(address(escrow), amount);
        id = escrow.createEscrow(payee, verifier, amount, deadline, WORK_SPEC_HASH);
        vm.stopPrank();
    }

    /// Sign the PASS digest for the given escrow + deliverable.
    function _sign(uint256 signerKey, uint256 escrowId, bytes32 deliverableHash)
        internal
        view
        returns (bytes memory sig)
    {
        bytes32 digest = escrow.passDigest(escrowId, deliverableHash);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerKey, digest);
        sig = abi.encodePacked(r, s, v);
    }

    /// Current timestamp cast to uint64.
    function _now() internal view returns (uint64) {
        return uint64(block.timestamp);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // GROUP 1 — Happy path: create → release by relayer
    // ══════════════════════════════════════════════════════════════════════════

    function test_happyPath_createReleaseByRelayer() public {
        uint64 deadline = _now() + DEADLINE_DELTA;

        // ── expect EscrowCreated ─────────────────────────────────────────────
        vm.startPrank(payer);
        usdc.approve(address(escrow), AMOUNT);

        vm.expectEmit(true, true, true, true, address(escrow));
        emit VerifyPayEscrow.EscrowCreated(1, payer, payee, verifier, AMOUNT, deadline, WORK_SPEC_HASH);

        uint256 id = escrow.createEscrow(payee, verifier, AMOUNT, deadline, WORK_SPEC_HASH);
        vm.stopPrank();

        assertEq(id, 1);

        // ── verifier signs ───────────────────────────────────────────────────
        bytes memory sig = _sign(verifierKey, id, DELIVERABLE_HASH);

        // ── relayer releases ─────────────────────────────────────────────────
        uint256 payeeBefore = usdc.balanceOf(payee);

        vm.expectEmit(true, true, false, true, address(escrow));
        emit VerifyPayEscrow.Released(id, payee, AMOUNT, DELIVERABLE_HASH, relayer);

        vm.prank(relayer);
        escrow.release(id, DELIVERABLE_HASH, sig);

        // ── post-state assertions ────────────────────────────────────────────
        assertEq(usdc.balanceOf(payee), payeeBefore + AMOUNT, "payee balance");

        VerifyPayEscrow.Escrow memory e = escrow.getEscrow(id);
        assertEq(uint8(e.status), uint8(VerifyPayEscrow.Status.Released), "status Released");
        assertEq(e.deliverableHash, DELIVERABLE_HASH, "deliverableHash stored");
    }

    // ══════════════════════════════════════════════════════════════════════════
    // GROUP 2 — Wrong signer → InvalidAttestation
    // ══════════════════════════════════════════════════════════════════════════

    function test_release_wrongSigner_attacker() public {
        uint256 id = _createEscrow(AMOUNT, _now() + DEADLINE_DELTA);
        bytes memory sig = _sign(attackerKey, id, DELIVERABLE_HASH); // not verifier

        vm.expectRevert(VerifyPayEscrow.InvalidAttestation.selector);
        vm.prank(relayer);
        escrow.release(id, DELIVERABLE_HASH, sig);
    }

    function test_release_wrongSigner_payee() public {
        uint256 id = _createEscrow(AMOUNT, _now() + DEADLINE_DELTA);
        bytes memory sig = _sign(payeeKey, id, DELIVERABLE_HASH); // payee, not verifier

        vm.expectRevert(VerifyPayEscrow.InvalidAttestation.selector);
        vm.prank(relayer);
        escrow.release(id, DELIVERABLE_HASH, sig);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // GROUP 3 — Wrong deliverableHash → InvalidAttestation
    // ══════════════════════════════════════════════════════════════════════════

    function test_release_wrongDeliverableHash() public {
        uint256 id = _createEscrow(AMOUNT, _now() + DEADLINE_DELTA);

        bytes32 correctHash   = DELIVERABLE_HASH;
        bytes32 differentHash = keccak256("different deliverable");

        // Sign over the CORRECT hash but call release with the DIFFERENT hash.
        bytes memory sig = _sign(verifierKey, id, correctHash);

        vm.expectRevert(VerifyPayEscrow.InvalidAttestation.selector);
        vm.prank(relayer);
        escrow.release(id, differentHash, sig);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // GROUP 4 — Replay attacks → InvalidAttestation
    // ══════════════════════════════════════════════════════════════════════════

    function test_replay_differentEscrowId() public {
        // Two escrows; verifier signs for escrow 1.
        uint64 deadline = _now() + DEADLINE_DELTA;
        uint256 id1 = _createEscrow(AMOUNT, deadline);

        // Fund payer for second escrow.
        usdc.mint(payer, AMOUNT);
        uint256 id2 = _createEscrow(AMOUNT, deadline);

        bytes memory sig = _sign(verifierKey, id1, DELIVERABLE_HASH); // signed for id1

        // Replaying on id2 must fail.
        vm.expectRevert(VerifyPayEscrow.InvalidAttestation.selector);
        vm.prank(relayer);
        escrow.release(id2, DELIVERABLE_HASH, sig);
    }

    function test_replay_differentContract() public {
        uint256 id1 = _createEscrow(AMOUNT, _now() + DEADLINE_DELTA);
        bytes memory sig = _sign(verifierKey, id1, DELIVERABLE_HASH);

        // Deploy a second VerifyPayEscrow instance with the same mock token.
        VerifyPayEscrow escrow2 = new VerifyPayEscrow(IERC20(address(usdc)));

        // Create a matching escrow on the second contract (same id=1).
        usdc.mint(payer, AMOUNT);
        vm.startPrank(payer);
        usdc.approve(address(escrow2), AMOUNT);
        escrow2.createEscrow(payee, verifier, AMOUNT, _now() + DEADLINE_DELTA, WORK_SPEC_HASH);
        vm.stopPrank();

        // Replaying the first contract's sig on the second should fail (different domain address).
        vm.expectRevert(VerifyPayEscrow.InvalidAttestation.selector);
        vm.prank(relayer);
        escrow2.release(1, DELIVERABLE_HASH, sig);
    }

    function test_replay_differentChainId() public {
        uint256 id = _createEscrow(AMOUNT, _now() + DEADLINE_DELTA);
        bytes memory sig = _sign(verifierKey, id, DELIVERABLE_HASH);

        // Release succeeds normally.
        vm.prank(relayer);
        escrow.release(id, DELIVERABLE_HASH, sig);

        // Now create a fresh escrow on a DIFFERENT chain id.
        uint256 newChainId = block.chainid + 1;
        vm.chainId(newChainId);

        usdc.mint(payer, AMOUNT);
        uint256 id2 = _createEscrow(AMOUNT, _now() + DEADLINE_DELTA);

        // The old signature was made on the original chain id — domain separator differs.
        bytes memory oldSig = _sign(verifierKey, id2, DELIVERABLE_HASH); // sign on NEW chain
        // Re-capture old-chain sig: vm.chainId changes in-place so we must re-check.
        // We'll sign manually on old chain id to simulate a cross-chain replay:
        // Re-derive the ORIGINAL chain's domain separator manually.
        uint256 origChainId = newChainId - 1;
        bytes32 origDomainSep = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("VerifyPay"),
                keccak256("1"),
                origChainId,
                address(escrow)
            )
        );
        bytes32 origStructHash = keccak256(
            abi.encode(escrow.PASS_TYPEHASH(), id2, DELIVERABLE_HASH)
        );
        bytes32 origDigest = keccak256(abi.encodePacked("\x19\x01", origDomainSep, origStructHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(verifierKey, origDigest);
        bytes memory crossChainSig = abi.encodePacked(r, s, v);

        // Release on the new chain with a sig made for the old chain should fail.
        vm.expectRevert(VerifyPayEscrow.InvalidAttestation.selector);
        vm.prank(relayer);
        escrow.release(id2, DELIVERABLE_HASH, crossChainSig);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // GROUP 5 — Double-settle state machine → NotOpen(id)
    // ══════════════════════════════════════════════════════════════════════════

    function test_doubleRelease() public {
        uint256 id = _createEscrow(AMOUNT, _now() + DEADLINE_DELTA);
        bytes memory sig = _sign(verifierKey, id, DELIVERABLE_HASH);

        vm.prank(relayer);
        escrow.release(id, DELIVERABLE_HASH, sig);

        // Second release must revert NotOpen.
        vm.expectRevert(abi.encodeWithSelector(VerifyPayEscrow.NotOpen.selector, id));
        vm.prank(relayer);
        escrow.release(id, DELIVERABLE_HASH, sig);
    }

    function test_releaseAfterRefund() public {
        uint64 deadline = _now() + DEADLINE_DELTA;
        uint256 id = _createEscrow(AMOUNT, deadline);

        // Refund first.
        vm.warp(deadline + 1);
        vm.prank(payer);
        escrow.refund(id);

        // Now try to release → NotOpen.
        bytes memory sig = _sign(verifierKey, id, DELIVERABLE_HASH);
        vm.expectRevert(abi.encodeWithSelector(VerifyPayEscrow.NotOpen.selector, id));
        vm.prank(relayer);
        escrow.release(id, DELIVERABLE_HASH, sig);
    }

    function test_refundAfterRelease() public {
        uint64 deadline = _now() + DEADLINE_DELTA;
        uint256 id = _createEscrow(AMOUNT, deadline);
        bytes memory sig = _sign(verifierKey, id, DELIVERABLE_HASH);

        vm.prank(relayer);
        escrow.release(id, DELIVERABLE_HASH, sig);

        // Warp past deadline and try to refund → NotOpen.
        vm.warp(deadline + 1);
        vm.expectRevert(abi.encodeWithSelector(VerifyPayEscrow.NotOpen.selector, id));
        vm.prank(payer);
        escrow.refund(id);
    }

    function test_doubleRefund() public {
        uint64 deadline = _now() + DEADLINE_DELTA;
        uint256 id = _createEscrow(AMOUNT, deadline);

        vm.warp(deadline + 1);
        vm.prank(payer);
        escrow.refund(id);

        // Second refund → NotOpen.
        vm.expectRevert(abi.encodeWithSelector(VerifyPayEscrow.NotOpen.selector, id));
        vm.prank(payer);
        escrow.refund(id);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // GROUP 6 — Refund timing
    // ══════════════════════════════════════════════════════════════════════════

    function test_refund_atDeadline() public {
        uint64 deadline = _now() + DEADLINE_DELTA;
        uint256 id = _createEscrow(AMOUNT, deadline);

        // Warp to exactly deadline — contract requires block.timestamp > deadline.
        vm.warp(deadline);
        vm.expectRevert(abi.encodeWithSelector(VerifyPayEscrow.DeadlineNotReached.selector, deadline));
        vm.prank(payer);
        escrow.refund(id);
    }

    function test_refund_beforeDeadline() public {
        uint64 deadline = _now() + DEADLINE_DELTA;
        uint256 id = _createEscrow(AMOUNT, deadline);

        vm.warp(deadline - 1);
        vm.expectRevert(abi.encodeWithSelector(VerifyPayEscrow.DeadlineNotReached.selector, deadline));
        vm.prank(payer);
        escrow.refund(id);
    }

    function test_refund_afterDeadline() public {
        uint64 deadline = _now() + DEADLINE_DELTA;
        uint256 id = _createEscrow(AMOUNT, deadline);

        uint256 payerBefore = usdc.balanceOf(payer);

        vm.warp(deadline + 1);

        vm.expectEmit(true, true, false, true, address(escrow));
        emit VerifyPayEscrow.Refunded(id, payer, AMOUNT);

        vm.prank(payer);
        escrow.refund(id);

        assertEq(usdc.balanceOf(payer), payerBefore + AMOUNT, "payer refund balance");
        VerifyPayEscrow.Escrow memory e = escrow.getEscrow(id);
        assertEq(uint8(e.status), uint8(VerifyPayEscrow.Status.Refunded), "status Refunded");
    }

    function test_refund_nonPayer() public {
        uint64 deadline = _now() + DEADLINE_DELTA;
        uint256 id = _createEscrow(AMOUNT, deadline);

        vm.warp(deadline + 1);
        vm.expectRevert(VerifyPayEscrow.NotPayer.selector);
        vm.prank(attacker);
        escrow.refund(id);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // GROUP 7 — createEscrow param validation
    // ══════════════════════════════════════════════════════════════════════════

    function test_create_zeroPayee() public {
        vm.prank(payer);
        usdc.approve(address(escrow), AMOUNT);
        vm.expectRevert(VerifyPayEscrow.ZeroAddress.selector);
        vm.prank(payer);
        escrow.createEscrow(address(0), verifier, AMOUNT, _now() + DEADLINE_DELTA, WORK_SPEC_HASH);
    }

    function test_create_zeroVerifier() public {
        vm.prank(payer);
        usdc.approve(address(escrow), AMOUNT);
        vm.expectRevert(VerifyPayEscrow.ZeroAddress.selector);
        vm.prank(payer);
        escrow.createEscrow(payee, address(0), AMOUNT, _now() + DEADLINE_DELTA, WORK_SPEC_HASH);
    }

    function test_create_zeroAmount() public {
        vm.prank(payer);
        usdc.approve(address(escrow), AMOUNT);
        vm.expectRevert(VerifyPayEscrow.ZeroAmount.selector);
        vm.prank(payer);
        escrow.createEscrow(payee, verifier, 0, _now() + DEADLINE_DELTA, WORK_SPEC_HASH);
    }

    function test_create_deadlineInPast() public {
        vm.warp(1000); // ensure block.timestamp > 0
        vm.prank(payer);
        usdc.approve(address(escrow), AMOUNT);
        vm.expectRevert(VerifyPayEscrow.DeadlineInPast.selector);
        vm.prank(payer);
        escrow.createEscrow(payee, verifier, AMOUNT, uint64(block.timestamp) - 1, WORK_SPEC_HASH);
    }

    function test_create_deadlineExactlyNow() public {
        vm.warp(1000);
        vm.prank(payer);
        usdc.approve(address(escrow), AMOUNT);
        // deadline == block.timestamp → require is deadline > block.timestamp, so this reverts.
        vm.expectRevert(VerifyPayEscrow.DeadlineInPast.selector);
        vm.prank(payer);
        escrow.createEscrow(payee, verifier, AMOUNT, uint64(block.timestamp), WORK_SPEC_HASH);
    }

    function test_create_missingAllowance() public {
        // No approval → transferFrom reverts inside SafeERC20.
        vm.expectRevert();
        vm.prank(payer);
        escrow.createEscrow(payee, verifier, AMOUNT, _now() + DEADLINE_DELTA, WORK_SPEC_HASH);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // GROUP 8 — Reentrancy guard on release()
    // ══════════════════════════════════════════════════════════════════════════

    function test_reentrancy_release() public {
        // Deploy a malicious token that re-enters release() on transfer.
        MaliciousToken mal = new MaliciousToken();

        // Deploy a fresh escrow wired to the malicious token.
        VerifyPayEscrow escrow2 = new VerifyPayEscrow(IERC20(address(mal)));

        // Mint to payer, approve.
        mal.mint(payer, AMOUNT);
        vm.prank(payer);
        mal.approve(address(escrow2), AMOUNT);

        // Create escrow.
        uint64 deadline = _now() + DEADLINE_DELTA;
        vm.prank(payer);
        uint256 id = escrow2.createEscrow(payee, verifier, AMOUNT, deadline, WORK_SPEC_HASH);

        // Sign PASS.
        bytes32 digest = escrow2.passDigest(id, DELIVERABLE_HASH);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(verifierKey, digest);
        bytes memory sig = abi.encodePacked(r, s, v);

        // Tell the malicious token to re-enter this escrow/id/hash/sig.
        mal.setTarget(address(escrow2), id, DELIVERABLE_HASH, sig);

        // The outer release call should succeed (reentrancy guard catches inner call silently
        // via try/catch in MaliciousToken.transfer), but the reentrant inner call would have
        // triggered ReentrancyGuardReentrantCall. Verify the outer call succeeds cleanly
        // and the status is Released (meaning double-spend was prevented).
        vm.prank(relayer);
        escrow2.release(id, DELIVERABLE_HASH, sig);

        // Verify escrow is Released and payee got funds.
        VerifyPayEscrow.Escrow memory e = escrow2.getEscrow(id);
        assertEq(uint8(e.status), uint8(VerifyPayEscrow.Status.Released), "status Released after reentrant attempt");
    }

    // ══════════════════════════════════════════════════════════════════════════
    // GROUP 9 — ERC-1271 smart-account verifier
    // ══════════════════════════════════════════════════════════════════════════

    function test_erc1271_verifier() public {
        // EOA whose sig the ERC-1271 wallet will validate.
        (address eoa, uint256 eoaKey) = makeAddrAndKey("eoaSigner");

        // Deploy ERC-1271 mock wallet that trusts the EOA.
        MockERC1271 wallet = new MockERC1271(eoa);

        // Create escrow with the ERC-1271 wallet as the verifier.
        vm.startPrank(payer);
        usdc.approve(address(escrow), AMOUNT);
        uint256 id = escrow.createEscrow(payee, address(wallet), AMOUNT, _now() + DEADLINE_DELTA, WORK_SPEC_HASH);
        vm.stopPrank();

        // EOA signs the passDigest.
        bytes32 digest = escrow.passDigest(id, DELIVERABLE_HASH);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(eoaKey, digest);
        bytes memory sig = abi.encodePacked(r, s, v);

        // Release should succeed because isValidSignature returns the magic value.
        vm.prank(relayer);
        escrow.release(id, DELIVERABLE_HASH, sig);

        VerifyPayEscrow.Escrow memory e = escrow.getEscrow(id);
        assertEq(uint8(e.status), uint8(VerifyPayEscrow.Status.Released), "ERC-1271 release status");
    }

    // ══════════════════════════════════════════════════════════════════════════
    // GROUP 10 — passDigest matches manual EIP-712 computation
    // ══════════════════════════════════════════════════════════════════════════

    function test_passDigest_matchesManual() public view {
        uint256 escrowId = 42;
        bytes32 deliverableHash = keccak256("some deliverable");

        // Manually compute: domain separator + struct hash → final digest.
        bytes32 domainSep = escrow.domainSeparator();

        bytes32 structHash = keccak256(
            abi.encode(escrow.PASS_TYPEHASH(), escrowId, deliverableHash)
        );

        bytes32 expectedDigest = keccak256(abi.encodePacked("\x19\x01", domainSep, structHash));

        bytes32 contractDigest = escrow.passDigest(escrowId, deliverableHash);

        assertEq(contractDigest, expectedDigest, "passDigest mismatch");
    }

    // ══════════════════════════════════════════════════════════════════════════
    // GROUP 11 — Fuzz tests
    // ══════════════════════════════════════════════════════════════════════════

    function testFuzz_fundsConserved(uint96 amount, uint64 deadlineDelta) public {
        vm.assume(amount > 0);
        // Clamp deadlineDelta so deadline > block.timestamp + MIN_DEADLINE_SECS
        // and doesn't overflow uint64.
        uint64 minSecs = escrow.MIN_DEADLINE_SECS();
        deadlineDelta = uint64(bound(uint256(deadlineDelta), uint256(minSecs), type(uint64).max / 2));

        uint64 deadline = uint64(block.timestamp) + deadlineDelta;

        // Mint sufficient USDC.
        usdc.mint(payer, amount);

        vm.startPrank(payer);
        usdc.approve(address(escrow), amount);
        uint256 id = escrow.createEscrow(payee, verifier, amount, deadline, WORK_SPEC_HASH);
        vm.stopPrank();

        uint256 payeeBefore = usdc.balanceOf(payee);

        bytes memory sig = _sign(verifierKey, id, DELIVERABLE_HASH);
        vm.prank(relayer);
        escrow.release(id, DELIVERABLE_HASH, sig);

        assertEq(usdc.balanceOf(payee), payeeBefore + amount, "fuzz: payee balance");
    }

    function testFuzz_refundNeverBeforeDeadline(uint64 deadlineDelta, uint64 warpDelta) public {
        // Use a fixed current timestamp of 1000 to have stable arithmetic.
        vm.warp(1000);

        // Clamp deadlineDelta: must be >= MIN_DEADLINE_SECS and not overflow uint64.
        uint64 minSecs = escrow.MIN_DEADLINE_SECS();
        deadlineDelta = uint64(bound(uint256(deadlineDelta), uint256(minSecs), type(uint64).max / 2 - 1000));
        // Clamp warpDelta to same safe range.
        warpDelta = uint64(bound(uint256(warpDelta), 0, type(uint64).max / 2 - 1000));

        uint64 deadline = uint64(block.timestamp) + deadlineDelta;
        uint256 id = _createEscrow(AMOUNT, deadline);

        uint256 warpTo = uint256(block.timestamp) + uint256(warpDelta);
        vm.warp(warpTo);

        if (warpDelta <= deadlineDelta) {
            // block.timestamp == 1000 + warpDelta <= 1000 + deadlineDelta == deadline
            // The contract reverts when block.timestamp <= deadline.
            vm.expectRevert(abi.encodeWithSelector(VerifyPayEscrow.DeadlineNotReached.selector, deadline));
            vm.prank(payer);
            escrow.refund(id);
        } else {
            // block.timestamp > deadline → refund succeeds.
            vm.prank(payer);
            escrow.refund(id);
            VerifyPayEscrow.Escrow memory e = escrow.getEscrow(id);
            assertEq(uint8(e.status), uint8(VerifyPayEscrow.Status.Refunded), "fuzz: refunded");
        }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // GROUP 0 — Constructor validation
    // ══════════════════════════════════════════════════════════════════════════

    /// @dev Deploying with address(0) as the token must revert ZeroAddress.
    function test_constructor_zeroUsdc() public {
        vm.expectRevert(VerifyPayEscrow.ZeroAddress.selector);
        new VerifyPayEscrow(IERC20(address(0)));
    }

    // ══════════════════════════════════════════════════════════════════════════
    // GROUP 12 — Signature malleability: high-s must be rejected
    // ══════════════════════════════════════════════════════════════════════════

    /// @dev secp256k1 order n
    uint256 internal constant SECP256K1_N =
        0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141;

    /// @dev Flip s to n - s (the malleable high-s form) and verify release reverts.
    function test_release_highS_malleability() public {
        uint256 id = _createEscrow(AMOUNT, _now() + DEADLINE_DELTA);

        // Obtain a canonical low-s sig from the test helper.
        bytes32 digest = escrow.passDigest(id, DELIVERABLE_HASH);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(verifierKey, digest);

        // Sanity: canonical sig has low s.
        assertLt(uint256(s), SECP256K1_N / 2 + 1, "test helper should produce low-s sig");

        // Flip to high-s and adjust v (parity flips).
        bytes32 highS = bytes32(SECP256K1_N - uint256(s));
        uint8 flippedV = v == 27 ? 28 : 27;

        bytes memory malleableSig = abi.encodePacked(r, highS, flippedV);

        vm.expectRevert(VerifyPayEscrow.InvalidAttestation.selector);
        vm.prank(relayer);
        escrow.release(id, DELIVERABLE_HASH, malleableSig);
    }

    /// @dev Low-s sig (canonical) must still succeed after the malleability guard.
    function test_release_lowS_accepted() public {
        uint256 id = _createEscrow(AMOUNT, _now() + DEADLINE_DELTA);
        bytes memory sig = _sign(verifierKey, id, DELIVERABLE_HASH);

        // Should succeed — not revert.
        vm.prank(relayer);
        escrow.release(id, DELIVERABLE_HASH, sig);

        VerifyPayEscrow.Escrow memory e = escrow.getEscrow(id);
        assertEq(uint8(e.status), uint8(VerifyPayEscrow.Status.Released));
    }

    // ══════════════════════════════════════════════════════════════════════════
    // GROUP 13 — DeadlineTooSoon: must be at least MIN_DEADLINE_SECS away
    // ══════════════════════════════════════════════════════════════════════════

    function test_create_deadlineTooSoon_exactlyNowPlusMinuteMinusOne() public {
        vm.warp(1_000_000);
        uint64 tooSoon = uint64(block.timestamp) + escrow.MIN_DEADLINE_SECS() - 1;

        vm.startPrank(payer);
        usdc.approve(address(escrow), AMOUNT);
        vm.expectRevert(VerifyPayEscrow.DeadlineTooSoon.selector);
        escrow.createEscrow(payee, verifier, AMOUNT, tooSoon, WORK_SPEC_HASH);
        vm.stopPrank();
    }

    function test_create_deadlineExactlyAtMinimum_succeeds() public {
        vm.warp(1_000_000);
        uint64 minDeadline = uint64(block.timestamp) + escrow.MIN_DEADLINE_SECS();

        vm.startPrank(payer);
        usdc.approve(address(escrow), AMOUNT);
        uint256 id = escrow.createEscrow(payee, verifier, AMOUNT, minDeadline, WORK_SPEC_HASH);
        vm.stopPrank();

        assertGt(id, 0);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // GROUP 11 — Fuzz tests (updated deadlineDelta bound for MIN_DEADLINE_SECS)
    // ══════════════════════════════════════════════════════════════════════════

    // The original testFuzz_fundsConserved must now use a deadlineDelta >= MIN_DEADLINE_SECS.
    function testFuzz_fundsConserved_minDeadline(uint96 amount, uint64 deadlineDelta) public {
        vm.assume(amount > 0);
        uint64 minSecs = escrow.MIN_DEADLINE_SECS();
        // Clamp: delta in [minSecs, 2^62] so deadline is always far enough in the future.
        deadlineDelta = uint64(bound(uint256(deadlineDelta), uint256(minSecs), type(uint64).max / 2));

        uint64 deadline = uint64(block.timestamp) + deadlineDelta;

        usdc.mint(payer, amount);

        vm.startPrank(payer);
        usdc.approve(address(escrow), amount);
        uint256 id = escrow.createEscrow(payee, verifier, amount, deadline, WORK_SPEC_HASH);
        vm.stopPrank();

        uint256 payeeBefore = usdc.balanceOf(payee);
        bytes memory sig = _sign(verifierKey, id, DELIVERABLE_HASH);
        vm.prank(relayer);
        escrow.release(id, DELIVERABLE_HASH, sig);

        assertEq(usdc.balanceOf(payee), payeeBefore + amount, "fuzz-minDeadline: payee balance");
    }
}
