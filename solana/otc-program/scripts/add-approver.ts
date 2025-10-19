import pkg from "@coral-xyz/anchor";
const anchor: any = pkg as any;
import { PublicKey, Keypair } from "@solana/web3.js";
import * as fs from "fs";

async function addApprover() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.Otc as any;
  
  const ownerData = JSON.parse(fs.readFileSync("./id.json", "utf8"));
  const owner = Keypair.fromSecretKey(Uint8Array.from(ownerData));
  const desk = new PublicKey("7EN1rubej95WmoyupRXQ78PKU2hTCspKn2mVKN1vxuPp");
  
  console.log("Adding owner as approver...");
  console.log("  Owner:", owner.publicKey.toString());
  console.log("  Desk:", desk.toString());
  
  const tx = await program.methods
    .setApprover(owner.publicKey, true)
    .accounts({
      desk,
      owner: owner.publicKey,
    })
    .signers([owner])
    .rpc();
  
  console.log("✅ Owner added as approver, tx:", tx);
}

addApprover()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("❌ Error:", err);
    process.exit(1);
  });
