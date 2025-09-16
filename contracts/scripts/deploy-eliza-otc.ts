import { ethers } from "hardhat";
import fs from "fs";
import path from "path";

async function main() {
  console.log("🚀 Starting ElizaOS OTC System Deployment...\n");
  
  const [owner, agent, approver] = await ethers.getSigners();
  
  console.log("📋 Deployment Accounts:");
  console.log("  Owner:", owner.address);
  console.log("  Agent:", agent.address);
  console.log("  Approver:", approver.address);
  console.log();

  // 1. Deploy ElizaOS Token
  console.log("1️⃣ Deploying ElizaOS Token...");
  const MockERC20 = await ethers.getContractFactory("MockERC20");
  const elizaToken = await MockERC20.deploy(
    "ElizaOS",
    "ElizaOS",
    18,
    ethers.parseEther("100000000") // 100M ElizaOS tokens
  );
  await elizaToken.waitForDeployment();
  const elizaAddress = await elizaToken.getAddress();
  console.log("✅ ElizaOS Token deployed to:", elizaAddress);

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
  
  // ElizaOS/USD price feed - $0.05 per ElizaOS (realistic for a new token)
  const elizaUsdFeed = await MockAggregator.deploy(8, BigInt(5000000)); // $0.05 with 8 decimals
  await elizaUsdFeed.waitForDeployment();
  const elizaUsdAddress = await elizaUsdFeed.getAddress();
  console.log("✅ ElizaOS/USD Price Feed deployed to:", elizaUsdAddress);
  
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
  
  // Set limits: min $5, max 1M ElizaOS per order, 30 min expiry, no default lockup
  await deal.setLimits(
    BigInt(500000000), // $5 with 8 decimals
    ethers.parseEther("1000000"), // 1M ElizaOS max per order
    30 * 60, // 30 minutes expiry
    0 // No default lockup (specified per quote)
  );
  console.log("  ✓ Limits configured");

  // 6. Fund OTC Contract with ElizaOS tokens
  console.log("\n6️⃣ Funding OTC Contract with ElizaOS tokens...");
  const fundAmount = ethers.parseEther("10000000"); // 10M ElizaOS
  await elizaToken.approve(otcAddress, fundAmount);
  await deal.depositTokens(fundAmount);
  console.log("  ✓ Deposited 10M ElizaOS to OTC contract");

  // 7. Fund test accounts
  console.log("\n7️⃣ Setting up test accounts...");
  
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
      dealFunding: "10,000,000 ElizaOS"
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
    // Note: Approver is a Hardhat signer, no private key available in test environment
    APPROVER_ADDRESS: approver.address,
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
  console.log("  • ElizaOS Token:", elizaAddress);
  console.log("  • OTC Contract:", otcAddress);
  console.log("  • ElizaOS Price: $0.05");
  console.log("  • OTC Funding: 10M ElizaOS");
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
