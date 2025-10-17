import { ethers } from "hardhat";
import fs from "fs";
import path from "path";

async function main() {
  console.log("🚀 Starting elizaOS OTC System Deployment...\n");
  
  const [owner, agent, approver] = await ethers.getSigners();
  
  console.log("📋 Deployment Accounts:");
  console.log("  Owner:", owner.address);
  console.log("  Agent:", agent.address);
  console.log("  Approver:", approver.address);
  console.log();

  // 1. Deploy elizaOS Token
  console.log("1️⃣ Deploying elizaOS Token...");
  console.log("⚠️  NOTE: This uses 18 decimals for local testing.");
  console.log("    For CCIP bridged tokens, decimals MUST match Solana native token!");
  console.log("    See CCIP-BRIDGE-CHECKLIST.md for production deployment.\n");
  
  const MockERC20 = await ethers.getContractFactory("MockERC20");
  const elizaToken = await MockERC20.deploy(
    "elizaOS",
    "elizaOS",
    18, // ⚠️ For production: Use same decimals as your Solana native token (likely 9)
    ethers.parseEther("100000000") // 100M elizaOS tokens
  );
  await elizaToken.waitForDeployment();
  const elizaAddress = await elizaToken.getAddress();
  console.log("✅ elizaOS Token deployed to:", elizaAddress);

  // 2. Deploy USDC Mock
  console.log("\n2️⃣ Deploying USDC Mock...");
  const usdcToken = await MockERC20.deploy(
    "USD Coin",
    "USDC",
    6,
    BigInt(10000000) * BigInt(10 ** 6) // 10M USDC
  );
  await usdcToken.waitForDeployment();
  const usdcAddress = await usdcToken.getAddress();
  console.log("✅ USDC deployed to:", usdcAddress);

  // 3. Deploy Price Feeds
  console.log("\n3️⃣ Deploying Price Feeds...");
  const MockAggregator = await ethers.getContractFactory("MockAggregatorV3");
  
  // elizaOS/USD price feed - $0.05 per elizaOS (realistic for a new token)
  const elizaUsdFeed = await MockAggregator.deploy(8, BigInt(5000000)); // $0.05 with 8 decimals
  await elizaUsdFeed.waitForDeployment();
  const elizaUsdAddress = await elizaUsdFeed.getAddress();
  console.log("✅ elizaOS/USD Price Feed deployed to:", elizaUsdAddress);
  
  // ETH/USD price feed - $3500 per ETH
  const ethUsdFeed = await MockAggregator.deploy(8, BigInt(350000000000)); // $3500 with 8 decimals
  await ethUsdFeed.waitForDeployment();
  const ethUsdAddress = await ethUsdFeed.getAddress();
  console.log("✅ ETH/USD Price Feed deployed to:", ethUsdAddress);

  // 4. Deploy OTC Contract
  console.log("\n4️⃣ Deploying OTC Contract...");
  const OTC = await ethers.getContractFactory("OTC");
  const deal = await OTC.deploy(
    owner.address,
    elizaAddress,
    usdcAddress,
    elizaUsdAddress,
    ethUsdAddress,
    agent.address
  );
  await deal.waitForDeployment();
  const otcAddress = await deal.getAddress();
  console.log("✅ OTC Contract deployed to:", otcAddress);

  // 5. Configure OTC Contract
  console.log("\n5️⃣ Configuring OTC Contract...");
  
  // Set approver
  await deal.setApprover(approver.address, true);
  console.log("  ✓ Approver set:", approver.address);
  
  // Set limits: min $5, max 1M elizaOS per order, 30 min expiry, no default lockup
  await deal.setLimits(
    BigInt(500000000), // $5 with 8 decimals
    ethers.parseEther("1000000"), // 1M elizaOS max per order
    30 * 60, // 30 minutes expiry
    0 // No default lockup (specified per quote)
  );
  console.log("  ✓ Limits configured");

  // Enable approver-only fulfillment for better UX (backend handles payment after approval)
  await deal.setRequireApproverToFulfill(true); // Only approver can fulfill - user just creates offer
  console.log("  ✓ Approver-only fulfillment enabled");

  // 6. Register elizaOS token and create consignment
  console.log("\n6️⃣ Setting up elizaOS token consignment...");
  
  // Register the token in multi-token registry
  const elizaTokenId = ethers.keccak256(ethers.toUtf8Bytes("ELIZA"));
  await deal.registerToken(elizaTokenId, elizaAddress, elizaUsdAddress);
  console.log("  ✓ elizaOS token registered in multi-token system");
  
  // Create a negotiable consignment for the elizaOS token
  const fundAmount = ethers.parseEther("10000000"); // 10M elizaOS
  const gasDeposit = ethers.parseEther("0.001"); // Required gas deposit
  await elizaToken.approve(otcAddress, fundAmount);
  await deal.createConsignment(
    elizaTokenId,
    fundAmount,
    true, // negotiable
    0, 0, // no fixed values (negotiable)
    100, 2500, // discount range: 1% - 25%
    7, 365, // lockup range: 7 days - 365 days
    ethers.parseEther("100"), // min deal: 100 tokens
    ethers.parseEther("1000000"), // max deal: 1M tokens
    true, // fractionalized
    false, // not private
    2000, // 20% max price volatility
    86400 * 7, // 7 days to execute
    { value: gasDeposit } // Include gas deposit
  );
  console.log("  ✓ Created negotiable consignment with 10M elizaOS tokens");

  // 7. Fund test accounts
  console.log("\n7️⃣ Setting up test accounts...");
  
  // Fund agent with USDC so it can pay for offers
  const agentUsdcAmount = BigInt(100000) * BigInt(10 ** 6); // 100k USDC
  await usdcToken.transfer(agent.address, agentUsdcAmount);
  console.log("  ✓ Agent funded with 100,000 USDC (for paying user offers)");
  
  // Create test wallet for user
  const testWallet = ethers.Wallet.createRandom();
  const testWalletWithProvider = testWallet.connect(ethers.provider);
  
  // Fund test wallet with ETH for gas
  await owner.sendTransaction({
    to: testWallet.address,
    value: ethers.parseEther("1.0")
  });
  console.log("  ✓ Test wallet created:", testWallet.address);
  console.log("  ✓ Funded with 1 ETH for gas");
  
  // Send some USDC to test wallet
  await usdcToken.transfer(testWallet.address, BigInt(10000) * BigInt(10 ** 6)); // 10k USDC
  console.log("  ✓ Funded with 10,000 USDC");

  // 7a. Grant approver role to the test wallet for automated approvals in tests
  console.log("\n7️⃣ Adding test wallet as approver...");
  await deal.setApprover(testWallet.address, true);
  console.log("  ✓ Test wallet added as approver");

  // 8. Save deployment info
  console.log("\n8️⃣ Saving deployment configuration...");
  
  const deploymentInfo = {
    network: "hardhat",
    timestamp: new Date().toISOString(),
    contracts: {
      elizaToken: elizaAddress,
      usdcToken: usdcAddress,
      deal: otcAddress,
      elizaUsdFeed: elizaUsdAddress,
      ethUsdFeed: ethUsdAddress
    },
    accounts: {
      owner: owner.address,
      agent: agent.address,
      approver: approver.address,
      testWallet: testWallet.address
    },
    testWalletPrivateKey: testWallet.privateKey,
    configuration: {
      elizaPrice: "$0.05",
      ethPrice: "$3500",
      minOrderUsd: "$5",
      maxOrderEliza: "1,000,000",
      quoteExpiry: "30 minutes",
      dealFunding: "10,000,000 elizaOS"
    }
  };

  // Save to JSON file
  const deploymentsDir = path.join(__dirname, "../deployments");
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }
  
  const deploymentFile = path.join(deploymentsDir, "eliza-otc-deployment.json");
  fs.writeFileSync(deploymentFile, JSON.stringify(deploymentInfo, null, 2));
  console.log("  ✓ Deployment info saved to:", deploymentFile);

  // Update .env.local file
  const envPath = path.join(__dirname, "../../.env.local");
  let envContent = "";
  
  if (fs.existsSync(envPath)) {
    envContent = fs.readFileSync(envPath, "utf8");
  }

  const envUpdates = {
    NEXT_PUBLIC_ELIZAOS_TOKEN_ADDRESS: elizaAddress,
    NEXT_PUBLIC_USDC_ADDRESS: usdcAddress,
    NEXT_PUBLIC_deal_ADDRESS: otcAddress,
    NEXT_PUBLIC_OTC_ADDRESS: otcAddress,
    NEXT_PUBLIC_ELIZAOS_USD_FEED: elizaUsdAddress,
    NEXT_PUBLIC_ETH_USD_FEED: ethUsdAddress,
    APPROVER_ADDRESS: approver.address,
    // Use agent's private key (account #1) for approvals - has approval rights in contract
    APPROVER_PRIVATE_KEY: "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
    TEST_WALLET_ADDRESS: testWallet.address,
    TEST_WALLET_PRIVATE_KEY: testWallet.privateKey
  };

  for (const [key, value] of Object.entries(envUpdates)) {
    const regex = new RegExp(`^${key}=.*`, "m");
    if (envContent.match(regex)) {
      envContent = envContent.replace(regex, `${key}=${value}`);
    } else {
      envContent += `\n${key}=${value}`;
    }
  }

  fs.writeFileSync(envPath, envContent);
  console.log("  ✓ Environment variables updated in .env.local");

  // Print summary
  console.log("\n" + "=".repeat(60));
  console.log("🎉 DEPLOYMENT SUCCESSFUL!");
  console.log("=".repeat(60));
  console.log("\n📊 Summary:");
  console.log("  • elizaOS Token:", elizaAddress);
  console.log("  • OTC Contract:", otcAddress);
  console.log("  • elizaOS Price: $0.05");
  console.log("  • OTC Funding: 10M elizaOS");
  console.log("  • Test Wallet:", testWallet.address);
  console.log("\n💡 Next Steps:");
  console.log("  1. Start the quote approval worker: npm run worker:start");
  console.log("  2. Run end-to-end tests: npm run test:e2e");
  console.log("  3. Test manual flow: npm run test:manual");
  console.log("\n✅ System ready for testing!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ Deployment failed:", error);
    process.exit(1);
  });
