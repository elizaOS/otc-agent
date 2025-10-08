"use client";

import { Button } from "@/components/button";
import { useMultiWallet } from "@/components/multiwallet";
import { NetworkConnectButton } from "@/components/network-connect";
import { BaseLogo } from "@/components/icons/index";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { useEffect, useState } from "react";
import { useAccount } from "wagmi";

interface WalletConnectorProps {
  onConnectionChange: (connected: boolean, address?: string) => void;
  showAsButton?: boolean;
}

const WalletConnectorInner = ({
  onConnectionChange,
  showAsButton,
}: WalletConnectorProps) => {
  const { address } = useAccount();
  const sol = useWallet();
  const {
    activeFamily,
    setActiveFamily,
    isConnected: unifiedConnected,
    evmConnected,
    solanaConnected,
  } = useMultiWallet();

  const bothConnected = evmConnected && solanaConnected;

  // Notify parent component of connection changes
  useEffect(() => {
    const a = activeFamily === "solana" ? sol.publicKey?.toBase58() : address;
    onConnectionChange(unifiedConnected, a);
  }, [
    unifiedConnected,
    activeFamily,
    sol.publicKey,
    address,
    onConnectionChange,
  ]);

  if (showAsButton) {
    if (unifiedConnected) return null;
    return (
      <NetworkConnectButton className="!h-9 flex items-center gap-2">
        <BaseLogo className="w-4 h-4" />
        <span>Connect Wallet</span>
      </NetworkConnectButton>
    );
  }

  if (!evmConnected && !solanaConnected) {
    return (
      <NetworkConnectButton className="!h-9 bg-[#ff8c00] !px-3 flex items-center gap-2">
        <BaseLogo className="w-4 h-4" />
        <span>Connect Wallet</span>
      </NetworkConnectButton>
    );
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {bothConnected && (
        <div className="inline-flex rounded-lg bg-zinc-100 dark:bg-zinc-900 p-1 border border-zinc-200 dark:border-zinc-800 min-w-fit">
          <button
            type="button"
            onClick={() => setActiveFamily("evm")}
            className={`px-3 py-1.5 rounded-md transition-all duration-200 font-medium text-xs whitespace-nowrap ${
              activeFamily === "evm"
                ? "bg-white text-[#0052ff] dark:bg-zinc-800 dark:text-white shadow-sm"
                : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
            }`}
          >
            Base
          </button>
          <button
            type="button"
            onClick={() => setActiveFamily("solana")}
            className={`px-3 py-1.5 rounded-md transition-all duration-200 font-medium text-xs whitespace-nowrap ${
              activeFamily === "solana"
                ? "bg-gradient-to-r from-[#9945FF] to-[#14F195] text-white shadow-sm"
                : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
            }`}
          >
            Solana
          </button>
        </div>
      )}

      {activeFamily === "evm" ? (
        <ConnectButton.Custom>
          {({ openAccountModal, openConnectModal, account }) => (
            <Button
              onClick={account ? openAccountModal : openConnectModal}
              className="!h-9 !px-3 !text-sm whitespace-nowrap bg-blue-500 dark:bg-blue-500 rounded-lg px-4 py-2 flex items-center gap-2"
            >
              <BaseLogo className="w-4 h-4" />
              <span>
                {account
                  ? account.displayName ||
                    `${account.address.slice(0, 6)}...${account.address.slice(-4)}`
                  : "Connect Base"}
              </span>
            </Button>
          )}
        </ConnectButton.Custom>
      ) : (
        <div className="inline-flex">
          <WalletMultiButton className="!h-9 !py-0 !px-3 !text-sm !text-white !border !border-[#e67e00] hover:!brightness-110 !whitespace-nowrap" />
        </div>
      )}
    </div>
  );
};

// Wrapper component that ensures client-side only rendering
export const WalletConnector = (props: WalletConnectorProps) => {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Don't render anything until client-side
  if (!mounted) {
    return null;
  }

  return <WalletConnectorInner {...props} />;
};
