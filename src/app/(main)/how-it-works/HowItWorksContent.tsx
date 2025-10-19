"use client";

import Card from "@/components/Card";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useMultiWallet } from "@/components/multiwallet";
import { useCallback, useState } from "react";
import { Dialog } from "@/components/dialog";
import { EVMLogo, SolanaLogo } from "@/components/icons/index";
import { EVMChainSelectorModal } from "@/components/evm-chain-selector-modal";

export default function HowItWorksContent() {
  const router = useRouter();
  const {
    isConnected,
    setActiveFamily,
    connectSolanaWallet,
    isPhantomInstalled,
  } = useMultiWallet();
  const [showNetworkDialog, setShowNetworkDialog] = useState(false);
  const [showEVMChainSelector, setShowEVMChainSelector] = useState(false);

  const handleConnectWallet = useCallback(() => {
    if (!isConnected) {
      setShowNetworkDialog(true);
    }
  }, [isConnected]);

  const handleConnectEvm = useCallback(() => {
    setShowNetworkDialog(false);
    setShowEVMChainSelector(true);
  }, []);

  const handleConnectSolana = useCallback(() => {
    if (!isPhantomInstalled) {
      alert("Please install Phantom or Solflare wallet to use Solana.");
      return;
    }
    setShowNetworkDialog(false);
    setActiveFamily("solana");
    connectSolanaWallet();
  }, [isPhantomInstalled, setActiveFamily, connectSolanaWallet]);

  const handleOpenTradingDesk = useCallback(() => {
    router.push("/");
  }, [router]);

  const handleViewDeals = useCallback(() => {
    router.push("/my-deals");
  }, [router]);

  return (
    <div className="relative flex flex-col px-4 sm:px-6 py-10 min-h-screen">
      {/* Background with gradient overlay */}
      <div className="absolute inset-0">
        {/* Black background */}
        <div className="absolute inset-0 bg-black" />

        {/* Background image positioned on the right */}
        <div className="absolute inset-0 flex justify-end">
          <Image
            src="/how-it-works/how-it-works-bg.png"
            alt="How it works background"
            width={1200}
            height={900}
            className="object-cover h-auto"
            priority
          />
        </div>

        {/* Gradient overlay - black on left fading to transparent on right */}
        <div
          className="absolute inset-0 bg-gradient-to-r from-black via-black to-transparent"
          style={{
            background:
              "linear-gradient(to right, rgba(16, 16, 16, 1) 0%, #000000 55%, rgba(0,0,0,0.3) 75%)",
          }}
        />
      </div>

      {/* Content */}
      <div className="z-10 flex flex-col items-start justify-center h-full">
        <div className="flex items-center mb-10">
          <Image
            src="/how-it-works/text.svg"
            alt="How it works text"
            height={220}
            width={950}
            draggable={false}
            className="select-none w-auto"
          />
        </div>

        {/* New heading text */}
        <h1 className="text-white font-bold text-start text-3xl max-w-4xl leading-tight">
          <span className="text-[#F75B1E]">
            {" "}
            Simple, transparent, on-chain.
          </span>
        </h1>
        <div className="flex mb-12 gap-4 mt-8 place-self-center lg:place-self-start flex-col lg:flex-row">
          <Card
            number="1"
            title="Connect your wallet"
            description="Connect to start. We support devnet with a local faucet for testing."
            button={isConnected ? "Wallet Connected" : "Connect Wallet"}
            disabled={isConnected}
            onClick={handleConnectWallet}
          />
          <Card
            number="2"
            title="Negotiate a deal"
            description="Use the agent OTC desk to request an amount, choose a discount and lockup."
            button="Open Trading Desk"
            onClick={handleOpenTradingDesk}
          />
          <Card
            number="3"
            title="Buy and hold"
            description="Complete payment in ETH or USDC. Your tokens are available after the lockup period ends."
            button="View My Deals"
            onClick={handleViewDeals}
          />
        </div>
      </div>
      <div
        className="absolute bottom-0 right-0 w-full h-2/3 z-20 pointer-events-none"
        style={{
          background: `radial-gradient(ellipse 80% 100% at 100% 100%, #F75B1E 0%, rgba(247, 91, 30, 0.6) 0%, rgba(247, 91, 30, 0.3) 0%, transparent 75%)`,
          filter: "blur(2px)",
        }}
      />

      {/* Network selection dialog */}
      <Dialog open={showNetworkDialog} onClose={setShowNetworkDialog} size="lg">
        <div className="p-6">
          <h3 className="text-center text-xl font-semibold mb-4">
            Choose a network
          </h3>
          <div className="bg-zinc-900/50 backdrop-blur-sm rounded-2xl p-6 border border-zinc-800/50 shadow-xl">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <button
                type="button"
                onClick={handleConnectEvm}
                className="group rounded-xl p-8 sm:p-10 text-center transition-all duration-200 cursor-pointer text-white bg-[#0052ff] border-2 border-[#0047e5] hover:border-[#0052ff] hover:brightness-110 hover:shadow-lg hover:scale-[1.02] active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-[#0052ff] focus:ring-offset-2 focus:ring-offset-zinc-900"
              >
                <div className="flex flex-col items-center gap-4">
                  <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-white/10 flex items-center justify-center group-hover:bg-white/20 transition-colors">
                    <EVMLogo className="w-10 h-10 sm:w-12 sm:h-12" />
                  </div>
                  <div className="text-2xl sm:text-3xl font-bold">EVM</div>
                  <div className="text-xs text-white/70">Base, BSC, Jeju</div>
                </div>
              </button>
              <button
                type="button"
                onClick={handleConnectSolana}
                className="group rounded-xl p-8 sm:p-10 text-center transition-all duration-200 cursor-pointer text-white bg-gradient-to-br from-[#9945FF] via-[#8752F3] to-[#14F195] border-2 border-[#9945FF]/50 hover:border-[#14F195]/50 hover:brightness-110 hover:shadow-lg hover:scale-[1.02] active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-[#9945FF] focus:ring-offset-2 focus:ring-offset-zinc-900"
              >
                <div className="flex flex-col items-center gap-4">
                  <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-white/10 flex items-center justify-center group-hover:bg-white/20 transition-colors">
                    <SolanaLogo className="w-10 h-10 sm:w-12 sm:h-12" />
                  </div>
                  <div className="text-2xl sm:text-3xl font-bold">Solana</div>
                </div>
              </button>
            </div>
          </div>
        </div>
      </Dialog>

      <EVMChainSelectorModal
        isOpen={showEVMChainSelector}
        onClose={() => setShowEVMChainSelector(false)}
      />
    </div>
  );
}
