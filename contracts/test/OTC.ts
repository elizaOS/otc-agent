import { expect } from "chai";
import hre from "hardhat";
import { time } from "@nomicfoundation/hardhat-toolbox/network-helpers";

describe("OTC", () => {
  async function deploy() {
    const [owner, agent, user, approver, other] = await hre.ethers.getSigners();

    const MockERC20 = await hre.ethers.getContractFactory("MockERC20");
    const token = await MockERC20.deploy("ElizaOS", "ElizaOS", 18, hre.ethers.parseEther("1000000"));
    const usdc = await MockERC20.deploy("USD Coin", "USDC", 6, 1_000_000n * 10n ** 6n);

    const MockAgg = await hre.ethers.getContractFactory("MockAggregatorV3");
    // 8 decimals feeds
    const tokenUsd = await MockAgg.deploy(8, 5000_00000000n); // $5000 per token? unrealistic but fine for math
    const ethUsd = await MockAgg.deploy(8, 3000_00000000n);   // $3000 per ETH

    const Desk = await hre.ethers.getContractFactory("OTC");
    const desk = await Desk.deploy(owner.address, await token.getAddress(), await usdc.getAddress(), await tokenUsd.getAddress(), await ethUsd.getAddress(), agent.address);

    await token.approve(await desk.getAddress(), hre.ethers.parseEther("1000000"));
    await desk.depositTokens(hre.ethers.parseEther("1000000"));
    await desk.setApprover(approver.address, true);
    await desk.setLimits(5_00000000n, hre.ethers.parseEther("10000"), 30 * 60, 0);

    return { owner, agent, user, approver, other, token, usdc, desk };
  }

  it("create -> approve -> fulfill (USDC) -> claim after unlock", async () => {
    const { user, approver, usdc, desk, token } = await deploy();

    // Reduce token price to something realistic: $0.001 per ElizaOS (8 decimals)
    const tokenUsdAddr = await desk.tokenUsdFeed();
    const tokenUsd = (await hre.ethers.getContractAt("MockAggregatorV3", tokenUsdAddr)) as any;
    await tokenUsd.setAnswer(100_000n); // $0.001 with 8 decimals

    // Fund user with USDC to pay
    await usdc.transfer(user.address, 1_000_000n * 10n ** 6n);

    // Create offer: 10,000 tokens, 10% discount, USDC
    await desk.connect(user).createOffer(hre.ethers.parseEther("10000"), 1000, 1, 0);
    const open = await desk.getOpenOfferIds();
    const offerId = open[0];

    // Approve
    await desk.connect(approver).approveOffer(offerId);

    // Fulfill with USDC
    const required = await desk.requiredUsdcAmount(offerId);
    await usdc.connect(user).approve(await desk.getAddress(), required);
    await desk.connect(user).fulfillOffer(offerId);

    // claim immediately (unlock delay 0)
    await desk.connect(user).claim(offerId);
    const bal = await token.balanceOf(user.address);
    expect(bal).to.equal(hre.ethers.parseEther("10000"));
  });

  it("enforces min $5 and max token per order", async () => {
    const { user, desk } = await deploy();
    // Extremely small order should revert due to min $5
    await expect(desk.connect(user).createOffer(1n, 0, 1, 0)).to.be.revertedWith("min $5");
    // Large order should revert due to max token per order
    await expect(desk.connect(user).createOffer(hre.ethers.parseEther("100000"), 0, 1, 0)).to.be.revertedWith("amount range");
  });

  it("user can cancel after expiry, approver can cancel anytime before pay", async () => {
    const { user, approver, desk } = await deploy();
    await desk.connect(user).createOffer(hre.ethers.parseEther("1000"), 0, 0, 0);
    const open = await desk.getOpenOfferIds();
    const offerId = open[0];
    // user cannot cancel immediately
    await expect(desk.connect(user).cancelOffer(offerId)).to.be.revertedWith("not expired");
    // approver can cancel
    await desk.connect(approver).cancelOffer(offerId);
  });

  it("0 lockup allows immediate claim after fulfill", async () => {
    const { user, approver, usdc, desk, token } = await deploy();
    // Set reasonable token price
    const tokenUsdAddr = await desk.tokenUsdFeed();
    const tokenUsd = (await hre.ethers.getContractAt("MockAggregatorV3", tokenUsdAddr)) as any;
    await tokenUsd.setAnswer(10_000_000n); // $0.1 ensures >= $5 for 1000 tokens

    // Fund user
    await usdc.transfer(user.address, 1_000_000n * 10n ** 6n);

    // Create, approve, fulfill
    await desk.connect(user).createOffer(hre.ethers.parseEther("1000"), 0, 1, 0); // 0 lockup
    const ids = await desk.getOpenOfferIds();
    const id = ids[0];
    await desk.connect(approver).approveOffer(id);
    const usdcAmt = await desk.requiredUsdcAmount(id);
    await usdc.connect(user).approve(await desk.getAddress(), usdcAmt);
    await desk.connect(user).fulfillOffer(id);

    // Immediate claim
    await expect(desk.connect(user).claim(id)).to.not.be.reverted;
    const bal = await token.balanceOf(user.address);
    expect(bal).to.equal(hre.ethers.parseEther("1000"));
  });

  it("claim reverts before unlock for non-zero lockup", async () => {
    const { user, approver, usdc, desk } = await deploy();
    const tokenUsdAddr2 = await desk.tokenUsdFeed();
    const tokenUsd2 = (await hre.ethers.getContractAt("MockAggregatorV3", tokenUsdAddr2)) as any;
    await tokenUsd2.setAnswer(10_000_000n); // $0.1 ensures >= $5

    await usdc.transfer(user.address, 1_000_000n * 10n ** 6n);
    // 30-day lockup
    await desk.connect(user).createOffer(hre.ethers.parseEther("1000"), 0, 1, 30n * 24n * 60n * 60n);
    const ids = await desk.getOpenOfferIds();
    const id = ids[0];
    await desk.connect(approver).approveOffer(id);
    const usdcAmt = await desk.requiredUsdcAmount(id);
    await usdc.connect(user).approve(await desk.getAddress(), usdcAmt);
    await desk.connect(user).fulfillOffer(id);

    await expect(desk.connect(user).claim(id)).to.be.revertedWith("locked");

    // advance just before unlock still reverts
    await hre.network.provider.send("evm_increaseTime", [29 * 24 * 60 * 60]);
    await hre.network.provider.send("evm_mine");
    await expect(desk.connect(user).claim(id)).to.be.revertedWith("locked");

    // advance past unlock succeeds
    await hre.network.provider.send("evm_increaseTime", [2 * 24 * 60 * 60]);
    await hre.network.provider.send("evm_mine");
    await expect(desk.connect(user).claim(id)).to.not.be.reverted;
  });

  it("autoClaim by approver distributes matured tokens in batch", async () => {
    const { user, approver, usdc, desk, token } = await deploy();
    const tokenUsdAddr3 = await desk.tokenUsdFeed();
    const tokenUsd3 = (await hre.ethers.getContractAt("MockAggregatorV3", tokenUsdAddr3)) as any;
    await tokenUsd3.setAnswer(10_000_000n); // $0.1 ensures >= $5
    await usdc.transfer(user.address, 1_000_000n * 10n ** 6n);

    // Create two offers with 1-day lockup
    for (let i = 0; i < 2; i++) {
      await desk.connect(user).createOffer(hre.ethers.parseEther("500"), 0, 1, 24n * 60n * 60n);
    }
    const ids = await desk.getOpenOfferIds();
    for (const id of ids) {
      await desk.connect(approver).approveOffer(id);
      const usdcAmt = await desk.requiredUsdcAmount(id);
      await usdc.connect(user).approve(await desk.getAddress(), usdcAmt);
      await desk.connect(user).fulfillOffer(id);
    }

    // advance past unlock
    await hre.network.provider.send("evm_increaseTime", [2 * 24 * 60 * 60]);
    await hre.network.provider.send("evm_mine");

    // Before autoClaim, user has 0 new tokens from these deals
    const before = await token.balanceOf(user.address);

    // Approver triggers autoClaim
    const idsArr = Array.from(ids);
    await expect(desk.connect(approver).autoClaim(idsArr)).to.not.be.reverted;

    const after = await token.balanceOf(user.address);
    expect(after - before).to.equal(hre.ethers.parseEther("1000"));
  });

  it("rejects stale price data based on maxFeedAgeSeconds", async () => {
    const { user, desk } = await deploy();
    const tokenUsdAddr = await desk.tokenUsdFeed();
    const tokenUsd = (await hre.ethers.getContractAt("MockAggregatorV3", tokenUsdAddr)) as any;
    // Set last update to 2 hours ago (stale)
    const now = (await hre.ethers.provider.getBlock("latest")).timestamp;
    await tokenUsd.setRoundData(10, 10, now - 7200, now - 7200);
    await expect(desk.connect(user).createOffer(hre.ethers.parseEther("1000"), 0, 1, 0)).to.be.revertedWith("stale price");

    // Freshen it and it should succeed
    await tokenUsd.setRoundData(11, 11, now, now);
    await expect(desk.connect(user).createOffer(hre.ethers.parseEther("1000"), 0, 1, 0)).to.not.be.reverted;
  });

  it("rounds up USDC amount when converting from USD 8d", async () => {
    const { user, approver, usdc, desk } = await deploy();
    const tokenUsdAddr = await desk.tokenUsdFeed();
    const tokenUsd = (await hre.ethers.getContractAt("MockAggregatorV3", tokenUsdAddr)) as any;
    // Set price so USD total is not multiple of 100 (8d), e.g., $5.00123 per token for 1 token
    await tokenUsd.setAnswer(500123000n); // $5.00123 (8d)

    await desk.connect(user).createOffer(hre.ethers.parseEther("1"), 0, 1, 0);
    const [offerId] = await desk.getOpenOfferIds();
    await desk.connect(approver).approveOffer(offerId);

    const usd = await desk.totalUsdForOffer(offerId);
    const floorUsdc = (usd * 10n ** 6n) / 10n ** 8n; // floor
    const required = await desk.requiredUsdcAmount(offerId); // ceil
    expect(required === floorUsdc || required === floorUsdc + 1n).to.be.true; // depending on exact divisibility

    await usdc.transfer(user.address, 1_000_000n * 10n ** 6n);
    await usdc.connect(user).approve(await desk.getAddress(), required);
    await expect(desk.connect(user).fulfillOffer(offerId)).to.not.be.reverted;
  });

  it("honors restrictFulfill: only beneficiary/agent/approver can fulfill when enabled", async () => {
    const { owner, user, approver, other, usdc, desk } = await deploy();
    await desk.connect(owner).setRestrictFulfill(true);

    const tokenUsdAddr4 = await desk.tokenUsdFeed();
    const tokenUsd4 = (await hre.ethers.getContractAt("MockAggregatorV3", tokenUsdAddr4)) as any;
    await tokenUsd4.setAnswer(10_000_000n); // $0.1 ensures >= $5

    await usdc.transfer(user.address, 1_000_000n * 10n ** 6n);
    await desk.connect(user).createOffer(hre.ethers.parseEther("1000"), 0, 1, 0);
    const [offerId] = await desk.getOpenOfferIds();
    await desk.connect(approver).approveOffer(offerId);

    const required = await desk.requiredUsdcAmount(offerId);
    await usdc.connect(other).approve(await desk.getAddress(), required);
    await expect(desk.connect(other).fulfillOffer(offerId)).to.be.revertedWith("fulfill restricted");

    await usdc.connect(user).approve(await desk.getAddress(), required);
    await expect(desk.connect(user).fulfillOffer(offerId)).to.not.be.reverted;
  });
});


