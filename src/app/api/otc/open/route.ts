import { NextResponse } from "next/server";
import { createPublicClient, http, type Abi, type Address } from "viem";
import { hardhat, base, baseSepolia } from "viem/chains";
import otcArtifact from "@/contracts/artifacts/contracts/OTC.sol/OTC.json";

function getChain() {
  const env = process.env.NODE_ENV;
  const network = process.env.NETWORK || "hardhat";
  if (env === "production") return base;
  if (network === "base-sepolia") return baseSepolia;
  return hardhat;
}

export async function GET() {
  try {
    const OTC_ADDRESS = process.env.NEXT_PUBLIC_OTC_ADDRESS as
      | Address
      | undefined;
    if (!OTC_ADDRESS) {
      return NextResponse.json({ offers: [] });
    }

    const chain = getChain();
    const publicClient = createPublicClient({ chain, transport: http() });
    const abi = otcArtifact.abi as Abi;

    // Enumerate open offers via getOpenOfferIds
    const openOfferIds = (await publicClient.readContract({
      address: OTC_ADDRESS,
      abi,
      functionName: "getOpenOfferIds",
      args: [],
    } as any)) as bigint[];

    const offers = await Promise.all(
      (openOfferIds || []).map(async (id) => {
        if (!id) return null;
        const o = (await publicClient.readContract({
          address: OTC_ADDRESS,
          abi,
          functionName: "offers",
          args: [id],
        } as any)) as any;
        const now = Math.floor(Date.now() / 1000);
        const unlocksInSeconds = Math.max(0, Number(o.unlockTime) - now);
        return {
          id: id.toString(),
          beneficiary: o.beneficiary,
          tokenAmount: o.tokenAmount.toString(),
          discountBps: Number(o.discountBps),
          createdAt: Number(o.createdAt),
          unlockTime: Number(o.unlockTime),
          priceUsdPerToken: Number(o.priceUsdPerToken),
          currency: Number(o.currency) === 0 ? "ETH" : "USDC",
          approved: Boolean(o.approved),
          paid: Boolean(o.paid),
          fulfilled: Boolean(o.fulfilled),
          cancelled: Boolean(o.cancelled),
          amountPaid: o.amountPaid.toString(),
          unlocksInSeconds,
          isMature: unlocksInSeconds === 0,
        };
      }),
    );
    const items = (offers || []).filter((x): x is NonNullable<typeof x> => x !== null);
    return NextResponse.json({ offers: items });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
