import {
  asUUID,
  ChannelType,
  composePromptFromState,
  createUniqueUuid,
  type Entity,
  type EntityPayload,
  EventType,
  type IAgentRuntime,
  logger,
  type Media,
  type Memory,
  type MessagePayload,
  ModelType,
  type Plugin,
  type UUID,
  type WorldPayload,
  type HandlerCallback,
} from "@elizaos/core";
import { v4 } from "uuid";
import { quoteAction } from "./actions/quote";
import { tokenProvider as ai16zProvider } from "./providers/ai16z";
import { otcDeskProvider } from "./providers/otcDesk";
import { quoteProvider } from "./providers/quote";
import { providersProvider } from "./providers/providers";
import { recentMessagesProvider } from "./providers/recentMessages";
import { tokenProvider as shawProvider } from "./providers/shaw";
import { tokenProvider as elizaTokenProvider } from "./providers/token";
import QuoteService from "./services/quoteService";
import { UserSessionStorageService } from "./services/userSessionStorage";

/**
 * Extracts the text content from within a <response> XML tag.
 * @param text The input string potentially containing the <response> tag.
 * @returns The extracted text content, or null if the tag is not found or empty.
 */
function extractResponseText(text: string): string | null {
  if (!text) return null;

  // Regex to find the content within <response>...</response>
  const responseMatch = text.match(/<response>([\s\S]*?)<\/response>/);

  if (!responseMatch || responseMatch[1] === undefined) {
    logger.warn("Could not find <response> tag or its content in text");
    // Attempt to find *any* XML block as a fallback, but log that it wasn't the expected <response>
    const fallbackMatch = text.match(/<(\w+)>([\s\S]*?)<\/\1>/);
    if (fallbackMatch && fallbackMatch[2] !== undefined) {
      logger.warn(
        `Found <${fallbackMatch[1]}> tag instead of <response>. Using its content.`,
      );
      const fallbackContent = fallbackMatch[2].trim();
      return fallbackContent || null; // Return null if content is empty after trimming
    }
    return null;
  }

  const responseContent = responseMatch[1].trim();

  // Return null if the content is empty after trimming
  if (!responseContent) {
    logger.warn("Found <response> tag, but its content is empty");
    return null;
  }

  // Basic unescaping for common XML entities (can be expanded if needed)
  const unescapedContent = responseContent
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");

  return unescapedContent;
}

export const messageHandlerTemplate = `
<providers>
{{providers}}
</providers>

<instructions>
Respond to the user's message and answer their question thoroughly.

When the user negotiates or requests different discount/lockup terms, generate a quote XML block with the NEW terms:

Example response for "give me 15%":
<response>
I can offer 15% discount with a 6-month lockup.

📊 **Quote Terms**
• **Discount: 15.00%**
• **Lockup: 6 months**

<quote>
  <quoteId>OTC-XXXXX</quoteId>
  <tokenSymbol>TOKEN</tokenSymbol>
  <lockupMonths>6</lockupMonths>
  <lockupDays>180</lockupDays>
  <pricePerToken>0.00127</pricePerToken>
  <discountBps>1500</discountBps>
  <discountPercent>15.00</discountPercent>
  <paymentCurrency>USDC</paymentCurrency>
  <createdAt>2025-10-06T15:00:00.000Z</createdAt>
  <status>negotiated</status>
  <message>Terms updated</message>
</quote>
</response>

For general questions, just respond conversationally without quote XML.
</instructions>

<keys>
"text" should be the text of the next message for {{agentName}} which they will send to the conversation.
</keys>

<output>
Respond using XML format like this:
<response>
    Your response text here
</response>

Your response must ONLY include the <response></response> XML block.
</output>`;

/**
 * Represents media data containing a buffer of data and the media type.
 * @typedef {Object} MediaData
 * @property {Buffer} data - The buffer of data.
 * @property {string} mediaType - The type of media.
 */
type MediaData = {
  data: Buffer;
  mediaType: string;
};

// Helper functions for response ID tracking in serverless environment
async function getLatestResponseId(
  runtime: IAgentRuntime,
  roomId: string,
): Promise<string | null> {
  return (
    (await runtime.getCache<string>(
      `response_id:${runtime.agentId}:${roomId}`,
    )) ?? null
  );
}

async function setLatestResponseId(
  runtime: IAgentRuntime,
  roomId: string,
  responseId: string,
): Promise<void> {
  if (!responseId || typeof responseId !== "string") {
    console.error("[setLatestResponseId] Invalid responseId:", responseId);
    throw new Error(`Invalid responseId: ${responseId}`);
  }
  const key = `response_id:${runtime.agentId}:${roomId}`;
  console.log("[setLatestResponseId] Setting cache:", {
    key,
    responseId: responseId.substring(0, 8),
  });
  await runtime.setCache(key, responseId);
}

async function clearLatestResponseId(
  runtime: IAgentRuntime,
  roomId: string,
): Promise<void> {
  const key = `response_id:${runtime.agentId}:${roomId}`;
  console.log("[clearLatestResponseId] Deleting cache key:", key);
  await runtime.deleteCache(key);
}

/**
 * Fetches media data from a list of attachments, supporting both HTTP URLs and local file paths.
 *
 * @param attachments Array of Media objects containing URLs or file paths to fetch media from
 * @returns Promise that resolves with an array of MediaData objects containing the fetched media data and content type
 */
/**
 * Fetches media data from given attachments.
 * @param {Media[]} attachments - Array of Media objects to fetch data from.
 * @returns {Promise<MediaData[]>} - A Promise that resolves with an array of MediaData objects.
 */
export async function fetchMediaData(
  attachments: Media[],
): Promise<MediaData[]> {
  return Promise.all(
    attachments.map(async (attachment: Media) => {
      if (/^(http|https):\/\//.test(attachment.url)) {
        // Handle HTTP URLs
        const response = await fetch(attachment.url);
        if (!response.ok) {
          throw new Error(`Failed to fetch file: ${attachment.url}`);
        }
        const mediaBuffer = Buffer.from(await response.arrayBuffer());
        const mediaType = attachment.contentType || "image/png";
        return { data: mediaBuffer, mediaType };
      }
      // if (fs.existsSync(attachment.url)) {
      //   // Handle local file paths
      //   const mediaBuffer = await fs.promises.readFile(path.resolve(attachment.url));
      //   const mediaType = attachment.contentType || 'image/png';
      //   return { data: mediaBuffer, mediaType };
      // }
      throw new Error(
        `File not found: ${attachment.url}. Make sure the path is correct.`,
      );
    }),
  );
}

/**
 * Handles incoming messages and generates responses based on the provided runtime and message information.
 *
 * @param {MessageReceivedHandlerParams} params - The parameters needed for message handling, including runtime, message, and callback.
 * @returns {Promise<void>} - A promise that resolves once the message handling and response generation is complete.
 */
const messageReceivedHandler = async ({
  runtime,
  message,
  callback,
}: {
  runtime: IAgentRuntime;
  message: Memory;
  callback: HandlerCallback;
}): Promise<void> => {
  // Generate a new response ID
  const responseId = v4();
  console.log(
    "[MessageHandler] Generated response ID:",
    responseId.substring(0, 8),
  );

  // Set this as the latest response ID for this room (using runtime cache for serverless)
  await setLatestResponseId(runtime, message.roomId, responseId);

  // Generate a unique run ID for tracking this message handler execution
  const runId = asUUID(v4());
  const startTime = Date.now();

  // Emit run started event
  await runtime.emitEvent(EventType.RUN_STARTED, {
    runtime,
    runId,
    messageId: message.id,
    roomId: message.roomId,
    entityId: message.entityId,
    startTime,
    status: "started",
    source: "messageHandler",
  });

  // Set up timeout monitoring
  const timeoutDuration = 60 * 60 * 1000; // 1 hour

  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(async () => {
      await runtime.emitEvent(EventType.RUN_TIMEOUT, {
        runtime,
        runId,
        messageId: message.id,
        roomId: message.roomId,
        entityId: message.entityId,
        startTime,
        status: "timeout",
        endTime: Date.now(),
        duration: Date.now() - startTime,
        error: "Run exceeded 60 minute timeout",
        source: "messageHandler",
      });
      reject(new Error("Run exceeded 60 minute timeout"));
    }, timeoutDuration);
  });

  const processingPromise = (async () => {
    if (message.entityId === runtime.agentId) {
      throw new Error("Message is from the agent itself");
    }

    // First, save the incoming message
    await Promise.all([runtime.createMemory(message, "messages")]);

    const state = await runtime.composeState(message, ["RECENT_MESSAGES"]);

    const prompt = composePromptFromState({
      state,
      template:
        runtime.character.templates?.messageHandlerTemplate ||
        messageHandlerTemplate,
    });

    console.log("*** PROMPT ***\n", prompt);

    let responseContent: string = "";

    // Retry if missing required fields
    let retries = 0;
    const maxRetries = 3;

    while (retries < maxRetries && (!responseContent || !responseContent)) {
      const response = await runtime.useModel(ModelType.TEXT_LARGE, {
        prompt,
      });

      logger.debug(`*** Raw LLM Response ***\n${response}`);
      console.log("[MessageHandler] LLM response length:", response.length);
      console.log(
        "[MessageHandler] LLM response preview:",
        response.substring(0, 500),
      );

      // Attempt to parse the XML response
      const extractedContent = extractResponseText(response);

      if (!extractedContent) {
        logger.warn(
          "*** Missing required fields (thought or actions), retrying... ***",
        );
        responseContent = "";
      } else {
        responseContent = extractedContent;
        break;
      }
      retries++;
    }

    // Check if this is still the latest response ID for this room
    const currentResponseId = await getLatestResponseId(
      runtime,
      message.roomId,
    );
    if (currentResponseId !== responseId) {
      logger.info(
        `Response discarded - newer message being processed for agent: ${runtime.agentId}, room: ${message.roomId}`,
      );
      return;
    }

    // Clean up the response ID
    await clearLatestResponseId(runtime, message.roomId);

    // Parse actions from response - support both XML tags and function-call syntax
    const xmlActionMatch = responseContent.match(/<action>(.*?)<\/action>/gi);
    const functionActionMatch = responseContent.match(
      /\b(CREATE_OTC_QUOTE)\s*\(/gi,
    );

    const actionNames: string[] = [];

    // Parse XML format: <action>CREATE_OTC_QUOTE</action>
    if (xmlActionMatch) {
      actionNames.push(
        ...xmlActionMatch.map((match) =>
          match.replace(/<\/?action>/gi, "").trim(),
        ),
      );
    }

    // Parse function-call format: CREATE_OTC_QUOTE({...})
    if (functionActionMatch) {
      actionNames.push(
        ...functionActionMatch.map((match) =>
          match.replace(/\s*\(.*/g, "").trim(),
        ),
      );
    }

    // Parse and save quote if present in response (don't trigger action handler)
    const quoteMatch = responseContent.match(/<quote>([\s\S]*?)<\/quote>/i);
    if (quoteMatch) {
      console.log(
        "[MessageHandler] Detected <quote> XML in response, parsing and saving",
      );
      // Simple regex-based parsing (server-side compatible)
      const quoteXml = quoteMatch[0];
      const getTag = (tag: string) => {
        const match = quoteXml.match(
          new RegExp(`<${tag}>([^<]*)<\/${tag}>`, "i"),
        );
        return match ? match[1].trim() : "";
      };
      const getNumTag = (tag: string) => {
        const val = getTag(tag);
        return val ? parseFloat(val) : 0;
      };

      const quoteId = getTag("quoteId");
      if (quoteId) {
        const { walletToEntityId } = await import("@/lib/entityId");
        const entityId = message.entityId.toString();

        const quoteData = {
          id: (await import("uuid")).v4(),
          quoteId,
          entityId: walletToEntityId(entityId),
          beneficiary: entityId.toLowerCase(),
          tokenAmount: getTag("tokenAmount") || "0",
          discountBps: getNumTag("discountBps"),
          apr: 0,
          lockupMonths: getNumTag("lockupMonths"),
          lockupDays: getNumTag("lockupDays"),
          paymentCurrency: getTag("paymentCurrency") as any,
          priceUsdPerToken: getNumTag("pricePerToken"),
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

        await runtime.setCache(`quote:${quoteId}`, quoteData);

        // Add to indexes
        const allQuotes =
          (await runtime.getCache<string[]>("all_quotes")) ?? [];
        if (!allQuotes.includes(quoteId)) {
          allQuotes.push(quoteId);
          await runtime.setCache("all_quotes", allQuotes);
        }

        const quoteEntityId = walletToEntityId(entityId);
        const entityQuoteIds =
          (await runtime.getCache<string[]>(
            `entity_quotes:${quoteEntityId}`,
          )) ?? [];
        if (!entityQuoteIds.includes(quoteId)) {
          entityQuoteIds.push(quoteId);
          await runtime.setCache(
            `entity_quotes:${quoteEntityId}`,
            entityQuoteIds,
          );
        }

        console.log(
          "[MessageHandler] Quote saved to cache and indexed:",
          quoteId,
        );
      }
    }

    console.log("[MessageHandler] Detected actions:", actionNames);

    // Create response memory with parsed actions
    const responseMemory: Memory = {
      id: createUniqueUuid(runtime, message.id),
      entityId: runtime.agentId,
      roomId: message.roomId,
      worldId: message.worldId,
      content: {
        text: responseContent,
        source: "agent",
        inReplyTo: message.id,
        actions: actionNames.length > 0 ? actionNames : undefined,
      },
    };

    // Process actions if any were found
    if (actionNames.length > 0) {
      console.log("[MessageHandler] Processing actions:", actionNames);

      // Process actions first, which will call the action handler
      await runtime.processActions(
        message,
        [responseMemory],
        state,
        async (content) => {
          console.log("[MessageHandler] Action callback received:", {
            action: content.action,
            hasText: !!content.text,
          });

          // The action handler provides the actual response text
          const finalResponseText = content.text || responseContent;

          // Save the response to database
          const finalResponseMemory: Memory = {
            id: responseMemory.id,
            entityId: runtime.agentId,
            roomId: message.roomId,
            worldId: message.worldId,
            content: {
              text: finalResponseText,
              source: "agent",
              inReplyTo: message.id,
            },
          };

          await runtime.createMemory(finalResponseMemory, "messages");
          console.log("[MessageHandler] Response saved to database");

          // Send to frontend
          if (callback) {
            await callback({
              text: finalResponseText,
            });
          }
          return [];
        },
      );
    } else {
      // No actions - save and send the response
      console.log(
        "[MessageHandler] No actions, saving response and calling callback",
      );
      await runtime.createMemory(responseMemory, "messages");
      console.log("[MessageHandler] Response saved, sending to frontend");
      await callback({
        text: responseContent,
      });
      console.log("[MessageHandler] Callback completed");
    }

    // Emit run ended event on successful completion
    await runtime.emitEvent(EventType.RUN_ENDED, {
      runtime,
      runId,
      messageId: message.id,
      roomId: message.roomId,
      entityId: message.entityId,
      startTime,
      status: "completed",
      endTime: Date.now(),
      duration: Date.now() - startTime,
      source: "messageHandler",
    });
  })();

  await Promise.race([processingPromise, timeoutPromise]);
};

/**
 * Syncs a single user into an entity
 */
/**
 * Asynchronously sync a single user with the specified parameters.
 *
 * @param {UUID} entityId - The unique identifier for the entity.
 * @param {IAgentRuntime} runtime - The runtime environment for the agent.
 * @param {any} user - The user object to sync.
 * @param {string} serverId - The unique identifier for the server.
 * @param {string} channelId - The unique identifier for the channel.
 * @param {ChannelType} type - The type of channel.
 * @param {string} source - The source of the user data.
 * @returns {Promise<void>} A promise that resolves once the user is synced.
 */
const syncSingleUser = async (
  entityId: UUID,
  runtime: IAgentRuntime,
  serverId: string,
  channelId: string,
  type: ChannelType,
  source: string,
) => {
  const entity = await runtime.getEntityById(entityId);
  logger.info(
    `Syncing user: ${(entity?.metadata?.[source] as any)?.username || entityId}`,
  );

  // Ensure we're not using WORLD type and that we have a valid channelId
  if (!channelId) {
    logger.warn(`Cannot sync user ${entity?.id} without a valid channelId`);
    return;
  }

  const roomId = createUniqueUuid(runtime, channelId);
  const worldId = createUniqueUuid(runtime, serverId);

  await runtime.ensureConnection({
    entityId,
    roomId,
    userName: (entity?.metadata?.[source] as any)?.username || entityId,
    name:
      (entity?.metadata?.[source] as any)?.name ||
      (entity?.metadata?.[source] as any)?.username ||
      `User${entityId}`,
    source,
    channelId,
    serverId,
    type,
    worldId,
  });

  logger.success(`Successfully synced user: ${entity?.id}`);
};

/**
 * Handles standardized server data for both WORLD_JOINED and WORLD_CONNECTED events
 */
const handleServerSync = async ({
  runtime,
  world,
  rooms,
  entities,
  source,
}: WorldPayload) => {
  logger.debug(`Handling server sync event for server: ${world.name}`);
  // Create/ensure the world exists for this server
  await runtime.ensureWorldExists({
    id: world.id,
    name: world.name,
    agentId: runtime.agentId,
    serverId: world.serverId,
    metadata: {
      ...world.metadata,
    },
  });

  // First sync all rooms/channels
  if (rooms && rooms.length > 0) {
    for (const room of rooms) {
      await runtime.ensureRoomExists({
        id: room.id,
        name: room.name,
        source: source,
        type: room.type,
        channelId: room.channelId,
        serverId: world.serverId,
        worldId: world.id,
      });
    }
  }

  // Then sync all users
  if (entities && entities.length > 0) {
    // Process entities in batches to avoid overwhelming the system
    const batchSize = 50;
    for (let i = 0; i < entities.length; i += batchSize) {
      const entityBatch = entities.slice(i, i + batchSize);

      // check if user is in any of these rooms in rooms
      const firstRoomUserIsIn = rooms.length > 0 ? rooms[0] : null;

      // Process each user in the batch
      await Promise.all(
        entityBatch.map(async (entity: Entity) => {
          if (!firstRoomUserIsIn || !entity.id) {
            logger.warn(`Skipping entity sync - missing room or entity id`);
            return;
          }
          await runtime.ensureConnection({
            entityId: entity.id,
            roomId: firstRoomUserIsIn.id,
            userName: (entity.metadata?.[source] as any)?.username || entity.id,
            name:
              (entity.metadata?.[source] as any)?.name ||
              (entity.metadata?.[source] as any)?.username ||
              `User${entity.id}`,
            source: source,
            channelId: firstRoomUserIsIn.channelId,
            serverId: world.serverId,
            type: firstRoomUserIsIn.type,
            worldId: world.id,
          });
        }),
      );

      // Add a small delay between batches if not the last batch
      if (i + batchSize < entities.length) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }
  }

  logger.debug(
    `Successfully synced standardized world structure for ${world.name}`,
  );
};

/**
 * Handles control messages for enabling or disabling UI elements in the frontend
 * @param {Object} params - Parameters for the handler
 * @param {IAgentRuntime} params.runtime - The runtime instance
 * @param {Object} params.message - The control message
 * @param {string} params.source - Source of the message
 */
const controlMessageHandler = async ({
  runtime,
  message,
}: {
  runtime: IAgentRuntime;
  message: {
    type: "control";
    payload: {
      action: "enable_input" | "disable_input";
      target?: string;
    };
    roomId: UUID;
  };
}) => {
  logger.debug(
    `[controlMessageHandler] Processing control message: ${message.payload.action} for room ${message.roomId}`,
  );

  // Here we would use a WebSocket service to send the control message to the frontend
  // This would typically be handled by a registered service with sendMessage capability

  // Get any registered WebSocket service
  const serviceNames = Array.from(runtime.getAllServices().keys());
  const websocketServiceName = serviceNames.find(
    (name: string) =>
      name.toLowerCase().includes("websocket") ||
      name.toLowerCase().includes("socket"),
  );

  if (websocketServiceName) {
    const websocketService = runtime.getService(websocketServiceName);
    if (websocketService && "sendMessage" in websocketService) {
      // Send the control message through the WebSocket service
      await (websocketService as any).sendMessage({
        type: "controlMessage",
        payload: {
          action: message.payload.action,
          target: message.payload.target,
          roomId: message.roomId,
        },
      });

      logger.debug(
        `[controlMessageHandler] Control message ${message.payload.action} sent successfully`,
      );
    } else {
      logger.error(
        "[controlMessageHandler] WebSocket service does not have sendMessage method",
      );
    }
  } else {
    logger.error(
      "[controlMessageHandler] No WebSocket service found to send control message",
    );
  }
};

const events = {
  [EventType.MESSAGE_RECEIVED]: [
    async (payload: MessagePayload) => {
      if (payload.callback) {
        await messageReceivedHandler({
          runtime: payload.runtime,
          message: payload.message,
          callback: payload.callback,
        });
      }
    },
  ],

  [EventType.MESSAGE_SENT]: [
    async (payload: MessagePayload) => {
      // Message sent tracking
      logger.debug(`Message sent: ${payload.message.content.text}`);
    },
  ],

  [EventType.WORLD_JOINED]: [
    async (payload: WorldPayload) => {
      await handleServerSync(payload);
    },
  ],

  [EventType.WORLD_CONNECTED]: [
    async (payload: WorldPayload) => {
      await handleServerSync(payload);
    },
  ],

  [EventType.ENTITY_JOINED]: [
    async (payload: EntityPayload) => {
      // Check for required fields
      if (!payload.worldId || !payload.metadata?.type || !payload.roomId) {
        logger.warn(
          `Skipping entity sync - missing worldId, roomId, or metadata.type`,
        );
        return;
      }

      // TypeScript should know these are defined now, but we'll use type assertions to be explicit
      const serverId = payload.worldId as string;
      const channelId = payload.roomId as string;
      const channelType = payload.metadata.type;

      await syncSingleUser(
        payload.entityId,
        payload.runtime,
        serverId,
        channelId,
        channelType,
        payload.source,
      );
    },
  ],

  [EventType.ENTITY_LEFT]: [
    async (payload: EntityPayload) => {
      // Update entity to inactive
      const entity = await payload.runtime.getEntityById(payload.entityId);
      if (entity) {
        entity.metadata = {
          ...entity.metadata,
          status: "INACTIVE",
          leftAt: Date.now(),
        };
        await payload.runtime.updateEntity(entity);
      }
      logger.info(`User ${payload.entityId} left world ${payload.worldId}`);
    },
  ],

  CONTROL_MESSAGE: [controlMessageHandler],
};

export const otcDeskPlugin: Plugin = {
  name: "otc-desk",
  description: "OTC Desk plugin for managing quotes and transactions",
  events,
  providers: [
    recentMessagesProvider,
    quoteProvider,
    otcDeskProvider,
    ai16zProvider,
    shawProvider,
    elizaTokenProvider,
    providersProvider,
  ],
  actions: [quoteAction],
  services: [QuoteService, UserSessionStorageService],
};

export default otcDeskPlugin;
