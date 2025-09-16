"use client";

import { AcceptQuoteModal } from "@/components/accept-quote-modal";
import { Button } from "@/components/button";
import {
  extractXMLFromMessage,
  parseOTCQuoteXML,
  type OTCQuote,
} from "@/utils/xml-parser";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { NetworkConnectButton } from "@/components/network-connect";
import { useMultiWallet } from "@/components/multiwallet";
// Sharing is disabled at the quote stage. Users can share after completing a deal.

interface OTCQuoteDisplayProps {
  messageText: string;
  onAccept?: (quote: OTCQuote) => void;
}

export function OTCQuoteDisplay({
  messageText,
  onAccept,
}: OTCQuoteDisplayProps) {
  const [quote, setQuote] = useState<OTCQuote | null>(null);
  const { isConnected } = useAccount();
  const { isConnected: unifiedConnected } = useMultiWallet();
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    // Parse XML from message text using utility
    const xmlString = extractXMLFromMessage(messageText);
    if (xmlString) {
      const parsedQuote = parseOTCQuoteXML(xmlString);
      if (parsedQuote) {
        setQuote(parsedQuote);
      }
    }
  }, [messageText]);

  if (!quote) return null;

  const handleAccept = async () => {
    if (!unifiedConnected) return;
    setShowModal(true);
  };

  // No sharing at the quote stage

  return (
    <div
      data-testid="quote-display"
      className="mt-4 p-4 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900"
    >
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          Quote #{quote.quoteId}
        </h3>
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <span className="text-zinc-500 dark:text-zinc-400">Discount:</span>
          <p
            className="font-medium text-zinc-900 dark:text-zinc-100"
            data-testid="quote-discount"
          >
            {quote.discountPercent}%
          </p>
        </div>

        <div>
          <span className="text-zinc-500 dark:text-zinc-400">Lockup:</span>
          <p className="font-medium text-zinc-900 dark:text-zinc-100">
            {quote.lockupMonths} months ({quote.lockupDays} days)
          </p>
        </div>
      </div>

      <div className="mt-4 flex gap-2">
        {!unifiedConnected ? (
          <div className="inline-flex gap-2">
            <NetworkConnectButton className="!h-9">Connect</NetworkConnectButton>
          </div>
        ) : (
          <>
            <Button
              data-testid="accept-quote-button"
              onClick={handleAccept}
              className="flex-1"
              color="orange"
            >
              Accept Quote
            </Button>
            {/* Sharing intentionally disabled until after deal completion */}
          </>
        )}
      </div>

      <AcceptQuoteModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        initialQuote={quote}
      />
    </div>
  );
}
