import { NextRequest, NextResponse } from "next/server";
import { agentRuntime } from "@/lib/agent-runtime";
import { v4 as uuidv4 } from "uuid";
import { db, messages, conversations } from "@/db";
import { eq } from "drizzle-orm";
import { quoteAction } from "@/lib/plugin-otc-desk/actions/quote";

// GET /api/conversations - Get user's conversations
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");

    if (!userId) {
      return NextResponse.json(
        { error: "userId is required" },
        { status: 400 },
      );
    }

    const conversations = await agentRuntime.getUserConversations(userId);

    return NextResponse.json({
      success: true,
      conversations,
    });
  } catch (error) {
    console.error("[Conversations API] Error getting conversations:", error);
    return NextResponse.json(
      {
        error: "Failed to get conversations",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

// POST /api/conversations - Create new conversation
export async function POST(request: NextRequest) {
  try {
    console.log("[Conversations API] POST request received");
    const body = await request.json();
    const { userId } = body;
    console.log("[Conversations API] userId:", userId);

    if (!userId) {
      return NextResponse.json(
        { error: "userId is required" },
        { status: 400 },
      );
    }

    const conversationId = await agentRuntime.createConversation(userId);
    console.log("[Conversations API] Created conversation:", conversationId);

    // Generate and send an initial agent offer message for this conversation
    try {
      const runtime = await agentRuntime.getRuntime();

      // Prepare a minimal Memory-like object for the action
      const memory: any = {
        id: uuidv4(),
        content: {
          text: "create quote for 200000 ElizaOS at 10% discount payable in USDC",
        },
        userId,
        agentId: runtime.agentId,
        roomId: conversationId,
        createdAt: Date.now(),
      };

      let agentResponseText = "";
      await (quoteAction.handler as any)(
        runtime as any,
        memory,
        undefined as any,
        {},
        (async (result: { text?: string }) => {
          agentResponseText = result?.text || "";
          return [] as any;
        }) as any,
      );

      if (agentResponseText && agentResponseText.trim().length > 0) {
        // Insert the agent message so the client sees the initial offer immediately
        const agentMessage = {
          id: uuidv4(),
          conversationId,
          userId: "otc-desk-agent",
          agentId: "otc-desk-agent",
          content: JSON.stringify({ text: agentResponseText, type: "agent" }),
          isAgent: true,
        } as any;

        await db.insert(messages).values(agentMessage);
        await db
          .update(conversations)
          .set({ lastMessageAt: new Date(), updatedAt: new Date() })
          .where(eq(conversations.id, conversationId));
      }
    } catch (initErr) {
      console.warn(
        "[Conversations API] Failed to create initial offer message:",
        initErr,
      );
      // Continue anyway; chat can still proceed without initial offer
    }

    return NextResponse.json({
      success: true,
      conversationId,
      createdAt: Date.now(),
    });
  } catch (error) {
    console.error("[Conversations API] Detailed error:", error);
    console.error(
      "[Conversations API] Error stack:",
      error instanceof Error ? error.stack : "No stack",
    );
    return NextResponse.json(
      {
        error: "Failed to create conversation",
        details: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
      },
      { status: 500 },
    );
  }
}
