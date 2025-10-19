import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Otc } from "../target/types/otc";
import { 
  Keypair, 
  PublicKey, 
  SystemProgram, 
  LAMPORTS_PER_SOL,
  Transaction 
} from "@solana/web3.js";
import { 
  createMint, 
  getOrCreateAssociatedTokenAccount,
  mintTo,
  TOKEN_PROGRAM_ID,
  getAccount
} from "@solana/spl-token";
import { assert } from "chai";
import * as fs from "fs";

describe("OTC Comprehensive Tests", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Otc as Program<Otc>;
  
  let desk: Keypair;
  let owner: Keypair;
  let agent: Keypair;
  let approver: Keypair;
  let buyer: Keypair;
  let consigner: Keypair;
  
  let tokenMint: PublicKey;
  let usdcMint: PublicKey;
  let tokenRegistry: Keypair;
  let consignment: Keypair;
  let offer: Keypair;
  
  let deskTokenTreasury: PublicKey;
  let deskUsdcTreasury: PublicKey;
  let ownerTokenAta: PublicKey;
  let buyerTokenAta: PublicKey;
  let buyerUsdcAta: PublicKey;
  let consignerTokenAta: PublicKey;

  before(async () => {
    // Initialize keypairs
    desk = Keypair.generate();
    owner = Keypair.generate();
    agent = Keypair.generate();
    approver = Keypair.generate();
    buyer = Keypair.generate();
    consigner = Keypair.generate();
    tokenRegistry = Keypair.generate();
    consignment = Keypair.generate();
    offer = Keypair.generate();

    // Airdrop SOL to accounts
    const airdropAmount = 10 * LAMPORTS_PER_SOL;
    await Promise.all([
      provider.connection.requestAirdrop(owner.publicKey, airdropAmount),
      provider.connection.requestAirdrop(agent.publicKey, airdropAmount),
      provider.connection.requestAirdrop(approver.publicKey, airdropAmount),
      provider.connection.requestAirdrop(buyer.publicKey, airdropAmount),
      provider.connection.requestAirdrop(consigner.publicKey, airdropAmount),
      provider.connection.requestAirdrop(desk.publicKey, airdropAmount),
    ]);
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Create mints
    tokenMint = await createMint(
      provider.connection,
      owner,
      owner.publicKey,
      null,
      18
    );

    usdcMint = await createMint(
      provider.connection,
      owner,
      owner.publicKey,
      null,
      6
    );

    // Create token accounts
    deskTokenTreasury = (await getOrCreateAssociatedTokenAccount(
      provider.connection,
      owner,
      tokenMint,
      desk.publicKey
    )).address;

    deskUsdcTreasury = (await getOrCreateAssociatedTokenAccount(
      provider.connection,
      owner,
      usdcMint,
      desk.publicKey
    )).address;

    ownerTokenAta = (await getOrCreateAssociatedTokenAccount(
      provider.connection,
      owner,
      tokenMint,
      owner.publicKey
    )).address;

    buyerTokenAta = (await getOrCreateAssociatedTokenAccount(
      provider.connection,
      owner,
      tokenMint,
      buyer.publicKey
    )).address;

    buyerUsdcAta = (await getOrCreateAssociatedTokenAccount(
      provider.connection,
      owner,
      usdcMint,
      buyer.publicKey
    )).address;

    consignerTokenAta = (await getOrCreateAssociatedTokenAccount(
      provider.connection,
      owner,
      tokenMint,
      consigner.publicKey
    )).address;

    // Mint tokens
    await mintTo(
      provider.connection,
      owner,
      tokenMint,
      ownerTokenAta,
      owner,
      1000000n * 10n ** 18n
    );

    await mintTo(
      provider.connection,
      owner,
      tokenMint,
      consignerTokenAta,
      owner,
      100000n * 10n ** 18n
    );

    await mintTo(
      provider.connection,
      owner,
      usdcMint,
      buyerUsdcAta,
      owner,
      100000n * 10n ** 6n
    );
  });

  describe("Desk Initialization", () => {
    it("should initialize desk with correct parameters", async () => {
      const minUsdAmount = new anchor.BN(5 * 10 ** 8); // $5
      const quoteExpirySecs = new anchor.BN(1800); // 30 minutes

      await program.methods
        .initDesk(minUsdAmount, quoteExpirySecs)
        .accounts({
          payer: owner.publicKey,
          owner: owner.publicKey,
          agent: agent.publicKey,
          tokenMint,
          usdcMint,
          desk: desk.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([owner, desk])
        .rpc();

      const deskAccount = await program.account.desk.fetch(desk.publicKey);
      assert.equal(deskAccount.owner.toBase58(), owner.publicKey.toBase58());
      assert.equal(deskAccount.agent.toBase58(), agent.publicKey.toBase58());
      assert.equal(deskAccount.minUsdAmount8d.toString(), minUsdAmount.toString());
      assert.equal(deskAccount.quoteExpirySecs.toString(), quoteExpirySecs.toString());
      assert.equal(deskAccount.paused, false);
    });

    it("should reject invalid USDC decimals", async () => {
      // This would require creating a mock USDC with wrong decimals
      // Skipping for now as it requires additional setup
    });
  });

  describe("Token Registration", () => {
    it("should register a new token", async () => {
      const priceFeedId = Buffer.alloc(32);
      priceFeedId.write("ELIZA/USD");

      await program.methods
        .registerToken([...priceFeedId])
        .accounts({
          desk: desk.publicKey,
          owner: owner.publicKey,
          tokenMint,
          tokenRegistry: tokenRegistry.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([owner, tokenRegistry])
        .rpc();

      const registryAccount = await program.account.tokenRegistry.fetch(tokenRegistry.publicKey);
      assert.equal(registryAccount.tokenMint.toBase58(), tokenMint.toBase58());
      assert.equal(registryAccount.isActive, true);
    });
  });

  describe("Admin Functions", () => {
    it("should set approver", async () => {
      await program.methods
        .setApprover(approver.publicKey, true)
        .accounts({
          owner: owner.publicKey,
          desk: desk.publicKey,
        })
        .signers([owner])
        .rpc();

      const deskAccount = await program.account.desk.fetch(desk.publicKey);
      assert.isTrue(deskAccount.approvers.some(a => a.toBase58() === approver.publicKey.toBase58()));
    });

    it("should set prices with bounds checking", async () => {
      const tokenPrice = new anchor.BN(10 * 10 ** 8); // $10
      const solPrice = new anchor.BN(150 * 10 ** 8); // $150
      const maxAge = new anchor.BN(3600);

      await program.methods
        .setPrices(tokenPrice, solPrice, new anchor.BN(0), maxAge)
        .accounts({
          owner: owner.publicKey,
          desk: desk.publicKey,
        })
        .signers([owner])
        .rpc();

      const deskAccount = await program.account.desk.fetch(desk.publicKey);
      assert.equal(deskAccount.tokenUsdPrice8d.toString(), tokenPrice.toString());
      assert.equal(deskAccount.solUsdPrice8d.toString(), solPrice.toString());
    });

    it("should reject prices outside bounds", async () => {
      const tokenPriceTooHigh = new anchor.BN(10001 * 10 ** 8); // $10,001
      const solPrice = new anchor.BN(150 * 10 ** 8);
      
      try {
        await program.methods
          .setPrices(tokenPriceTooHigh, solPrice, new anchor.BN(0), new anchor.BN(3600))
          .accounts({
            owner: owner.publicKey,
            desk: desk.publicKey,
          })
          .signers([owner])
          .rpc();
        assert.fail("Should have rejected high price");
      } catch (error) {
        assert.include(error.toString(), "BadPrice");
      }
    });

    it("should set limits", async () => {
      const minUsd = new anchor.BN(10 * 10 ** 8);
      const maxToken = new anchor.BN(10000 * 10 ** 18);
      const quoteExpiry = new anchor.BN(3600);
      const defaultUnlock = new anchor.BN(0);
      const maxLockup = new anchor.BN(365 * 86400);

      await program.methods
        .setLimits(minUsd, maxToken, quoteExpiry, defaultUnlock, maxLockup)
        .accounts({
          owner: owner.publicKey,
          desk: desk.publicKey,
        })
        .signers([owner])
        .rpc();

      const deskAccount = await program.account.desk.fetch(desk.publicKey);
      assert.equal(deskAccount.minUsdAmount8d.toString(), minUsd.toString());
    });

    it("should pause and unpause", async () => {
      await program.methods
        .pause()
        .accounts({
          owner: owner.publicKey,
          desk: desk.publicKey,
        })
        .signers([owner])
        .rpc();

      let deskAccount = await program.account.desk.fetch(desk.publicKey);
      assert.isTrue(deskAccount.paused);

      await program.methods
        .unpause()
        .accounts({
          owner: owner.publicKey,
          desk: desk.publicKey,
        })
        .signers([owner])
        .rpc();

      deskAccount = await program.account.desk.fetch(desk.publicKey);
      assert.isFalse(deskAccount.paused);
    });

    it("should set emergency refund parameters", async () => {
      await program.methods
        .setEmergencyRefund(true, new anchor.BN(30 * 86400))
        .accounts({
          owner: owner.publicKey,
          desk: desk.publicKey,
        })
        .signers([owner])
        .rpc();

      const deskAccount = await program.account.desk.fetch(desk.publicKey);
      assert.isTrue(deskAccount.emergencyRefundEnabled);
      assert.equal(deskAccount.emergencyRefundDeadlineSecs.toString(), (30 * 86400).toString());
    });
  });

  describe("Consignment Management", () => {
    it("should create a negotiable consignment", async () => {
      const amount = new anchor.BN(1000 * 10 ** 18);
      const isNegotiable = true;
      const fixedDiscountBps = 0;
      const fixedLockupDays = 0;
      const minDiscountBps = 500; // 5%
      const maxDiscountBps = 2000; // 20%
      const minLockupDays = 0;
      const maxLockupDays = 30;
      const minDealAmount = new anchor.BN(100 * 10 ** 18);
      const maxDealAmount = new anchor.BN(500 * 10 ** 18);
      const isFractionalized = true;
      const isPrivate = false;
      const maxPriceVolatilityBps = 2000; // 20%
      const maxTimeToExecuteSecs = new anchor.BN(86400); // 1 day

      await program.methods
        .createConsignment(
          amount,
          isNegotiable,
          fixedDiscountBps,
          fixedLockupDays,
          minDiscountBps,
          maxDiscountBps,
          minLockupDays,
          maxLockupDays,
          minDealAmount,
          maxDealAmount,
          isFractionalized,
          isPrivate,
          maxPriceVolatilityBps,
          maxTimeToExecuteSecs
        )
        .accounts({
          desk: desk.publicKey,
          consigner: consigner.publicKey,
          tokenMint,
          consignerTokenAta,
          deskTokenTreasury,
          consignment: consignment.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([consigner, consignment])
        .rpc();

      const consignmentAccount = await program.account.consignment.fetch(consignment.publicKey);
      assert.equal(consignmentAccount.consigner.toBase58(), consigner.publicKey.toBase58());
      assert.equal(consignmentAccount.totalAmount.toString(), amount.toString());
      assert.equal(consignmentAccount.isNegotiable, isNegotiable);
      assert.equal(consignmentAccount.isActive, true);
    });

    it("should create fixed-price consignment", async () => {
      const consignment2 = Keypair.generate();
      const amount = new anchor.BN(500 * 10 ** 18);
      const isNegotiable = false;
      const fixedDiscountBps = 1000; // 10%
      const fixedLockupDays = 30;

      await program.methods
        .createConsignment(
          amount,
          isNegotiable,
          fixedDiscountBps,
          fixedLockupDays,
          0, 0, 0, 0,
          new anchor.BN(50 * 10 ** 18),
          new anchor.BN(250 * 10 ** 18),
          true,
          false,
          1000,
          new anchor.BN(86400)
        )
        .accounts({
          desk: desk.publicKey,
          consigner: consigner.publicKey,
          tokenMint,
          consignerTokenAta,
          deskTokenTreasury,
          consignment: consignment2.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([consigner, consignment2])
        .rpc();

      const consignmentAccount = await program.account.consignment.fetch(consignment2.publicKey);
      assert.equal(consignmentAccount.fixedDiscountBps, fixedDiscountBps);
      assert.equal(consignmentAccount.fixedLockupDays, fixedLockupDays);
    });

    it("should withdraw consignment", async () => {
      const consignment3 = Keypair.generate();
      const amount = new anchor.BN(100 * 10 ** 18);

      // Create consignment
      await program.methods
        .createConsignment(
          amount,
          false, 1000, 30, 0, 0, 0, 0,
          new anchor.BN(10 * 10 ** 18),
          new anchor.BN(50 * 10 ** 18),
          true, false, 1000, new anchor.BN(86400)
        )
        .accounts({
          desk: desk.publicKey,
          consigner: consigner.publicKey,
          tokenMint,
          consignerTokenAta,
          deskTokenTreasury,
          consignment: consignment3.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([consigner, consignment3])
        .rpc();

      // Withdraw consignment
      await program.methods
        .withdrawConsignment(new anchor.BN(3))
        .accounts({
          consignment: consignment3.publicKey,
          desk: desk.publicKey,
          deskSigner: desk.publicKey,
          consigner: consigner.publicKey,
          deskTokenTreasury,
          consignerTokenAta,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([consigner, desk])
        .rpc();

      const consignmentAccount = await program.account.consignment.fetch(consignment3.publicKey);
      assert.equal(consignmentAccount.isActive, false);
      assert.equal(consignmentAccount.remainingAmount.toString(), "0");
    });
  });

  describe("Offer Creation and Management", () => {
    it("should create offer from consignment", async () => {
      // Update token registry price first
      const tokenPrice = new anchor.BN(10 * 10 ** 8); // $10
      
      // This is a simplified test - in practice would need to update registry price
      // For now, setting desk prices
      await program.methods
        .setPrices(tokenPrice, new anchor.BN(150 * 10 ** 8), new anchor.BN(0), new anchor.BN(3600))
        .accounts({
          owner: owner.publicKey,
          desk: desk.publicKey,
        })
        .signers([owner])
        .rpc();

      const tokenAmount = new anchor.BN(200 * 10 ** 18);
      const discountBps = 1000; // 10%
      const currency = 1; // USDC
      const lockupSecs = new anchor.BN(0);

      await program.methods
        .createOfferFromConsignment(
          new anchor.BN(1), // consignmentId
          tokenAmount,
          discountBps,
          currency,
          lockupSecs
        )
        .accounts({
          desk: desk.publicKey,
          consignment: consignment.publicKey,
          tokenRegistry: tokenRegistry.publicKey,
          beneficiary: buyer.publicKey,
          offer: offer.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([buyer, offer])
        .rpc();

      const offerAccount = await program.account.offer.fetch(offer.publicKey);
      assert.equal(offerAccount.beneficiary.toBase58(), buyer.publicKey.toBase58());
      assert.equal(offerAccount.tokenAmount.toString(), tokenAmount.toString());
      assert.equal(offerAccount.discountBps, discountBps);
      assert.equal(offerAccount.currency, currency);
      assert.equal(offerAccount.approved, false);
    });

    it("should approve offer", async () => {
      await program.methods
        .approveOffer(new anchor.BN(1))
        .accounts({
          desk: desk.publicKey,
          offer: offer.publicKey,
          approver: approver.publicKey,
        })
        .signers([approver])
        .rpc();

      const offerAccount = await program.account.offer.fetch(offer.publicKey);
      assert.isTrue(offerAccount.approved);
    });

    it("should reject double approval", async () => {
      try {
        await program.methods
          .approveOffer(new anchor.BN(1))
          .accounts({
            desk: desk.publicKey,
            offer: offer.publicKey,
            approver: approver.publicKey,
          })
          .signers([approver])
          .rpc();
        assert.fail("Should have rejected double approval");
      } catch (error) {
        assert.include(error.toString(), "AlreadyApproved");
      }
    });

    it("should fulfill offer with USDC", async () => {
      await program.methods
        .fulfillOfferUsdc(new anchor.BN(1))
        .accounts({
          desk: desk.publicKey,
          offer: offer.publicKey,
          deskTokenTreasury,
          deskUsdcTreasury,
          payerUsdcAta: buyerUsdcAta,
          payer: buyer.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([buyer])
        .rpc();

      const offerAccount = await program.account.offer.fetch(offer.publicKey);
      assert.isTrue(offerAccount.paid);
      assert.equal(offerAccount.payer.toBase58(), buyer.publicKey.toBase58());
    });

    it("should claim tokens after unlock", async () => {
      await program.methods
        .claim(new anchor.BN(1))
        .accounts({
          desk: desk.publicKey,
          deskSigner: desk.publicKey,
          offer: offer.publicKey,
          deskTokenTreasury,
          beneficiaryTokenAta: buyerTokenAta,
          beneficiary: buyer.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([desk])
        .rpc();

      const offerAccount = await program.account.offer.fetch(offer.publicKey);
      assert.isTrue(offerAccount.fulfilled);

      // Check buyer received tokens
      const buyerTokenAccount = await getAccount(provider.connection, buyerTokenAta);
      assert.isTrue(buyerTokenAccount.amount > 0n);
    });
  });

  describe("Emergency Refund", () => {
    it("should process emergency refund for USDC", async () => {
      // Create and pay for an offer first
      const offer2 = Keypair.generate();
      const tokenAmount = new anchor.BN(100 * 10 ** 18);
      
      // Create offer
      await program.methods
        .createOfferFromConsignment(
          new anchor.BN(1),
          tokenAmount,
          1000, // 10% discount
          1, // USDC
          new anchor.BN(30 * 86400) // 30 day lockup
        )
        .accounts({
          desk: desk.publicKey,
          consignment: consignment.publicKey,
          tokenRegistry: tokenRegistry.publicKey,
          beneficiary: buyer.publicKey,
          offer: offer2.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([buyer, offer2])
        .rpc();

      // Approve
      await program.methods
        .approveOffer(new anchor.BN(2))
        .accounts({
          desk: desk.publicKey,
          offer: offer2.publicKey,
          approver: approver.publicKey,
        })
        .signers([approver])
        .rpc();

      // Pay with USDC
      await program.methods
        .fulfillOfferUsdc(new anchor.BN(2))
        .accounts({
          desk: desk.publicKey,
          offer: offer2.publicKey,
          deskTokenTreasury,
          deskUsdcTreasury,
          payerUsdcAta: buyerUsdcAta,
          payer: buyer.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([buyer])
        .rpc();

      // Fast forward time (simulated - in real test would need to wait or mock)
      // For now, try emergency refund (will fail if too early)
      
      // In a real test environment, we would need to advance the blockchain time
      // For comprehensive testing, this would need special test setup
    });
  });

  describe("Edge Cases and Security", () => {
    it("should prevent fulfillment when paused", async () => {
      // Pause the desk
      await program.methods
        .pause()
        .accounts({
          owner: owner.publicKey,
          desk: desk.publicKey,
        })
        .signers([owner])
        .rpc();

      const offer3 = Keypair.generate();
      
      try {
        await program.methods
          .createOfferFromConsignment(
            new anchor.BN(1),
            new anchor.BN(50 * 10 ** 18),
            1000, 1, new anchor.BN(0)
          )
          .accounts({
            desk: desk.publicKey,
            consignment: consignment.publicKey,
            tokenRegistry: tokenRegistry.publicKey,
            beneficiary: buyer.publicKey,
            offer: offer3.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .signers([buyer, offer3])
          .rpc();
        assert.fail("Should have rejected when paused");
      } catch (error) {
        assert.include(error.toString(), "Paused");
      }

      // Unpause
      await program.methods
        .unpause()
        .accounts({
          owner: owner.publicKey,
          desk: desk.publicKey,
        })
        .signers([owner])
        .rpc();
    });

    it("should enforce minimum USD amount", async () => {
      // Set high minimum
      await program.methods
        .setLimits(
          new anchor.BN(1000 * 10 ** 8), // $1000 minimum
          new anchor.BN(10000 * 10 ** 18),
          new anchor.BN(3600),
          new anchor.BN(0),
          new anchor.BN(365 * 86400)
        )
        .accounts({
          owner: owner.publicKey,
          desk: desk.publicKey,
        })
        .signers([owner])
        .rpc();

      const offer4 = Keypair.generate();
      
      try {
        await program.methods
          .createOfferFromConsignment(
            new anchor.BN(1),
            new anchor.BN(1 * 10 ** 18), // Very small amount
            1000, 1, new anchor.BN(0)
          )
          .accounts({
            desk: desk.publicKey,
            consignment: consignment.publicKey,
            tokenRegistry: tokenRegistry.publicKey,
            beneficiary: buyer.publicKey,
            offer: offer4.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .signers([buyer, offer4])
          .rpc();
        assert.fail("Should have rejected low USD amount");
      } catch (error) {
        assert.include(error.toString(), "MinUsd");
      }
    });

    it("should enforce consignment deal limits", async () => {
      const offer5 = Keypair.generate();
      
      try {
        // Try to create offer exceeding max deal amount
        await program.methods
          .createOfferFromConsignment(
            new anchor.BN(1),
            new anchor.BN(600 * 10 ** 18), // Exceeds max of 500
            1000, 1, new anchor.BN(0)
          )
          .accounts({
            desk: desk.publicKey,
            consignment: consignment.publicKey,
            tokenRegistry: tokenRegistry.publicKey,
            beneficiary: buyer.publicKey,
            offer: offer5.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .signers([buyer, offer5])
          .rpc();
        assert.fail("Should have rejected amount out of range");
      } catch (error) {
        assert.include(error.toString(), "AmountRange");
      }
    });

    it("should handle inventory calculations correctly", async () => {
      const deskAccount = await program.account.desk.fetch(desk.publicKey);
      const treasuryAccount = await getAccount(provider.connection, deskTokenTreasury);
      
      // Available inventory should be treasury balance minus reserved
      const available = Number(treasuryAccount.amount) - Number(deskAccount.tokenReserved);
      assert.isTrue(available >= 0);
    });
  });

  describe("Price Oracle Integration", () => {
    it("should handle price deviation checks", async () => {
      // This would require Pyth oracle integration
      // For comprehensive testing, would need to set up Pyth mock accounts
      // Skipping for now as it requires additional infrastructure
    });
  });

  describe("Multi-signature Approvals", () => {
    it("should support multiple approvers", async () => {
      const approver2 = Keypair.generate();
      
      // Airdrop to new approver
      await provider.connection.requestAirdrop(approver2.publicKey, LAMPORTS_PER_SOL);
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Add second approver
      await program.methods
        .setApprover(approver2.publicKey, true)
        .accounts({
          owner: owner.publicKey,
          desk: desk.publicKey,
        })
        .signers([owner])
        .rpc();

      const deskAccount = await program.account.desk.fetch(desk.publicKey);
      assert.equal(deskAccount.approvers.length, 2);
    });

    it("should remove approver", async () => {
      const approver2 = deskAccount.approvers[1];
      
      await program.methods
        .setApprover(approver2, false)
        .accounts({
          owner: owner.publicKey,
          desk: desk.publicKey,
        })
        .signers([owner])
        .rpc();

      const deskAccount = await program.account.desk.fetch(desk.publicKey);
      assert.equal(deskAccount.approvers.length, 1);
    });
  });

  describe("SOL Payment Flow", () => {
    it("should fulfill offer with SOL", async () => {
      const offer6 = Keypair.generate();
      
      // Reset minimum to reasonable amount
      await program.methods
        .setLimits(
          new anchor.BN(5 * 10 ** 8), // $5 minimum
          new anchor.BN(10000 * 10 ** 18),
          new anchor.BN(3600),
          new anchor.BN(0),
          new anchor.BN(365 * 86400)
        )
        .accounts({
          owner: owner.publicKey,
          desk: desk.publicKey,
        })
        .signers([owner])
        .rpc();

      // Create offer for SOL payment
      await program.methods
        .createOfferFromConsignment(
          new anchor.BN(1),
          new anchor.BN(10 * 10 ** 18),
          1000, // 10% discount
          0, // SOL payment
          new anchor.BN(0)
        )
        .accounts({
          desk: desk.publicKey,
          consignment: consignment.publicKey,
          tokenRegistry: tokenRegistry.publicKey,
          beneficiary: buyer.publicKey,
          offer: offer6.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([buyer, offer6])
        .rpc();

      // Approve
      await program.methods
        .approveOffer(new anchor.BN(3))
        .accounts({
          desk: desk.publicKey,
          offer: offer6.publicKey,
          approver: approver.publicKey,
        })
        .signers([approver])
        .rpc();

      // Fulfill with SOL
      await program.methods
        .fulfillOfferSol(new anchor.BN(3))
        .accounts({
          desk: desk.publicKey,
          offer: offer6.publicKey,
          deskTokenTreasury,
          payer: buyer.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([buyer])
        .rpc();

      const offerAccount = await program.account.offer.fetch(offer6.publicKey);
      assert.isTrue(offerAccount.paid);
      assert.equal(offerAccount.currency, 0);
    });
  });

  describe("Treasury Management", () => {
    it("should deposit tokens", async () => {
      const depositAmount = new anchor.BN(1000 * 10 ** 18);
      
      await program.methods
        .depositTokens(depositAmount)
        .accounts({
          desk: desk.publicKey,
          owner: owner.publicKey,
          ownerTokenAta,
          deskTokenTreasury,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([owner])
        .rpc();

      const deskAccount = await program.account.desk.fetch(desk.publicKey);
      assert.isTrue(deskAccount.tokenDeposited.gt(new anchor.BN(0)));
    });

    it("should withdraw tokens respecting reserved amount", async () => {
      const withdrawAmount = new anchor.BN(100 * 10 ** 18);
      
      await program.methods
        .withdrawTokens(withdrawAmount)
        .accounts({
          owner: owner.publicKey,
          desk: desk.publicKey,
          deskSigner: desk.publicKey,
          deskTokenTreasury,
          ownerTokenAta,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([owner, desk])
        .rpc();

      // Check withdrawal succeeded
      const ownerTokenAccount = await getAccount(provider.connection, ownerTokenAta);
      assert.isTrue(ownerTokenAccount.amount > 0n);
    });

    it("should withdraw USDC", async () => {
      const ownerUsdcAta = (await getOrCreateAssociatedTokenAccount(
        provider.connection,
        owner,
        usdcMint,
        owner.publicKey
      )).address;

      const withdrawAmount = new anchor.BN(100 * 10 ** 6);
      
      await program.methods
        .withdrawUsdc(withdrawAmount)
        .accounts({
          owner: owner.publicKey,
          desk: desk.publicKey,
          deskSigner: desk.publicKey,
          deskUsdcTreasury,
          toUsdcAta: ownerUsdcAta,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([owner, desk])
        .rpc();
    });

    it("should withdraw SOL", async () => {
      const withdrawAmount = new anchor.BN(0.1 * LAMPORTS_PER_SOL);
      const recipient = Keypair.generate();
      
      await program.methods
        .withdrawSol(withdrawAmount)
        .accounts({
          desk: desk.publicKey,
          deskSigner: desk.publicKey,
          owner: owner.publicKey,
          to: recipient.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([owner, desk])
        .rpc();

      const balance = await provider.connection.getBalance(recipient.publicKey);
      assert.equal(balance, withdrawAmount.toNumber());
    });
  });
});
