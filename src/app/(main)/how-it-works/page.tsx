"use client";
import { Footer } from "@/components/footer";
import { WalletConnector } from "@/components/wallet-connector";
import { useMultiWallet } from "@/components/multiwallet";
import Image from "next/image";
import Card from "@/components/Card";

export default function Page() {
  const { isConnected, networkLabel } = useMultiWallet();
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
            className=" object-cover"
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
            className="select-none"
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
        <div className="flex gap-4 mt-8 flex-row">
          <Card
            number="1"
            title="Connect your wallet"
            description="Connect to start. We support devnet with a local faucet for testing."
            button="Start Tutorial"
          />
          <Card
            number="2"
            title="Negotiate a deal"
            description="Use the AI trading desk to request an amount, choose a discount and lockup."
            button="Start Tutorial"
          />
          <Card
            number="3"
            title="Buy and hold"
            description="Complete payment in ETH or USDC. Your ELIZA unlocks after the selected lockup."
            button="Start Tutorial"
            note={true}
          />
        </div>
      </div>
      <div
        className="absolute bottom-0 right-0 w-full h-2/3 z-20 pointer-events-none"
        style={{
          background: `radial-gradient(ellipse 80% 100% at 100% 100%, #F75B1E 0%, rgba(247, 91, 30, 0.6) 0%, rgba(247, 91, 30, 0.3) 50%, transparent 75%)`,
          filter: "blur(2px)",
        }}
      />
    </div>
  );
}
