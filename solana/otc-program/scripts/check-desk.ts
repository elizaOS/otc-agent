import pkg from "@coral-xyz/anchor";
const anchor: any = pkg as any;
import { PublicKey, Keypair } from "@solana/web3.js";
import * as fs from "fs";

async function check() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.Otc as any;
  
  const desk = new PublicKey("7EN1rubej95WmoyupRXQ78PKU2hTCspKn2mVKN1vxuPp");
  const data = await program.account.desk.fetch(desk);
  
  console.log("Full desk data:", JSON.stringify(data, null, 2));
}

check().catch(console.error);
