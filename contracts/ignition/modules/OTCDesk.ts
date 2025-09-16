import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const USDC_DECIMALS = 6n;
const ELIZAOS_DECIMALS = 18n;

const OTCModule = buildModule("OTCModule", (m) => {
  const owner = m.getAccount(0);
  const agent = m.getAccount(1);

  const tokenSupply = m.getParameter("tokenSupply", 1_000_000n * 10n ** ELIZAOS_DECIMALS);
  const eliza = m.contract("MockERC20", ["ElizaOS", "ElizaOS", Number(ELIZAOS_DECIMALS), tokenSupply], { id: "eliza_token", from: owner });
  const usdc = m.contract("MockERC20", ["USD Coin", "USDC", Number(USDC_DECIMALS), 0n], { id: "usdc_token", from: owner });

  // Deploy mock Chainlink feeds: 8 decimals
  // Token/USD = 0.00005 USD per token -> 5,000 with 8 decimals
  const tokenUsd = m.contract("MockAggregatorV3", [8, 5_000n], { id: "token_usd_feed", from: owner });
  // ETH/USD = 2000 USD -> 2000 * 1e8 = 200,000,000,000
  const ethUsd = m.contract("MockAggregatorV3", [8, 200_000_000_000n], { id: "eth_usd_feed", from: owner });

  const desk = m.contract("OTC", [owner, eliza, usdc, tokenUsd, ethUsd, agent], { from: owner });

  // Approve and seed token inventory
  m.call(eliza, "approve", [desk, tokenSupply], { id: "approve_eliza_desk", from: owner });
  m.call(desk, "depositTokens", [tokenSupply], { id: "deposit_eliza_desk", from: owner });

  // Set default limits
  const MIN_USD_5 = 5n * 10n ** 8n;
  const MAX_TOKENS = 10_000n * 10n ** ELIZAOS_DECIMALS;
  const EXPIRY = 30n * 60n; // 30 minutes
  const UNLOCK_DELAY = 0n;
  m.call(desk, "setLimits", [MIN_USD_5, MAX_TOKENS, EXPIRY, UNLOCK_DELAY], { id: "set_limits", from: owner });

  // Whitelist ops approver
  const OPS = "0x9ac2168C4874d927dBAb86Eda191a0807FDE2526";
  m.call(desk, "setApprover", [OPS, true], { id: "whitelist_ops_otc", from: owner });

  return { eliza, usdc, tokenUsd, ethUsd, desk };
});

export default OTCModule;



