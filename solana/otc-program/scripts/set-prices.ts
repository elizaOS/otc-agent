import pkg from "@coral-xyz/anchor";
const anchor: any = pkg as any;
const { BN } = anchor;
import { PublicKey, Keypair } from "@solana/web3.js";
import * as fs from "fs";

async function setPrices() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.Otc as any;
  
  const ownerData = JSON.parse(fs.readFileSync("./id.json", "utf8"));
  const owner = Keypair.fromSecretKey(Uint8Array.from(ownerData));
  const desk = new PublicKey("7EN1rubej95WmoyupRXQ78PKU2hTCspKn2mVKN1vxuPp");
  
  console.log("💲 Setting prices on desk:", desk.toString());
  console.log("   Token: $1.00");
  console.log("   SOL: $100.00");
  
  const tx = await program.methods
    .setPrices(
      new BN(100_000_000), // $1.00 token (8 decimals: 1.00 * 10^8)
      new BN(10_000_000_000), // $100 SOL (8 decimals: 100 * 10^8)
      new BN(0),
      new BN(3600) // 1 hour max age
    )
    .accounts({
      desk,
      owner: owner.publicKey,
    })
    .signers([owner])
    .rpc();
  
  console.log("✅ Prices set successfully");
  console.log("   Transaction:", tx);
  
  // Verify
  const updated = await program.account.desk.fetch(desk);
  console.log("\n📊 Verified:");
  console.log("   Token USD Price:", updated.tokenUsdPrice8d?.toString());
  console.log("   SOL USD Price:", updated.solUsdPrice8d?.toString());
}

setPrices()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("❌ Error:", err);
    process.exit(1);
  });
