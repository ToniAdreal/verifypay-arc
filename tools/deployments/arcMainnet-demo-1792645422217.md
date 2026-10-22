# VerifyPay demo run: Arc (chain 5042), 2026-10-22T05:03:42.216Z
Contract: [0x3622FfDCFE88c542aB1203a00282e128159edDE7](https://explorer.arc.io/address/0x3622FfDCFE88c542aB1203a00282e128159edDE7) (deploy tx https://explorer.arc.io/tx/0x17d7c9eb7d232c014473516b1a66d5c59318daa00ea1afcd902c51eedd6b1590)

| Step | Tx | Gas (USDC) |
|---|---|---|
| Gas top-up PAYER→AGENT 0.05 USDC | [0x4e71ba6b…](https://explorer.arc.io/tx/0x4e71ba6b1fb586743ef54ae9fa78c68d90601a3ede3933105d52d8bc76bb2aae) | 0.001552698 |
| approve (escrow A) | [0x2c2a0f97…](https://explorer.arc.io/tx/0x2c2a0f97853fc81d66c53d50f5d67202d7447e3f7204444a24632625f63392c8) | 0.001164198 |
| createEscrow #1 (1.0 USDC locked) | [0x2da1c317…](https://explorer.arc.io/tx/0x2da1c317e5986275526f36cc26851169b962b99df0b531bc6653105ec6383812) | 0.004642386 |
| release #1 → AGENT (1.0 USDC) | [0xdd7589a0…](https://explorer.arc.io/tx/0xdd7589a06f6e5d7104008f35b476c61a41e7aaf6a36b1fd4d686702ce177efcf) | 0.002047101 |
| approve (escrow B) | [0xaeb78a11…](https://explorer.arc.io/tx/0xaeb78a11d9bc8640d9460cdb36ee995afaa0c2851c3f1e62d5e9c608624043ad) | 0.001164198 |
| createEscrow #2 (0.5 USDC, short deadline) | [0x2cdb2c8b…](https://explorer.arc.io/tx/0x2cdb2c8bae9a986247fb9903e950fe64e97f9e864cb72f6cc4569d846837f717) | 0.004642386 |
| refund #2 → PAYER (0.5 USDC) | [0xcefd3fb8…](https://explorer.arc.io/tx/0xcefd3fb8800bceaf19f267161ad1c2e1b6bdff5198c454f4f563dbe7d3f5c39c) | 0.001376298 |
| sweep AGENT→PAYER | [0x6b4c42e0…](https://explorer.arc.io/tx/0x6b4c42e00d927f4e58458b9330bdf95c23ef685123973f60ead71dbc7994e7b8) | 0.00102795 |
