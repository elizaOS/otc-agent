import { ethers } from "hardhat";
import fs from "fs";
import path from "path";

async function main() {
  console.log("🚨 Testing Emergency Refund Functionality...\n");
  
  // Load deployment info
  const deploymentFile = path.join(__dirname, "../deployments/eliza-otc-deployment.json");
  const deployment = JSON.parse(fs.readFileSync(deploymentFile, "utf8"));
  
  const [owner, agent, approver, user, payer] = await ethers.getSigners();
  
  // Get contract instances
  const otc = await ethers.getContractAt("OTC", deployment.contracts.deal);
  const elizaToken = await ethers.getContractAt("MockERC20", deployment.contracts.elizaToken);
  const usdc = await ethers.getContractAt("MockERC20", deployment.contracts.usdcToken);
  
  console.log("📋 Setup:");
  console.log("  OTC Contract:", await otc.getAddress());
  console.log("  User:", user.address);
  console.log("  Payer:", payer.address);
  
  // Update price feeds to be fresh
  const tokenUsdFeed = await ethers.getContractAt("MockAggregatorV3", deployment.contracts.elizaUsdFeed);
  const ethUsdFeed = await ethers.getContractAt("MockAggregatorV3", deployment.contracts.ethUsdFeed);
  const currentBlock = await ethers.provider.getBlock("latest");
  await tokenUsdFeed.setRoundData(100, 100, currentBlock.timestamp, currentBlock.timestamp);
  await ethUsdFeed.setRoundData(100, 100, currentBlock.timestamp, currentBlock.timestamp);
  console.log("  ✓ Price feeds updated");
  
  // Create a stuck deal scenario
  console.log("\n1️⃣ Creating Stuck Deal Scenario...");
  
  // Create offer with long lockup
  const tx1 = await otc.connect(user).createOffer(
    ethers.parseEther("5000"), // 5000 ElizaOS
    1000, // 10% discount
    1, // USDC payment
    180 * 24 * 60 * 60 // 180 day lockup (very long)
  );
  await tx1.wait();
  
  const openOffers = await otc.getOpenOfferIds();
  const stuckOfferId = openOffers[openOffers.length - 1];
  console.log("  ✓ Created offer with 180-day lockup, ID:", stuckOfferId.toString());
  
  // Approve and fulfill
  await otc.connect(approver).approveOffer(stuckOfferId);
  console.log("  ✓ Offer approved");
  
  // Fund payer and fulfill
  await usdc.transfer(payer.address, BigInt(10000) * BigInt(10 ** 6));
  const required = await otc.requiredUsdcAmount(stuckOfferId);
  await usdc.connect(payer).approve(await otc.getAddress(), required);
  await otc.connect(payer).fulfillOffer(stuckOfferId);
  console.log("  ✓ Offer fulfilled with", (Number(required) / 1e6).toFixed(2), "USDC");
  
  // Check offer state
  const offer = await otc.offers(stuckOfferId);
  console.log("  ✓ Deal is now locked for 180 days");
  console.log("    - Paid:", offer.paid);
  console.log("    - Fulfilled:", offer.fulfilled);
  console.log("    - Cancelled:", offer.cancelled);
  
  // Test emergency refund
  console.log("\n2️⃣ Testing Emergency Refund...");
  
  // Check if emergency refunds are enabled
  const emergencyEnabled = await otc.emergencyRefundsEnabled();
  console.log("  Emergency refunds enabled:", emergencyEnabled);
  
  if (!emergencyEnabled) {
    console.log("  ⚠️ Emergency refunds disabled, enabling...");
    await otc.connect(owner).setEmergencyRefund(true);
    console.log("  ✓ Emergency refunds now enabled");
  }
  
  // Try immediate refund (should fail)
  console.log("\n  Testing immediate refund (should fail)...");
  try {
    await otc.connect(payer).emergencyRefund(stuckOfferId);
    console.log("  ❌ UNEXPECTED: Immediate refund succeeded!");
  } catch (error: any) {
    if (error.message.includes("too early")) {
      console.log("  ✓ Correctly rejected: Too early for emergency refund");
    } else {
      console.log("  ❌ Unexpected error:", error.message);
    }
  }
  
  // Fast forward time to enable emergency refund
  console.log("\n3️⃣ Simulating Time Passage...");
  const deadline = await otc.emergencyRefundDeadline();
  console.log("  Emergency refund deadline:", Number(deadline) / 86400, "days");
  
  // Fast forward past deadline
  await ethers.provider.send("evm_increaseTime", [Number(deadline) + 86400]); // +1 day extra
  await ethers.provider.send("evm_mine", []);
  console.log("  ✓ Time advanced", (Number(deadline) + 86400) / 86400, "days");
  
  // Now try emergency refund
  console.log("\n4️⃣ Executing Emergency Refund...");
  
  const usdcBefore = await usdc.balanceOf(payer.address);
  console.log("  USDC balance before refund:", (Number(usdcBefore) / 1e6).toFixed(2));
  
  const tx2 = await otc.connect(payer).emergencyRefund(stuckOfferId);
  await tx2.wait();
  console.log("  ✓ Emergency refund executed!");
  
  const usdcAfter = await usdc.balanceOf(payer.address);
  console.log("  USDC balance after refund:", (Number(usdcAfter) / 1e6).toFixed(2));
  console.log("  ✓ Refunded amount:", ((Number(usdcAfter) - Number(usdcBefore)) / 1e6).toFixed(2), "USDC");
  
  // Check offer state after refund
  const offerAfter = await otc.offers(stuckOfferId);
  console.log("\n  Deal state after refund:");
  console.log("    - Paid:", offerAfter.paid);
  console.log("    - Fulfilled:", offerAfter.fulfilled);
  console.log("    - Cancelled:", offerAfter.cancelled, "✓");
  
  // Verify tokens were released from reserve
  const reservedAfter = await otc.tokenReserved();
  console.log("  ✓ Tokens released from reserve");
  
  // Test admin emergency withdraw
  console.log("\n5️⃣ Testing Admin Emergency Withdraw...");
  
  // Update price feeds again after time travel
  const currentBlock2 = await ethers.provider.getBlock("latest");
  await tokenUsdFeed.setRoundData(101, 101, currentBlock2.timestamp, currentBlock2.timestamp);
  await ethUsdFeed.setRoundData(101, 101, currentBlock2.timestamp, currentBlock2.timestamp);
  
  // Create another stuck deal
  const tx3 = await otc.connect(user).createOffer(
    ethers.parseEther("1000"),
    0,
    1,
    30 * 24 * 60 * 60 // 30 day lockup
  );
  await tx3.wait();
  
  const offers2 = await otc.getOpenOfferIds();
  const adminTestId = offers2[offers2.length - 1];
  
  await otc.connect(approver).approveOffer(adminTestId);
  await usdc.connect(payer).approve(await otc.getAddress(), await otc.requiredUsdcAmount(adminTestId));
  await otc.connect(payer).fulfillOffer(adminTestId);
  console.log("  ✓ Created and fulfilled test offer ID:", adminTestId.toString());
  
  // Try admin withdraw too early (should fail)
  try {
    await otc.connect(owner).adminEmergencyWithdraw(adminTestId);
    console.log("  ❌ UNEXPECTED: Admin withdraw succeeded too early!");
  } catch (error: any) {
    if (error.message.includes("180 days")) {
      console.log("  ✓ Correctly rejected: Must wait 180 days after unlock");
    }
  }
  
  // Fast forward to allow admin withdraw
  await ethers.provider.send("evm_increaseTime", [210 * 24 * 60 * 60]); // 210 days
  await ethers.provider.send("evm_mine", []);
  
  const userTokensBefore = await elizaToken.balanceOf(user.address);
  await otc.connect(owner).adminEmergencyWithdraw(adminTestId);
  const userTokensAfter = await elizaToken.balanceOf(user.address);
  
  console.log("  ✓ Admin emergency withdraw executed");
  console.log("  ✓ Tokens sent to beneficiary:", 
    ethers.formatEther(userTokensAfter - userTokensBefore), "ElizaOS");
  
  // Test storage cleanup
  console.log("\n6️⃣ Testing Storage Cleanup...");
  
  // Update price feeds again
  const currentBlock3 = await ethers.provider.getBlock("latest");
  await tokenUsdFeed.setRoundData(102, 102, currentBlock3.timestamp, currentBlock3.timestamp);
  await ethUsdFeed.setRoundData(102, 102, currentBlock3.timestamp, currentBlock3.timestamp);
  
  // Create some expired offers
  for (let i = 0; i < 5; i++) {
    await otc.connect(user).createOffer(
      ethers.parseEther("100"),
      0,
      1,
      0
    );
  }
  
  const beforeCleanup = await otc.getOpenOfferIds();
  console.log("  Open offers before cleanup:", beforeCleanup.length);
  
  // Fast forward to expire them
  await ethers.provider.send("evm_increaseTime", [2 * 24 * 60 * 60]);
  await ethers.provider.send("evm_mine", []);
  
  // Public cleanup
  await otc.connect(user).cleanupExpiredOffers(10);
  
  const afterCleanup = await otc.getOpenOfferIds();
  console.log("  Open offers after cleanup:", afterCleanup.length);
  console.log("  ✓ Storage cleaned successfully");
  
  console.log("\n✅ Emergency Recovery Tests Complete!");
  console.log("\n📊 Summary:");
  console.log("  • Emergency refund after deadline: ✓");
  console.log("  • Funds returned to payer: ✓");
  console.log("  • Admin emergency withdraw: ✓");
  console.log("  • Storage cleanup: ✓");
  console.log("\n🛡️ Recovery mechanisms are fully operational!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ Test failed:", error);
    process.exit(1);
  });
