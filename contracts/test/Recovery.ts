import { expect } from "chai";
import hre from "hardhat";

describe("OTC Recovery & Refund Tests", () => {
  async function deploy() {
    const [owner, agent, user, approver, payer] = await hre.ethers.getSigners();

    const MockERC20 = await hre.ethers.getContractFactory("MockERC20");
    const token = await MockERC20.deploy("ElizaOS", "ElizaOS", 18, hre.ethers.parseEther("1000000"));
    const usdc = await MockERC20.deploy("USD Coin", "USDC", 6, 1_000_000n * 10n ** 6n);

    const MockAgg = await hre.ethers.getContractFactory("MockAggregatorV3");
    const tokenUsd = await MockAgg.deploy(8, 10_000_000n); // $0.1
    const ethUsd = await MockAgg.deploy(8, 3000_00000000n); // $3000

    const Desk = await hre.ethers.getContractFactory("OTC");
    const desk = await Desk.deploy(
      owner.address, 
      await token.getAddress(), 
      await usdc.getAddress(), 
      await tokenUsd.getAddress(), 
      await ethUsd.getAddress(), 
      agent.address
    );

    await token.approve(await desk.getAddress(), hre.ethers.parseEther("1000000"));
    await desk.depositTokens(hre.ethers.parseEther("1000000"));
    await desk.setApprover(approver.address, true);
    await desk.setLimits(5_00000000n, hre.ethers.parseEther("10000"), 30 * 60, 0);

    return { owner, agent, user, approver, payer, token, usdc, desk };
  }

  describe("Emergency Refunds", () => {
    it("allows emergency refund after deadline for stuck deals", async () => {
      const { owner, user, approver, payer, usdc, desk } = await deploy();
      
      // Create and fulfill an offer
      await desk.connect(user).createOffer(hre.ethers.parseEther("1000"), 0, 1, 30 * 24 * 60 * 60); // 30 day lockup
      const [offerId] = await desk.getOpenOfferIds();
      await desk.connect(approver).approveOffer(offerId);
      
      // Fund payer and fulfill
      await usdc.transfer(payer.address, 1_000_000n * 10n ** 6n);
      const required = await desk.requiredUsdcAmount(offerId);
      await usdc.connect(payer).approve(await desk.getAddress(), required);
      await desk.connect(payer).fulfillOffer(offerId);
      
      // Enable emergency refunds
      await desk.connect(owner).setEmergencyRefund(true);
      
      // Cannot refund immediately
      await expect(
        desk.connect(payer).emergencyRefund(offerId)
      ).to.be.revertedWith("too early for emergency refund");
      
      // Fast forward past emergency deadline (90 days default)
      await hre.network.provider.send("evm_increaseTime", [91 * 24 * 60 * 60]);
      await hre.network.provider.send("evm_mine");
      
      // Now payer can get refund
      const balBefore = await usdc.balanceOf(payer.address);
      await desk.connect(payer).emergencyRefund(offerId);
      const balAfter = await usdc.balanceOf(payer.address);
      
      expect(balAfter - balBefore).to.equal(required);
      
      // Offer should be cancelled
      const offer = await desk.offers(offerId);
      expect(offer.cancelled).to.be.true;
    });

    it("allows emergency refund for ETH payments", async () => {
      const { owner, user, approver, payer, desk } = await deploy();
      
      // Create ETH payment offer
      await desk.connect(user).createOffer(hre.ethers.parseEther("1000"), 0, 0, 30 * 24 * 60 * 60); // ETH, 30 day lockup
      const [offerId] = await desk.getOpenOfferIds();
      await desk.connect(approver).approveOffer(offerId);
      
      // Fulfill with ETH
      const required = await desk.requiredEthWei(offerId);
      await desk.connect(payer).fulfillOffer(offerId, { value: required });
      
      // Enable emergency refunds and fast forward
      await desk.connect(owner).setEmergencyRefund(true);
      await hre.network.provider.send("evm_increaseTime", [91 * 24 * 60 * 60]);
      await hre.network.provider.send("evm_mine");
      
      // Get refund
      const balBefore = await hre.ethers.provider.getBalance(payer.address);
      const tx = await desk.connect(payer).emergencyRefund(offerId);
      const receipt = await tx.wait();
      const gasUsed = receipt.gasUsed * receipt.gasPrice;
      const balAfter = await hre.ethers.provider.getBalance(payer.address);
      
      // Should have received ETH back (minus gas)
      expect(balAfter - balBefore + gasUsed).to.be.closeTo(required, hre.ethers.parseEther("0.001"));
    });

    it("prevents emergency refund when disabled", async () => {
      const { user, approver, payer, usdc, desk } = await deploy();
      
      await desk.connect(user).createOffer(hre.ethers.parseEther("1000"), 0, 1, 0);
      const [offerId] = await desk.getOpenOfferIds();
      await desk.connect(approver).approveOffer(offerId);
      
      await usdc.transfer(payer.address, 1_000_000n * 10n ** 6n);
      const required = await desk.requiredUsdcAmount(offerId);
      await usdc.connect(payer).approve(await desk.getAddress(), required);
      await desk.connect(payer).fulfillOffer(offerId);
      
      // Fast forward but don't enable emergency refunds
      await hre.network.provider.send("evm_increaseTime", [91 * 24 * 60 * 60]);
      await hre.network.provider.send("evm_mine");
      
      await expect(
        desk.connect(payer).emergencyRefund(offerId)
      ).to.be.revertedWith("emergency refunds disabled");
    });

    it("allows beneficiary to trigger emergency refund", async () => {
      const { owner, user, approver, payer, usdc, desk } = await deploy();
      
      await desk.connect(user).createOffer(hre.ethers.parseEther("1000"), 0, 1, 30 * 24 * 60 * 60);
      const [offerId] = await desk.getOpenOfferIds();
      await desk.connect(approver).approveOffer(offerId);
      
      await usdc.transfer(payer.address, 1_000_000n * 10n ** 6n);
      const required = await desk.requiredUsdcAmount(offerId);
      await usdc.connect(payer).approve(await desk.getAddress(), required);
      await desk.connect(payer).fulfillOffer(offerId);
      
      await desk.connect(owner).setEmergencyRefund(true);
      
      // Fast forward past unlock + 30 days
      await hre.network.provider.send("evm_increaseTime", [61 * 24 * 60 * 60]);
      await hre.network.provider.send("evm_mine");
      
      // Beneficiary can trigger refund for stuck deal
      await expect(
        desk.connect(user).emergencyRefund(offerId)
      ).to.not.be.reverted;
    });
  });

  describe("Admin Emergency Withdraw", () => {
    it("allows owner to recover truly stuck funds after 180 days", async () => {
      const { owner, user, approver, payer, usdc, desk, token } = await deploy();
      
      await desk.connect(user).createOffer(hre.ethers.parseEther("1000"), 0, 1, 30 * 24 * 60 * 60);
      const [offerId] = await desk.getOpenOfferIds();
      await desk.connect(approver).approveOffer(offerId);
      
      await usdc.transfer(payer.address, 1_000_000n * 10n ** 6n);
      const required = await desk.requiredUsdcAmount(offerId);
      await usdc.connect(payer).approve(await desk.getAddress(), required);
      await desk.connect(payer).fulfillOffer(offerId);
      
      // Cannot withdraw before 180 days after unlock
      await expect(
        desk.connect(owner).adminEmergencyWithdraw(offerId)
      ).to.be.revertedWith("must wait 180 days after unlock");
      
      // Fast forward 210 days (past unlock + 180 days)
      await hre.network.provider.send("evm_increaseTime", [210 * 24 * 60 * 60]);
      await hre.network.provider.send("evm_mine");
      
      // Owner can now recover tokens to beneficiary
      const balBefore = await token.balanceOf(user.address);
      await desk.connect(owner).adminEmergencyWithdraw(offerId);
      const balAfter = await token.balanceOf(user.address);
      
      expect(balAfter - balBefore).to.equal(hre.ethers.parseEther("1000"));
    });
  });

  describe("Storage Cleanup", () => {
    it("automatically cleans up old offers when limit reached", async () => {
      const { user, desk } = await deploy();
      
      // Create many offers
      for (let i = 0; i < 10; i++) {
        await desk.connect(user).createOffer(hre.ethers.parseEther("100"), 0, 1, 0);
      }
      
      const offersBefore = await desk.getOpenOfferIds();
      expect(offersBefore.length).to.equal(10);
      
      // Fast forward to expire them (but not too long to make price stale)
      await hre.network.provider.send("evm_increaseTime", [35 * 60]); // 35 minutes
      await hre.network.provider.send("evm_mine");
      
      // Check that getOpenOfferIds filters expired offers
      const openOffers = await desk.getOpenOfferIds();
      expect(openOffers.length).to.equal(0); // All expired
    });

    it("allows public cleanup of expired offers", async () => {
      const { user, desk } = await deploy();
      
      // Create offers
      for (let i = 0; i < 5; i++) {
        await desk.connect(user).createOffer(hre.ethers.parseEther("100"), 0, 1, 0);
      }
      
      const offersBefore = await desk.getOpenOfferIds();
      expect(offersBefore.length).to.equal(5);
      
      // Fast forward to expire them
      await hre.network.provider.send("evm_increaseTime", [2 * 24 * 60 * 60]);
      await hre.network.provider.send("evm_mine");
      
      // Anyone can call cleanup
      await desk.connect(user).cleanupExpiredOffers(10);
      
      // Should be cleaned
      const offersAfter = await desk.getOpenOfferIds();
      expect(offersAfter.length).to.equal(0);
    });

    it("limits cleanup batch size", async () => {
      const { user, desk } = await deploy();
      
      await expect(
        desk.connect(user).cleanupExpiredOffers(101)
      ).to.be.revertedWith("invalid max");
      
      await expect(
        desk.connect(user).cleanupExpiredOffers(0)
      ).to.be.revertedWith("invalid max");
    });
  });
});
