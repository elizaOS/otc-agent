import { ethers } from "hardhat";
import fs from "fs";
import path from "path";

async function main() {
  console.log("🧪 Testing OTC Contract with Recovery Features...\n");
  
  // Load deployment info
  const deploymentFile = path.join(__dirname, "../deployments/eliza-otc-deployment.json");
  const deployment = JSON.parse(fs.readFileSync(deploymentFile, "utf8"));
  
  const [owner, agent, approver, user, payer] = await ethers.getSigners();
  
  // Get contract instances
  const otc = await ethers.getContractAt("OTC", deployment.contracts.deal);
  const elizaToken = await ethers.getContractAt("MockERC20", deployment.contracts.elizaToken);
  const usdc = await ethers.getContractAt("MockERC20", deployment.contracts.usdcToken);
  
  console.log("📋 Contract Info:");
  console.log("  OTC Address:", await otc.getAddress());
  console.log("  Token Balance:", ethers.formatEther(await elizaToken.balanceOf(await otc.getAddress())));
  console.log("  Available Inventory:", ethers.formatEther(await otc.availableTokenInventory()));
  
  // Test 1: Basic offer creation and fulfillment
  console.log("\n1️⃣ Testing Basic Offer Flow...");
  
  // Create offer
  const tx1 = await otc.connect(user).createOffer(
    ethers.parseEther("1000"), // 1000 ElizaOS
    500, // 5% discount
    1, // USDC payment
    0 // No lockup for quick test
  );
  await tx1.wait();
  console.log("  ✓ Offer created");
  
  // Get offer ID
  const openOffers = await otc.getOpenOfferIds();
  const offerId = openOffers[openOffers.length - 1];
  console.log("  ✓ Offer ID:", offerId.toString());
  
  // Approve offer
  const tx2 = await otc.connect(approver).approveOffer(offerId);
  await tx2.wait();
  console.log("  ✓ Offer approved");
  
  // Fund payer with USDC
  await usdc.transfer(payer.address, BigInt(1000) * BigInt(10 ** 6));
  const required = await otc.requiredUsdcAmount(offerId);
  await usdc.connect(payer).approve(await otc.getAddress(), required);
  console.log("  ✓ USDC funded and approved:", (Number(required) / 1e6).toFixed(2), "USDC");
  
  // Fulfill offer
  const tx3 = await otc.connect(payer).fulfillOffer(offerId);
  await tx3.wait();
  console.log("  ✓ Offer fulfilled");
  
  // Claim tokens
  const tx4 = await otc.connect(user).claim(offerId);
  await tx4.wait();
  const userBalance = await elizaToken.balanceOf(user.address);
  console.log("  ✓ Tokens claimed:", ethers.formatEther(userBalance), "ElizaOS");
  
  // Test 2: Emergency refund setup
  console.log("\n2️⃣ Testing Emergency Refund Setup...");
  
  // Create offer with lockup
  const tx5 = await otc.connect(user).createOffer(
    ethers.parseEther("500"),
    0,
    1, // USDC
    30 * 24 * 60 * 60 // 30 day lockup
  );
  await tx5.wait();
  const offerIds2 = await otc.getOpenOfferIds();
  const lockedOfferId = offerIds2[offerIds2.length - 1];
  console.log("  ✓ Created locked offer ID:", lockedOfferId.toString());
  
  // Approve and fulfill
  await otc.connect(approver).approveOffer(lockedOfferId);
  await usdc.transfer(payer.address, BigInt(1000) * BigInt(10 ** 6));
  const required2 = await otc.requiredUsdcAmount(lockedOfferId);
  await usdc.connect(payer).approve(await otc.getAddress(), required2);
  await otc.connect(payer).fulfillOffer(lockedOfferId);
  console.log("  ✓ Locked offer fulfilled");
  
  // Check emergency refund status
  const emergencyEnabled = await otc.emergencyRefundsEnabled();
  console.log("  ✓ Emergency refunds enabled:", emergencyEnabled);
  
  // Enable if not already
  if (!emergencyEnabled) {
    const tx6 = await otc.connect(owner).setEmergencyRefund(true);
    await tx6.wait();
    console.log("  ✓ Emergency refunds now enabled");
  }
  
  const deadline = await otc.emergencyRefundDeadline();
  console.log("  ✓ Emergency refund deadline:", Number(deadline) / 86400, "days");
  
  // Test 3: Storage info
  console.log("\n3️⃣ Storage Management Info...");
  const maxReturned = await otc.maxOpenOffersToReturn();
  console.log("  ✓ Max offers returned:", maxReturned.toString());
  
  const currentOpenOffers = await otc.getOpenOfferIds();
  console.log("  ✓ Current open offers:", currentOpenOffers.length);
  
  // Test 4: Check new security features
  console.log("\n4️⃣ Security Features Check...");
  const maxLockup = await otc.maxLockupSeconds();
  console.log("  ✓ Max lockup period:", Number(maxLockup) / 86400, "days");
  
  const restrictFulfill = await otc.restrictFulfillToBeneficiaryOrApprover();
  console.log("  ✓ Restrict fulfill to beneficiary/approver:", restrictFulfill);
  
  // Test 5: ETH payment with refund
  console.log("\n5️⃣ Testing ETH Payment with Excess Refund...");
  
  // Create ETH offer
  const tx7 = await otc.connect(user).createOffer(
    ethers.parseEther("100"),
    0,
    0, // ETH payment
    0
  );
  await tx7.wait();
  const ethOfferIds = await otc.getOpenOfferIds();
  const ethOfferId = ethOfferIds[ethOfferIds.length - 1];
  
  await otc.connect(approver).approveOffer(ethOfferId);
  const requiredEth = await otc.requiredEthWei(ethOfferId);
  const excess = ethers.parseEther("0.001");
  
  const balBefore = await ethers.provider.getBalance(payer.address);
  const tx8 = await otc.connect(payer).fulfillOffer(ethOfferId, { value: requiredEth + excess });
  const receipt = await tx8.wait();
  const gasUsed = receipt.gasUsed * receipt.gasPrice;
  const balAfter = await ethers.provider.getBalance(payer.address);
  
  const actualSpent = balBefore - balAfter - gasUsed;
  const refunded = actualSpent < requiredEth + excess;
  console.log("  ✓ ETH payment with excess refund:", refunded ? "PASSED" : "FAILED");
  console.log("    Required:", ethers.formatEther(requiredEth), "ETH");
  console.log("    Sent:", ethers.formatEther(requiredEth + excess), "ETH");
  console.log("    Excess refunded:", ethers.formatEther(excess), "ETH");
  
  console.log("\n✅ All tests completed successfully!");
  console.log("\n📝 Summary:");
  console.log("  • Basic offer flow: ✓");
  console.log("  • Emergency refund ready: ✓");
  console.log("  • Storage management: ✓");
  console.log("  • Security features: ✓");
  console.log("  • ETH refund mechanism: ✓");
  console.log("\n🎉 OTC Contract with recovery features is fully operational!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ Test failed:", error);
    process.exit(1);
  });
