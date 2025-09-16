import { NextRequest, NextResponse } from "next/server";
import {
  createPublicClient,
  createWalletClient,
  http,
  privateKeyToAccount,
  type Abi,
  type Address,
} from "viem";
import { hardhat, base, baseSepolia } from "viem/chains";
import otcArtifact from "@/contracts/artifacts/contracts/OTC.sol/OTC.json";

// This should be called daily via a cron job (e.g., Vercel Cron or external scheduler)
// It checks for matured OTC and claims them on behalf of users

const OTC_ADDRESS = process.env.NEXT_PUBLIC_OTC_ADDRESS as Address;
const APPROVER_PRIVATE_KEY = process.env.APPROVER_PRIVATE_KEY as
  | `0x${string}`
  | undefined;
const CRON_SECRET = process.env.CRON_SECRET;

function getChain() {
  const env = process.env.NODE_ENV;
  const network = process.env.NETWORK || "hardhat";
  if (env === "production") return base;
  if (network === "base-sepolia") return baseSepolia;
  return hardhat;
}

export async function GET(request: NextRequest) {
  // Verify cron secret if using external scheduler
  const authHeader = request.headers.get("authorization");
  const cronSecret = CRON_SECRET;

  // Always require authentication in production
  if (!cronSecret && process.env.NODE_ENV === "production") {
    console.error("[Cron API] No CRON_SECRET configured in production");
    return NextResponse.json(
      { error: "Server configuration error" },
      { status: 500 },
    );
  }

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    console.warn("[Cron API] Unauthorized cron access attempt", {
      ip:
        request.headers.get("x-forwarded-for") ||
        request.headers.get("x-real-ip"),
      timestamp: new Date().toISOString(),
    });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!OTC_ADDRESS) {
    return NextResponse.json(
      { error: "Missing configuration" },
      { status: 500 },
    );
  }

  try {
    const chain = getChain();
    const publicClient = createPublicClient({ chain, transport: http() });
    const abi = otcArtifact.abi as Abi;

    // Enumerate all offers via nextOfferId
    const nextOfferId = (await publicClient.readContract({
      address: OTC_ADDRESS,
      abi,
      functionName: "nextOfferId",
    })) as bigint;

    const now = Math.floor(Date.now() / 1000);
    const maturedOffers: bigint[] = [];

    for (let i = 1n; i < nextOfferId; i++) {
      const offer = (await publicClient.readContract({
        address: OTC_ADDRESS,
        abi,
        functionName: "offers",
        args: [i],
      })) as any;

      // Matured = paid, not fulfilled, not cancelled, and unlockTime passed
      if (
        offer?.beneficiary &&
        offer.paid &&
        !offer.fulfilled &&
        !offer.cancelled &&
        Number(offer.unlockTime) > 0 &&
        Number(offer.unlockTime) <= now
      ) {
        maturedOffers.push(i);
      }
    }

    const result: {
      maturedOffers: string[];
      claimedOffers: string[];
      failedOffers: { id: string; error: string }[];
      txHash?: string;
    } = {
      maturedOffers: maturedOffers.map(String),
      claimedOffers: [],
      failedOffers: [],
    };

    // Execute autoClaim as approver if configured and there are matured offers
    if (maturedOffers.length > 0) {
      if (!APPROVER_PRIVATE_KEY) {
        return NextResponse.json(
          {
            success: false,
            error: "Missing APPROVER_PRIVATE_KEY",
            maturedOffers: result.maturedOffers,
            message:
              "Found matured offers but cannot claim without approver key",
          },
          { status: 500 },
        );
      }

      const account = privateKeyToAccount(APPROVER_PRIVATE_KEY);
      const walletClient = createWalletClient({
        account,
        chain,
        transport: http(),
      });

      // Chunk to avoid gas issues (e.g., 50 per tx)
      const chunkSize = 50;
      const chunks: bigint[][] = [];
      for (let i = 0; i < maturedOffers.length; i += chunkSize) {
        chunks.push(maturedOffers.slice(i, i + chunkSize));
      }

      for (const chunk of chunks) {
        try {
          const hash = await walletClient.writeContract({
            address: OTC_ADDRESS,
            abi,
            functionName: "autoClaim",
            args: [chunk],
            account,
          } as any);
          // wait for 1 confirmation
          await publicClient.waitForTransactionReceipt({ hash });
          result.txHash = hash;
          result.claimedOffers.push(...chunk.map(String));
        } catch (e: any) {
          result.failedOffers.push({
            id: chunk.map(String).join(","),
            error: e?.message || String(e),
          });
        }
      }
    }

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      ...result,
    });
  } catch (error) {
    console.error("[Cron API] Error checking matured deals:", error);
    return NextResponse.json(
      {
        error: "Failed to check matured deals",
        details:
          process.env.NODE_ENV === "production"
            ? "Internal server error"
            : error instanceof Error
              ? error.message
              : String(error),
      },
      { status: 500 },
    );
  }
}

// Also support POST for some cron services
export async function POST(request: NextRequest) {
  return GET(request);
}
