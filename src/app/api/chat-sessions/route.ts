import { NextRequest, NextResponse } from "next/server";
import { agentRuntime } from "../../../lib/agent-runtime";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");

    if (!userId) {
      return NextResponse.json(
        { error: "userId parameter is required" },
        { status: 400 },
      );
    }

    // Get user's conversations from our database
    console.log(`[API] Fetching conversations for user: ${userId}`);

    const conversations = await agentRuntime.getUserConversations(userId);

    // Transform conversations to include additional metadata
    const sessions = await Promise.all(
      conversations.map(async (conv) => {
        try {
          // Get messages for this conversation to find the first message and count
          const messages = await agentRuntime.getConversationMessages(
            conv.id,
            50,
          );

          const firstUserMessage = messages.find((msg) => !msg.isAgent);
          const lastMessage = messages[messages.length - 1];

          return {
            id: conv.id,
            title:
              conv.title ||
              firstUserMessage?.content?.substring(0, 50) ||
              "New Chat",
            messageCount: messages.length,
            lastActivity: conv.lastMessageAt || conv.createdAt,
            preview: lastMessage
              ? JSON.parse(lastMessage.content).text?.substring(0, 100)
              : "",
            isFromAgent: lastMessage?.isAgent || false,
            createdAt: conv.createdAt,
          };
        } catch (error) {
          console.error(
            `[API] Error processing conversation ${conv.id}:`,
            error,
          );
          return {
            id: conv.id,
            title: conv.title || "New Chat",
            messageCount: 0,
            lastActivity: conv.lastMessageAt || conv.createdAt,
            preview: "",
            isFromAgent: false,
            createdAt: conv.createdAt,
          };
        }
      }),
    );

    // Sort by last activity (most recent first)
    sessions.sort(
      (a, b) =>
        new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime(),
    );

    return NextResponse.json({
      success: true,
      sessions,
      totalSessions: sessions.length,
    });
  } catch (error) {
    console.error("[API] Error fetching chat sessions:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch chat sessions",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
