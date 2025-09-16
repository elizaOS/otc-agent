// Serverless-compatible agent runtime with Drizzle ORM for Next.js
import { v4 as uuidv4 } from "uuid";
import { eq, desc, gt, and, asc, sql } from "drizzle-orm";
// DO NOT replace with an agent-simple.ts, it won't work!
import agent from "./agent";
import {
  db,
  conversations,
  messages,
  type Conversation,
  type Message,
  type NewConversation,
  type NewMessage,
} from "../db";
import { AgentRuntime, EventType, elizaLogger } from "@elizaos/core";

const globalAny = globalThis as any;
if (typeof globalAny.__elizaMigrationsRan === "undefined")
  globalAny.__elizaMigrationsRan = false;
if (typeof globalAny.__elizaManagerLogged === "undefined")
  globalAny.__elizaManagerLogged = false;

async function tableExists(table: string): Promise<boolean> {
  try {
    const res = await (db as any).execute?.(
      sql.raw(`SELECT to_regclass('public.${table}') IS NOT NULL AS exists`),
    );
    const rows = (res as any)?.rows;
    return !!rows?.[0]?.exists;
  } catch {
    return false;
  }
}

export { Message, Conversation };

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
      // Reuse a cached singleton runtime across warm invocations
      if ((globalThis as any).__elizaRuntime) {
        this.runtime = (globalThis as any).__elizaRuntime as AgentRuntime;
        return this.runtime;
      }

      // Initialize runtime without database adapter - we handle persistence separately
      this.runtime = new AgentRuntime({
        ...agent,
        settings: {
          GROQ_API_KEY: process.env.GROQ_API_KEY,
          SMALL_GROQ_MODEL:
            process.env.SMALL_GROQ_MODEL || "llama-3.1-8b-instant",
          LARGE_GROQ_MODEL:
            process.env.LARGE_GROQ_MODEL || "llama-3.1-8b-instant",
          ...agent.character.settings,
        },
        // adapter is optional - we're managing persistence through Drizzle
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
      try {
        await this.ensureBuiltInTables();
      } catch (migrationError) {
        console.warn(
          "[AgentRuntime] Built-in table migration warning:",
          migrationError,
        );
      }

      // Try to initialize, but continue if there are DB-related errors
      try {
        await this.runtime.initialize();
      } catch (error) {
        console.warn("Runtime initialization warning:", error);
        // Continue anyway - some initialization errors are expected without full DB
      }
    }
    return this.runtime;
  }

  private async ensureBuiltInTables(): Promise<void> {
    if (this.hasRunMigrations || (globalThis as any).__elizaMigrationsRan)
      return;
    try {
      // Try to ensure pgvector extension exists (if available)
      try {
        await (db as any).execute?.(
          sql.raw("CREATE EXTENSION IF NOT EXISTS vector"),
        );
      } catch (extErr) {
        console.warn(
          "[AgentRuntime] Could not create pgvector extension (may not be installed):",
          extErr,
        );
      }

      // Ensure core app tables exist (idempotent)
      try {
        await (db as any).execute?.(
          sql.raw(`
          CREATE TABLE IF NOT EXISTS conversations (
            id text PRIMARY KEY,
            user_id text NOT NULL,
            title text,
            last_message_at timestamp,
            created_at timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
            updated_at timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
          )
        `),
        );
        await (db as any).execute?.(
          sql.raw(`
          CREATE TABLE IF NOT EXISTS messages (
            id text PRIMARY KEY,
            conversation_id text NOT NULL REFERENCES conversations(id),
            user_id text NOT NULL,
            agent_id text,
            content text NOT NULL,
            is_agent boolean DEFAULT false NOT NULL,
            created_at timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
          )
        `),
        );
      } catch (coreErr) {
        console.warn(
          "[AgentRuntime] Failed ensuring core tables (conversations/messages):",
          coreErr,
        );
      }

      // Always run plugin migrations once (idempotent) so required tables like 'memories' exist
      const { DatabaseMigrationService } = await import("@elizaos/plugin-sql");
      const migrationService = new DatabaseMigrationService();
      await migrationService.initializeWithDatabase(db as unknown as any);
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore - plugin typing is not critical here
      migrationService.discoverAndRegisterPluginSchemas(agent.plugins || []);
      await migrationService.runAllPluginMigrations();
      console.log(
        "[AgentRuntime] Ensured built-in plugin tables via migrations",
      );

      // Ensure app tables (quotes, user_sessions) exist (idempotent)
      try {
        // quotes table
        if (!(await tableExists("quotes"))) {
          await (db as any).execute?.(
            sql.raw(`
            CREATE TABLE IF NOT EXISTS quotes (
              id text PRIMARY KEY,
              quote_id text UNIQUE NOT NULL,
              user_id text NOT NULL,
              beneficiary text,
              token_amount text NOT NULL,
              discount_bps integer NOT NULL,
              apr real NOT NULL,
              lockup_months integer NOT NULL,
              lockup_days integer NOT NULL,
              payment_currency text NOT NULL,
              price_usd_per_token real NOT NULL,
              total_usd real NOT NULL,
              discount_usd real NOT NULL,
              discounted_usd real NOT NULL,
              payment_amount text NOT NULL,
              status text NOT NULL DEFAULT 'active',
              signature text,
              created_at timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
              expires_at timestamp NOT NULL,
              executed_at timestamp,
              rejected_at timestamp,
              approved_at timestamp,
              offer_id text,
              transaction_hash text,
              block_number integer,
              rejection_reason text,
              approval_note text
            )
          `),
          );
        }

        // user_sessions table
        if (!(await tableExists("user_sessions"))) {
          await (db as any).execute?.(
            sql.raw(`
            CREATE TABLE IF NOT EXISTS user_sessions (
              id text PRIMARY KEY,
              user_id text UNIQUE NOT NULL,
              wallet_address text,
              quotes_created integer NOT NULL DEFAULT 0,
              last_quote_at timestamp,
              daily_quote_count integer NOT NULL DEFAULT 0,
              daily_reset_at timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
              total_deals integer NOT NULL DEFAULT 0,
              total_volume_usd real NOT NULL DEFAULT 0,
              total_saved_usd real NOT NULL DEFAULT 0,
              created_at timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
              updated_at timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
            )
          `),
          );
        }
      } catch (appTableErr) {
        console.warn(
          "[AgentRuntime] Failed ensuring app tables (quotes/user_sessions):",
          appTableErr,
        );
      }

      this.hasRunMigrations = true;
      (globalThis as any).__elizaMigrationsRan = true;
    } catch (error) {
      console.warn(
        "[AgentRuntime] Failed to ensure built-in plugin tables:",
        error,
      );
      // Fallback: minimally ensure agents table exists to allow runtime init to proceed
      try {
        await (db as any).execute?.(
          sql.raw(`
          CREATE TABLE IF NOT EXISTS agents (
            id uuid PRIMARY KEY,
            name text NOT NULL,
            bio jsonb
          )
        `),
        );
      } catch (fallbackError) {
        console.warn(
          "[AgentRuntime] Fallback agents table creation failed:",
          fallbackError,
        );
      }
    }
  }

  private async ensureAgentAndRoomRecords(
    conversationId: string,
  ): Promise<void> {
    try {
      // Ensure agent row exists for runtime.agentId
      if ((await tableExists("agents")) && this.runtime?.agentId) {
        const safeName = agent.character.name.replace(/'/g, "''");
        await (db as any).execute?.(
          sql.raw(
            `INSERT INTO agents (id, name, enabled) VALUES ('${this.runtime.agentId}', '${safeName}', true)
           ON CONFLICT (id) DO NOTHING`,
          ),
        );
      }
      // Ensure room row exists for this conversation (used by plugin tables)
      if (await tableExists("rooms")) {
        await (db as any).execute?.(
          sql.raw(
            `INSERT INTO rooms (id, "agentId", source, "type") VALUES ('${conversationId}', '${this.runtime?.agentId ?? ""}', 'web', 'chat')
           ON CONFLICT (id) DO NOTHING`,
          ),
        );
      }
    } catch (err) {
      console.warn("[AgentRuntime] Failed ensuring agent/room records:", err);
    }
  }

  // Helper method to handle messages
  public async handleMessage(
    conversationId: string,
    userId: string,
    content: { text?: string; attachments?: any[] },
    agentId?: string,
    clientMessageId?: string,
  ): Promise<Message> {
    // store raw input; display sanitization occurs in providers

    // Get the runtime instance
    const runtime = await this.getRuntime();

    // Ensure conversation exists (create if missing)
    try {
      const existing = await this.getConversation(conversationId);
      if (!existing) {
        console.log(
          "[AgentRuntime] Conversation not found. Creating new conversation:",
          conversationId,
        );
        const newConversation: NewConversation = {
          id: conversationId,
          userId,
          title: "New Conversation",
        };
        await db.insert(conversations).values(newConversation);
      }
    } catch (convError) {
      console.error(
        "[AgentRuntime] Error ensuring conversation exists:",
        convError,
      );
      throw convError;
    }

    // Create user message
    const userMessage: NewMessage = {
      id: clientMessageId || uuidv4(),
      conversationId,
      userId,
      agentId: agentId || "otc-desk-agent",
      content: JSON.stringify(content),
      isAgent: false,
    };

    // Store user message in database
    console.log("[AgentRuntime] Inserting user message:", userMessage);
    let insertedUserMessage;
    try {
      const result = await db.insert(messages).values(userMessage).returning();
      insertedUserMessage = result[0];
      console.log(
        "[AgentRuntime] User message inserted:",
        insertedUserMessage?.id,
      );
    } catch (error) {
      console.error("[AgentRuntime] Error inserting user message:", error);
      throw error;
    }

    // Ensure agent/room records exist for plugin memory writes
    await this.ensureAgentAndRoomRecords(conversationId);

    // Emit MESSAGE_RECEIVED and delegate handling to plugins
    console.log("[AgentRuntime] Emitting MESSAGE_RECEIVED event to plugins");

    try {
      await runtime.emitEvent(EventType.MESSAGE_RECEIVED, {
        runtime,
        message: {
          id: userMessage.id,
          content: {
            text: content.text || "",
            attachments: content.attachments || [],
          },
          userId,
          agentId: runtime.agentId,
          roomId: conversationId,
          createdAt: Date.now(),
        },
        callback: async (result: { text?: string; attachments?: any[] }) => {
          const responseText = result?.text || "";

          const agentMessage: NewMessage = {
            id: uuidv4(),
            conversationId,
            userId: "otc-desk-agent",
            agentId: "otc-desk-agent",
            content: JSON.stringify({
              text: responseText,
              type: "agent",
            }),
            isAgent: true,
          };

          try {
            console.log(
              "[AgentRuntime] Inserting agent message:",
              agentMessage.id,
            );
            await db.insert(messages).values(agentMessage);
            console.log("[AgentRuntime] Agent message inserted successfully");
          } catch (error) {
            console.error(
              "[AgentRuntime] Error inserting agent message:",
              error,
            );
          }

          try {
            await db
              .update(conversations)
              .set({ lastMessageAt: new Date(), updatedAt: new Date() })
              .where(eq(conversations.id, conversationId));
            console.log("[AgentRuntime] Updated conversation timestamp");
          } catch (error) {
            console.error("[AgentRuntime] Error updating conversation:", error);
          }
        },
      });
    } catch (error) {
      console.error(
        "[AgentRuntime] Error during MESSAGE_RECEIVED handling:",
        error,
      );
    }

    return insertedUserMessage;
  }

  // Get messages for a conversation
  public async getConversationMessages(
    conversationId: string,
    limit = 50,
    afterTimestamp?: number,
  ): Promise<Message[]> {
    const baseWhere = eq(messages.conversationId, conversationId);
    const whereClause = afterTimestamp
      ? and(baseWhere, gt(messages.createdAt, new Date(afterTimestamp)))
      : baseWhere;

    const results = await db
      .select()
      .from(messages)
      .where(whereClause)
      .orderBy(asc(messages.createdAt))
      .limit(limit);

    return results; // Already chronological
  }

  // Create a new conversation
  public async createConversation(userId: string): Promise<string> {
    const conversationId = uuidv4();

    const newConversation: NewConversation = {
      id: conversationId,
      userId,
      title: "New Conversation",
    };

    await db.insert(conversations).values(newConversation);

    return conversationId;
  }

  // Get user's conversations
  public async getUserConversations(userId: string): Promise<Conversation[]> {
    const userConversations = await db
      .select()
      .from(conversations)
      .where(eq(conversations.userId, userId))
      .orderBy(
        desc(conversations.lastMessageAt),
        desc(conversations.createdAt),
      );

    return userConversations;
  }

  public async getConversation(
    conversationId: string,
  ): Promise<Conversation | undefined> {
    const [conversation] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, conversationId));

    return conversation;
  }
}

// Export singleton instance
export const agentRuntime = AgentRuntimeManager.getInstance();
