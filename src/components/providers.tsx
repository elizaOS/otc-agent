"use client";

import { MultiWalletProvider } from "@/components/multiwallet";
import { ChainResetMonitor } from "@/components/chain-reset-monitor";
import { DevResetButton } from "@/components/dev-reset-button";
import { APP_INFO } from "@/config/app";
import { config } from "@/lib/wagmi-client";
import { RainbowKitProvider } from "@rainbow-me/rainbowkit";
import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import {
  PhantomWalletAdapter,
  SolflareWalletAdapter,
} from "@solana/wallet-adapter-wallets";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { useEffect, useMemo, useState } from "react";
import { WagmiProvider } from "wagmi";

// Required by wallet-adapter-react-ui styles
import "@solana/wallet-adapter-react-ui/styles.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 0, // Always refetch - critical for real-time contract state
      gcTime: 0, // Don't cache old data
    },
  },
});

export function Providers({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const solanaEndpoint =
    process.env.NEXT_PUBLIC_SOLANA_RPC || "https://api.devnet.solana.com";
  const wallets = useMemo(
    () => [new PhantomWalletAdapter(), new SolflareWalletAdapter()],
    [],
  );

  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      {mounted ? (
        <WagmiProvider config={config}>
          <QueryClientProvider client={queryClient}>
            <RainbowKitProvider
              appInfo={{
                appName: APP_INFO.NAME,
              }}
            >
              <ConnectionProvider endpoint={solanaEndpoint}>
                <WalletProvider wallets={wallets} autoConnect>
                  <WalletModalProvider>
                    <MultiWalletProvider>
                      <ChainResetMonitor />
                      <DevResetButton />
                      {children}
                    </MultiWalletProvider>
                  </WalletModalProvider>
                </WalletProvider>
              </ConnectionProvider>
            </RainbowKitProvider>
          </QueryClientProvider>
        </WagmiProvider>
      ) : (
        children
      )}
    </ThemeProvider>
  );
}
