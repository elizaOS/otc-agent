"use client";
import Card from "@/components/Card";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useMultiWallet } from "@/components/multiwallet";
import { useState, useCallback } from "react";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { Dialog, DialogBody, DialogTitle } from "@/components/dialog";

export default function Page() {
  const router = useRouter();
  const { isConnected, setActiveFamily } = useMultiWallet();
  const [showNetworkModal, setShowNetworkModal] = useState(false);
  const { openConnectModal } = useConnectModal();
  const { setVisible } = useWalletModal();

  const handleConnectWallet = useCallback(() => {
    if (!isConnected) {
      // Not connected, show network selection modal
      setShowNetworkModal(true);
    }
    // If connected, do nothing
  }, [isConnected]);

  const handleOpenTradingDesk = useCallback(() => {
    router.push("/");
  }, [router]);

  const handleViewDeals = useCallback(() => {
    router.push("/my-deals");
  }, [router]);

  const onChooseEvm = useCallback(() => {
    setActiveFamily("evm");
    setShowNetworkModal(false);
    openConnectModal?.();
  }, [openConnectModal, setActiveFamily]);

  const onChooseSolana = useCallback(() => {
    setActiveFamily("solana");
    setShowNetworkModal(false);
    setVisible(true);
  }, [setActiveFamily, setVisible]);
  return (
    <div className="relative flex flex-col px-4 sm:px-6 py-10 h-screen">
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
          {/* Temporary replacement text */}
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
          Buy discounted ELIZA with a time-based lockup.{" "}
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
            description="Use the AI trading desk to request an amount, choose a discount and lockup."
            button="Open Trading Desk"
            onClick={handleOpenTradingDesk}
          />
          <Card
            number="3"
            title="Buy and hold"
            description="Complete payment in ETH or USDC. Your ELIZA unlocks after the selected lockup."
            button="View My Deals"
            note={true}
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

      {/* Network selection modal */}
      <Dialog open={showNetworkModal} onClose={setShowNetworkModal} size="sm">
        <div className="p-4">
          <DialogTitle>Choose a network</DialogTitle>
          <DialogBody className="pt-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <button
                type="button"
                onClick={onChooseEvm}
                className="rounded-xl p-4 sm:p-5 text-left transition-all duration-200 cursor-pointer text-white bg-[#0052ff] border border-[#0047e5] hover:brightness-110 hover:shadow-md active:scale-[0.99] focus:outline-none focus:ring-2"
              >
                <div className="text-sm font-semibold">Base</div>
                <div className="text-xs text-white/80">
                  Connect with RainbowKit
                </div>
              </button>
              <button
                type="button"
                onClick={onChooseSolana}
                className="rounded-xl p-4 sm:p-5 text-left transition-all duration-200 cursor-pointer text-white bg-gradient-to-r from-[#9945FF] via-[#8752F3] to-[#14F195] hover:brightness-110 hover:shadow-md focus:outline-none focus:ring-2"
              >
                <div className="text-sm font-semibold">Solana</div>
                <div className="text-xs text-white/85">
                  Connect with Solana Wallet
                </div>
              </button>
            </div>
          </DialogBody>
        </div>
      </Dialog>
    </div>
  );
}
