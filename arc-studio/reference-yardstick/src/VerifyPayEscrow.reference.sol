// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";

/// @title VerifyPayEscrow
/// @notice USDC escrow that pays a worker (e.g. an AI coding agent) only when a designated
///         verifier signs an EIP-712 PASS attestation over (escrowId, deliverableHash).
///         If no PASS arrives, the payer can refund once the deadline has passed.
/// @dev    On Arc, USDC is the native gas token and is also exposed as an ERC-20 at
///         0x3600000000000000000000000000000000000000 with 6 decimals
///         (docs.arc.io/arc/references/contract-addresses). This contract only ever uses
///         the ERC-20 interface (6 decimals) and never touches msg.value, so the
///         18-decimal native view never mixes with ERC-20 amounts.
///         Lifecycle: None -> Open -> (Released | Refunded). Each escrow settles once.
contract VerifyPayEscrow is EIP712, ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum Status {
        None,
        Open,
        Released,
        Refunded
    }

    struct Escrow {
        address payer;
        uint64 deadline; // unix seconds; refund allowed when block.timestamp > deadline
        Status status;
        address payee;
        address verifier;
        uint256 amount; // USDC base units (6 decimals)
        bytes32 workSpecHash; // hash of the task spec the work is judged against
        bytes32 deliverableHash; // set on release: hash of the deliverable the verifier passed
    }

    /// @dev EIP-712 typehash for the verifier's PASS attestation.
    bytes32 public constant PASS_TYPEHASH = keccak256("Pass(uint256 escrowId,bytes32 deliverableHash)");

    IERC20 public immutable usdc;
    uint256 public nextEscrowId = 1;
    mapping(uint256 => Escrow) private _escrows;

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

    error ZeroAddress();
    error ZeroAmount();
    error DeadlineInPast();
    error NotOpen(uint256 escrowId);
    error InvalidAttestation();
    error NotPayer();
    error DeadlineNotReached(uint64 deadline);

    constructor(IERC20 usdc_) EIP712("VerifyPay", "1") {
        if (address(usdc_) == address(0)) revert ZeroAddress();
        usdc = usdc_;
    }

    /// @notice Lock `amount` USDC for `payee`. Caller must have approved this contract first.
    function createEscrow(address payee, address verifier, uint256 amount, uint64 deadline, bytes32 workSpecHash)
        external
        nonReentrant
        returns (uint256 escrowId)
    {
        // Arc reverts value transfers to address(0); reject it up front for payee and verifier.
        if (payee == address(0) || verifier == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        if (deadline <= block.timestamp) revert DeadlineInPast();

        escrowId = nextEscrowId++;
        _escrows[escrowId] = Escrow({
            payer: msg.sender,
            deadline: deadline,
            status: Status.Open,
            payee: payee,
            verifier: verifier,
            amount: amount,
            workSpecHash: workSpecHash,
            deliverableHash: bytes32(0)
        });

        emit EscrowCreated(escrowId, msg.sender, payee, verifier, amount, deadline, workSpecHash);
        usdc.safeTransferFrom(msg.sender, address(this), amount);
    }

    /// @notice Pay the payee. Anyone may relay this (payee, payer, a bot) as long as the
    ///         escrow's verifier signed PASS for exactly this escrowId and deliverableHash.
    /// @dev    Release stays possible after the deadline until the payer actually refunds.
    ///         Replay is prevented by the single-settle status, the escrowId in the struct,
    ///         and chainId + contract address in the EIP-712 domain.
    function release(uint256 escrowId, bytes32 deliverableHash, bytes calldata signature) external nonReentrant {
        Escrow storage e = _escrows[escrowId];
        if (e.status != Status.Open) revert NotOpen(escrowId);
        if (!SignatureChecker.isValidSignatureNow(e.verifier, passDigest(escrowId, deliverableHash), signature)) {
            revert InvalidAttestation();
        }

        e.status = Status.Released;
        e.deliverableHash = deliverableHash;
        uint256 amount = e.amount;
        address payee = e.payee;

        emit Released(escrowId, payee, amount, deliverableHash, msg.sender);
        usdc.safeTransfer(payee, amount);
    }

    /// @notice Return the USDC to the payer once the deadline has passed without a release.
    function refund(uint256 escrowId) external nonReentrant {
        Escrow storage e = _escrows[escrowId];
        if (e.status != Status.Open) revert NotOpen(escrowId);
        if (msg.sender != e.payer) revert NotPayer();
        if (block.timestamp <= e.deadline) revert DeadlineNotReached(e.deadline);

        e.status = Status.Refunded;
        uint256 amount = e.amount;

        emit Refunded(escrowId, msg.sender, amount);
        usdc.safeTransfer(msg.sender, amount);
    }

    /// @notice EIP-712 digest the verifier must sign for a PASS.
    function passDigest(uint256 escrowId, bytes32 deliverableHash) public view returns (bytes32) {
        return _hashTypedDataV4(keccak256(abi.encode(PASS_TYPEHASH, escrowId, deliverableHash)));
    }

    function getEscrow(uint256 escrowId) external view returns (Escrow memory) {
        return _escrows[escrowId];
    }

    function domainSeparator() external view returns (bytes32) {
        return _domainSeparatorV4();
    }
}
