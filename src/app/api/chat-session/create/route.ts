import { NextRequest, NextResponse } from "next/server";
import { agentRuntime } from "../../../../lib/agent-runtime";

export async function POST(request: NextRequest) {
  try {
    const { userId, initialMessage } = await request.json();

    if (!userId) {
      return NextResponse.json(
        { error: "userId is required" },
        { status: 400 },
      );
    }

    // Create a new conversation using our agent runtime
    const sessionId = await agentRuntime.createConversation(userId);

    console.log(
      `[API] Created new chat session: ${sessionId} for user: ${userId}`,
    );

    // If there's an initial message, send it
    if (initialMessage) {
      try {
        await agentRuntime.handleMessage(sessionId, userId, {
          text: initialMessage,
        });
      } catch (error) {
        console.error("[API] Error handling initial message:", error);
        // Continue even if initial message fails
      }
    }

    return NextResponse.json({
      success: true,
      sessionId,
      userId,
      createdAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[API] Error creating chat session:", error);
    return NextResponse.json(
      {
        error: "Failed to create chat session",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
