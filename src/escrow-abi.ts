export const ESCROW_ABI = [
  // ── constructor ──────────────────────────────────────────────────────────
  { type: 'constructor', inputs: [{ name: 'usdc_', type: 'address' }], stateMutability: 'nonpayable' },

  // ── state-changing ───────────────────────────────────────────────────────
  {
    type: 'function', name: 'createEscrow', stateMutability: 'nonpayable',
    inputs: [
      { name: 'payee', type: 'address' },
      { name: 'verifier', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'deadline', type: 'uint64' },
      { name: 'workSpecHash', type: 'bytes32' },
    ],
    outputs: [{ name: 'escrowId', type: 'uint256' }],
  },
  {
    type: 'function', name: 'release', stateMutability: 'nonpayable',
    inputs: [
      { name: 'escrowId', type: 'uint256' },
      { name: 'deliverableHash', type: 'bytes32' },
      { name: 'signature', type: 'bytes' },
    ],
    outputs: [],
  },
  {
    type: 'function', name: 'refund', stateMutability: 'nonpayable',
    inputs: [{ name: 'escrowId', type: 'uint256' }],
    outputs: [],
  },

  // ── views ────────────────────────────────────────────────────────────────
  {
    type: 'function', name: 'getEscrow', stateMutability: 'view',
    inputs: [{ name: 'escrowId', type: 'uint256' }],
    outputs: [{
      name: '', type: 'tuple',
      components: [
        { name: 'payer', type: 'address' },
        { name: 'payee', type: 'address' },
        { name: 'verifier', type: 'address' },
        { name: 'amount', type: 'uint256' },
        { name: 'deadline', type: 'uint64' },
        { name: 'workSpecHash', type: 'bytes32' },
        { name: 'deliverableHash', type: 'bytes32' },
        { name: 'status', type: 'uint8' },
      ],
    }],
  },
  {
    type: 'function', name: 'passDigest', stateMutability: 'view',
    inputs: [{ name: 'escrowId', type: 'uint256' }, { name: 'deliverableHash', type: 'bytes32' }],
    outputs: [{ name: '', type: 'bytes32' }],
  },
  {
    type: 'function', name: 'domainSeparator', stateMutability: 'view',
    inputs: [], outputs: [{ name: '', type: 'bytes32' }],
  },
  {
    type: 'function', name: 'PASS_TYPEHASH', stateMutability: 'view',
    inputs: [], outputs: [{ name: '', type: 'bytes32' }],
  },
  {
    type: 'function', name: 'nextEscrowId', stateMutability: 'view',
    inputs: [], outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function', name: 'usdc', stateMutability: 'view',
    inputs: [], outputs: [{ name: '', type: 'address' }],
  },
  {
    type: 'function', name: 'MIN_DEADLINE_SECS', stateMutability: 'view',
    inputs: [], outputs: [{ name: '', type: 'uint64' }],
  },

  // ── events ───────────────────────────────────────────────────────────────
  {
    type: 'event', name: 'EscrowCreated', anonymous: false,
    inputs: [
      { name: 'escrowId', type: 'uint256', indexed: true },
      { name: 'payer', type: 'address', indexed: true },
      { name: 'payee', type: 'address', indexed: true },
      { name: 'verifier', type: 'address', indexed: false },
      { name: 'amount', type: 'uint256', indexed: false },
      { name: 'deadline', type: 'uint64', indexed: false },
      { name: 'workSpecHash', type: 'bytes32', indexed: false },
    ],
  },
  {
    type: 'event', name: 'Released', anonymous: false,
    inputs: [
      { name: 'escrowId', type: 'uint256', indexed: true },
      { name: 'payee', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
      { name: 'deliverableHash', type: 'bytes32', indexed: false },
      { name: 'relayer', type: 'address', indexed: false },
    ],
  },
  {
    type: 'event', name: 'Refunded', anonymous: false,
    inputs: [
      { name: 'escrowId', type: 'uint256', indexed: true },
      { name: 'payer', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
    ],
  },

  // ── errors ───────────────────────────────────────────────────────────────
  { type: 'error', name: 'ZeroAddress', inputs: [] },
  { type: 'error', name: 'ZeroAmount', inputs: [] },
  { type: 'error', name: 'DeadlineInPast', inputs: [] },
  { type: 'error', name: 'DeadlineTooSoon', inputs: [] },
  { type: 'error', name: 'NotOpen', inputs: [{ name: 'escrowId', type: 'uint256' }] },
  { type: 'error', name: 'InvalidAttestation', inputs: [] },
  { type: 'error', name: 'NotPayer', inputs: [] },
  { type: 'error', name: 'DeadlineNotReached', inputs: [{ name: 'deadline', type: 'uint64' }] },
  { type: 'error', name: 'ReentrancyGuardReentrantCall', inputs: [] },
  { type: 'error', name: 'SafeERC20FailedOperation', inputs: [{ name: 'token', type: 'address' }] },
] as const
