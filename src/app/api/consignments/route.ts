import { NextRequest, NextResponse } from "next/server";
import { ConsignmentDB } from "@/services/database";
import type { Chain } from "@/config/chains";
import { ConsignmentService } from "@/services/consignmentService";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tokenId = searchParams.get("tokenId");
  const chains = searchParams.getAll("chains") as Chain[];
  const negotiableTypes = searchParams.getAll("negotiableTypes");
  const isFractionalized = searchParams.get("isFractionalized");
  const consignerAddress = searchParams.get("consigner");
  const requesterAddress = searchParams.get("requester");

  // Get all consignments (we'll filter in memory for multi-select)
  const filters: Parameters<typeof ConsignmentDB.getAllConsignments>[0] = {};
  if (tokenId) filters.tokenId = tokenId;

  let consignments = await ConsignmentDB.getAllConsignments(filters);

  // Filter by chains if specified
  if (chains.length > 0) {
    consignments = consignments.filter((c) =>
      chains.includes(c.chain as Chain),
    );
  }

  // Filter by negotiable types if specified
  if (negotiableTypes.length > 0) {
    consignments = consignments.filter((c) => {
      const isNeg = c.isNegotiable;
      if (negotiableTypes.includes("negotiable") && isNeg) return true;
      if (negotiableTypes.includes("fixed") && !isNeg) return true;
      return false;
    });
  }

  // Filter by fractionalized if specified
  if (isFractionalized === "true") {
    consignments = consignments.filter((c) => c.isFractionalized);
  }

  if (consignerAddress) {
    consignments = consignments.filter(
      (c) =>
        c.consignerAddress.toLowerCase() === consignerAddress.toLowerCase(),
    );
  }

  if (requesterAddress) {
    const requester = requesterAddress.toLowerCase();
    consignments = consignments.filter((c) => {
      if (!c.isPrivate) return true;
      if (c.consignerAddress === requester) return true;
      if (c.allowedBuyers?.includes(requester)) return true;
      return false;
    });
  } else {
    consignments = consignments.filter((c) => !c.isPrivate);
  }

  return NextResponse.json({
    success: true,
    consignments,
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      tokenId,
      consignerAddress,
      amount,
      isNegotiable,
      fixedDiscountBps,
      fixedLockupDays,
      minDiscountBps,
      maxDiscountBps,
      minLockupDays,
      maxLockupDays,
      minDealAmount,
      maxDealAmount,
      isFractionalized,
      isPrivate,
      allowedBuyers,
      maxPriceVolatilityBps,
      maxTimeToExecuteSeconds,
      chain,
    } = body;

    if (!tokenId || !consignerAddress || !amount || !chain) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 },
      );
    }

    // Convert any number/string to BigInt-safe string (handles scientific notation)
    const toBigIntString = (value: string | number): string => {
      let num: number;
      
      if (typeof value === 'string') {
        num = Number(value);
        if (isNaN(num) || !isFinite(num)) {
          throw new Error(`Invalid number: ${value}`);
        }
        // If string has no decimal and no scientific notation, use it directly
        if (!value.includes('.') && !value.toLowerCase().includes('e')) {
          try {
            return BigInt(value).toString();
          } catch {
            // Fall through
          }
        }
      } else {
        num = value;
      }
      
      // Convert number to integer string (handling scientific notation)
      // Use Intl.NumberFormat to avoid scientific notation in output
      const floored = Math.floor(num);
      const formatted = new Intl.NumberFormat('en-US', {
        maximumFractionDigits: 0,
        useGrouping: false,
      }).format(floored);
      
      return formatted;
    };

    const service = new ConsignmentService();
    const consignment = await service.createConsignment({
      tokenId,
      consignerAddress,
      amount: toBigIntString(amount),
      isNegotiable,
      fixedDiscountBps,
      fixedLockupDays,
      minDiscountBps,
      maxDiscountBps,
      minLockupDays,
      maxLockupDays,
      minDealAmount: toBigIntString(minDealAmount),
      maxDealAmount: toBigIntString(maxDealAmount),
      isFractionalized,
      isPrivate,
      allowedBuyers,
      maxPriceVolatilityBps,
      maxTimeToExecuteSeconds,
      chain,
    });

    return NextResponse.json({
      success: true,
      consignment,
    });
  } catch (error) {
    console.error("Error creating consignment:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create consignment" },
      { status: 500 },
    );
  }
}
