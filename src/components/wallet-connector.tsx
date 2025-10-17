"use client";

import { Button } from "@/components/button";
import { useMultiWallet } from "@/components/multiwallet";
import { NetworkConnectButton } from "@/components/network-connect";
import { WalletMenu } from "@/components/wallet-menu";
import { useEffect, useState, useRef } from "react";

interface WalletConnectorProps {
  onConnectionChange: (connected: boolean, address?: string) => void;
  showAsButton?: boolean;
}

const WalletConnectorInner = ({
  onConnectionChange,
  showAsButton,
}: WalletConnectorProps) => {
  const { isConnected, evmAddress, solanaPublicKey, activeFamily } =
    useMultiWallet();

  // Debug logging
  useEffect(() => {
    console.log("[WalletConnector] State:", {
      isConnected,
      evmAddress,
      solanaPublicKey,
      activeFamily,
      showAsButton,
      willShow: isConnected ? "WalletMenu" : "NetworkConnectButton",
    });
  }, [isConnected, evmAddress, solanaPublicKey, activeFamily, showAsButton]);

  // Notify parent component of connection changes
  useEffect(() => {
    onConnectionChange(isConnected, evmAddress || solanaPublicKey);
  }, [isConnected, evmAddress, solanaPublicKey, onConnectionChange]);

  if (showAsButton) {
    if (isConnected) return null;

    // Show simplified connect button using NetworkConnectButton
    return (
      <div className="inline-flex">
        <NetworkConnectButton className="!h-9 !px-4 !text-sm bg-orange-500 hover:bg-orange-600 text-white rounded-lg">
          Connect Wallet
        </NetworkConnectButton>
      </div>
    );
  }

  // Main header view - show WalletMenu when connected, NetworkConnectButton when not
  return isConnected ? (
    <WalletMenu />
  ) : (
    <NetworkConnectButton className="!h-9 !px-4 !text-sm bg-orange-500 hover:bg-orange-600 text-white rounded-lg">
      Connect
    </NetworkConnectButton>
  );
};

// Wrapper component that ensures client-side only rendering
export const WalletConnector = (props: WalletConnectorProps) => {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Show skeleton button while Privy/wallets are initializing
  if (!mounted) {
    return (
      <div className="inline-flex h-9 px-4 rounded-lg bg-zinc-200 dark:bg-zinc-800 animate-pulse">
        <div className="w-20 h-4 bg-zinc-300 dark:bg-zinc-700 rounded my-auto" />
      </div>
    );
  }

  return <WalletConnectorInner {...props} />;
};
