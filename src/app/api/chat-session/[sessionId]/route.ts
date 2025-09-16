import { NextRequest, NextResponse } from "next/server";
import { agentRuntime } from "../../../../lib/agent-runtime";

interface RouteParams {
  params: Promise<{
    sessionId: string;
  }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { sessionId } = await params;
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "50");

    console.log(`[API] Fetching messages for session: ${sessionId}`);

    // Get conversation details
    const conversation = await agentRuntime.getConversation(sessionId);

    if (!conversation) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    // Get messages for this conversation
    const messages = await agentRuntime.getConversationMessages(
      sessionId,
      limit,
    );

    // Transform messages to the expected format
    const formattedMessages = messages.map((msg) => {
      const content = JSON.parse(msg.content);
      return {
        id: msg.id,
        content: content.text || "",
        isAgent: msg.isAgent,
        userId: msg.userId,
        createdAt: msg.createdAt,
        metadata: content,
      };
    });

    return NextResponse.json({
      success: true,
      conversation,
      messages: formattedMessages,
      messageCount: formattedMessages.length,
    });
  } catch (error) {
    console.error(`[API] Error fetching session:`, error);
    return NextResponse.json(
      {
        error: "Failed to fetch session",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { sessionId } = await params;
    const body = await request.json();
    const { message, userId } = body;

    if (!userId) {
      return NextResponse.json(
        { error: "userId is required" },
        { status: 400 },
      );
    }

    if (!message || !message.text) {
      return NextResponse.json(
        { error: "message.text is required" },
        { status: 400 },
      );
    }

    console.log(
      `[API] Sending message to session: ${sessionId} from user: ${userId}`,
    );

    // Handle the message using our agent runtime
    const result = await agentRuntime.handleMessage(sessionId, userId, message);

    // Wait a moment for the agent response to be generated
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Get the latest messages including the agent response
    const messages = await agentRuntime.getConversationMessages(sessionId, 10);
    const latestMessages = messages.slice(-2); // Get last 2 messages (user + agent)

    return NextResponse.json({
      success: true,
      message: {
        id: result.id,
        content: message.text,
        userId,
        createdAt: result.createdAt,
      },
      agentResponse: latestMessages.find((m) => m.isAgent) || null,
    });
  } catch (error) {
    console.error("[API] Error sending message:", error);
    return NextResponse.json(
      {
        error: "Failed to send message",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
