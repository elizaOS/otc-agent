# Eliza OTC Desk

Eliza agent that negotiates OTC token deals. Next.js frontend, EVM and Solana contracts, quote engine with Chainlink price feeds.

## Structure

- `src/lib/agent.ts` - Eliza character and negotiation logic
- `src/lib/plugin-otc-desk` - OTC plugin (providers, actions, quote service)
- `src/app/api/*` - API routes
- `contracts/` - Hardhat contracts (EVM)
- `solana/otc-program/` - Anchor program (Solana)
- `drizzle/` - DB schema (Drizzle ORM)

## Setup

```bash
# Install
bun install
pnpm install --prefix contracts

# Database (optional - falls back to defaults)
# export POSTGRES_URL=postgres://eliza:password@localhost:5439/eliza
bun run db:push

# Generate Solana keypair (first run only)
cd solana/otc-program && solana-keygen new -o id.json && cd ../..

# Start everything (Hardhat + Solana + Next.js on :2222)
bun run dev
```

### Prerequisites
- Bun or Node.js 18+
- pnpm: `npm i -g pnpm`
- Solana CLI: `sh -c "$(curl -sSfL https://release.solana.com/stable/install)"`
- Anchor: `cargo install --git https://github.com/coral-xyz/anchor avm --locked && avm install 0.31.0 && avm use 0.31.0`
- Rust nightly: `rustup toolchain install nightly-2025-04-14`

## MetaMask Local Setup

Add network: RPC `http://127.0.0.1:8545`, Chain ID `31337`

Import test account (has 10k ETH):
```
0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
```

### Chain Reset Handling (NEW!)

When you reset the local chain, the app now automatically detects and handles nonce errors:

- **Automatic Detection**: Shows a toast notification when chain reset is detected
- **One-Click Recovery**: "Reset Wallet" button in error messages
- **Dev Reset Button**: Fixed 🔧 button in bottom-right (development only)
- **Smart Error Handling**: All transaction errors are caught with helpful recovery options

No more manual MetaMask resets needed! See [`docs/CHAIN_RESET_HANDLING.md`](./docs/CHAIN_RESET_HANDLING.md) for details.

## Environment

`.env.local`:
```env
# EVM
NEXT_PUBLIC_RPC_URL=http://127.0.0.1:8545
NEXT_PUBLIC_OTC_ADDRESS=<set by deploy>
APPROVER_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80

# Solana
NEXT_PUBLIC_SOLANA_RPC=http://127.0.0.1:8899
NEXT_PUBLIC_SOLANA_PROGRAM_ID=<program id from deploy>

# Agent
GROQ_API_KEY=<your key>

# Auth (dev defaults)
API_SECRET_KEY=dev-admin-key
WORKER_AUTH_TOKEN=dev-worker-secret
CRON_SECRET=dev-cron-secret

# Database (optional)
POSTGRES_URL=postgres://eliza:password@localhost:5439/eliza

# Twitter (optional)
X_CONSUMER_KEY=<key>
X_CONSUMER_SECRET=<secret>
```

## Scripts

```bash
bun run dev              # Full stack (Hardhat + Solana + Next.js)
bun run db:push          # Apply DB schema
npm run worker:start     # Quote approval worker

# EVM only
npm run rpc:start        # Hardhat + deploy
npm run rpc:deploy       # Deploy contracts

# Solana only  
npm run sol:validator    # Local validator
npm run sol:deploy       # Build + deploy program
npm run sol:dev          # Validator + deploy

# Tests
npm run test             # Unit tests
npm run cypress:run      # E2E tests
```

## Deploy

### EVM
```bash
cd contracts
export ETH_RPC_URL=https://sepolia.infura.io/v3/<key>
export DEPLOYER_PRIVATE_KEY=0x...
pnpm hardhat ignition deploy ./ignition/modules/OTCDesk.ts --network sepolia
```

### Solana
```bash
cd solana/otc-program
solana config set -u devnet
anchor build
anchor deploy
# Set NEXT_PUBLIC_SOLANA_PROGRAM_ID to output
```

### Production
```bash
npm run build
npm start  # Port 2222
```

Deploy to Vercel/Netlify/etc with production env vars.