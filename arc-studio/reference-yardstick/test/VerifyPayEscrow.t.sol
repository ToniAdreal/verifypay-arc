// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {VerifyPayEscrow} from "../src/VerifyPayEscrow.sol";
import {MockUSDC, ReentrantUSDC, MockSmartVerifier, IVerifyPayLike} from "./mocks/MockUSDC.sol";

contract VerifyPayEscrowTest is Test {
    VerifyPayEscrow internal escrow;
    MockUSDC internal usdc;

    address internal payer = makeAddr("payer");
    address internal payee = makeAddr("payee-agent");
    address internal relayer = makeAddr("relayer");
    uint256 internal verifierPk = 0xA11CE;
    address internal verifier;
    uint256 internal attackerPk = 0xBAD;

    uint256 internal constant ONE_USDC = 1e6;
    bytes32 internal constant SPEC = keccak256("spec: fix slugify, tests must pass");
    bytes32 internal constant DELIVERABLE = keccak256("evidence record 3e199bb6...");

    event EscrowCreated(
        uint256 indexed escrowId,
        address indexed payer,
        address indexed payee,
        address verifier,
        uint256 amount,
        uint64 deadline,
        bytes32 workSpecHash
    );
    event Released(
        uint256 indexed escrowId, address indexed payee, uint256 amount, bytes32 deliverableHash, address relayer
    );
    event Refunded(uint256 indexed escrowId, address indexed payer, uint256 amount);

    function setUp() public {
        vm.warp(1_800_000_000);
        verifier = vm.addr(verifierPk);
        usdc = new MockUSDC();
        escrow = new VerifyPayEscrow(IERC20(address(usdc)));
        usdc.mint(payer, 100 * ONE_USDC);
        vm.prank(payer);
        usdc.approve(address(escrow), type(uint256).max);
    }

    // ---------- helpers ----------
    function _create(uint256 amount, uint64 deadline) internal returns (uint256 id) {
        vm.prank(payer);
        id = escrow.createEscrow(payee, verifier, amount, deadline, SPEC);
    }

    function _sign(uint256 pk, VerifyPayEscrow target, uint256 id, bytes32 h) internal view returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, target.passDigest(id, h));
        return abi.encodePacked(r, s, v);
    }

    function _deadline() internal view returns (uint64) {
        return uint64(block.timestamp + 1 days);
    }

    // ---------- create ----------
    function test_create_pullsUsdcAndEmits() public {
        uint64 dl = _deadline();
        vm.expectEmit(true, true, true, true, address(escrow));
        emit EscrowCreated(1, payer, payee, verifier, ONE_USDC, dl, SPEC);
        uint256 id = _create(ONE_USDC, dl);

        assertEq(id, 1);
        assertEq(usdc.balanceOf(address(escrow)), ONE_USDC);
        assertEq(usdc.balanceOf(payer), 99 * ONE_USDC);
        VerifyPayEscrow.Escrow memory e = escrow.getEscrow(id);
        assertEq(e.payer, payer);
        assertEq(e.payee, payee);
        assertEq(e.verifier, verifier);
        assertEq(e.amount, ONE_USDC);
        assertEq(e.deadline, dl);
        assertEq(e.workSpecHash, SPEC);
        assertEq(uint8(e.status), uint8(VerifyPayEscrow.Status.Open));
        assertEq(escrow.nextEscrowId(), 2);
    }

    function test_create_revertsOnBadParams() public {
        uint64 dl = _deadline();
        vm.startPrank(payer);
        vm.expectRevert(VerifyPayEscrow.ZeroAddress.selector);
        escrow.createEscrow(address(0), verifier, ONE_USDC, dl, SPEC);
        vm.expectRevert(VerifyPayEscrow.ZeroAddress.selector);
        escrow.createEscrow(payee, address(0), ONE_USDC, dl, SPEC);
        vm.expectRevert(VerifyPayEscrow.ZeroAmount.selector);
        escrow.createEscrow(payee, verifier, 0, dl, SPEC);
        vm.expectRevert(VerifyPayEscrow.DeadlineInPast.selector);
        escrow.createEscrow(payee, verifier, ONE_USDC, uint64(block.timestamp), SPEC);
        vm.stopPrank();
    }

    function test_create_revertsWithoutAllowance() public {
        address poor = makeAddr("no-allowance");
        usdc.mint(poor, ONE_USDC);
        vm.prank(poor);
        vm.expectRevert(
            abi.encodeWithSelector(IERC20Errors.ERC20InsufficientAllowance.selector, address(escrow), 0, ONE_USDC)
        );
        escrow.createEscrow(payee, verifier, ONE_USDC, _deadline(), SPEC);
    }

    function test_constructor_rejectsZeroToken() public {
        vm.expectRevert(VerifyPayEscrow.ZeroAddress.selector);
        new VerifyPayEscrow(IERC20(address(0)));
    }

    // ---------- happy path ----------
    function test_release_happyPath_anyoneCanRelay() public {
        uint256 id = _create(ONE_USDC, _deadline());
        bytes memory sig = _sign(verifierPk, escrow, id, DELIVERABLE);

        vm.expectEmit(true, true, false, true, address(escrow));
        emit Released(id, payee, ONE_USDC, DELIVERABLE, relayer);
        vm.prank(relayer);
        escrow.release(id, DELIVERABLE, sig);

        assertEq(usdc.balanceOf(payee), ONE_USDC);
        assertEq(usdc.balanceOf(address(escrow)), 0);
        VerifyPayEscrow.Escrow memory e = escrow.getEscrow(id);
        assertEq(uint8(e.status), uint8(VerifyPayEscrow.Status.Released));
        assertEq(e.deliverableHash, DELIVERABLE);
    }

    function test_release_stillAllowedAfterDeadlineIfNotRefunded() public {
        uint64 dl = _deadline();
        uint256 id = _create(ONE_USDC, dl);
        vm.warp(dl + 10);
        escrow.release(id, DELIVERABLE, _sign(verifierPk, escrow, id, DELIVERABLE));
        assertEq(usdc.balanceOf(payee), ONE_USDC);
    }

    function test_release_smartAccountVerifier_erc1271() public {
        MockSmartVerifier smart = new MockSmartVerifier(verifier);
        vm.prank(payer);
        uint256 id = escrow.createEscrow(payee, address(smart), ONE_USDC, _deadline(), SPEC);
        escrow.release(id, DELIVERABLE, _sign(verifierPk, escrow, id, DELIVERABLE));
        assertEq(usdc.balanceOf(payee), ONE_USDC);
    }

    // ---------- wrong signer / wrong payload ----------
    function test_release_wrongSigner_reverts() public {
        uint256 id = _create(ONE_USDC, _deadline());
        bytes memory sig = _sign(attackerPk, escrow, id, DELIVERABLE);
        vm.expectRevert(VerifyPayEscrow.InvalidAttestation.selector);
        escrow.release(id, DELIVERABLE, sig);
        assertEq(usdc.balanceOf(address(escrow)), ONE_USDC);
    }

    function test_release_payerOrPayeeSignatureIsNotEnough() public {
        uint256 payeePk = 0xC0DE;
        address agent = vm.addr(payeePk);
        vm.prank(payer);
        uint256 id = escrow.createEscrow(agent, verifier, ONE_USDC, _deadline(), SPEC);
        bytes memory sig = _sign(payeePk, escrow, id, DELIVERABLE);
        vm.expectRevert(VerifyPayEscrow.InvalidAttestation.selector);
        escrow.release(id, DELIVERABLE, sig);
    }

    function test_release_signatureForOtherDeliverable_reverts() public {
        uint256 id = _create(ONE_USDC, _deadline());
        bytes memory sig = _sign(verifierPk, escrow, id, keccak256("some other deliverable"));
        vm.expectRevert(VerifyPayEscrow.InvalidAttestation.selector);
        escrow.release(id, DELIVERABLE, sig);
    }

    function test_release_garbageSignature_reverts() public {
        uint256 id = _create(ONE_USDC, _deadline());
        vm.expectRevert(VerifyPayEscrow.InvalidAttestation.selector);
        escrow.release(id, DELIVERABLE, hex"1234");
    }

    // ---------- replay ----------
    function test_replay_sameSigOnOtherEscrow_reverts() public {
        uint256 id1 = _create(ONE_USDC, _deadline());
        uint256 id2 = _create(ONE_USDC, _deadline());
        bytes memory sig1 = _sign(verifierPk, escrow, id1, DELIVERABLE);
        escrow.release(id1, DELIVERABLE, sig1);
        vm.expectRevert(VerifyPayEscrow.InvalidAttestation.selector);
        escrow.release(id2, DELIVERABLE, sig1);
        assertEq(usdc.balanceOf(payee), ONE_USDC);
        assertEq(usdc.balanceOf(address(escrow)), ONE_USDC);
    }

    function test_replay_acrossContracts_reverts() public {
        VerifyPayEscrow other = new VerifyPayEscrow(IERC20(address(usdc)));
        vm.prank(payer);
        usdc.approve(address(other), type(uint256).max);
        uint256 idA = _create(ONE_USDC, _deadline());
        vm.prank(payer);
        uint256 idB = other.createEscrow(payee, verifier, ONE_USDC, _deadline(), SPEC);
        assertEq(idA, idB); // same id on both deployments
        bytes memory sigA = _sign(verifierPk, escrow, idA, DELIVERABLE);
        vm.expectRevert(VerifyPayEscrow.InvalidAttestation.selector);
        other.release(idB, DELIVERABLE, sigA);
    }

    function test_replay_acrossChains_reverts() public {
        uint256 id = _create(ONE_USDC, _deadline());
        bytes memory sig = _sign(verifierPk, escrow, id, DELIVERABLE); // signed for chainid 31337
        vm.chainId(5042); // same contract, different chain id (e.g. a mainnet fork)
        vm.expectRevert(VerifyPayEscrow.InvalidAttestation.selector);
        escrow.release(id, DELIVERABLE, sig);
    }

    // ---------- double settle ----------
    function test_doubleRelease_reverts() public {
        uint256 id = _create(ONE_USDC, _deadline());
        bytes memory sig = _sign(verifierPk, escrow, id, DELIVERABLE);
        escrow.release(id, DELIVERABLE, sig);
        vm.expectRevert(abi.encodeWithSelector(VerifyPayEscrow.NotOpen.selector, id));
        escrow.release(id, DELIVERABLE, sig);
        assertEq(usdc.balanceOf(payee), ONE_USDC);
    }

    function test_release_unknownEscrow_reverts() public {
        bytes memory sig = _sign(verifierPk, escrow, 42, DELIVERABLE);
        vm.expectRevert(abi.encodeWithSelector(VerifyPayEscrow.NotOpen.selector, 42));
        escrow.release(42, DELIVERABLE, sig);
    }

    // ---------- refund timing ----------
    function test_refund_beforeOrAtDeadline_reverts() public {
        uint64 dl = _deadline();
        uint256 id = _create(ONE_USDC, dl);
        vm.startPrank(payer);
        vm.expectRevert(abi.encodeWithSelector(VerifyPayEscrow.DeadlineNotReached.selector, dl));
        escrow.refund(id);
        vm.warp(dl);
        vm.expectRevert(abi.encodeWithSelector(VerifyPayEscrow.DeadlineNotReached.selector, dl));
        escrow.refund(id);
        vm.stopPrank();
    }

    function test_refund_afterDeadline_returnsFunds() public {
        uint64 dl = _deadline();
        uint256 id = _create(ONE_USDC, dl);
        vm.warp(dl + 1);
        vm.expectEmit(true, true, false, true, address(escrow));
        emit Refunded(id, payer, ONE_USDC);
        vm.prank(payer);
        escrow.refund(id);
        assertEq(usdc.balanceOf(payer), 100 * ONE_USDC);
        assertEq(uint8(escrow.getEscrow(id).status), uint8(VerifyPayEscrow.Status.Refunded));
    }

    function test_refund_onlyPayer() public {
        uint64 dl = _deadline();
        uint256 id = _create(ONE_USDC, dl);
        vm.warp(dl + 1);
        vm.prank(payee);
        vm.expectRevert(VerifyPayEscrow.NotPayer.selector);
        escrow.refund(id);
    }

    function test_refund_afterRelease_reverts() public {
        uint64 dl = _deadline();
        uint256 id = _create(ONE_USDC, dl);
        escrow.release(id, DELIVERABLE, _sign(verifierPk, escrow, id, DELIVERABLE));
        vm.warp(dl + 1);
        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(VerifyPayEscrow.NotOpen.selector, id));
        escrow.refund(id);
    }

    function test_release_afterRefund_reverts() public {
        uint64 dl = _deadline();
        uint256 id = _create(ONE_USDC, dl);
        bytes memory sig = _sign(verifierPk, escrow, id, DELIVERABLE);
        vm.warp(dl + 1);
        vm.prank(payer);
        escrow.refund(id);
        vm.expectRevert(abi.encodeWithSelector(VerifyPayEscrow.NotOpen.selector, id));
        escrow.release(id, DELIVERABLE, sig);
    }

    function test_doubleRefund_reverts() public {
        uint64 dl = _deadline();
        uint256 id = _create(ONE_USDC, dl);
        vm.warp(dl + 1);
        vm.startPrank(payer);
        escrow.refund(id);
        vm.expectRevert(abi.encodeWithSelector(VerifyPayEscrow.NotOpen.selector, id));
        escrow.refund(id);
        vm.stopPrank();
    }

    // ---------- reentrancy ----------
    function test_reentrancy_onRelease_blocked() public {
        ReentrantUSDC evil = new ReentrantUSDC();
        VerifyPayEscrow e2 = new VerifyPayEscrow(IERC20(address(evil)));
        evil.mint(payer, 10 * ONE_USDC);
        vm.startPrank(payer);
        evil.approve(address(e2), type(uint256).max);
        uint256 id1 = e2.createEscrow(payee, verifier, ONE_USDC, _deadline(), SPEC);
        uint256 id2 = e2.createEscrow(payee, verifier, ONE_USDC, _deadline(), SPEC);
        vm.stopPrank();
        bytes memory sig2 = _sign(verifierPk, e2, id2, DELIVERABLE);
        evil.arm(IVerifyPayLike(address(e2)), id2, DELIVERABLE, sig2, false);
        bytes memory sig1 = _sign(verifierPk, e2, id1, DELIVERABLE);
        vm.expectRevert(ReentrancyGuard.ReentrancyGuardReentrantCall.selector);
        e2.release(id1, DELIVERABLE, sig1);
        // nothing moved: both escrows still hold their USDC
        assertEq(evil.balanceOf(address(e2)), 2 * ONE_USDC);
    }

    // ---------- digest matches off-chain EIP-712 (viem/ethers) ----------
    function test_passDigest_matchesManualEip712() public view {
        bytes32 domain = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("VerifyPay"),
                keccak256("1"),
                block.chainid,
                address(escrow)
            )
        );
        bytes32 structHash = keccak256(abi.encode(keccak256("Pass(uint256 escrowId,bytes32 deliverableHash)"), 7, DELIVERABLE));
        assertEq(escrow.domainSeparator(), domain);
        assertEq(escrow.passDigest(7, DELIVERABLE), keccak256(abi.encodePacked("\x19\x01", domain, structHash)));
    }

    // ---------- fuzz ----------
    function testFuzz_createRelease_conservesFunds(uint96 amount, bytes32 deliverable, uint32 ttl) public {
        amount = uint96(bound(amount, 1, 100 * ONE_USDC));
        ttl = uint32(bound(ttl, 1, 365 days));
        uint256 id = _create(amount, uint64(block.timestamp + ttl));
        escrow.release(id, deliverable, _sign(verifierPk, escrow, id, deliverable));
        assertEq(usdc.balanceOf(payee), amount);
        assertEq(usdc.balanceOf(payer) + usdc.balanceOf(payee), 100 * ONE_USDC);
        assertEq(usdc.balanceOf(address(escrow)), 0);
    }

    function testFuzz_refundNeverBeforeDeadline(uint32 ttl, uint32 elapsed) public {
        ttl = uint32(bound(ttl, 1, 365 days));
        uint64 dl = uint64(block.timestamp + ttl);
        uint256 id = _create(ONE_USDC, dl);
        vm.warp(block.timestamp + elapsed);
        vm.prank(payer);
        if (block.timestamp <= dl) {
            vm.expectRevert(abi.encodeWithSelector(VerifyPayEscrow.DeadlineNotReached.selector, dl));
            escrow.refund(id);
        } else {
            escrow.refund(id);
            assertEq(usdc.balanceOf(payer), 100 * ONE_USDC);
        }
    }
}
