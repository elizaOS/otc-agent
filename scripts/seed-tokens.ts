#!/usr/bin/env bun

async function seedTokens() {
  console.log("\n🌱 Seeding multi-token OTC marketplace...\n");
  
  const fs = await import("fs");
  const deploymentPath = "./contracts/deployments/eliza-otc-deployment.json";
  
  if (!fs.existsSync(deploymentPath)) {
    console.log("⚠️  Contracts not deployed yet, skipping seed");
    console.log("   Run 'npm run dev' to deploy contracts first");
    process.exit(0);
  }

  const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
  const elizaAddress = deployment.contracts.elizaToken;

  console.log(`✅ Using elizaOS token from deployment: ${elizaAddress}`);

  let retries = 5;
  while (retries > 0) {
    const healthCheck = await fetch("http://localhost:2222/api/devnet/address").catch(() => null);
    if (healthCheck && healthCheck.ok) {
      console.log("✅ Frontend is ready");
      break;
    }
    console.log(`⏳ Waiting for frontend... (${retries} retries left)`);
    await new Promise(r => setTimeout(r, 2000));
    retries--;
  }

  if (retries === 0) {
    console.log("⚠️  Frontend not ready, skipping seed");
    process.exit(0);
  }
  
  await fetch("http://localhost:2222/api/tokens", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      symbol: "elizaOS",
      name: "elizaOS",
      contractAddress: elizaAddress,
      chain: "base",
      decimals: 18,
      logoUrl: "/tokens/eliza.svg",
      description: "The native token of the elizaOS AI agent platform. Get discounted elizaOS with flexible lockup periods through our OTC marketplace.",
      website: "https://elizaos.ai",
      twitter: "https://twitter.com/elizaos",
    }),
  }).catch(() => console.log("Token may already exist"));

  console.log("✅ elizaOS token registered");

  const tokenId = `token-base-${elizaAddress.toLowerCase()}`;
  const ownerAddress = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
  
  await fetch("http://localhost:2222/api/consignments", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      tokenId,
      consignerAddress: ownerAddress,
      amount: "10000000000000000000000000",
      isNegotiable: true,
      minDiscountBps: 1000,
      maxDiscountBps: 2500,
      minLockupDays: 30,
      maxLockupDays: 365,
      minDealAmount: "1000000000000000000000",
      maxDealAmount: "1000000000000000000000000",
      isFractionalized: true,
      isPrivate: false,
      maxPriceVolatilityBps: 1000,
      maxTimeToExecuteSeconds: 1800,
      chain: "base",
    }),
  }).catch(() => console.log("Consignment may already exist"));

  console.log("✅ Created negotiable elizaOS consignment (10M tokens)");

  await fetch("http://localhost:2222/api/consignments", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      tokenId,
      consignerAddress: ownerAddress,
      amount: "5000000000000000000000000",
      isNegotiable: false,
      fixedDiscountBps: 1500,
      fixedLockupDays: 180,
      minDiscountBps: 0,
      maxDiscountBps: 0,
      minLockupDays: 0,
      maxLockupDays: 0,
      minDealAmount: "10000000000000000000000",
      maxDealAmount: "5000000000000000000000000",
      isFractionalized: true,
      isPrivate: false,
      maxPriceVolatilityBps: 500,
      maxTimeToExecuteSeconds: 1800,
      chain: "base",
    }),
  }).catch(() => console.log("Consignment may already exist"));

  console.log("✅ Created fixed-price elizaOS consignment (5M tokens)");
  console.log("\n🎉 Multi-token OTC marketplace seeded successfully!");
  console.log("   Visit http://localhost:2222 to see available deals\n");
}

seedTokens().catch((err) => {
  console.error("❌ Seed error:", err);
  process.exit(1);
});

