import { expect } from "chai";
import hre from "hardhat";

describe("OTC Security Tests", () => {
  async function deploy() {
    const [owner, agent, user, approver, attacker] = await hre.ethers.getSigners();

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

    return { owner, agent, user, approver, attacker, token, usdc, desk, tokenUsd, ethUsd };
  }

  it("prevents setting zero address as agent", async () => {
    const { owner, desk } = await deploy();
    await expect(
      desk.connect(owner).setAgent(hre.ethers.ZeroAddress)
    ).to.be.revertedWith("zero agent");
  });

  it("prevents withdrawal to zero address", async () => {
    const { owner, desk } = await deploy();
    await expect(
      desk.connect(owner).withdrawStable(hre.ethers.ZeroAddress, 0, 100)
    ).to.be.revertedWith("zero addr");
  });

  it("enforces maximum lockup period", async () => {
    const { user, desk } = await deploy();
    const twoYears = 2n * 365n * 24n * 60n * 60n;
    await expect(
      desk.connect(user).createOffer(hre.ethers.parseEther("1000"), 0, 1, twoYears)
    ).to.be.revertedWith("lockup too long");
  });

  it("refunds excess ETH in fulfillOffer", async () => {
    const { user, approver, desk } = await deploy();
    
    await desk.connect(user).createOffer(hre.ethers.parseEther("1000"), 0, 0, 0); // ETH payment
    const [offerId] = await desk.getOpenOfferIds();
    await desk.connect(approver).approveOffer(offerId);
    
    const required = await desk.requiredEthWei(offerId);
    const excess = hre.ethers.parseEther("0.1");
    const totalSent = required + excess;
    
    const balBefore = await hre.ethers.provider.getBalance(user.address);
    const tx = await desk.connect(user).fulfillOffer(offerId, { value: totalSent });
    const receipt = await tx.wait();
    const gasUsed = receipt.gasUsed * receipt.gasPrice;
    const balAfter = await hre.ethers.provider.getBalance(user.address);
    
    // User should have received the excess back (minus gas)
    const actualSpent = balBefore - balAfter - gasUsed;
    expect(actualSpent).to.be.closeTo(required, hre.ethers.parseEther("0.001"));
  });

  it("limits autoClaim batch size", async () => {
    const { approver, desk } = await deploy();
    const largeArray = Array.from({ length: 51 }, (_, i) => i + 1);
    await expect(
      desk.connect(approver).autoClaim(largeArray)
    ).to.be.revertedWith("batch too large");
  });

  it("handles invalid offer IDs in autoClaim gracefully", async () => {
    const { approver, desk } = await deploy();
    // Should not revert, just skip invalid IDs
    await expect(
      desk.connect(approver).autoClaim([0, 999999, 1])
    ).to.not.be.reverted;
  });

  it("prevents double approval", async () => {
    const { user, approver, desk } = await deploy();
    
    await desk.connect(user).createOffer(hre.ethers.parseEther("1000"), 0, 1, 0);
    const [offerId] = await desk.getOpenOfferIds();
    
    await desk.connect(approver).approveOffer(offerId);
    await expect(
      desk.connect(approver).approveOffer(offerId)
    ).to.be.revertedWith("already approved");
  });

  it("rejects approval if price moved too much", async () => {
    const { user, approver, desk, tokenUsd } = await deploy();
    
    await desk.connect(user).createOffer(hre.ethers.parseEther("1000"), 0, 1, 0);
    const [offerId] = await desk.getOpenOfferIds();
    
    // Change price by 25% (more than 20% threshold)
    await tokenUsd.setAnswer(12_500_000n); // $0.125 (25% increase from $0.1)
    
    await expect(
      desk.connect(approver).approveOffer(offerId)
    ).to.be.revertedWith("price moved too much");
    
    // Change to 15% increase (within threshold)
    await tokenUsd.setAnswer(11_500_000n); // $0.115
    await expect(
      desk.connect(approver).approveOffer(offerId)
    ).to.not.be.reverted;
  });

  it("getOpenOfferIds returns limited results", async () => {
    const { user, desk } = await deploy();
    
    // Create many offers
    for (let i = 0; i < 10; i++) {
      await desk.connect(user).createOffer(hre.ethers.parseEther("100"), 0, 1, 0);
    }
    
    const openOffers = await desk.getOpenOfferIds();
    const maxReturned = await desk.maxOpenOffersToReturn();
    expect(openOffers.length).to.be.lte(Number(maxReturned));
  });
});

describe("Lock Security Tests", () => {
  it("enforces immutable owner and unlockTime", async () => {
    const Lock = await hre.ethers.getContractFactory("Lock");
    const futureTime = (await hre.ethers.provider.getBlock("latest")).timestamp + 3600;
    const lock = await Lock.deploy(futureTime, { value: hre.ethers.parseEther("1") });
    
    // These should be immutable (no setter functions exist)
    const owner = await lock.owner();
    const unlockTime = await lock.unlockTime();
    expect(owner).to.not.equal(hre.ethers.ZeroAddress);
    expect(unlockTime).to.equal(futureTime);
  });

  it("prevents unlock time too far in future", async () => {
    const Lock = await hre.ethers.getContractFactory("Lock");
    const currentTime = (await hre.ethers.provider.getBlock("latest")).timestamp;
    const twoYears = currentTime + (2 * 365 * 24 * 60 * 60);
    
    await expect(
      Lock.deploy(twoYears, { value: hre.ethers.parseEther("1") })
    ).to.be.revertedWith("Unlock time too far");
  });

  it("checks balance before withdrawal", async () => {
    const [owner] = await hre.ethers.getSigners();
    const Lock = await hre.ethers.getContractFactory("Lock");
    const currentBlock = await hre.ethers.provider.getBlock("latest");
    const futureTime = currentBlock.timestamp + 10;
    
    // Deploy without sending ETH
    const lock = await Lock.deploy(futureTime);
    
    // Fast forward time past unlock
    await hre.network.provider.send("evm_increaseTime", [11]);
    await hre.network.provider.send("evm_mine");
    
    // Should revert due to no balance
    await expect(lock.withdraw()).to.be.revertedWith("No balance");
  });
});
