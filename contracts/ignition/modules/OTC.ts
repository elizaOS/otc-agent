// This setup uses Hardhat Ignition to manage smart contract deployments.
// Learn more about it at https://hardhat.org/ignition

import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const DEFAULT_SUPPLY = 10_000_000n * 10n ** 18n; // 10M ElizaOS for OTC
const USDC_DECIMALS = 6n;
const ELIZAOS_DECIMALS = 18n;

const OTCModule = buildModule("OTCModule", (m) => {
  const owner = m.getAccount(0);
  const agent = m.getAccount(1);

  const supply = m.getParameter("elizaSupply", DEFAULT_SUPPLY);

  const eliza = m.contract("MockERC20", ["ElizaOS", "ElizaOS", Number(ELIZAOS_DECIMALS), supply], { from: owner });
  const usdc = m.contract("MockERC20", ["USD Coin", "USDC", Number(USDC_DECIMALS), 0n], { from: owner });

  const deal = m.contract(
    "OTC",
    [owner, eliza, usdc, agent],
    { from: owner }
  );

  // Owner approves OTC to transfer ElizaOS for deposit
  m.call(eliza, "approve", [deal, supply], { id: "approve_eliza_supply", from: owner });
  // Deposit supply into OTC contract
  m.call(deal, "depositTokenSupply", [supply], { id: "deposit_eliza_supply", from: owner });

  // Set agent also as distributor for testing auto-claims
  m.call(deal, "setDistributor", [agent, true], { id: "whitelist_distributor", from: owner });

  // Whitelist ops approver address for devnet
  const OPS = "0x9ac2168C4874d927dBAb86Eda191a0807FDE2526";
  m.call(deal, "setDistributor", [OPS, true], { id: "whitelist_ops", from: owner });

  return { eliza, usdc, deal };
});

export default OTCModule;


