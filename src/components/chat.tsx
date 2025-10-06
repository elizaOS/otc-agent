"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { v4 as uuidv4 } from "uuid";

import { ChatMessages } from "@/components/chat-messages";
import { Dialog } from "@/components/dialog";
import { useMultiWallet } from "@/components/multiwallet";
import { NetworkConnectButton } from "@/components/network-connect";
import { LoadingSpinner } from "@/components/spinner";
import { TextareaWithActions } from "@/components/textarea-with-actions";
import { AcceptQuoteModal } from "@/components/accept-quote-modal";
import { Button } from "@/components/button";
import { CHAT_SOURCE, USER_NAME } from "@/constants";
import type { ChatMessage } from "@/types/chat-message";
import { parseMessageXML } from "@/utils/xml-parser";

interface ChatProps {
  roomId?: string;
}

export const Chat = ({ roomId: initialRoomId }: ChatProps = {}) => {
  // --- State ---
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [inputDisabled, setInputDisabled] = useState<boolean>(false);
  const [roomId, setRoomId] = useState<string | null>(initialRoomId || null);
  const [isLoadingHistory, setIsLoadingHistory] = useState<boolean>(false);
  const [isAgentThinking, setIsAgentThinking] = useState<boolean>(false);
  const [entityId, setUserId] = useState<string | null>(null);
  const { isConnected: unifiedConnected, entityId: unifiedUserId } =
    useMultiWallet();
  const [showConnectOverlay, setShowConnectOverlay] = useState<boolean>(false);
  const [currentQuote, setCurrentQuote] = useState<any>(null);
  const [showAcceptModal, setShowAcceptModal] = useState<boolean>(false);
  const [isOfferGlowing, setIsOfferGlowing] = useState<boolean>(false);
  const [showClearChatModal, setShowClearChatModal] = useState<boolean>(false);

  // --- Refs ---
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastMessageTimestampRef = useRef<number>(0);
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const previousQuoteIdRef = useRef<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // (Removed duplicate time helper; consolidated in utils/time if needed elsewhere)

  // Initialize user from connected wallet; gate chat when disconnected
  useEffect(() => {
    if (typeof window === "undefined") return;

    if (unifiedConnected && unifiedUserId) {
      const addr = unifiedUserId.toLowerCase();
      setUserId(addr);

      // Load room for this wallet if we have one
      const storedRoomId = localStorage.getItem(`otc-desk-room-${addr}`);
      if (storedRoomId && !initialRoomId) {
        setRoomId(storedRoomId);
      }
      setShowConnectOverlay(false);
      setInputDisabled(false);
    } else {
      // Disconnected: lock the chat and show overlay
      setUserId(null);
      setInputDisabled(true);
      // Always show overlay when wallet is not connected
      setShowConnectOverlay(true);
    }
  }, [unifiedConnected, unifiedUserId, initialRoomId]);

  // Function to create a new room
  const createNewRoom = useCallback(async () => {
    if (!entityId) return null;

    try {
      const response = await fetch("/api/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entityId }),
      });

      if (!response.ok) {
        throw new Error("Failed to create room");
      }

      const data = await response.json();
      const newRoomId = data.roomId;

      setRoomId(newRoomId);
      // Persist room per-wallet
      try {
        if (entityId) {
          localStorage.setItem(`otc-desk-room-${entityId}`, newRoomId);
        }
      } catch {}
      setMessages([]);

      return newRoomId;
    } catch (error) {
      throw error;
      return null;
    }
  }, [entityId]);

  // Load room data
  useEffect(() => {
    if (!roomId || !entityId) return;

    const loadRoom = async () => {
      try {
        setIsLoadingHistory(true);

        const response = await fetch(`/api/rooms/${roomId}/messages`, {
          cache: "no-store",
        });

        if (response.ok) {
          const data = await response.json();
          const messages = data.messages || [];

          // Format messages for display with generous parsing
          const formattedMessages = messages
            .filter((msg: any) => {
              // Parse message text to check if we should filter it
              let messageText = "";
              if (msg.content?.text) {
                messageText = msg.content.text;
              } else if (msg.text) {
                messageText = msg.text;
              } else if (msg.content && typeof msg.content === "string") {
                messageText = msg.content;
              }
              
              // Filter out system messages
              return !messageText.startsWith("Executed action:");
            })
            .map((msg: any) => {
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
                name: msg.entityId === msg.agentId ? "Eliza" : USER_NAME,
                text: messageText,
                senderId: msg.entityId,
                roomId: roomId,
                createdAt:
                  typeof msg.createdAt === "number"
                    ? msg.createdAt
                    : new Date(msg.createdAt || Date.now()).getTime(),
                source: CHAT_SOURCE,
                isLoading: false,
                serverMessageId: msg.id, // Store server ID for deduplication
              };
            });

          // Deduplicate: remove optimistic client messages and use server versions
          setMessages((prev) => {
            // Filter out optimistic user messages (client-side only)
            const withoutOptimistic = prev.filter(
              (m) => !(m as any).isUserMessage,
            );

            // Merge and dedupe by server ID
            const byServerId = new Map<string, any>();
            withoutOptimistic.forEach((m) => {
              byServerId.set(m.id, m);
            });
            formattedMessages.forEach((m: any) => {
              byServerId.set(m.serverMessageId, m);
            });

            const result = Array.from(byServerId.values());
            result.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));

            return result;
          });

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

    loadRoom();
  }, [roomId, entityId]);

  // Poll for new messages when agent is thinking
  useEffect(() => {
    if (!isAgentThinking || !roomId) {
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
          `/api/rooms/${roomId}/messages?afterTimestamp=${lastMessageTimestampRef.current}&_=${Date.now()}`,
          {
            cache: "no-store",
          },
        );

        if (response.ok) {
          const data = await response.json();
          const newMessages = data.messages || [];

          if (newMessages.length > 0) {
            const formattedMessages = newMessages
              .filter((msg: any) => {
                // Parse message text to check if we should filter it
                let messageText = "";
                if (msg.content?.text) {
                  messageText = msg.content.text;
                } else if (msg.text) {
                  messageText = msg.text;
                } else if (msg.content && typeof msg.content === "string") {
                  messageText = msg.content;
                }
                
                // Filter out system messages
                return !messageText.startsWith("Executed action:");
              })
              .map((msg: any) => {
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
                  name: msg.entityId === msg.agentId ? "Eliza" : USER_NAME,
                  text: messageText,
                  senderId: msg.entityId,
                  roomId: roomId,
                  createdAt:
                    typeof msg.createdAt === "number"
                      ? msg.createdAt
                      : new Date(msg.createdAt || Date.now()).getTime(),
                  source: CHAT_SOURCE,
                  isLoading: false,
                  serverMessageId: msg.id, // Store server ID for deduplication
                };
              });

            setMessages((prev) => {
              console.log(
                `[Polling] Received ${formattedMessages.length} new messages`,
              );

              // Remove optimistic client messages - they'll be replaced by server versions
              const withoutOptimistic = prev.filter(
                (m) => !(m as any).isUserMessage,
              );

              // Merge with new messages and dedupe by server ID
              const byServerId = new Map<string, any>();
              withoutOptimistic.forEach((m) => {
                const key = (m as any).serverMessageId || m.id;
                byServerId.set(key, m);
              });
              formattedMessages.forEach((m: any) => {
                byServerId.set(m.serverMessageId, m);
              });

              const merged = Array.from(byServerId.values());
              merged.sort(
                (a: any, b: any) => (a.createdAt || 0) - (b.createdAt || 0),
              );

              console.log(
                `[Polling] After deduplication: ${merged.length} total messages`,
              );
              return merged;
            });

            // Update last message timestamp
            const lastNewMessage =
              formattedMessages[formattedMessages.length - 1];
            lastMessageTimestampRef.current = lastNewMessage.createdAt;

            // Check if we received an agent message
            const hasAgentMessage = newMessages.some(
              (msg: any) => msg.entityId === msg.agentId,
            );
            if (hasAgentMessage) {
              console.log(
                "[Polling] Agent response received, stopping polling",
              );
              setIsAgentThinking(false);
              setInputDisabled(false);
            }
          }
        }
      } catch {
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
  }, [isAgentThinking, roomId]);

  // Send message function
  const sendMessage = useCallback(
    async (messageText: string) => {
      console.log(
        "sendMessage",
        messageText,
        entityId,
        roomId,
        inputDisabled,
        unifiedConnected,
      );
      if (
        !messageText.trim() ||
        !entityId ||
        !roomId ||
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
        senderId: entityId,
        roomId: roomId,
        createdAt: Date.now(),
        source: CHAT_SOURCE,
        isLoading: false,
        isUserMessage: true,
      };

      setMessages((prev) => [...prev, userMessage]);
      setIsAgentThinking(true);
      setInputDisabled(true);

      const doPost = async () =>
        fetch(`/api/rooms/${roomId}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            entityId,
            text: messageText,
            clientMessageId,
          }),
          cache: "no-store",
          keepalive: true,
        });

      try {
        let response = await doPost();
        if (!response.ok) {
          // Retry once on transient server errors
          await new Promise((r) => setTimeout(r, 800));
          response = await doPost();
        }
        if (!response.ok) throw new Error("Failed to send message");

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
            // Set to just before our message so we catch both our message and agent's response
            lastMessageTimestampRef.current = serverCreatedAt - 100;
            console.log(
              `[Send Message] Set polling timestamp to ${lastMessageTimestampRef.current} (server time: ${serverCreatedAt})`,
            );
          } else {
            // Fallback: use current time minus a buffer
            lastMessageTimestampRef.current = Date.now() - 1000;
            console.log(
              `[Send Message] Set polling timestamp to ${lastMessageTimestampRef.current} (fallback)`,
            );
          }
        } catch {
          // If parsing fails, use current time with buffer to ensure we catch responses
          lastMessageTimestampRef.current = Date.now() - 1000;
          console.log(
            `[Send Message] Set polling timestamp to ${lastMessageTimestampRef.current} (error fallback)`,
          );
        }
      } catch (error) {
        // On network errors, try one delayed retry before failing
        const isNetworkError = error instanceof TypeError;
        if (isNetworkError) {
          try {
            await new Promise((r) => setTimeout(r, 1200));
            const retryRes = await doPost();
            if (!retryRes.ok) throw new Error("Failed to send message");
          } catch (finalErr) {
            setIsAgentThinking(false);
            setInputDisabled(false);
            setMessages((prev) =>
              prev.filter((msg) => msg.id !== userMessage.id),
            );
            throw finalErr;
          }
        } else {
          setIsAgentThinking(false);
          setInputDisabled(false);
          setMessages((prev) =>
            prev.filter((msg) => msg.id !== userMessage.id),
          );
          throw error;
        }
      }
    },
    [entityId, roomId, inputDisabled, unifiedConnected],
  );

  // Handle form submit
  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = input.trim();
      if (!trimmed) return;

      console.log("handleSubmit", trimmed, entityId, roomId, unifiedConnected);

      // Ensure user is connected and room exists before sending
      if (!unifiedConnected || !entityId) {
        setShowConnectOverlay(true);
        return;
      }

      let activeRoomId = roomId;
      if (!activeRoomId) {
        activeRoomId = await createNewRoom();
        if (!activeRoomId) return; // creation failed
        setRoomId(activeRoomId);
      }

      await sendMessage(trimmed);
      setInput("");
      
      // Refocus the textarea after sending
      setTimeout(() => {
        textareaRef.current?.focus();
      }, 0);
    },
    [input, unifiedConnected, entityId, roomId, createNewRoom, sendMessage],
  );

  // Handle creating a new room when there isn't one
  useEffect(() => {
    if (!roomId && entityId && unifiedConnected) {
      // Automatically create a room for this wallet when connected
      createNewRoom();
    }
  }, [roomId, entityId, unifiedConnected, createNewRoom]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    container.scrollTop = container.scrollHeight;
  }, [messages]);

  // Extract current quote from messages
  useEffect(() => {
    if (!messages.length) {
      console.log('[Quote Update] No messages yet');
      return;
    }

    console.log('[Quote Update] Scanning', messages.length, 'messages for quote');

    // Find the latest quote in messages
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (!msg || msg.name === USER_NAME) continue;
      
      try {
        const parsed = parseMessageXML(
          typeof msg.text === "string" ? msg.text : (msg as any).content?.text || ""
        );
        
        if (parsed?.type === "otc_quote" && parsed.data) {
          const newQuote = parsed.data;
          const newQuoteId = newQuote.quoteId;
          const prevQuoteId = previousQuoteIdRef.current;
          
          // Only update if quote actually changed
          if (prevQuoteId !== newQuoteId) {
            console.log('[Quote Update] Quote changed:', { prevQuoteId, newQuoteId });
            
            // Trigger glow effect only if there was a previous quote
            if (prevQuoteId) {
              console.log('[Quote Update] Triggering glow effect');
              setIsOfferGlowing(true);
              setTimeout(() => {
                console.log('[Quote Update] Stopping glow effect');
                setIsOfferGlowing(false);
              }, 5000);
            }
            
            // Update the ref and state
            previousQuoteIdRef.current = newQuoteId;
            setCurrentQuote(newQuote);
          }
          break;
        }
      } catch (e) {
        console.error('[Quote Update] Error parsing message:', e);
      }

    }
  }, [messages]);

  const handleAcceptOffer = () => {
    setShowAcceptModal(true);
  };

  const handleClearChat = useCallback(async () => {
    if (!entityId) return;

    try {
      // Clear local storage for this wallet
      localStorage.removeItem(`otc-desk-room-${entityId}`);
      
      // Create a new room
      const newRoomId = await createNewRoom();
      if (newRoomId) {
        // Clear messages and reset state
        setMessages([]);
        setCurrentQuote(null);
        previousQuoteIdRef.current = null;
        setRoomId(newRoomId);
        console.log("[ClearChat] Created new room:", newRoomId);
      }
      
      setShowClearChatModal(false);
    } catch (error) {
      console.error("[ClearChat] Failed to clear chat:", error);
    }
  }, [entityId, createNewRoom]);

  return (
    <>
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
        textareaRef={textareaRef}
        showConnectOverlay={showConnectOverlay}
        setShowConnectOverlay={setShowConnectOverlay}
        currentQuote={currentQuote}
        onAcceptOffer={handleAcceptOffer}
        isOfferGlowing={isOfferGlowing}
        onClearChat={() => setShowClearChatModal(true)}
      />
      <AcceptQuoteModal
        isOpen={showAcceptModal}
        onClose={() => setShowAcceptModal(false)}
        initialQuote={currentQuote}
      />
      
      {/* Clear Chat Confirmation Modal */}
      <Dialog
        open={showClearChatModal}
        onClose={() => setShowClearChatModal(false)}
      >
        <div className="bg-white dark:bg-zinc-900 max-w-md">
          <h3 className="text-xl font-semibold bg-red-500 dark:bg-red-500 mb-4 px-4 py-2">
            Clear Chat History?
          </h3>
          <p className="text-zinc-600 dark:text-zinc-400 mb-6">
            This will permanently delete all messages and reset the agent's memory of your conversation. 
            Your current quote will be reset to default terms. This action cannot be undone.
          </p>
          <div className="flex gap-3 justify-end">
            <Button
              onClick={() => setShowClearChatModal(false)}
              className="bg-zinc-200 dark:bg-zinc-800 rounded-lg"
            >
              <div className="px-4 py-2">
              Cancel
              </div>
            </Button>
            <Button
              onClick={handleClearChat}
              color="red"
            >
              <div className="px-4 py-2 bg-red-500 dark:bg-red-500 rounded-lg"> 
              Clear Chat
              </div>
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
};

function ChatHeader({
  messages,
  apiQuote,
  onAcceptOffer,
  isOfferGlowing,
  onClearChat,
}: {
  messages: ChatMessage[];
  apiQuote: any;
  onAcceptOffer: () => void;
  isOfferGlowing: boolean;
  onClearChat: () => void;
}) {
  // Use the quote passed from parent (extracted from messages)
  const currentQuote = apiQuote;

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
              <Button
                onClick={onAcceptOffer}
                className={`!h-8 !px-3 !text-xs transition-all duration-300 !bg-orange-500 hover:!bg-orange-600 !text-white !border-orange-600 ${
                  isOfferGlowing 
                    ? 'shadow-lg shadow-orange-500/50 ring-2 ring-orange-400 animate-pulse' 
                    : ''
                }`}
                color="orange"
                title={`Accept Offer ${isOfferGlowing ? '(GLOWING)' : ''}`}
              >
                Accept Offer
              </Button>
            </div>
          ) : null}
          <Button 
            onClick={onClearChat} 
            className="!h-8 !px-3 !text-xs bg-red-500 dark:bg-red-500 rounded-lg"
          >
            Clear Chat
          </Button>
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
  textareaRef,
  showConnectOverlay,
  setShowConnectOverlay,
  currentQuote,
  onAcceptOffer,
  isOfferGlowing,
  onClearChat,
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
  textareaRef: React.RefObject<HTMLTextAreaElement>;
  showConnectOverlay: boolean;
  setShowConnectOverlay: (v: boolean) => void;
  currentQuote: any;
  onAcceptOffer: () => void;
  isOfferGlowing: boolean;
  onClearChat: () => void;
}) {
  return (
    <div className="flex flex-1 min-h-0 h-full w-full">
      {/* Connect wallet overlay */}
      <Dialog
        open={showConnectOverlay}
        onClose={() => {
          try {
            localStorage.setItem("otc-desk-connect-overlay-seen", "1");
            localStorage.setItem("otc-desk-connect-overlay-dismissed", "1");
          } catch {}
          setShowConnectOverlay(false);
        }}
      >
        <div className="relative p-0">
          <div className="flex flex-col items-center justify-center w-[min(640px,90vw)]">
            <div className="w-full rounded-2xl overflow-hidden bg-zinc-50 dark:bg-zinc-900 ring-1 ring-zinc-200 dark:ring-zinc-800 shadow-2xl">
              <div className="relative w-full">
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
                      Get discounted ElizaOS tokens. Let&apos;s deal, anon.
                    </p>
                    <div className="inline-flex gap-2">
                      <NetworkConnectButton className="!h-10 !px-4 !py-2 bg-orange-500 dark:bg-orange-500 rounded-lg">
                        Connect
                      </NetworkConnectButton>
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

      {/* Main container - full width */}
      <div className="relative z-10 flex flex-1 min-h-0 p-4">
        {/* Chat section - Full width */}
        <div className="flex-1 flex flex-col h-full min-w-0">
          <ChatHeader messages={messages} apiQuote={currentQuote} onAcceptOffer={onAcceptOffer} isOfferGlowing={isOfferGlowing} onClearChat={onClearChat} />

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

          {/* Input Area - pinned to bottom of chat */}
          <div className="mt-auto">
            <TextareaWithActions
              ref={textareaRef}
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
