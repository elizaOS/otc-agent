"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { DealCompletion } from "@/components/deal-completion";

export default function DealPage() {
  const params = useParams();
  const router = useRouter();
  const [quote, setQuote] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadDeal() {
      try {
        const quoteId = params.id as string;
        if (!quoteId) {
          router.push("/");
          return;
        }

        // Fetch the executed quote details
        const response = await fetch(`/api/quote/executed/${quoteId}`);
        if (!response.ok) {
          throw new Error("Deal not found");
        }

        const data = await response.json();
        setQuote(data.quote);
      } catch (error) {
        console.error("Failed to load deal:", error);
        router.push("/");
      } finally {
        setLoading(false);
      }
    }

    loadDeal();
  }, [params.id, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-500 mx-auto mb-4"></div>
          <div className="text-xl text-zinc-600 dark:text-zinc-400">
            Loading your deal...
          </div>
        </div>
      </div>
    );
  }

  if (!quote) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mb-2">
            Deal Not Found
          </h1>
          <p className="text-zinc-600 dark:text-zinc-400">
            This deal may have expired or doesn't exist.
          </p>
        </div>
      </div>
    );
  }

  return <DealCompletion quote={quote} />;
}
