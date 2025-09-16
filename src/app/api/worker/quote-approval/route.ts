import { NextRequest, NextResponse } from "next/server";
import {
  startQuoteApprovalWorker,
  stopQuoteApprovalWorker,
} from "@/services/quoteApprovalWorker";

// API endpoint to manage the quote approval worker
// POST /api/worker/quote-approval?action=start|stop

export async function POST(request: NextRequest) {
  try {
    // Enforce admin authorization
    const authHeader = request.headers.get("authorization");
    const apiKey = process.env.API_SECRET_KEY || process.env.ADMIN_API_KEY;

    // Always require authentication in production
    if (!apiKey && process.env.NODE_ENV === "production") {
      console.error("[Worker API] No API key configured in production");
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 },
      );
    }

    if (apiKey && authHeader !== `Bearer ${apiKey}`) {
      console.warn("[Worker API] Unauthorized access attempt", {
        ip:
          request.headers.get("x-forwarded-for") ||
          request.headers.get("x-real-ip"),
      });
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Try to get action from query params or body
    const { searchParams } = new URL(request.url);
    let action = searchParams.get("action");

    // If not in query params, try body
    if (!action) {
      try {
        const body = await request.json();
        action = body.action;
      } catch {
        // Body parsing failed, action remains null
      }
    }

    if (action === "start") {
      // Allow passing approver key for test/dev
      try {
        const body = await request.json();
        if (
          body?.approverPrivateKey &&
          typeof body.approverPrivateKey === "string"
        ) {
          process.env.APPROVER_PRIVATE_KEY = body.approverPrivateKey as string;
        }
      } catch {}
      startQuoteApprovalWorker();
      return NextResponse.json({
        success: true,
        message: "Quote approval worker started",
      });
    } else if (action === "stop") {
      stopQuoteApprovalWorker();
      return NextResponse.json({
        success: true,
        message: "Quote approval worker stopped",
      });
    } else {
      return NextResponse.json(
        {
          error: "Invalid action. Use ?action=start or ?action=stop",
        },
        { status: 400 },
      );
    }
  } catch (error) {
    console.error("Error managing quote approval worker:", error);
    return NextResponse.json(
      {
        error: "Failed to manage worker",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}

// GET endpoint to check worker status
export async function GET(request: NextRequest) {
  // Enforce admin authorization
  const authHeader = request.headers.get("authorization");
  const apiKey = process.env.API_SECRET_KEY || process.env.ADMIN_API_KEY;

  // Always require authentication in production
  if (!apiKey && process.env.NODE_ENV === "production") {
    console.error("[Worker API] No API key configured in production");
    return NextResponse.json(
      { error: "Server configuration error" },
      { status: 500 },
    );
  }

  if (apiKey && authHeader !== `Bearer ${apiKey}`) {
    console.warn("[Worker API] Unauthorized status check attempt");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // In a real implementation, you'd check if the worker is actually running
  // For now, we'll return a simple status
  return NextResponse.json({
    status: "unknown",
    message: "Worker status checking not yet implemented",
  });
}
