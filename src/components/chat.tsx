"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { v4 as uuidv4 } from "uuid";

import { ChatMessages } from "@/components/chat-messages";
import { Dialog } from "@/components/dialog";
import { LoadingSpinner } from "@/components/spinner";
import { TextareaWithActions } from "@/components/textarea-with-actions";
import { CHAT_SOURCE, USER_NAME } from "@/constants";
import type { ChatMessage } from "@/types/chat-message";
import { parseMessageXML } from "@/utils/xml-parser";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Button } from "@/components/button";
import { NetworkConnectButton } from "@/components/network-connect";
import { useAccount } from "wagmi";
import { useMultiWallet } from "@/components/multiwallet";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";

interface ChatProps {
  conversationId?: string;
}

export const Chat = ({
  conversationId: propConversationId,
}: ChatProps = {}) => {
  // --- State ---
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [inputDisabled, setInputDisabled] = useState<boolean>(false);
  const [conversationId, setConversationId] = useState<string | null>(
    propConversationId || null,
  );
  const [isLoadingHistory, setIsLoadingHistory] = useState<boolean>(false);
  const [isAgentThinking, setIsAgentThinking] = useState<boolean>(false);
  const [userId, setUserId] = useState<string | null>(null);
  const { address, isConnected } = useAccount();
  const { isConnected: unifiedConnected, userId: unifiedUserId } =
    useMultiWallet();
  const [showConnectOverlay, setShowConnectOverlay] = useState<boolean>(false);
  const [overlayDismissed, setOverlayDismissed] = useState<boolean>(false);

  // --- Refs ---
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastMessageTimestampRef = useRef<number>(0);
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);

  // (Removed duplicate time helper; consolidated in utils/time if needed elsewhere)

  // Initialize user from connected wallet; gate chat when disconnected
  useEffect(() => {
    if (typeof window === "undefined") return;

    if (unifiedConnected && unifiedUserId) {
      const addr = unifiedUserId.toLowerCase();
      setUserId(addr);

      // Load conversation for this wallet if we have one
      const storedConversationId = localStorage.getItem(
        `otc-desk-conversation-${addr}`,
      );
      if (storedConversationId && !propConversationId) {
        setConversationId(storedConversationId);
      }
      setShowConnectOverlay(false);
    } else {
      // Disconnected: lock the chat and show overlay
      setUserId(null);
      setInputDisabled(true);
      // Show only on first visit until user dismisses
      try {
        const seen = localStorage.getItem("otc-desk-connect-overlay-seen");
        const dismissed = localStorage.getItem(
          "otc-desk-connect-overlay-dismissed",
        );
        const shouldShow = !seen && !dismissed;
        setShowConnectOverlay(shouldShow);
      } catch {
        setShowConnectOverlay(true);
      }
    }
  }, [unifiedConnected, unifiedUserId, propConversationId]);

  // Function to create a new conversation
  const createNewConversation = useCallback(async () => {
    if (!userId) return null;

    try {
      const response = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });

      if (!response.ok) {
        throw new Error("Failed to create conversation");
      }

      const data = await response.json();
      const newConversationId = data.conversationId;

      setConversationId(newConversationId);
      // Persist conversation per-wallet
      try {
        if (userId) {
          localStorage.setItem(
            `otc-desk-conversation-${userId}`,
            newConversationId,
          );
        }
      } catch {}
      setMessages([]);

      return newConversationId;
    } catch (error) {
      throw error;
      return null;
    }
  }, [userId]);

  // Load conversation data
  useEffect(() => {
    if (!conversationId || !userId) return;

    const loadConversation = async () => {
      try {
        setIsLoadingHistory(true);

        const response = await fetch(
          `/api/conversations/${conversationId}/messages`,
        );

        if (response.ok) {
          const data = await response.json();
          const messages = data.messages || [];

          // Format messages for display with generous parsing
          const formattedMessages = messages.map((msg: any) => {
            // Parse message text from various possible formats
            let messageText = "";
            if (msg.content?.text) {
              messageText = msg.content.text;
            } else if (msg.text) {
              messageText = msg.text;
            } else if (msg.content && typeof msg.content === "string") {
              messageText = msg.content;
            } else if (msg.content) {
              messageText = JSON.stringify(msg.content);
            }

            return {
              id: msg.id || `msg-${msg.createdAt}`,
              name: msg.isAgent ? "Eliza" : USER_NAME,
              text: messageText,
              senderId: msg.userId,
              roomId: conversationId,
              createdAt: new Date(msg.createdAt).getTime(),
              source: CHAT_SOURCE,
              isLoading: false,
            };
          });

          setMessages(formattedMessages);

          // Update last message timestamp
          if (formattedMessages.length > 0) {
            lastMessageTimestampRef.current =
              formattedMessages[formattedMessages.length - 1].createdAt;
          }
        }
      } catch (error) {
        throw error;
      } finally {
        setIsLoadingHistory(false);
      }
    };

    loadConversation();
  }, [conversationId, userId]);

  // Poll for new messages when agent is thinking
  useEffect(() => {
    if (!isAgentThinking || !conversationId) {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
      return;
    }

    // Poll every second for new messages
    pollingIntervalRef.current = setInterval(async () => {
      try {
        const response = await fetch(
          `/api/conversations/${conversationId}/messages?afterTimestamp=${lastMessageTimestampRef.current}`,
        );

        if (response.ok) {
          const data = await response.json();
          const newMessages = data.messages || [];

          if (newMessages.length > 0) {
            const formattedMessages = newMessages.map((msg: any) => {
              // Parse message text from various possible formats
              let messageText = "";
              if (msg.content?.text) {
                messageText = msg.content.text;
              } else if (msg.text) {
                messageText = msg.text;
              } else if (msg.content && typeof msg.content === "string") {
                messageText = msg.content;
              } else if (msg.content) {
                messageText = JSON.stringify(msg.content);
              }

              return {
                id: msg.id || `msg-${msg.createdAt}`,
                name: msg.isAgent ? "Eliza" : USER_NAME,
                text: messageText,
                senderId: msg.userId,
                roomId: conversationId,
                createdAt: new Date(msg.createdAt).getTime(),
                source: CHAT_SOURCE,
                isLoading: false,
              };
            });

            setMessages((prev) => {
              const byId = new Map<string, any>();
              prev.forEach((m) => byId.set(m.id, m));
              formattedMessages.forEach((m: any) => byId.set(m.id, m));
              const merged = Array.from(byId.values());
              merged.sort(
                (a: any, b: any) => (a.createdAt || 0) - (b.createdAt || 0),
              );
              return merged;
            });

            // Update last message timestamp
            const lastNewMessage =
              formattedMessages[formattedMessages.length - 1];
            lastMessageTimestampRef.current = lastNewMessage.createdAt;

            // Check if we received an agent message
            const hasAgentMessage = newMessages.some((msg: any) => msg.isAgent);
            if (hasAgentMessage) {
              setIsAgentThinking(false);
              setInputDisabled(false);
            }
          }
        }
      } catch (error) {
        // Ignore polling errors - they're expected when messages aren't ready
      }
    }, 1000);

    // Stop polling after 30 seconds
    setTimeout(() => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
        setIsAgentThinking(false);
        setInputDisabled(false);
      }
    }, 30000);

    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
  }, [isAgentThinking, conversationId]);

  // Send message function
  const sendMessage = useCallback(
    async (messageText: string) => {
      if (
        !messageText.trim() ||
        !userId ||
        !conversationId ||
        inputDisabled ||
        !unifiedConnected
      ) {
        throw new Error("Cannot send message: missing required data");
      }

      // Add user message to UI immediately with a client-generated ID
      const clientMessageId = uuidv4();
      const userMessage: ChatMessage = {
        id: clientMessageId,
        name: USER_NAME,
        text: messageText,
        senderId: userId,
        roomId: conversationId,
        createdAt: Date.now(),
        source: CHAT_SOURCE,
        isLoading: false,
      };

      setMessages((prev) => [...prev, userMessage]);
      setIsAgentThinking(true);
      setInputDisabled(true);

      try {
        // Send message via API
        const response = await fetch(
          `/api/conversations/${conversationId}/messages`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              userId,
              text: messageText,
              clientMessageId,
            }),
          },
        );

        if (!response.ok) {
          throw new Error("Failed to send message");
        }

        // Prefer server timestamp to avoid client/server clock skew missing agent replies
        try {
          const result = await response.json();
          const serverCreatedAt = result?.message?.createdAt
            ? new Date(result.message.createdAt).getTime()
            : undefined;
          if (
            typeof serverCreatedAt === "number" &&
            !Number.isNaN(serverCreatedAt)
          ) {
            // Subtract 1ms to include any agent messages written at the same DB timestamp second
            lastMessageTimestampRef.current = Math.max(
              lastMessageTimestampRef.current,
              serverCreatedAt - 1,
            );
          }
        } catch {
          // If parsing fails, fall back to previous timestamp; polling will still pick up messages
        }
      } catch (error) {
        setIsAgentThinking(false);
        setInputDisabled(false);
        setMessages((prev) => prev.filter((msg) => msg.id !== userMessage.id));
        throw error;
      }
    },
    [userId, conversationId, inputDisabled, unifiedConnected],
  );

  // Handle form submit
  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (input.trim()) {
        sendMessage(input.trim());
        setInput("");
      }
    },
    [input, sendMessage],
  );

  // Handle creating a new conversation when there isn't one
  useEffect(() => {
    if (!conversationId && userId && unifiedConnected) {
      // Automatically create a conversation for this wallet when connected
      createNewConversation();
    }
  }, [conversationId, userId, unifiedConnected, createNewConversation]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    container.scrollTop = container.scrollHeight;
  }, [messages]);

  return (
    <ChatBody
      messages={messages}
      isLoadingHistory={isLoadingHistory}
      isAgentThinking={isAgentThinking}
      input={input}
      setInput={setInput}
      handleSubmit={handleSubmit}
      inputDisabled={inputDisabled}
      isConnected={unifiedConnected}
      messagesContainerRef={messagesContainerRef}
      showConnectOverlay={showConnectOverlay}
      setShowConnectOverlay={setShowConnectOverlay}
      setOverlayDismissed={setOverlayDismissed}
      onClear={createNewConversation}
    />
  );
};

function ChatHeader({
  messages,
  onClear,
  isConnected,
}: {
  messages: ChatMessage[];
  onClear: () => void;
  isConnected: boolean;
}) {
  // Find latest assistant quote
  let currentQuote: any = null;
  try {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const m = messages[i];
      if (!m || m.name === USER_NAME) continue;
      const res = parseMessageXML(
        typeof m.text === "string" ? m.text : (m as any).content?.text || "",
      );
      if (res?.type === "otc_quote") {
        currentQuote = res.data;
        break;
      }
    }
  } catch {}

  return (
    <div className="mb-3">
      <div className="flex items-center gap-3">
        <div className="ml-auto flex items-center gap-3">
          {currentQuote ? (
            <div className="hidden sm:flex items-center gap-6 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white/50 dark:bg-zinc-900/50 px-4 py-2">
              <div className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Current Offer
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-zinc-500 dark:text-zinc-400 text-xs">
                  Discount
                </span>
                <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  {(
                    (currentQuote as any).discountPercent ||
                    (currentQuote as any).discountBps / 100
                  ).toFixed(0)}
                  %
                </span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-zinc-500 dark:text-zinc-400 text-xs">
                  Maturity
                </span>
                <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  {Math.round(
                    (currentQuote as any).lockupMonths ||
                      ((currentQuote as any).lockupDays || 0) / 30,
                  )}{" "}
                  months
                </span>
              </div>
            </div>
          ) : null}
          {/* <Button onClick={onClear} color="blue" disabled={!isConnected}>
            Clear Chat
          </Button> */}
        </div>
      </div>
    </div>
  );
}

function ChatBody({
  messages,
  isLoadingHistory,
  isAgentThinking,
  input,
  setInput,
  handleSubmit,
  inputDisabled,
  isConnected,
  messagesContainerRef,
  showConnectOverlay,
  setShowConnectOverlay,
  setOverlayDismissed,
  onClear,
}: {
  messages: ChatMessage[];
  isLoadingHistory: boolean;
  isAgentThinking: boolean;
  input: string;
  setInput: (s: string) => void;
  handleSubmit: (e: React.FormEvent) => void;
  inputDisabled: boolean;
  isConnected: boolean;
  messagesContainerRef: React.RefObject<HTMLDivElement>;
  showConnectOverlay: boolean;
  setShowConnectOverlay: (v: boolean) => void;
  setOverlayDismissed: (v: boolean) => void;
  onClear: () => Promise<string | null> | null | void;
}) {
  return (
    <div className="flex flex-col flex-1 min-h-0 h-full w-full">
      {/* Connect wallet overlay */}
      <Dialog
        open={showConnectOverlay}
        onClose={(open) => {
          // Allow Esc/outside-click to dismiss once per session
          try {
            localStorage.setItem("otc-desk-connect-overlay-seen", "1");
            localStorage.setItem("otc-desk-connect-overlay-dismissed", "1");
          } catch {}
          setOverlayDismissed(true);
          setShowConnectOverlay(false);
        }}
      >
        <div className="relative p-0">
          <div className="flex flex-col items-center justify-center w-[min(640px,90vw)]">
            <div className="w-full rounded-2xl overflow-hidden bg-zinc-50 dark:bg-zinc-900 ring-1 ring-zinc-200 dark:ring-zinc-800 shadow-2xl">
              <div className="relative w-full">
                {/* Hero area */}
                <div className="relative aspect-[16/9] w-full bg-gradient-to-br from-zinc-900 to-zinc-800">
                  <div
                    aria-hidden
                    className="absolute inset-0 opacity-30 bg-no-repeat bg-right-bottom"
                    style={{
                      backgroundImage: "url('/business.png')",
                      backgroundSize: "contain",
                    }}
                  />
                  <div className="relative z-10 h-full w-full flex flex-col items-center justify-center text-center px-6">
                    <h2 className="text-2xl font-semibold text-white tracking-tight mb-2">
                      Connect Wallet
                    </h2>
                    <p className="text-zinc-300 text-sm mb-4">
                      Get discounted ElizaOS tokens. Let’s deal, anon.
                    </p>
                    <div className="inline-flex gap-2">
                      <NetworkConnectButton className="!h-10">Connect</NetworkConnectButton>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      try {
                        localStorage.setItem(
                          "otc-desk-connect-overlay-seen",
                          "1",
                        );
                        localStorage.setItem(
                          "otc-desk-connect-overlay-dismissed",
                          "1",
                        );
                      } catch {}
                      setOverlayDismissed(true);
                      setShowConnectOverlay(false);
                    }}
                    className="absolute top-2 right-2 rounded-full bg-white/10 text-white hover:bg-white/20 p-1"
                    aria-label="Close"
                  >
                    <svg
                      className="h-5 w-5"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path
                        fillRule="evenodd"
                        d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </button>
                </div>
              </div>
              <div className="p-4 text-xs text-zinc-600 dark:text-zinc-400">
                You must connect a wallet to chat. Conversations are tied to
                your address.
              </div>
            </div>
          </div>
        </div>
      </Dialog>

      {/* Main chat container */}
      <div className="relative z-10 flex flex-1 min-h-0 p-4">
        <div className="w-full flex flex-col h-full">
          {/* Header row with Current Offer summary and actions */}
          <ChatHeader
            messages={messages}
            onClear={() => {
              if (onClear) onClear();
            }}
            isConnected={isConnected}
          />

          {/* Chat Messages - only scrollable area */}
          <div
            ref={messagesContainerRef}
            className="flex-1 min-h-0 overflow-y-auto"
          >
            {isLoadingHistory ? (
              <div className="flex items-center justify-center min-h-full">
                <div className="flex items-center gap-2">
                  <LoadingSpinner />
                  <span className="text-gray-600">Loading conversation...</span>
                </div>
              </div>
            ) : messages.length === 0 ? (
              <div className="flex items-center justify-center min-h-full text-center">
                <div>
                  <h2 className="text-xl font-semibold text-zinc-700 dark:text-zinc-300 mb-2">
                    Welcome to ElizaOS OTC Desk
                  </h2>
                  <p className="text-zinc-500 dark:text-zinc-400">
                    {isConnected
                      ? "Ask me about quotes for ElizaOS tokens!"
                      : "Connect your wallet to get a quote and start chatting."}
                  </p>
                </div>
              </div>
            ) : (
              <>
                <ChatMessages
                  messages={messages}
                  citationsMap={{}}
                  followUpPromptsMap={{}}
                  onFollowUpClick={(prompt) => {
                    setInput(prompt);
                  }}
                />
                {isAgentThinking && (
                  <div className="flex items-center gap-2 py-4 text-gray-600">
                    <LoadingSpinner />
                    <span>Eliza is thinking...</span>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Input Area - pinned to bottom of page */}
          <div className="mt-auto">
            <TextareaWithActions
              input={input}
              onInputChange={(e) => setInput(e.target.value)}
              onSubmit={handleSubmit}
              isLoading={isAgentThinking || inputDisabled || !isConnected}
              placeholder={
                isConnected
                  ? "Ask about quotes for ElizaOS tokens..."
                  : "Connect wallet to chat"
              }
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default Chat;
