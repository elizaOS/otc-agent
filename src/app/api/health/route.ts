import { NextResponse } from "next/server";
import { agentRuntime } from "../../../lib/agent-runtime";

export async function GET() {
  try {
    const isReady = agentRuntime.isReady();

    return NextResponse.json({
      status: "ok",
      agentReady: isReady,
      timestamp: new Date().toISOString(),
      environment: {
        hasGroqKey: !!process.env.GROQ_API_KEY,
        database: "SQLite (Drizzle)",
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: "error",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
