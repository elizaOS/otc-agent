import pkg from "@coral-xyz/anchor";
import type { Program } from "@coral-xyz/anchor";
import type { Otc } from "../target/types/otc";
const anchor: any = pkg as any;
const { BN } = anchor;
import { PublicKey, SystemProgram, Keypair } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync, createMint, getOrCreateAssociatedTokenAccount, mintTo } from "@solana/spl-token";
import { expect } from "chai";

describe("otc localnet smoke", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = (anchor.workspace as any).Otc as Program<Otc>;
  const airdrop = async (pk: any, lamports: number) => {
    const sig = await provider.connection.requestAirdrop(pk, lamports);
    await provider.connection.confirmTransaction(sig, "confirmed");
  };

  it("initializes desk and deposits tokens", async () => {
    const owner = Keypair.generate();
    const sig = await provider.connection.requestAirdrop(owner.publicKey, 2e9);
    await provider.connection.confirmTransaction(sig, "confirmed");
    const agent = Keypair.generate();
    await airdrop(agent.publicKey, 2e9);
    const desk = Keypair.generate();

    const tokenMint = await createMint(provider.connection, owner, owner.publicKey, null, 9);
    const usdcMint = await createMint(provider.connection, owner, owner.publicKey, null, 6);

    const deskTokenTreasury = getAssociatedTokenAddressSync(tokenMint, desk.publicKey, true);
    const deskUsdcTreasury = getAssociatedTokenAddressSync(usdcMint, desk.publicKey, true);
    await getOrCreateAssociatedTokenAccount(provider.connection, owner, tokenMint, desk.publicKey, true);
    await getOrCreateAssociatedTokenAccount(provider.connection, owner, usdcMint, desk.publicKey, true);

    await program.methods
      .initDesk(new BN(500000000), new BN(1800))
      .accounts({ desk: desk.publicKey, tokenMint, usdcMint, owner: owner.publicKey, agent: agent.publicKey, payer: owner.publicKey, systemProgram: SystemProgram.programId })
      .signers([owner, desk])
      .rpc();

    const ownerTokenAta = getAssociatedTokenAddressSync(tokenMint, owner.publicKey);
    await getOrCreateAssociatedTokenAccount(provider.connection, owner, tokenMint, owner.publicKey);
    await mintTo(provider.connection, owner, tokenMint, ownerTokenAta, owner, BigInt(1_000_000_000000000) as any);

    await program.methods.depositTokens(new BN("500000000000000")).accounts({ desk: desk.publicKey, owner: owner.publicKey, ownerTokenAta, deskTokenTreasury, tokenProgram: TOKEN_PROGRAM_ID }).signers([owner]).rpc();

    expect(true).to.eq(true);
  });
});


