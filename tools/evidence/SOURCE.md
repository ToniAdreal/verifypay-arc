These three files are copied unchanged from Toni Adreal's public VerifyGate repo
(https://github.com/ToniAdreal/verifygate, `samples-js/`), fetched 2026-10-21.
- `spec.json`: the task spec. `workSpecHash = keccak256(file bytes)`.
- `evidence_passing.json`: VerifyGate Judge Mode evidence record, verdict PASS. `deliverableHash = 0x || record_hash`.
- `evidence_failing.json`: verdict FAIL. The verifier script refuses to sign it.
Note: these are Judge Mode sample records (`signing_key_is_default_dev_key: true`). VerifyPay doesn't
rely on VerifyGate's own signature. The on-chain trust anchor is the verifier's EIP-712 signature.
