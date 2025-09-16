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
  type MessagePayload,
  type MessageReceivedHandlerParams,
  ModelType,
  type Plugin,
  type UUID,
  type WorldPayload,
} from "@elizaos/core";
import { v4 } from "uuid";
import { acceptQuoteAction } from "./actions/acceptQuote";
import { quoteAction } from "./actions/quote";
import { tokenProvider as ai16zProvider } from "./providers/ai16z";
import { otcDeskProvider } from "./providers/otcDesk";
import { quoteProvider } from "./providers/quote";
import { recentMessagesProvider } from "./providers/recentMessages";
import { tokenProvider as shawProvider } from "./providers/shaw";
import { tokenProvider as elizaTokenProvider } from "./providers/token";

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
Respond to the user's message and answer their question thoroughly and thoroughly.
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

const latestResponseIds = new Map<string, Map<string, string>>();

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
}: MessageReceivedHandlerParams): Promise<void> => {
  // Generate a new response ID
  const responseId = v4();
  // Get or create the agent-specific map
  if (!latestResponseIds.has(runtime.agentId)) {
    latestResponseIds.set(runtime.agentId, new Map<string, string>());
  }
  const agentResponses = latestResponseIds.get(runtime.agentId);
  if (!agentResponses) {
    throw new Error("Agent responses map not found");
  }

  // Set this as the latest response ID for this agent+room
  agentResponses.set(message.roomId, responseId);

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
  let timeoutId: NodeJS.Timeout | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(async () => {
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
    try {
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

      // Check if this is still the latest response ID for this agent+room
      const currentResponseId = agentResponses.get(message.roomId);
      if (currentResponseId !== responseId) {
        logger.info(
          `Response discarded - newer message being processed for agent: ${runtime.agentId}, room: ${message.roomId}`,
        );
        return;
      }

      // Clean up the response ID
      agentResponses.delete(message.roomId);
      if (agentResponses.size === 0) {
        latestResponseIds.delete(runtime.agentId);
      }

      await callback({
        text: responseContent,
      });

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
    } catch (error) {
      // Emit run ended event with error
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
        error: error.message,
        source: "messageHandler",
      });
      throw error;
    }
  })();

  try {
    await Promise.race([processingPromise, timeoutPromise]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
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
  try {
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
  } catch (error) {
    logger.error(
      `Error syncing user: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
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
  try {
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
            try {
              if (!firstRoomUserIsIn || !entity.id) {
                logger.warn(`Skipping entity sync - missing room or entity id`);
                return;
              }
              await runtime.ensureConnection({
                entityId: entity.id,
                roomId: firstRoomUserIsIn.id,
                userName:
                  (entity.metadata?.[source] as any)?.username || entity.id,
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
            } catch (err) {
              logger.warn(
                `Failed to sync user ${entity.metadata?.username || entity.id}: ${err}`,
              );
            }
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
  } catch (error) {
    logger.error(
      `Error processing standardized server data: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
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
  try {
    logger.debug(
      `[controlMessageHandler] Processing control message: ${message.payload.action} for room ${message.roomId}`,
    );

    // Here we would use a WebSocket service to send the control message to the frontend
    // This would typically be handled by a registered service with sendMessage capability

    // Get any registered WebSocket service
    const serviceNames = Array.from(runtime.getAllServices().keys());
    const websocketServiceName = serviceNames.find(
      (name) =>
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
  } catch (error) {
    logger.error(
      `[controlMessageHandler] Error processing control message: ${error}`,
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
      try {
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
      } catch (error) {
        logger.error(`Error handling user left: ${error.message}`);
      }
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
  ],
  actions: [quoteAction, acceptQuoteAction],
};

export default otcDeskPlugin;
