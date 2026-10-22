// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @dev 6-decimal stand-in for Arc's USDC ERC-20 interface (0x3600...0000).
contract MockUSDC is ERC20 {
    constructor() ERC20("USD Coin", "USDC") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

interface IVerifyPayLike {
    function release(uint256 escrowId, bytes32 deliverableHash, bytes calldata signature) external;
    function refund(uint256 escrowId) external;
}

/// @dev Token that tries to re-enter the escrow during transfer, to prove the guard works.
contract ReentrantUSDC is ERC20 {
    IVerifyPayLike public target;
    uint256 public attackId;
    bytes32 public attackHash;
    bytes public attackSig;
    bool public attackRefund;

    constructor() ERC20("Evil USD", "eUSD") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function arm(IVerifyPayLike t, uint256 id, bytes32 h, bytes calldata sig, bool useRefund) external {
        target = t;
        attackId = id;
        attackHash = h;
        attackSig = sig;
        attackRefund = useRefund;
    }

    function transfer(address to, uint256 value) public override returns (bool) {
        if (address(target) != address(0)) {
            IVerifyPayLike t = target;
            target = IVerifyPayLike(address(0));
            if (attackRefund) t.refund(attackId);
            else t.release(attackId, attackHash, attackSig);
        }
        return super.transfer(to, value);
    }
}

/// @dev Minimal ERC-1271 smart-account verifier that trusts one EOA signer.
contract MockSmartVerifier {
    address public immutable owner;

    constructor(address owner_) {
        owner = owner_;
    }

    function isValidSignature(bytes32 hash, bytes calldata sig) external view returns (bytes4) {
        (bytes32 r, bytes32 s) = abi.decode(sig[:64], (bytes32, bytes32));
        uint8 v = uint8(sig[64]);
        return ecrecover(hash, v, r, s) == owner ? bytes4(0x1626ba7e) : bytes4(0xffffffff);
    }
}
