import { NextRequest, NextResponse } from "next/server";

// Compatibility endpoint to support older tests calling /api/eliza/message
// Proxies to the new conversation APIs: creates a conversation if missing,
// then posts the message and returns the agent's text (if any) and raw payload.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, message } = body || {};

    if (!userId || !message || typeof message !== "string") {
      return NextResponse.json(
        { error: "userId and message are required" },
        { status: 400 },
      );
    }

    const origin = request.nextUrl.origin;
    // Create conversation
    const createRes = await fetch(`${origin}/api/conversations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
      cache: "no-store",
    });
    if (!createRes.ok) {
      const text = await createRes.text();
      return NextResponse.json(
        { error: "Failed to create conversation", details: text },
        { status: 500 },
      );
    }
    const createData = await createRes.json();
    const conversationId = createData.conversationId;

    // Send message
    const msgRes = await fetch(
      `${origin}/api/conversations/${conversationId}/messages`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, text: message }),
        cache: "no-store",
      },
    );
    if (!msgRes.ok) {
      const text = await msgRes.text();
      return NextResponse.json(
        { error: "Failed to send message", details: text },
        { status: 500 },
      );
    }
    const msgData = await msgRes.json();

    return NextResponse.json({
      success: true,
      conversationId,
      message: msgData?.message,
      text: (msgData?.message?.content?.text as string) || "",
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Compat endpoint failed",
        details: error instanceof Error ? error.message : "Unknown",
      },
      { status: 500 },
    );
  }
}
