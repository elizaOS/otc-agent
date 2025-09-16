import { NextRequest, NextResponse } from "next/server";
import { agentRuntime } from "@/lib/agent-runtime";

// Test utilities
async function testEndpoint(
  url: string,
  options?: RequestInit,
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options?.headers,
      },
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: `HTTP ${response.status}: ${JSON.stringify(data)}`,
      };
    }

    return { success: true, data };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// GET /api/test - Run comprehensive tests
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const baseUrl = searchParams.get("baseUrl") || "http://localhost:3000";

  const testResults: any[] = [];
  let allTestsPassed = true;

  // Test 1: Health Check
  {
    const result = await testEndpoint(`${baseUrl}/api/health`);
    const passed = result.success && result.data?.pong === true;
    testResults.push({
      test: "Health Check",
      passed,
      result: result.data,
      error: result.error,
    });
    if (!passed) allTestsPassed = false;
  }

  // Test 2: Create Conversation
  let conversationId: string | undefined;
  {
    const result = await testEndpoint(`${baseUrl}/api/conversations`, {
      method: "POST",
      body: JSON.stringify({ userId: "test-user-123" }),
    });
    const passed = result.success && result.data?.conversationId;
    conversationId = result.data?.conversationId;
    testResults.push({
      test: "Create Conversation",
      passed,
      conversationId,
      result: result.data,
      error: result.error,
    });
    if (!passed) allTestsPassed = false;
  }

  // Test 3: Send Message
  if (conversationId) {
    const result = await testEndpoint(
      `${baseUrl}/api/conversations/${conversationId}/messages`,
      {
        method: "POST",
        body: JSON.stringify({
          userId: "test-user-123",
          text: "Quote me a otc for AI16Z",
        }),
      },
    );
    const passed = result.success && result.data?.message;
    testResults.push({
      test: "Send Message",
      passed,
      messageId: result.data?.message?.id,
      result: result.data,
      error: result.error,
    });
    if (!passed) allTestsPassed = false;
  }

  // Test 4: Get Messages (with retry for agent response)
  if (conversationId) {
    let messages: any[] = [];
    let retries = 5;
    let agentResponded = false;

    while (retries > 0 && !agentResponded) {
      await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait 1 second

      const result = await testEndpoint(
        `${baseUrl}/api/conversations/${conversationId}/messages`,
      );

      if (result.success && result.data?.messages) {
        messages = result.data.messages;
        agentResponded = messages.some((m: any) => m.isAgent);
      }

      retries--;
    }

    const passed = messages.length > 0 && agentResponded;
    testResults.push({
      test: "Get Messages (with agent response)",
      passed,
      messageCount: messages.length,
      hasAgentResponse: agentResponded,
      messages: messages.slice(0, 3), // Show first 3 messages
    });
    if (!passed) allTestsPassed = false;
  }

  // Test 5: Get Conversation Details
  if (conversationId) {
    const result = await testEndpoint(
      `${baseUrl}/api/conversations/${conversationId}`,
    );
    const passed = result.success && result.data?.messages;
    testResults.push({
      test: "Get Conversation Details",
      passed,
      messageCount: result.data?.messages?.length,
      result: result.data,
      error: result.error,
    });
    if (!passed) allTestsPassed = false;
  }

  // Test 6: List User Conversations
  {
    const result = await testEndpoint(
      `${baseUrl}/api/conversations?userId=test-user-123`,
    );
    const passed = result.success && Array.isArray(result.data?.conversations);
    testResults.push({
      test: "List User Conversations",
      passed,
      conversationCount: result.data?.conversations?.length,
      result: result.data,
      error: result.error,
    });
    if (!passed) allTestsPassed = false;
  }

  // Test 7: Direct Runtime Test
  {
    try {
      const isReady = agentRuntime.isReady();
      const testConvId =
        await agentRuntime.createConversation("direct-test-user");
      await agentRuntime.handleMessage(testConvId, "direct-test-user", {
        text: "Hello, can you help me with an OTC deal?",
      });
      const messages = await agentRuntime.getConversationMessages(testConvId);

      const passed = isReady && testConvId && messages.length >= 2; // User message + agent response
      testResults.push({
        test: "Direct Runtime Test",
        passed,
        runtimeReady: isReady,
        conversationCreated: !!testConvId,
        messageCount: messages.length,
        agentResponded: messages.some((m) => m.isAgent),
      });
      if (!passed) allTestsPassed = false;
    } catch (error) {
      testResults.push({
        test: "Direct Runtime Test",
        passed: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
      allTestsPassed = false;
    }
  }

  // Test 8: OTC Quote Test
  if (conversationId) {
    const result = await testEndpoint(
      `${baseUrl}/api/conversations/${conversationId}/messages`,
      {
        method: "POST",
        body: JSON.stringify({
          userId: "test-user-123",
          text: "Give me a quote for ElizaOS tokens",
        }),
      },
    );

    // Wait for response
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const messagesResult = await testEndpoint(
      `${baseUrl}/api/conversations/${conversationId}/messages?afterTimestamp=0`,
    );

    const messages = messagesResult.data?.messages || [];
    const lastAgentMessage = [...messages]
      .reverse()
      .find((m: any) => m.isAgent);
    const hasQuoteInfo =
      lastAgentMessage?.content?.text?.toLowerCase().includes("shaw") &&
      (lastAgentMessage?.content?.text?.toLowerCase().includes("price") ||
        lastAgentMessage?.content?.text?.toLowerCase().includes("quote"));

    const passed = result.success && hasQuoteInfo;
    testResults.push({
      test: "OTC Quote Test",
      passed,
      hasQuoteInfo,
      agentResponse: lastAgentMessage?.content?.text?.substring(0, 200) + "...",
    });
    if (!passed) allTestsPassed = false;
  }

  // Generate summary
  const summary = {
    totalTests: testResults.length,
    passed: testResults.filter((t) => t.passed).length,
    failed: testResults.filter((t) => !t.passed).length,
    allPassed: allTestsPassed,
    timestamp: new Date().toISOString(),
    environment: {
      baseUrl,
      runtimeVersion: "simple",
    },
  };

  return NextResponse.json({
    success: allTestsPassed,
    summary,
    testResults,
    recommendation: allTestsPassed
      ? "✅ All tests passed! The system is working correctly."
      : "❌ Some tests failed. Please check the test results for details.",
  });
}
