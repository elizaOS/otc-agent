"use client";
import "@/app/globals.css";

import dynamic from "next/dynamic";
import { Suspense } from "react";

// const InitialQuoteDisplay = dynamic(
//   () => import("@/components/initial-quote-display").then((m) => m.InitialQuoteDisplay),
//   { ssr: false },
// );

// Dynamic import for chat with otc functionality
const Chat = dynamic(() => import("@/components/chat"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-screen">
      <div className="animate-pulse">
        <div className="text-xl text-zinc-500">Loading ElizaOS OTC Desk...</div>
      </div>
    </div>
  ),
});

// These components are dynamically imported but currently not used in the landing page
// They are used in the enhanced chat component instead
// const InitialQuoteDisplay = dynamic(...)
// const AcceptQuoteModal = dynamic(...)
// const DealCompletion = dynamic(...)

function LandingPageContent() {
  return (
    <div className="h-full flex flex-col">
      <Chat />
    </div>
  );
}

export default function Page() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <div className="text-xl text-zinc-600 dark:text-zinc-400">
              Loading ElizaOS OTC System...
            </div>
            <div className="text-sm text-zinc-500 dark:text-zinc-500 mt-2">
              Initializing Web3 connection...
            </div>
          </div>
        </div>
      }
    >
      <LandingPageContent />
    </Suspense>
  );
}
