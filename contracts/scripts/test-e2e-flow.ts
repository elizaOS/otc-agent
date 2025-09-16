import { ethers } from "hardhat";
import fs from "fs";
import path from "path";
import dealArtifact from "../artifacts/contracts/OTC.sol/OTC.json";

const COLORS = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
  magenta: "\x1b[35m"
};

function log(message: string, color: string = COLORS.reset) {
  console.log(`${color}${message}${COLORS.reset}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  log("\n🧪 ElizaOS END-TO-END TEST", COLORS.bright + COLORS.cyan);
  log("=" .repeat(60), COLORS.cyan);

  // Load deployment info
  const deploymentFile = path.join(__dirname, "../deployments/eliza-otc-deployment.json");
  if (!fs.existsSync(deploymentFile)) {
    throw new Error("Deployment file not found. Run 'npm run deploy:eliza' first.");
  }
  
  const deployment = JSON.parse(fs.readFileSync(deploymentFile, "utf8"));
  log("\n📋 Loaded deployment from: " + deployment.timestamp, COLORS.blue);

  // Get signers
  const [owner, agent, approver] = await ethers.getSigners();
  
  // Connect to contracts
  const deal = await ethers.getContractAt("OTC", deployment.contracts.deal);
  const elizaToken = await ethers.getContractAt("MockERC20", deployment.contracts.elizaToken);
  const usdcToken = await ethers.getContractAt("MockERC20", deployment.contracts.usdcToken);
  
  // Import test wallet
  const testWallet = new ethers.Wallet(deployment.testWalletPrivateKey, ethers.provider);
  
  log("\n👤 Test User Wallet: " + testWallet.address, COLORS.yellow);
  
  // Check balances
  const ethBalance = await ethers.provider.getBalance(testWallet.address);
  const usdcBalance = await usdcToken.balanceOf(testWallet.address);
  log(`  • ETH Balance: ${ethers.formatEther(ethBalance)} ETH`);
  log(`  • USDC Balance: ${Number(usdcBalance) / 1e6} USDC`);

  // ====================
  // STEP 1: USER CREATES OFFER
  // ====================
  log("\n" + "=".repeat(60), COLORS.cyan);
  log("STEP 1: USER CREATES OFFER", COLORS.bright + COLORS.green);
  log("=".repeat(60), COLORS.cyan);
  
  const tokenAmount = ethers.parseEther("10000"); // 10,000 ElizaOS
  const discountBps = 1500; // 15% discount
  const paymentCurrency = 1; // USDC
  const lockupSeconds = 90 * 24 * 60 * 60; // 90 days (3 months)
  
  log("\n📝 Quote Parameters:", COLORS.yellow);
  log(`  • Token Amount: 10,000 ElizaOS`);
  log(`  • Discount: 15%`);
  log(`  • Payment: USDC`);
  log(`  • Lockup: 90 days`);
  
  // Connect deal contract to test wallet
  const dealUser = deal.connect(testWallet);
  
  log("\n⏳ Creating offer on-chain...");
  const createTx = await dealUser.createOffer(
    tokenAmount,
    discountBps,
    paymentCurrency,
    lockupSeconds
  );
  const createReceipt = await createTx.wait();
  
  // Get offer ID from events
  const offerCreatedEvent = createReceipt?.logs.find(
    (log: any) => log.fragment?.name === "OfferCreated"
  );
  const offerId = (offerCreatedEvent as any)?.args?.[0];
  
  log(`✅ Offer created with ID: ${offerId}`, COLORS.green);
  log(`  • Transaction: ${createReceipt?.hash}`);
  
  // Get offer details
  const offer = await deal.offers(offerId);
  const totalUsd = await deal.totalUsdForOffer(offerId);
  
  log("\n💰 Offer Details:", COLORS.yellow);
  log(`  • Token Amount: ${ethers.formatEther(offer.tokenAmount)} ElizaOS`);
  log(`  • Price per Token: $${Number(offer.priceUsdPerToken) / 1e8}`);
  log(`  • Total USD Value: $${Number(totalUsd) / 1e8}`);
  log(`  • Payment Required: ${Number(totalUsd) / 1e8} USDC`);

  // ====================
  // STEP 2: AGENT APPROVES OFFER
  // ====================
  log("\n" + "=".repeat(60), COLORS.cyan);
  log("STEP 2: AGENT APPROVES OFFER", COLORS.bright + COLORS.green);
  log("=".repeat(60), COLORS.cyan);
  
  log("\n🤖 Agent reviewing offer...");
  await sleep(2000); // Simulate review time
  
  // In production, this would be done by the QuoteApprovalWorker
  // Here we simulate it manually
  const dealApprover = deal.connect(approver);
  
  log("⏳ Approving offer...");
  const approveTx = await dealApprover.approveOffer(offerId);
  const approveReceipt = await approveTx.wait();
  
  log(`✅ Offer approved by agent!`, COLORS.green);
  log(`  • Transaction: ${approveReceipt?.hash}`);
  log(`  • Approver: ${approver.address}`);

  // ====================
  // STEP 3: USER FULFILLS OFFER
  // ====================
  log("\n" + "=".repeat(60), COLORS.cyan);
  log("STEP 3: USER FULFILLS OFFER (PAYMENT)", COLORS.bright + COLORS.green);
  log("=".repeat(60), COLORS.cyan);
  
  // Calculate USDC amount needed
  const usdcAmount = (totalUsd * BigInt(1e6)) / BigInt(1e8); // Convert from 8 decimals to 6
  
  log(`\n💳 Payment Required: ${Number(usdcAmount) / 1e6} USDC`, COLORS.yellow);
  
  // Approve USDC spending
  const usdcUser = usdcToken.connect(testWallet);
  log("⏳ Approving USDC spend...");
  const usdcApproveTx = await usdcUser.approve(deployment.contracts.deal, usdcAmount);
  await usdcApproveTx.wait();
  log("✅ USDC spend approved");
  
  // Fulfill offer
  log("⏳ Fulfilling offer with USDC payment...");
  const fulfillTx = await dealUser.fulfillOffer(offerId);
  const fulfillReceipt = await fulfillTx.wait();
  
  log(`✅ Offer fulfilled successfully!`, COLORS.green);
  log(`  • Transaction: ${fulfillReceipt?.hash}`);
  log(`  • Payment: ${Number(usdcAmount) / 1e6} USDC`);
  
  // Check updated offer status
  const updatedOffer = await deal.offers(offerId);
  log("\n📊 Updated Offer Status:", COLORS.yellow);
  log(`  • Paid: ${updatedOffer.paid}`);
  log(`  • Payer: ${updatedOffer.payer}`);
  log(`  • Amount Paid: ${Number(updatedOffer.amountPaid) / 1e6} USDC`);

  // ====================
  // STEP 4: WAIT FOR UNLOCK & CLAIM
  // ====================
  log("\n" + "=".repeat(60), COLORS.cyan);
  log("STEP 4: UNLOCK & CLAIM TOKENS", COLORS.bright + COLORS.green);
  log("=".repeat(60), COLORS.cyan);
  
  // Check unlock time
  const unlockTime = Number(updatedOffer.unlockTime);
  const currentTime = Math.floor(Date.now() / 1000);
  const timeUntilUnlock = unlockTime - currentTime;
  
  if (timeUntilUnlock > 0) {
    log(`\n⏰ Tokens locked for ${timeUntilUnlock} seconds`, COLORS.yellow);
    log("  • For testing, let's skip ahead in time...");
    
    // For hardhat network, we can manipulate time
    await ethers.provider.send("evm_increaseTime", [timeUntilUnlock + 1]);
    await ethers.provider.send("evm_mine", []);
    log("  ✓ Time advanced to unlock period");
  }
  
  // Claim tokens
  log("\n⏳ Claiming ElizaOS tokens...");
  const claimTx = await dealUser.claim(offerId);
  const claimReceipt = await claimTx.wait();
  
  log(`✅ Tokens claimed successfully!`, COLORS.green);
  log(`  • Transaction: ${claimReceipt?.hash}`);
  
  // Check final balances
  const elizaBalance = await elizaToken.balanceOf(testWallet.address);
  const finalUsdcBalance = await usdcToken.balanceOf(testWallet.address);
  
  log("\n💎 Final Balances:", COLORS.yellow);
  log(`  • ElizaOS: ${ethers.formatEther(elizaBalance)} ElizaOS`);
  log(`  • USDC: ${Number(finalUsdcBalance) / 1e6} USDC`);

  // ====================
  // STEP 5: DEAL COMPLETION CELEBRATION
  // ====================
  log("\n" + "=".repeat(60), COLORS.cyan);
  log("STEP 5: DEAL COMPLETION", COLORS.bright + COLORS.green);
  log("=".repeat(60), COLORS.cyan);
  
  const savedAmount = Number(totalUsd) / 1e8 * 0.15; // 15% discount
  
  log("\n🎉 CONGRATULATIONS! Deal Complete! 🎉", COLORS.bright + COLORS.magenta);
  log("\n📈 Deal Summary:", COLORS.yellow);
  log(`  • Tokens Received: ${ethers.formatEther(elizaBalance)} ElizaOS`);
  log(`  • Amount Paid: ${Number(usdcAmount) / 1e6} USDC`);
  log(`  • Discount Received: 15% ($${savedAmount.toFixed(2)} saved)`);
  log(`  • Discount ROI: ${((savedAmount / (Number(totalUsd) / 1e8)) * 100).toFixed(1)}%`);
  log(`  • Lockup Period: 90 days`);
  
  log("\n✨ P&L Summary:", COLORS.green);
  log(`  • Market Value: $${(Number(totalUsd) / 1e8 / 0.85).toFixed(2)}`);
  log(`  • You Paid: $${(Number(totalUsd) / 1e8).toFixed(2)}`);
  log(`  • Instant Savings: $${savedAmount.toFixed(2)}`);
  log(`  • ROI: ${((savedAmount / (Number(totalUsd) / 1e8)) * 100).toFixed(1)}%`);

  // ====================
  // TEST SUMMARY
  // ====================
  log("\n" + "=".repeat(60), COLORS.cyan);
  log("🏁 END-TO-END TEST COMPLETE!", COLORS.bright + COLORS.green);
  log("=" .repeat(60), COLORS.cyan);
  
  log("\n✅ All Steps Passed:", COLORS.green);
  log("  1. ✓ User created deal offer");
  log("  2. ✓ Agent approved offer");
  log("  3. ✓ User fulfilled with USDC payment");
  log("  4. ✓ Tokens unlocked and claimed");
  log("  5. ✓ Deal completion celebrated");
  
  log("\n🚀 System is working perfectly!", COLORS.bright + COLORS.green);
}

main()
  .then(() => {
    log("\n✨ Test completed successfully!", COLORS.green);
    process.exit(0);
  })
  .catch((error) => {
    log("\n❌ Test failed:", COLORS.red);
    console.error(error);
    process.exit(1);
  });
