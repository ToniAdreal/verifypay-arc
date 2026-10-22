// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";

/// @title VerifyPayEscrow
/// @notice USDC-only escrow released to a payee when a verifier signs a PASS attestation.
contract VerifyPayEscrow is EIP712, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice USDC token used for all escrow funding and payouts.
    /// @dev Set once at construction; on Arc deploy with 0x3600000000000000000000000000000000000000.
    IERC20 public immutable usdc;

    /// @notice EIP-712 typehash for pass attestations.
    bytes32 public constant PASS_TYPEHASH = keccak256("Pass(uint256 escrowId,bytes32 deliverableHash)");

    /// @notice Escrow lifecycle.
    enum Status {
        None,
        Open,
        Released,
        Refunded
    }

    struct Escrow {
        address payer;
        address payee;
        address verifier;
        uint256 amount;
        uint64 deadline;
        bytes32 workSpecHash;
        bytes32 deliverableHash;
        Status status;
    }

    mapping(uint256 => Escrow) private _escrows;

    /// @notice Next escrow id to allocate. First real escrow id is 1.
    uint256 public nextEscrowId = 1;

    /// @notice Minimum seconds from now that a deadline must be set to.
    /// @dev Prevents block-timestamp manipulation griefing (miner skews ~15 s on Arc)
    ///      and forces at least a meaningful escrow window.
    uint64 public constant MIN_DEADLINE_SECS = 60;

    error ZeroAddress();
    error ZeroAmount();
    error DeadlineInPast();
    error DeadlineTooSoon();
    error NotOpen(uint256 escrowId);
    error InvalidAttestation();
    error NotPayer();
    error DeadlineNotReached(uint64 deadline);

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
        uint256 indexed escrowId,
        address indexed payee,
        uint256 amount,
        bytes32 deliverableHash,
        address relayer
    );

    event Refunded(uint256 indexed escrowId, address indexed payer, uint256 amount);

    /// @param usdc_ ERC-20 token used for all transfers (6 decimals on Arc).
    /// @dev Reverts ZeroAddress if usdc_ is the zero address.
    constructor(IERC20 usdc_) EIP712("VerifyPay", "1") {
        if (address(usdc_) == address(0)) revert ZeroAddress();
        usdc = usdc_;
    }

    /// @notice Create a new escrow and fund it with USDC from the payer.
    /// @param payee Recipient of funds on successful PASS attestation.
    /// @param verifier Signer authorized to attest PASS for this escrow.
    /// @param amount USDC amount (6 decimals) to lock in escrow.
    /// @param deadline Timestamp after which payer may refund if still open.
    /// @param workSpecHash Hash of the agreed work specification.
    /// @return escrowId Newly created escrow id.
    function createEscrow(
        address payee,
        address verifier,
        uint256 amount,
        uint64 deadline,
        bytes32 workSpecHash
    ) external nonReentrant returns (uint256 escrowId) {
        if (payee == address(0) || verifier == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        if (deadline <= uint64(block.timestamp)) revert DeadlineInPast();
        if (deadline < uint64(block.timestamp) + MIN_DEADLINE_SECS) revert DeadlineTooSoon();

        escrowId = nextEscrowId++;

        _escrows[escrowId] = Escrow({
            payer: msg.sender,
            payee: payee,
            verifier: verifier,
            amount: amount,
            deadline: deadline,
            workSpecHash: workSpecHash,
            deliverableHash: bytes32(0),
            status: Status.Open // None -> Open
        });

        usdc.safeTransferFrom(msg.sender, address(this), amount);

        emit EscrowCreated(escrowId, msg.sender, payee, verifier, amount, deadline, workSpecHash);
    }

    /// @notice Release escrowed USDC to payee with a valid verifier PASS attestation.
    /// @dev Deadline is intentionally not checked; release stays possible until refunded.
    ///      EOA signatures are additionally checked for the low-s form (EIP-2) to reject
    ///      malleable s-flipped variants.  ERC-1271 smart-account signatures are not
    ///      constrained here because their isValidSignature logic is owner-defined.
    /// @param escrowId Escrow id to release.
    /// @param deliverableHash Hash of delivered work acknowledged by verifier signature.
    /// @param signature Verifier signature over EIP-712 PASS payload.
    function release(uint256 escrowId, bytes32 deliverableHash, bytes calldata signature) external nonReentrant {
        Escrow storage escrow = _escrows[escrowId];
        if (escrow.status != Status.Open) revert NotOpen(escrowId);

        // Reject high-s EOA signatures (signature malleability, EIP-2).
        // Only applies to 65-byte compact ECDSA signatures; ERC-1271 blobs may be longer.
        if (signature.length == 65) {
            bytes32 s;
            assembly { s := calldataload(add(signature.offset, 32)) }
            // secp256k1 order n; s must be in [1, n/2]
            if (uint256(s) > 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0) {
                revert InvalidAttestation();
            }
        }

        bytes32 digest = _passDigest(escrowId, deliverableHash);
        if (!SignatureChecker.isValidSignatureNow(escrow.verifier, digest, signature)) revert InvalidAttestation();

        // Effects: Open -> Released
        escrow.status = Status.Released;
        escrow.deliverableHash = deliverableHash;

        // Interaction
        usdc.safeTransfer(escrow.payee, escrow.amount);

        emit Released(escrowId, escrow.payee, escrow.amount, deliverableHash, msg.sender);
    }

    /// @notice Refund escrowed USDC back to payer once deadline has passed.
    /// @param escrowId Escrow id to refund.
    function refund(uint256 escrowId) external nonReentrant {
        Escrow storage escrow = _escrows[escrowId];
        if (msg.sender != escrow.payer) revert NotPayer();
        if (escrow.status != Status.Open) revert NotOpen(escrowId);
        if (block.timestamp <= escrow.deadline) revert DeadlineNotReached(escrow.deadline);

        // Effects: Open -> Refunded
        escrow.status = Status.Refunded;

        // Interaction
        usdc.safeTransfer(escrow.payer, escrow.amount);

        emit Refunded(escrowId, escrow.payer, escrow.amount);
    }

    /// @notice Get escrow by id.
    /// @param escrowId Escrow id.
    /// @return Full escrow struct.
    function getEscrow(uint256 escrowId) external view returns (Escrow memory) {
        return _escrows[escrowId];
    }

    /// @notice Return EIP-712 digest expected for verifier PASS attestation.
    /// @param escrowId Escrow id.
    /// @param deliverableHash Hash of delivered work.
    /// @return EIP-712 digest to be signed by verifier.
    function passDigest(uint256 escrowId, bytes32 deliverableHash) external view returns (bytes32) {
        return _passDigest(escrowId, deliverableHash);
    }

    /// @notice Return current EIP-712 domain separator.
    function domainSeparator() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    function _passDigest(uint256 escrowId, bytes32 deliverableHash) internal view returns (bytes32) {
        bytes32 structHash = keccak256(abi.encode(PASS_TYPEHASH, escrowId, deliverableHash));
        return keccak256(abi.encodePacked("\x19\x01", _domainSeparatorV4(), structHash));
    }
}
