import { NextRequest, NextResponse } from "next/server";
import { QuoteService } from "@/services/database";
import { agentRuntime } from "@/lib/agent-runtime";

export async function GET(request: NextRequest) {
  try {
    // Ensure runtime init has run to create required tables
    try {
      await agentRuntime.getRuntime();
    } catch {}
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");

    if (!userId) {
      return NextResponse.json(
        { error: "userId parameter is required" },
        { status: 400 },
      );
    }

    // Pull the latest active quote for this user from DB
    const active = await QuoteService.getActiveQuotes();
    const quote = active.find((q) => q.userId === userId) || null;

    return NextResponse.json({ success: true, quote });
  } catch (error) {
    console.error("[Quote API] Error fetching latest quote:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch latest quote",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    // Ensure runtime init has run to create required tables
    try {
      await agentRuntime.getRuntime();
    } catch {}
    const body = await request.json();
    const { quoteId, beneficiary } = body;

    if (!quoteId || !beneficiary) {
      return NextResponse.json(
        { error: "quoteId and beneficiary are required" },
        { status: 400 },
      );
    }

    // Update the beneficiary and signature for this quote
    const updated = await QuoteService.setQuoteBeneficiary(
      quoteId,
      beneficiary,
    );

    return NextResponse.json({ success: true, quote: updated });
  } catch (error) {
    console.error("[Quote API] Error storing quote:", error);
    return NextResponse.json(
      {
        error: "Failed to store quote",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
