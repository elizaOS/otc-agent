"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LoadingSpinner } from "@/components/spinner";
import { formatTimeAgo } from "@/utils/time";

interface ChatSession {
  id: string;
  title: string;
  messageCount: number;
  lastActivity: string;
  preview: string;
  isFromAgent: boolean;
  channelId?: string;
}

interface ChatSessionsProps {
  userId: string | null;
  currentSessionId?: string;
  showSwitcher?: boolean;
}

export const ChatSessions = ({
  userId,
  currentSessionId,
  showSwitcher = false,
}: ChatSessionsProps) => {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    if (!userId) return;

    const fetchSessions = async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(
          `/api/chat-sessions?userId=${encodeURIComponent(userId)}`,
        );
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Failed to fetch chat sessions");
        }

        setSessions(data.data?.sessions || []);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to load chat sessions",
        );
      } finally {
        setLoading(false);
      }
    };

    fetchSessions();
  }, [userId]);

  const handleSessionClick = (session: ChatSession) => {
    // Navigate to the chat session page
    router.push(`/chat/${session.id}`);
  };

  // formatTimeAgo imported from utils/time

  if (!userId) {
    return null;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="flex items-center gap-2">
          <LoadingSpinner />
          <span className="text-zinc-600 dark:text-zinc-400">
            Loading chat sessions...
          </span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
        <p className="text-red-700 dark:text-red-300 text-sm">
          Failed to load chat sessions: {error}
        </p>
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-zinc-500 dark:text-zinc-400 text-sm">
          {showSwitcher
            ? "No other chat sessions found"
            : "No previous chat sessions"}
        </p>
      </div>
    );
  }

  const filteredSessions = showSwitcher
    ? sessions.filter((s) => s.id !== currentSessionId)
    : sessions;

  if (showSwitcher && filteredSessions.length === 0) {
    return (
      <div className="text-center py-4">
        <p className="text-zinc-500 dark:text-zinc-400 text-sm">
          No other chat sessions found
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {showSwitcher && (
        <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-3">
          Switch to another conversation:
        </h3>
      )}

      {!showSwitcher && (
        <h3 className="text-lg font-semibold text-zinc-900 dark:text-white mb-4">
          Previous Conversations
        </h3>
      )}

      <div className="space-y-2">
        {filteredSessions.map((session) => (
          <div
            key={session.id}
            onClick={() => handleSessionClick(session)}
            className="group cursor-pointer bg-white dark:bg-zinc-950 border border-zinc-950/10 dark:border-white/10 rounded-lg p-4 hover:bg-zinc-950/[2.5%] dark:hover:bg-white/[2.5%] transition-all duration-200"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <h4 className="font-medium text-zinc-900 dark:text-white text-sm group-hover:text-zinc-700 dark:group-hover:text-zinc-300 transition-colors line-clamp-1">
                  {session.title}
                </h4>
                {session.preview && (
                  <p className="text-zinc-600 dark:text-zinc-400 text-xs mt-1 line-clamp-2">
                    {session.isFromAgent ? "🤖 " : ""}
                    {session.preview}
                  </p>
                )}
                <div className="flex items-center gap-3 mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                  <span>
                    {session.messageCount} message
                    {session.messageCount !== 1 ? "s" : ""}
                  </span>
                  <span>•</span>
                  <span>{formatTimeAgo(session.lastActivity)}</span>
                </div>
              </div>
              <div className="flex-shrink-0">
                <svg
                  className="w-4 h-4 text-zinc-400 group-hover:text-zinc-600 dark:group-hover:text-zinc-300 transition-colors"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ChatSessions;
