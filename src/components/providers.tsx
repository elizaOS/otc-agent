"use client";

import { ThemeProvider } from "next-themes";
import { RainbowKitProvider, darkTheme, lightTheme } from "@rainbow-me/rainbowkit";
import { WagmiProvider } from "wagmi";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import {
  PhantomWalletAdapter,
  SolflareWalletAdapter,
} from "@solana/wallet-adapter-wallets";
import { useEffect, useMemo, useState } from "react";
import { config } from "@/lib/wagmi-client";
import { APP_INFO } from "@/config/app";
import { MultiWalletProvider } from "@/components/multiwallet";

// Required by wallet-adapter-react-ui styles
import "@solana/wallet-adapter-react-ui/styles.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000, // 1 minute
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

  const elizaOrange = "#ff8c00";

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
                    <MultiWalletProvider>{children}</MultiWalletProvider>
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
