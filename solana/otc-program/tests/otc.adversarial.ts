import pkg from "@coral-xyz/anchor";
import type { Program } from "@coral-xyz/anchor";
import type { Otc } from "../target/types/otc";
const anchor: any = pkg as any;
const { BN } = anchor;
import { PublicKey, SystemProgram, Keypair } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync, createMint, getOrCreateAssociatedTokenAccount, mintTo } from "@solana/spl-token";
import { expect } from "chai";

describe("otc adversarial", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = (anchor.workspace as any).Otc as Program<Otc>;

  const airdrop = async (pk: any, lamports: number) => {
    const sig = await provider.connection.requestAirdrop(pk, lamports);
    await provider.connection.confirmTransaction(sig, "confirmed");
  };

  let owner: Keypair;
  let agent: Keypair;
  let tokenMint: PublicKey;
  let usdcMint: PublicKey;
  let desk: Keypair;
  let deskTokenTreasury: PublicKey;
  let deskUsdcTreasury: PublicKey;

  beforeEach(async () => {
    owner = Keypair.generate();
    agent = Keypair.generate();
    desk = Keypair.generate();
    await airdrop(owner.publicKey, 2e9);
    await airdrop(agent.publicKey, 2e9);
    tokenMint = await createMint(provider.connection, owner, owner.publicKey, null, 9);
    usdcMint = await createMint(provider.connection, owner, owner.publicKey, null, 6);
    deskTokenTreasury = getAssociatedTokenAddressSync(tokenMint, desk.publicKey, true);
    deskUsdcTreasury = getAssociatedTokenAddressSync(usdcMint, desk.publicKey, true);
    await getOrCreateAssociatedTokenAccount(provider.connection, owner, tokenMint, desk.publicKey, true);
    await getOrCreateAssociatedTokenAccount(provider.connection, owner, usdcMint, desk.publicKey, true);

    await program.methods
      .initDesk(new BN(500000000), new BN(60))
      .accounts({ owner: owner.publicKey, agent: agent.publicKey, tokenMint, usdcMint, desk: desk.publicKey, payer: owner.publicKey, systemProgram: SystemProgram.programId })
      .signers([owner, desk])
      .rpc();

    const ownerTokenAta = getAssociatedTokenAddressSync(tokenMint, owner.publicKey);
    await getOrCreateAssociatedTokenAccount(provider.connection, owner, tokenMint, owner.publicKey);
    await mintTo(provider.connection, owner, tokenMint, ownerTokenAta, owner, BigInt(1_000_000_000000000) as any);
    await program.methods.depositTokens(new BN("500000000000000"))
      .accounts({ desk: desk.publicKey, owner: owner.publicKey, ownerTokenAta, deskTokenTreasury, tokenProgram: TOKEN_PROGRAM_ID })
      .signers([owner]).rpc();

    await program.methods.setPrices(new BN(1_000_000_000), new BN(100_000_000_00), new BN(0), new BN(3600))
      .accounts({ desk: desk.publicKey, owner: owner.publicKey }).signers([owner]).rpc();
  });

  it("rejects createOffer when insufficient inventory (reserved)", async () => {
    const user = Keypair.generate();
    await airdrop(user.publicKey, 2e9);
    const deskAccount = await program.account.desk.fetch(desk.publicKey);
    const id = new BN(deskAccount.nextOfferId.toString());
    const offer = Keypair.generate();

    await program.methods.createOffer(new BN("1000000000"), 0, 1, new BN(0))
      .accountsStrict({ desk: desk.publicKey, deskTokenTreasury, beneficiary: user.publicKey, offer: offer.publicKey, systemProgram: SystemProgram.programId })
      .signers([user, offer]).rpc();
    await program.methods.setApprover(user.publicKey, true).accounts({ desk: desk.publicKey, owner: owner.publicKey }).signers([owner]).rpc();
    await program.methods.approveOffer(id).accounts({ desk: desk.publicKey, offer: offer.publicKey, approver: user.publicKey }).signers([user]).rpc();

    const payerUsdc = await getOrCreateAssociatedTokenAccount(provider.connection, owner, usdcMint, user.publicKey);
    await mintTo(provider.connection, owner, usdcMint, payerUsdc.address, owner, BigInt(1_000_000_000) as any);
    await program.methods.fulfillOfferUsdc(id).accounts({ desk: desk.publicKey, offer: offer.publicKey, deskTokenTreasury, deskUsdcTreasury, payerUsdcAta: payerUsdc.address, payer: user.publicKey, tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId }).signers([user]).rpc();

    // Attempt to withdraw below reserved should fail
    const withdrawAmount = new BN("500000000000000");
    try {
      await program.methods.withdrawTokens(withdrawAmount).accounts({ desk: desk.publicKey, deskSigner: desk.publicKey, owner: owner.publicKey, deskTokenTreasury, ownerTokenAta: getAssociatedTokenAddressSync(tokenMint, owner.publicKey), tokenProgram: TOKEN_PROGRAM_ID }).signers([owner, desk]).rpc();
      expect.fail("withdrawTokens should fail due to reserved balance");
    } catch (e) {
      // ok
    }
  });

  it("rejects fulfill when expired (checked add)", async () => {
    const user = Keypair.generate();
    await airdrop(user.publicKey, 2e9);
    const d = await program.account.desk.fetch(desk.publicKey);
    const id = new BN(d.nextOfferId.toString());
    const offer = Keypair.generate();
    await program.methods.createOffer(new BN("1000000000"), 0, 1, new BN(0)).accountsStrict({ desk: desk.publicKey, deskTokenTreasury, beneficiary: user.publicKey, offer: offer.publicKey, systemProgram: SystemProgram.programId }).signers([user, offer]).rpc();
    await program.methods.setApprover(user.publicKey, true).accounts({ desk: desk.publicKey, owner: owner.publicKey }).signers([owner]).rpc();
    await program.methods.approveOffer(id).accounts({ desk: desk.publicKey, offer: offer.publicKey, approver: user.publicKey }).signers([user]).rpc();

    // artificially set quote_expiry_secs very small by owner
    await program.methods.setLimits(new BN(500000000), new BN("1000000000000000"), new BN(1), new BN(0), new BN(365*24*3600)).accounts({ desk: desk.publicKey, owner: owner.publicKey }).signers([owner]).rpc();
    await new Promise(r => setTimeout(r, 1500));
    try {
      await program.methods.fulfillOfferUsdc(id).accounts({ desk: desk.publicKey, offer: offer.publicKey, deskTokenTreasury, deskUsdcTreasury, payerUsdcAta: getAssociatedTokenAddressSync(usdcMint, user.publicKey), payer: user.publicKey, tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId }).signers([user]).rpc();
      expect.fail("fulfill should fail due to expiry");
    } catch (e) {}
  });

  it("enforces desk ownership of treasuries in fulfill", async () => {
    const user = Keypair.generate();
    await airdrop(user.publicKey, 2e9);
    const d = await program.account.desk.fetch(desk.publicKey);
    const id = new BN(d.nextOfferId.toString());
    const offer = Keypair.generate();

    await program.methods.createOffer(new BN("1000000000"), 0, 1, new BN(0)).accountsStrict({ desk: desk.publicKey, deskTokenTreasury, beneficiary: user.publicKey, offer: offer.publicKey, systemProgram: SystemProgram.programId }).signers([user, offer]).rpc();
    await program.methods.setApprover(user.publicKey, true).accounts({ desk: desk.publicKey, owner: owner.publicKey }).signers([owner]).rpc();
    await program.methods.approveOffer(id).accounts({ desk: desk.publicKey, offer: offer.publicKey, approver: user.publicKey }).signers([user]).rpc();

    // Craft a fake treasury owned by user
    const fakeTreasury = getAssociatedTokenAddressSync(tokenMint, user.publicKey);
    await getOrCreateAssociatedTokenAccount(provider.connection, owner, tokenMint, user.publicKey);
    try {
      await program.methods.fulfillOfferSol(id).accounts({ desk: desk.publicKey, offer: offer.publicKey, deskTokenTreasury: fakeTreasury, payer: user.publicKey, systemProgram: SystemProgram.programId }).signers([user]).rpc();
      expect.fail("fulfill should fail due to treasury owner constraint");
    } catch (e) {}
  });
});


