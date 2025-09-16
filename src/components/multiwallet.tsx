"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useAccount, useChainId } from "wagmi";
import { base, hardhat, mainnet } from "wagmi/chains";
import { useWallet } from "@solana/wallet-adapter-react";

type ChainFamily = "evm" | "solana" | "none";

type MultiWalletContextValue = {
  activeFamily: ChainFamily;
  setActiveFamily: (family: Exclude<ChainFamily, "none">) => void;

  // Unified status
  isConnected: boolean;
  userId: string | null;
  networkLabel: string; // e.g. "EVM Mainnet" or "Solana Devnet"

  // EVM
  evmConnected: boolean;
  evmAddress?: string;

  // Solana
  solanaConnected: boolean;
  solanaPublicKey?: string;

  // Helpers
  paymentPairLabel: string; // e.g. "USDC/ETH" or "USDC/SOL"
};

const MultiWalletContext = createContext<MultiWalletContextValue | undefined>(
  undefined,
);

export function MultiWalletProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { address: evmAddress, isConnected: evmConnected } = useAccount();
  const { publicKey, connected: solanaConnected } = useWallet();
  const chainId = useChainId();

  const [activeFamily, setActiveFamilyState] = useState<ChainFamily>("none");

  // Prefer whichever is connected; allow explicit switching
  useEffect(() => {
    if (activeFamily === "none") {
      if (evmConnected) setActiveFamilyState("evm");
      else if (solanaConnected) setActiveFamilyState("solana");
    }
  }, [activeFamily, evmConnected, solanaConnected]);

  // If user disconnects active family, flip to the other if available
  useEffect(() => {
    if (activeFamily === "evm" && !evmConnected && solanaConnected) {
      setActiveFamilyState("solana");
    } else if (activeFamily === "solana" && !solanaConnected && evmConnected) {
      setActiveFamilyState("evm");
    } else if (!evmConnected && !solanaConnected) {
      setActiveFamilyState("none");
    }
  }, [activeFamily, evmConnected, solanaConnected]);

  const setActiveFamily = useCallback(
    (family: Exclude<ChainFamily, "none">) => {
      setActiveFamilyState(family);
    },
    [],
  );

  const solanaPublicKey = useMemo(() => publicKey?.toBase58(), [publicKey]);

  const isConnected = evmConnected || solanaConnected;
  const evmNetworkName = useMemo(() => {
    if (!chainId) return "Unknown";
    if (chainId === hardhat.id) return "Hardhat";
    if (chainId === mainnet.id) return "Mainnet";
    if (chainId === base.id) return "Base";
    return `Chain ${chainId}`;
  }, [chainId]);

  const solanaEndpoint =
    process.env.NEXT_PUBLIC_SOLANA_RPC || "https://api.devnet.solana.com";
  const solanaNetworkName = useMemo(() => {
    const e = solanaEndpoint.toLowerCase();
    if (e.includes("devnet")) return "Devnet";
    if (e.includes("mainnet")) return "Mainnet";
    if (e.includes("127.0.0.1") || e.includes("localhost")) return "Localnet";
    return "Unknown";
  }, [solanaEndpoint]);

  const networkLabel = useMemo(() => {
    if (activeFamily === "evm" && evmConnected) return `EVM ${evmNetworkName}`;
    if (activeFamily === "solana" && solanaConnected)
      return `Solana ${solanaNetworkName}`;
    if (evmConnected) return `EVM ${evmNetworkName}`;
    if (solanaConnected) return `Solana ${solanaNetworkName}`;
    return "Not connected";
  }, [activeFamily, evmConnected, solanaConnected, evmNetworkName, solanaNetworkName]);
  const userId = useMemo(() => {
    if (activeFamily === "evm" && evmConnected && evmAddress)
      return evmAddress.toLowerCase();
    if (activeFamily === "solana" && solanaConnected && solanaPublicKey)
      return solanaPublicKey;
    // Fallback if active family not set but one is connected
    if (evmConnected && evmAddress) return evmAddress.toLowerCase();
    if (solanaConnected && solanaPublicKey) return solanaPublicKey;
    return null;
  }, [
    activeFamily,
    evmConnected,
    evmAddress,
    solanaConnected,
    solanaPublicKey,
  ]);

  const paymentPairLabel = activeFamily === "solana" ? "USDC/SOL" : "USDC/ETH";

  const value: MultiWalletContextValue = {
    activeFamily,
    setActiveFamily,
    isConnected,
    userId,
    networkLabel,
    evmConnected,
    evmAddress: evmAddress ?? undefined,
    solanaConnected,
    solanaPublicKey,
    paymentPairLabel,
  };

  return (
    <MultiWalletContext.Provider value={value}>
      {children}
    </MultiWalletContext.Provider>
  );
}

export function useMultiWallet(): MultiWalletContextValue {
  const ctx = useContext(MultiWalletContext);
  if (!ctx) {
    return {
      activeFamily: "none",
      setActiveFamily: () => {},
      isConnected: false,
      userId: null,
      networkLabel: "Not connected",
      evmConnected: false,
      evmAddress: undefined,
      solanaConnected: false,
      solanaPublicKey: undefined,
      paymentPairLabel: "USDC/ETH",
    };
  }
  return ctx;
}
