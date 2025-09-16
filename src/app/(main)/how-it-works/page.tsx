"use client";

import Link from "next/link";
import { Footer } from "@/components/footer";
import { WalletConnector } from "@/components/wallet-connector";
import { useMultiWallet } from "@/components/multiwallet";

export default function Page() {
  const { isConnected, networkLabel } = useMultiWallet();
  return (
    <>
      <main className="flex-1 px-4 sm:px-6 py-10">
        <div className="max-w-4xl mx-auto space-y-10">
          <div className="text-center space-y-3">
            <h1 className="text-3xl font-semibold">How It Works</h1>
            <p className="text-zinc-600 dark:text-zinc-400">
              Buy discounted ElizaOS with a time-based lockup. Simple,
              transparent, on-chain.
            </p>
          </div>

          <ol className="grid gap-4 sm:gap-6 sm:grid-cols-3">
            <li className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-6">
              <div className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Step 1
              </div>
              <h2 className="mt-2 text-lg font-semibold">
                Connect your wallet
              </h2>
              {isConnected ? (
                <p className="mt-2 text-sm text-emerald-700 dark:text-emerald-400">
                  Wallet connected to {networkLabel}
                </p>
              ) : (
                <>
                  <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                    Connect to start. We support devnet with a local faucet for
                    testing.
                  </p>
                  <div className="mt-4">
                    <WalletConnector onConnectionChange={() => {}} showAsButton />
                  </div>
                </>
              )}
            </li>

            <li className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-6">
              <div className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Step 2
              </div>
              <h2 className="mt-2 text-lg font-semibold">Negotiate a deal</h2>
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                Use the AI trading desk to request an amount, choose a discount
                and lockup.
              </p>
              <div className="mt-4">
                <Link
                  href="/"
                  className="text-sm font-medium underline underline-offset-4 hover:no-underline"
                >
                  Open Trading Desk
                </Link>
              </div>
            </li>

            <li className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-6">
              <div className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Step 3
              </div>
              <h2 className="mt-2 text-lg font-semibold">Buy and hold</h2>
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                Complete payment in ETH, SOL or USDC. Your tokens unlock after the
                selected lockup.
              </p>
              <div className="mt-4">
                <Link
                  href="/my-deals"
                  className="text-sm font-medium underline underline-offset-4 hover:no-underline"
                >
                  View My Deals
                </Link>
              </div>
            </li>
          </ol>

          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-6">
            <h3 className="text-lg font-semibold">What happens on-chain?</h3>
            <ul className="mt-3 space-y-2 text-sm text-zinc-600 dark:text-zinc-400 list-disc pl-5">
              <li>
                Quotes capture price and discount on-chain at creation time.
              </li>
              <li>
                When you pay, the contract locks ElizaOS for your address until
                maturity.
              </li>
              <li>Tokens are auto-released to your wallet as soon as the unlock time is reached.
              </li>
            </ul>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
