"use client";

import { useAccount } from "wagmi";
import { useEffect, useMemo, useState } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { useWallet } from "@solana/wallet-adapter-react";
import { useMultiWallet } from "@/components/multiwallet";
import { Button } from "@/components/button";
import { NetworkConnectButton } from "@/components/network-connect";

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
    networkLabel,
  } = useMultiWallet();

  const bothConnected = evmConnected && solanaConnected;

  const displayAddress = useMemo(() => {
    const evm = address;
    const solAddr = sol.publicKey?.toBase58();
    const a = activeFamily === "solana" ? solAddr : evm;
    return a ? `${a.slice(0, 6)}...${a.slice(-4)}` : "";
  }, [activeFamily, address, sol.publicKey]);

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
    return <NetworkConnectButton className="!h-9">Connect Wallet</NetworkConnectButton>;
  }

  if (!evmConnected && !solanaConnected) {
    return <NetworkConnectButton className="!h-9">Connect Wallet</NetworkConnectButton>;
  }

  return (
    <div className="flex items-center gap-2">
      <div className="inline-flex items-center gap-2 rounded-md bg-zinc-100 dark:bg-zinc-900 px-2 py-1">
        <span className="text-[10px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          {networkLabel}
        </span>
        {displayAddress && (
          <span className="text-sm text-zinc-700 dark:text-zinc-300">{displayAddress}</span>
        )}
      </div>

      {bothConnected && (
        <div className="inline-flex rounded-md bg-zinc-100 dark:bg-zinc-900 text-xs">
          <button
            type="button"
            onClick={() => setActiveFamily("evm")}
            className={`px-2 py-1 rounded-l-md ${activeFamily === "evm" ? "bg-white text-zinc-900 dark:bg-zinc-800 dark:text-white" : "text-zinc-600 dark:text-zinc-400"}`}
          >
            Use EVM
          </button>
          <button
            type="button"
            onClick={() => setActiveFamily("solana")}
            className={`px-2 py-1 rounded-r-md ${activeFamily === "solana" ? "bg-white text-zinc-900 dark:bg-zinc-800 dark:text-white" : "text-zinc-600 dark:text-zinc-400"}`}
          >
            Use Solana
          </button>
        </div>
      )}

      {activeFamily === "evm" ? (
        <ConnectButton.Custom>
          {({ openAccountModal, openConnectModal, account, mounted }) => (
            <Button
              onClick={account ? openAccountModal : openConnectModal}
              color="orange"
              className="!h-9"
            >
              {account ? "Manage" : "Connect EVM"}
            </Button>
          )}
        </ConnectButton.Custom>
      ) : (
        <div className="inline-flex">
          <WalletMultiButton className="!h-9 !py-0 !px-3 !text-sm !bg-[#ff8c00] !text-white !border !border-[#e67e00] hover:!brightness-110" />
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
