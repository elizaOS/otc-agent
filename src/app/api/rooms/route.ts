import { NextRequest, NextResponse } from "next/server";
import { agentRuntime } from "@/lib/agent-runtime";
import { v4 as uuidv4 } from "uuid";
import { walletToEntityId } from "@/lib/entityId";
import { stringToUuid } from "@elizaos/core";

// GET /api/rooms - Get user's rooms
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const entityId = searchParams.get("entityId");

  if (!entityId) {
    return NextResponse.json(
      { error: "entityId is required" },
      { status: 400 },
    );
  }

  const runtime = await agentRuntime.getRuntime();
  const roomIds = await runtime.getRoomsForParticipants([
    stringToUuid(entityId) as any,
  ]);

  // Get room details
  const rooms = await Promise.all(
    roomIds.map(async (roomId) => {
      const room = await runtime.getRoom(roomId);
      return {
        id: roomId,
        ...room,
      };
    }),
  );

  return NextResponse.json({
    success: true,
    rooms,
  });
}

// POST /api/rooms - Create new room
export async function POST(request: NextRequest) {
  console.log("[Rooms API] POST request received");
  const body = await request.json();
  const { entityId } = body;
  console.log("[Rooms API] entityId:", entityId);

  if (!entityId) {
    return NextResponse.json(
      { error: "entityId is required" },
      { status: 400 },
    );
  }

  const runtime = await agentRuntime.getRuntime();
  const roomId = uuidv4();

  // Ensure room exists
  await runtime.ensureRoomExists({
    id: roomId as any,
    source: "web",
    type: "DM" as any,
    channelId: roomId,
    serverId: "otc-desk-server",
    worldId: stringToUuid("otc-desk-world") as any,
    agentId: runtime.agentId,
  });

  console.log("[Rooms API] Created room:", roomId, "for entity:", entityId);

  // Create initial welcome message with default quote
  console.log(
    "[Rooms API] Creating initial welcome message for wallet:",
    entityId,
  );

  // Ensure entity exists in database to prevent foreign key errors
  const userEntityId = walletToEntityId(entityId);
  await runtime.ensureConnection({
    entityId: userEntityId as any,
    roomId: roomId as any,
    userName: entityId,
    name: entityId,
    source: "web",
    channelId: roomId,
    serverId: "otc-desk-server",
    type: "DM" as any,
    worldId: stringToUuid("otc-desk-world") as any,
  });

  // Save initial quote to cache with consistent ID generation
  const crypto = await import("crypto");
  const dayTimestamp = Math.floor(Date.now() / (24 * 60 * 60 * 1000));
  const hash = crypto
    .createHash("sha256")
    .update(`${userEntityId}-${dayTimestamp}`)
    .digest("hex")
    .substring(0, 12)
    .toUpperCase();
  const initialQuoteId = `OTC-${hash}`;

  const initialQuoteData = {
    id: uuidv4(),
    quoteId: initialQuoteId,
    entityId: userEntityId,
    beneficiary: entityId.toLowerCase(),
    tokenAmount: "0",
    discountBps: 1000,
    apr: 0,
    lockupMonths: 5,
    lockupDays: 150,
    paymentCurrency: "USDC" as any,
    priceUsdPerToken: 0.00127,
    totalUsd: 0,
    discountUsd: 0,
    discountedUsd: 0,
    paymentAmount: "0",
    signature: "",
    status: "active" as any,
    createdAt: Date.now(),
    executedAt: 0,
    rejectedAt: 0,
    approvedAt: 0,
    offerId: "",
    transactionHash: "",
    blockNumber: 0,
    rejectionReason: "",
    approvalNote: "",
  };

  await runtime.setCache(`quote:${initialQuoteId}`, initialQuoteData);

  // Add to indexes
  const allQuotes = (await runtime.getCache<string[]>("all_quotes")) ?? [];
  if (!allQuotes.includes(initialQuoteId)) {
    allQuotes.push(initialQuoteId);
    await runtime.setCache("all_quotes", allQuotes);
  }

  const entityQuoteIds =
    (await runtime.getCache<string[]>(`entity_quotes:${userEntityId}`)) ?? [];
  if (!entityQuoteIds.includes(initialQuoteId)) {
    entityQuoteIds.push(initialQuoteId);
    await runtime.setCache(`entity_quotes:${userEntityId}`, entityQuoteIds);
  }

  console.log(
    "[Rooms API] Initial quote saved to cache and indexed:",
    initialQuoteId,
  );

  // Create a welcome message with default quote terms
  const welcomeMessage = `I can offer a 10.00% discount with a 5-month lockup.

📊 **Quote Terms** (ID: ${initialQuoteId})
• **Discount: 10.00%**
• **Lockup: 5 months** (150 days)

<!-- XML_START -->

<quote>
  <quoteId>${initialQuoteId}</quoteId>
  <tokenSymbol>TOKEN</tokenSymbol>
  <lockupMonths>5</lockupMonths>
  <lockupDays>150</lockupDays>
  <pricePerToken>0.00127</pricePerToken>
  <discountBps>1000</discountBps>
  <discountPercent>10.00</discountPercent>
  <paymentCurrency>USDC</paymentCurrency>
  <createdAt>${new Date().toISOString()}</createdAt>
  <status>negotiated</status>
  <message>Amount is selected during acceptance. Terms will be validated on-chain.</message>
</quote>
<!-- XML_END -->`;

  const agentMessage = {
    id: uuidv4(),
    roomId,
    entityId: runtime.agentId,
    agentId: runtime.agentId,
    content: {
      text: welcomeMessage,
      type: "agent",
    },
    createdAt: Date.now(),
  } as any;

  await runtime.createMemory(agentMessage, "messages");
  console.log("[Rooms API] ✅ Initial welcome message created");

  return NextResponse.json({
    success: true,
    roomId,
    createdAt: Date.now(),
  });
}
