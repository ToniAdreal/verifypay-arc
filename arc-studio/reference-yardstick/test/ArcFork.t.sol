// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {VerifyPayEscrow} from "../src/VerifyPayEscrow.sol";

/// @notice Runs the full flow against Arc's real USDC (0x3600...0000) on a fork.
///         Opt-in:  arc-forge test --network arc --fork-url https://rpc.testnet.arc.io --match-contract ArcFork
///         Use Arc Foundry (arc-forge) so native-USDC semantics are emulated
///         (docs.arc.io/arc/tutorials/troubleshoot-with-arc-foundry).
contract ArcForkTest is Test {
    address internal constant ARC_USDC = 0x3600000000000000000000000000000000000000;

    function test_fork_fullFlowOnRealUsdc() public {
        // Only meaningful on an Arc fork (testnet 5042002 or mainnet 5042); skipped otherwise.
        if (block.chainid != 5042002 && block.chainid != 5042) {
            vm.skip(true);
        }

        IERC20 usdc = IERC20(ARC_USDC);
        assertEq(IERC20Metadata(ARC_USDC).decimals(), 6, "ERC-20 USDC must be 6 decimals");

        VerifyPayEscrow escrow = new VerifyPayEscrow(usdc);
        address payer = makeAddr("fork-payer");
        address payee = makeAddr("fork-payee");
        uint256 verifierPk = 0xA11CE;

        // Native USDC (18 dec) and ERC-20 USDC (6 dec) share one balance on Arc.
        vm.deal(payer, 5 ether); // 5 USDC native
        assertEq(usdc.balanceOf(payer), 5e6, "native 18-dec balance should read as 6-dec ERC-20");

        vm.startPrank(payer);
        usdc.approve(address(escrow), 1e6);
        uint256 id = escrow.createEscrow(payee, vm.addr(verifierPk), 1e6, uint64(block.timestamp + 1 hours), keccak256("spec"));
        vm.stopPrank();
        assertEq(usdc.balanceOf(address(escrow)), 1e6);

        bytes32 deliverable = keccak256("deliverable");
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(verifierPk, escrow.passDigest(id, deliverable));
        escrow.release(id, deliverable, abi.encodePacked(r, s, v));
        assertEq(usdc.balanceOf(payee), 1e6);
        assertEq(payee.balance, 1 ether, "payee native balance = 1 USDC in 18 decimals");
    }
}
