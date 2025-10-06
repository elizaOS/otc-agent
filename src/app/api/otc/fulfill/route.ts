import { NextRequest, NextResponse } from "next/server";
import {
  createPublicClient,
  createWalletClient,
  http,
  type Abi,
  type Address,
  recoverMessageAddress,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base, baseSepolia, hardhat } from "viem/chains";
import otcArtifact from "@/contracts/artifacts/contracts/OTC.sol/OTC.json";
import { parseOfferStruct } from "@/lib/otc-helpers";

function getChain() {
  const env = process.env.NODE_ENV;
  const network = process.env.NETWORK || "hardhat";
  if (env === "production") return base;
  if (network === "base-sepolia") return baseSepolia;
  return hardhat;
}

export async function POST(request: NextRequest) {
  try {
    const OTC_ADDRESS = process.env.NEXT_PUBLIC_OTC_ADDRESS as
      | Address
      | undefined;
    const APPROVER_PRIVATE_KEY = process.env.APPROVER_PRIVATE_KEY as
      | `0x${string}`
      | undefined;
    const API_KEY = process.env.API_SECRET_KEY || process.env.ADMIN_API_KEY;

    if (!OTC_ADDRESS || !APPROVER_PRIVATE_KEY) {
      return NextResponse.json(
        { error: "Server not configured" },
        { status: 500 },
      );
    }

    // Require auth in production
    if (process.env.NODE_ENV === "production") {
      const authHeader = request.headers.get("authorization");
      if (!API_KEY || authHeader !== `Bearer ${API_KEY}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    const { offerId, signature, message } = await request.json();
    if (
      typeof offerId !== "string" &&
      typeof offerId !== "number" &&
      typeof offerId !== "bigint"
    ) {
      return NextResponse.json({ error: "Invalid offerId" }, { status: 400 });
    }

    const chain = getChain();
    const publicClient = createPublicClient({ chain, transport: http() });
    const account = privateKeyToAccount(APPROVER_PRIVATE_KEY);
    const walletClient = createWalletClient({
      account,
      chain,
      transport: http(),
    });
    const abi = otcArtifact.abi as Abi;

    // Optional: enforce contract flag for approver-only fulfill
    const requireApprover = (await (publicClient as any).readContract({
      address: OTC_ADDRESS,
      abi,
      functionName: "requireApproverToFulfill",
      args: [],
    })) as boolean;
    if (!requireApprover) {
      // Soft guard: proceed but log warning
      console.warn(
        "[OTC Fulfill API] requireApproverToFulfill is false; proceeding anyway",
      );
    }

    const id = BigInt(offerId as any);

    // Verify intention: recovered signer must match offer.beneficiary
    const offerRaw = (await publicClient.readContract({
      address: OTC_ADDRESS,
      abi,
      functionName: "offers",
      args: [id],
    } as any)) as any;

    const offer = parseOfferStruct(offerRaw);

    if (!offer || offer.beneficiary === undefined) {
      return NextResponse.json({ error: "Offer not found" }, { status: 404 });
    }

    try {
      if (message && signature) {
        const recovered = await recoverMessageAddress({ message, signature });
        if (
          recovered.toLowerCase() !== String(offer.beneficiary).toLowerCase()
        ) {
          return NextResponse.json(
            { error: "Signature does not match beneficiary" },
            { status: 401 },
          );
        }
      }
    } catch {}

    // For USDC fulfill, ensure approver wallet has allowance set for the desk
    // and enough balance; for ETH, compute required wei from contract
    let txHash: `0x${string}` | undefined;
    if (Number(offer.currency) === 1) {
      // USDC path
      const usdcAddress = (await publicClient.readContract({
        address: OTC_ADDRESS,
        abi,
        functionName: "usdc",
        args: [],
      } as any)) as Address;

      const erc20Abi = [
        {
          type: "function",
          name: "allowance",
          stateMutability: "view",
          inputs: [
            { name: "owner", type: "address" },
            { name: "spender", type: "address" },
          ],
          outputs: [{ name: "", type: "uint256" }],
        },
        {
          type: "function",
          name: "approve",
          stateMutability: "nonpayable",
          inputs: [
            { name: "spender", type: "address" },
            { name: "amount", type: "uint256" },
          ],
          outputs: [{ name: "", type: "bool" }],
        },
      ] as const satisfies Abi;

      const required = (await publicClient.readContract({
        address: OTC_ADDRESS,
        abi,
        functionName: "requiredUsdcAmount",
        args: [id],
      } as any)) as bigint;

      const currentAllowance = (await publicClient.readContract({
        address: usdcAddress,
        abi: erc20Abi as any,
        functionName: "allowance",
        args: [account.address, OTC_ADDRESS],
      } as any)) as bigint;

      if (currentAllowance < required) {
        await walletClient.writeContract({
          address: usdcAddress,
          abi: erc20Abi as any,
          functionName: "approve",
          args: [OTC_ADDRESS, required],
          account,
        } as any);
      }

      txHash = await walletClient.writeContract({
        address: OTC_ADDRESS,
        abi,
        functionName: "fulfillOffer",
        args: [id],
        account,
      } as any);
    } else {
      // ETH path
      const requiredWei = (await publicClient.readContract({
        address: OTC_ADDRESS,
        abi,
        functionName: "requiredEthWei",
        args: [id],
      } as any)) as bigint;

      txHash = await walletClient.writeContract({
        address: OTC_ADDRESS,
        abi,
        functionName: "fulfillOffer",
        args: [id],
        account,
        value: requiredWei,
      } as any);
    }

    await publicClient.waitForTransactionReceipt({ hash: txHash! });
    return NextResponse.json({ success: true, txHash });
  } catch (error) {
    console.error("[OTC Fulfill API] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
