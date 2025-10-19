import pkg from "@coral-xyz/anchor";
const anchor: any = pkg as any;
import { PublicKey } from "@solana/web3.js";

async function verify() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.Otc as any;
  
  const desk = new PublicKey("7EN1rubej95WmoyupRXQ78PKU2hTCspKn2mVKN1vxuPp");
  const data = await program.account.desk.fetch(desk);
  
  const now = Math.floor(Date.now() / 1000);
  const pricesAge = now - parseInt(data.pricesUpdatedAt.toString(), 16);
  const maxAge = parseInt(data.maxPriceAgeSecs.toString(), 16);
  const tokenPrice = parseInt(data.tokenUsdPrice8D.toString(), 16) / 1e8;
  const solPrice = parseInt(data.solUsdPrice8D.toString(), 16) / 1e8;
  const tokenBalance = parseInt(data.tokenDeposited.toString(), 16);
  const reserved = parseInt(data.tokenReserved.toString(), 16);
  const available = tokenBalance - reserved;
  
  console.log("📊 LOCALNET READINESS CHECK");
  console.log("===========================\n");
  
  console.log("✅ Prices:");
  console.log(`   Token: $${tokenPrice.toFixed(2)}`);
  console.log(`   SOL: $${solPrice.toFixed(2)}`);
  console.log(`   Age: ${pricesAge}s (max: ${maxAge}s)`);
  console.log(`   Status: ${pricesAge < maxAge ? "FRESH ✅" : "STALE ❌"}\n`);
  
  console.log("✅ Inventory:");
  console.log(`   Available: ${available} tokens`);
  console.log(`   Reserved: ${reserved} tokens`);
  console.log(`   Status: ${available > 0 ? "READY ✅" : "EMPTY ❌"}\n`);
  
  console.log("✅ Approvers:");
  console.log(`   Count: ${data.approvers.length}`);
  console.log(`   List: ${data.approvers.map((a: any) => a.toString().slice(0, 8)).join(", ")}\n`);
  
  console.log("✅ Configuration:");
  console.log(`   Paused: ${data.paused ? "YES ❌" : "NO ✅"}`);
  console.log(`   Next Offer ID: ${parseInt(data.nextOfferId.toString(), 16)}\n`);
  
  if (pricesAge < maxAge && available > 0 && !data.paused && data.approvers.length > 0) {
    console.log("🎉 LOCALNET READY FOR TRADING");
  } else {
    console.log("⚠️  LOCALNET NOT READY - check items above");
    process.exit(1);
  }
}

verify().catch((err) => {
  console.error("❌ Verification failed:", err.message);
  process.exit(1);
});
