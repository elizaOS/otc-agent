"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useChainId, useDisconnect } from "wagmi";
import { base, baseSepolia, bsc, bscTestnet, localhost } from "wagmi/chains";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { PhantomWalletName } from "@solana/wallet-adapter-wallets";
import { jejuMainnet, jejuTestnet, jejuLocalnet } from "@/lib/chains";
import type { EVMChain } from "@/types";

type ChainFamily = "evm" | "solana" | "social" | "none";

type SolanaWalletAdapter = {
  publicKey: { toBase58: () => string } | null;
  signTransaction: (tx: any) => Promise<any>;
  signAllTransactions: (txs: any[]) => Promise<any[]>;
};

type MultiWalletContextValue = {
  activeFamily: ChainFamily;
  setActiveFamily: (family: Exclude<ChainFamily, "none">) => void;
  selectedEVMChain: EVMChain;
  setSelectedEVMChain: (chain: EVMChain) => void;

  // Connection status
  isConnected: boolean;
  entityId: string | null;
  networkLabel: string; // e.g. "EVM Base" or "Solana Devnet"

  // EVM (via Privy)
  evmConnected: boolean;
  evmAddress?: string;

  // Solana (via wallet-adapter)
  solanaConnected: boolean;
  solanaPublicKey?: string;
  solanaWallet: SolanaWalletAdapter | null;

  // Privy auth
  privyAuthenticated: boolean;
  privyReady: boolean;
  privyUser: any;
  isFarcasterContext: boolean;

  // Helpers
  paymentPairLabel: string; // e.g. "USDC/ETH" or "USDC/SOL"
  isPhantomInstalled: boolean;
  currentChainId: number | null;
  isJejuChain: boolean;

  // Privy methods
  login: () => void;
  logout: () => Promise<void>;
  connectWallet: () => void;

  // Solana wallet-adapter methods
  connectSolanaWallet: () => void;
  switchSolanaWallet: () => void;

  // Unified disconnect
  disconnect: () => Promise<void>;
};

const MultiWalletContext = createContext<MultiWalletContextValue | undefined>(
  undefined,
);

export function MultiWalletProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const {
    ready: privyReady,
    authenticated: privyAuthenticated,
    user: privyUser,
    login,
    logout,
    connectWallet,
  } = usePrivy();

  // Get EVM wallets from Privy and wagmi
  const { wallets } = useWallets();
  const { disconnect: disconnectWagmi } = useDisconnect();

  // Get Solana wallet from wallet-adapter
  const {
    publicKey: solanaPublicKeyObj,
    connected: solanaWalletConnected,
    signTransaction,
    signAllTransactions,
    disconnect: disconnectSolanaWallet,
    select,
    connect,
    wallet,
    wallets: availableWallets,
  } = useWallet();
  const { setVisible: setSolanaModalVisible } = useWalletModal();

  // Create wallet adapter object for Anchor
  const solanaWalletAdapter: SolanaWalletAdapter | null =
    solanaWalletConnected &&
    solanaPublicKeyObj &&
    signTransaction &&
    signAllTransactions
      ? {
          publicKey: solanaPublicKeyObj,
          signTransaction,
          signAllTransactions,
        }
      : null;

  const chainId = useChainId();

  const [activeFamily, setActiveFamilyState] = useState<ChainFamily>("none");
  const [selectedEVMChain, setSelectedEVMChain] = useState<EVMChain>("base");
  const [isFarcasterContext, setIsFarcasterContext] = useState(false);
  const [isPhantomInstalled, setIsPhantomInstalled] = useState(false);

  // Detect if Phantom wallet is installed
  useEffect(() => {
    if (typeof window === "undefined") return;

    // Check for Phantom Solana wallet
    const checkPhantom = () => {
      const isInstalled = !!(window as any).phantom?.solana?.isPhantom;
      setIsPhantomInstalled(isInstalled);
    };

    checkPhantom();

    // Check again after a short delay in case the extension loads slowly
    const timer = setTimeout(checkPhantom, 1000);
    return () => clearTimeout(timer);
  }, []);

  // Detect Farcaster context
  useEffect(() => {
    if (typeof window === "undefined") return;

    import("@farcaster/miniapp-sdk")
      .then(({ default: miniappSdk }) => {
        miniappSdk.context
          .then((context) => {
            if (context) {
              setIsFarcasterContext(true);
              miniappSdk.actions.ready();
            }
          })
          .catch(() => {
            setIsFarcasterContext(false);
          });
      })
      .catch(() => {
        setIsFarcasterContext(false);
      });
  }, []);

  // Determine connection status
  const evmConnected = wallets.length > 0;
  const solanaConnected = solanaWalletConnected;

  // Get primary wallet addresses
  const evmAddress = wallets[0]?.address;
  const solanaPublicKey = solanaPublicKeyObj?.toBase58();

  // Debug logging for Solana wallet state
  useEffect(() => {
    console.log("[MultiWallet] Solana state update:", {
      publicKey: solanaPublicKey,
      connected: solanaWalletConnected,
      walletAdapter: solanaWalletAdapter ? "available" : "null",
      activeFamily,
      isConnected: evmConnected || solanaWalletConnected || privyAuthenticated,
    });
  }, [
    solanaWalletConnected,
    solanaPublicKey,
    solanaWalletAdapter,
    activeFamily,
    evmConnected,
    privyAuthenticated,
  ]);

  // Connect Solana wallet modal
  const connectSolanaWallet = useCallback(async () => {
    console.log("[MultiWallet] Connecting Solana wallet...");
    console.log(
      "[MultiWallet] Available wallets:",
      availableWallets?.map((w) => w.adapter.name),
    );
    console.log(
      "[MultiWallet] Currently selected wallet:",
      wallet?.adapter.name,
    );

    // Try direct Phantom connection first if available
    const phantomWallet = availableWallets?.find(
      (w) => w.adapter.name === PhantomWalletName,
    );

    if (phantomWallet && select && connect) {
      console.log("[MultiWallet] Phantom detected, connecting directly...");
      try {
        select(PhantomWalletName);
        console.log("[MultiWallet] Selected Phantom, now connecting...");
        await connect();
        console.log("[MultiWallet] Phantom connected successfully");
        return;
      } catch (error) {
        console.error("[MultiWallet] Direct Phantom connection failed:", error);
      }
    }

    // Fallback to modal
    console.log("[MultiWallet] Falling back to wallet selection modal");
    if (!setSolanaModalVisible) {
      console.error(
        "[MultiWallet] setSolanaModalVisible is not available - wallet modal won't open",
      );
      return;
    }
    setSolanaModalVisible(true);
    console.log("[MultiWallet] Called setSolanaModalVisible(true)");
  }, [availableWallets, wallet, select, connect, setSolanaModalVisible]);

  // Switch Solana wallet - always shows modal for wallet selection
  const switchSolanaWallet = useCallback(() => {
    console.log("[MultiWallet] Switching Solana wallet - showing modal");
    if (!setSolanaModalVisible) {
      console.error(
        "[MultiWallet] setSolanaModalVisible is not available - wallet modal won't open",
      );
      return;
    }
    setSolanaModalVisible(true);
  }, [setSolanaModalVisible]);

  // Unified disconnect for both Privy and Solana
  const disconnect = useCallback(async () => {
    console.log("[MultiWallet] Disconnecting all wallets...");

    // Disconnect wagmi first
    if (evmConnected) {
      console.log("[MultiWallet] Disconnecting wagmi...");
      disconnectWagmi();
    }

    // Disconnect Solana wallet if connected
    if (solanaWalletConnected && disconnectSolanaWallet) {
      console.log("[MultiWallet] Disconnecting Solana wallet...");
      await disconnectSolanaWallet();
    }

    // Disconnect Privy (handles social login)
    console.log("[MultiWallet] Logging out from Privy...");
    await logout();

    // Clear localStorage caches
    if (typeof window !== "undefined") {
      localStorage.removeItem("wagmi.store");
      localStorage.removeItem("wagmi.cache");
      localStorage.removeItem("wagmi.recentConnectorId");
      localStorage.removeItem("privy:token");
      localStorage.removeItem("privy:refresh_token");
    }

    // Reset active family
    setActiveFamilyState("none");

    console.log("[MultiWallet] Disconnect complete");
  }, [
    evmConnected,
    solanaWalletConnected,
    disconnectWagmi,
    disconnectSolanaWallet,
    logout,
  ]);

  // Only auto-select on initial load when nothing is set
  useEffect(() => {
    if (activeFamily !== "none") return;

    // Initial connection - auto-select based on what's connected
    if (evmConnected) {
      console.log("[MultiWallet] Initial auto-select: EVM");
      setActiveFamilyState("evm");
    } else if (solanaConnected) {
      console.log("[MultiWallet] Initial auto-select: Solana");
      setActiveFamilyState("solana");
    } else if (privyAuthenticated) {
      console.log("[MultiWallet] Initial auto-select: social");
      setActiveFamilyState("social");
    }
  }, [activeFamily, evmConnected, solanaConnected, privyAuthenticated]);

  // Only reset to "none" if everything is disconnected
  useEffect(() => {
    if (!evmConnected && !solanaConnected && !privyAuthenticated && activeFamily !== "none") {
      console.log("[MultiWallet] All disconnected, resetting to none");
      setActiveFamilyState("none");
    }
  }, [evmConnected, solanaConnected, privyAuthenticated, activeFamily]);

  const setActiveFamily = useCallback(
    (family: Exclude<ChainFamily, "none">) => {
      setActiveFamilyState(family);
    },
    [],
  );

  const isConnected = evmConnected || solanaConnected || privyAuthenticated;

  // Determine if current chain is Jeju (mainnet, testnet, or localnet)
  const isJejuChain = useMemo(() => {
    if (!chainId) return false;
    return chainId === jejuMainnet.id || chainId === jejuTestnet.id || chainId === jejuLocalnet.id;
  }, [chainId]);

  // EVM network name
  const evmNetworkName = useMemo(() => {
    if (!chainId) return "Unknown";
    if (chainId === localhost.id) return "Anvil";
    if (chainId === base.id) return "Base";
    if (chainId === baseSepolia.id) return "Base Sepolia";
    if (chainId === bsc.id) return "BSC";
    if (chainId === bscTestnet.id) return "BSC Testnet";
    if (chainId === jejuMainnet.id) return "Jeju";
    if (chainId === jejuTestnet.id) return "Jeju Testnet";
    if (chainId === jejuLocalnet.id) return "Jeju Localnet";
    return `Chain ${chainId}`;
  }, [chainId]);

  const solanaCluster =
    process.env.NODE_ENV === "development" ? "devnet" : "mainnet-beta";
  const solanaNetworkName = useMemo(() => {
    if (solanaCluster === "devnet") return "Devnet";
    if (solanaCluster === "mainnet-beta") return "Mainnet";
    return "Unknown";
  }, [solanaCluster]);

  const networkLabel = useMemo(() => {
    if (activeFamily === "evm" && evmConnected) {
      // Show selected EVM chain if it's a recognized name, otherwise show the detected network
      const chainNames: Record<string, string> = {
        base: "Base",
        bsc: "BSC",
        jeju: "Jeju",
      };
      const selectedChainName = chainNames[selectedEVMChain] || evmNetworkName;
      return selectedChainName;
    }
    if (activeFamily === "solana" && solanaConnected) {
      return `Solana ${solanaNetworkName}`;
    }
    if (activeFamily === "social" && privyAuthenticated) {
      return isFarcasterContext ? "Farcaster" : "Social Login";
    }
    if (evmConnected) return `${evmNetworkName}`;
    if (solanaConnected) return `Solana ${solanaNetworkName}`;
    if (privyAuthenticated) return "Social Login";
    return "Not connected";
  }, [
    activeFamily,
    evmConnected,
    solanaConnected,
    selectedEVMChain,
    evmNetworkName,
    solanaNetworkName,
    privyAuthenticated,
    isFarcasterContext,
  ]);

  const entityId = useMemo(() => {
    // Return wallet address directly (not UUID) for entity ID
    // Backend APIs will convert to UUID when needed for cache keys
    if (activeFamily === "evm" && evmConnected && evmAddress) {
      return evmAddress.toLowerCase();
    }
    if (activeFamily === "solana" && solanaConnected && solanaPublicKey) {
      return solanaPublicKey.toLowerCase();
    }
    // Fallback if active family not set but one is connected
    if (evmConnected && evmAddress) return evmAddress.toLowerCase();
    if (solanaConnected && solanaPublicKey)
      return solanaPublicKey.toLowerCase();
    // For social login, use Privy user ID
    if (privyAuthenticated && privyUser?.id) return privyUser.id;
    return null;
  }, [
    activeFamily,
    evmConnected,
    evmAddress,
    solanaConnected,
    solanaPublicKey,
    privyAuthenticated,
    privyUser,
  ]);

  const paymentPairLabel = activeFamily === "solana" ? "USDC/SOL" : "USDC/ETH";

  const value: MultiWalletContextValue = {
    activeFamily,
    setActiveFamily,
    selectedEVMChain,
    setSelectedEVMChain,
    isConnected,
    entityId,
    networkLabel,
    evmConnected,
    evmAddress,
    solanaConnected,
    solanaPublicKey,
    solanaWallet: solanaWalletAdapter,
    privyAuthenticated,
    privyReady,
    privyUser,
    isFarcasterContext,
    paymentPairLabel,
    isPhantomInstalled,
    currentChainId: chainId ?? null,
    isJejuChain,
    login,
    logout,
    connectWallet,
    connectSolanaWallet,
    switchSolanaWallet,
    disconnect,
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
    throw new Error("useMultiWallet must be used within MultiWalletProvider");
  }
  return ctx;
}
