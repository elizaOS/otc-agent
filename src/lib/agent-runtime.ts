// Serverless-compatible agent runtime with Drizzle ORM for Next.js
import { v4 as uuidv4 } from "uuid";
// DO NOT replace with an agent-simple.ts, it won't work!
import {
  AgentRuntime,
  ChannelType,
  EventType,
  Memory,
  elizaLogger,
  stringToUuid,
  type UUID,
} from "@elizaos/core";
import agent from "./agent";

const globalAny = globalThis as any;
if (typeof globalAny.__elizaMigrationsRan === "undefined")
  globalAny.__elizaMigrationsRan = false;
if (typeof globalAny.__elizaManagerLogged === "undefined")
  globalAny.__elizaManagerLogged = false;

class AgentRuntimeManager {
  private static instance: AgentRuntimeManager;
  public runtime: AgentRuntime | null = null;
  private hasRunMigrations = false;

  private constructor() {
    // Configure the elizaLogger to use console
    if (elizaLogger) {
      elizaLogger.log = console.log.bind(console);
      elizaLogger.info = console.info.bind(console);
      elizaLogger.warn = console.warn.bind(console);
      elizaLogger.error = console.error.bind(console);
      elizaLogger.debug = console.debug.bind(console);
      elizaLogger.success = (msg: string) => console.log(`✓ ${msg}`);
      (elizaLogger as any).notice = console.info.bind(console);
    }

    // Also configure global console if needed
    if (typeof globalThis !== "undefined" && !globalAny.logger) {
      globalAny.logger = {
        log: console.log.bind(console),
        info: console.info.bind(console),
        warn: console.warn.bind(console),
        error: console.error.bind(console),
        debug: console.debug.bind(console),
      };
    }

    if (!globalAny.__elizaManagerLogged) {
      // Silence noisy init log; keep flag to avoid repeated work
      globalAny.__elizaManagerLogged = true;
    }
  }

  public static getInstance(): AgentRuntimeManager {
    if (!AgentRuntimeManager.instance) {
      AgentRuntimeManager.instance = new AgentRuntimeManager();
    }
    return AgentRuntimeManager.instance;
  }

  public isReady(): boolean {
    return true;
  }

  // Helper method to get or create the runtime instance
  async getRuntime(): Promise<AgentRuntime> {
    if (!this.runtime) {
      // Force fresh initialization - don't use cached runtime
      // This ensures services are properly registered
      console.log("[AgentRuntime] Creating fresh runtime instance");

      // Clear any cached runtime
      (globalThis as any).__elizaRuntime = null;

      // Initialize runtime with database configuration for SQL plugin
      // In localnet mode, connects to Docker PostgreSQL on port 5439
      const dbPort = process.env.POSTGRES_DEV_PORT || process.env.VENDOR_OTC_DESK_DB_PORT || 5439;
      const DEFAULT_POSTGRES_URL = `postgres://eliza:password@localhost:${dbPort}/eliza`;
      
      console.log(`[AgentRuntime] Database config: port=${dbPort}`);
      
      // Use the existing agent ID from DB (b850bc30-45f8-0041-a00a-83df46d8555d)
      const RUNTIME_AGENT_ID = "b850bc30-45f8-0041-a00a-83df46d8555d" as UUID;
      this.runtime = new AgentRuntime({
        ...agent,
        agentId: RUNTIME_AGENT_ID,
        settings: {
          GROQ_API_KEY: process.env.GROQ_API_KEY || "",
          SMALL_GROQ_MODEL:
            process.env.SMALL_GROQ_MODEL || "llama-3.1-8b-instant",
          LARGE_GROQ_MODEL: process.env.LARGE_GROQ_MODEL || "qwen/qwen3-32b",
          POSTGRES_URL:
            process.env.POSTGRES_URL ||
            process.env.POSTGRES_DATABASE_URL ||
            DEFAULT_POSTGRES_URL,
          ...agent.character.settings,
        },
      } as any);

      // Cache globally for reuse in warm container
      (globalThis as any).__elizaRuntime = this.runtime;

      // Ensure runtime has a logger with all required methods
      if (!this.runtime.logger || !this.runtime.logger.log) {
        this.runtime.logger = {
          log: console.log.bind(console),
          info: console.info.bind(console),
          warn: console.warn.bind(console),
          error: console.error.bind(console),
          debug: console.debug.bind(console),
          success: (message: string) => console.log(`✓ ${message}`),
          notice: console.info.bind(console),
        } as any;
      }

      // Ensure SQL plugin built-in tables exist (idempotent)
      await this.ensureBuiltInTables();

      // Initialize runtime - this calls ensureAgentExists internally (runtime.ts:405)
      // which creates both the agent record AND its entity record
      await this.runtime.initialize();

      // Log registered services
      const services = Array.from(this.runtime.getAllServices().keys());
      console.log("[AgentRuntime] Registered services:", services);
    }
    return this.runtime;
  }

  private async ensureBuiltInTables(): Promise<void> {
    if (this.hasRunMigrations || (globalThis as any).__elizaMigrationsRan)
      return;

    this.hasRunMigrations = true;
    (globalThis as any).__elizaMigrationsRan = true;

    // Database adapter and migrations are handled by @elizaos/plugin-sql during runtime.initialize()
    // Quotes and user sessions are stored via runtime.getCache/setCache
    console.log("[AgentRuntime] Using Eliza cache system for quote storage");
  }

  // Helper method to handle messages
  public async handleMessage(
    roomId: string,
    entityId: string,
    content: { text?: string; attachments?: any[] },
  ): Promise<Memory> {
    const runtime = await this.getRuntime();

    // Ensure room and entity connection (follows Eliza's ensureConnection pattern)
    const entityUuid = stringToUuid(entityId) as UUID;
    await runtime.ensureConnection({
      entityId: entityUuid,
      roomId: roomId as UUID,
      worldId: stringToUuid("otc-desk-world"),
      source: "web",
      type: ChannelType.DM,
      channelId: roomId,
      serverId: "otc-desk-server",
      userName: entityId,
    } as any);

    // Create user message
    const userMessage: Memory = {
      roomId: roomId as UUID,
      entityId: entityUuid,
      agentId: runtime.agentId as UUID,
      content: {
        text: content.text || "",
        attachments: content.attachments || [],
      },
    };
    // Emit MESSAGE_RECEIVED and delegate handling to plugins
    await runtime.emitEvent(EventType.MESSAGE_RECEIVED, {
      runtime,
      message: {
        id: userMessage.id,
        content: {
          text: content.text || "",
          attachments: content.attachments || [],
        },
        entityId: stringToUuid(entityId) as UUID,
        agentId: runtime.agentId,
        roomId: roomId,
        createdAt: Date.now(),
      },
      callback: async (result: { text?: string; attachments?: any[] }) => {
        const responseText = result?.text || "";

        const agentMessage: Memory = {
          id: uuidv4() as UUID,
          roomId: roomId as UUID,
          entityId: runtime.agentId as UUID,
          agentId: runtime.agentId as UUID,
          content: {
            text: responseText,
            type: "agent",
          },
        };

        await runtime.createMemory(agentMessage, "messages");
      },
    });

    return userMessage;
  }
}

// Export singleton instance
export const agentRuntime = AgentRuntimeManager.getInstance();
