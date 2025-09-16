"use client";

import { useEffect } from "react";
import { Button } from "@/components/button";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4">
      <div className="text-center">
        <h2 className="text-2xl font-bold mb-4">Something went wrong!</h2>
        <p className="text-zinc-600 dark:text-zinc-400 mb-6">
          An error occurred while processing your request.
        </p>
        <Button onClick={() => reset()} className="px-4 py-2">
          Try again
        </Button>
      </div>
    </div>
  );
}
