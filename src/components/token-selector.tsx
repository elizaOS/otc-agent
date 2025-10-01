import Image from "next/image";
import { useState } from "react";

export default function TokenSelecter() {
  const [selectedToken, setSelectedToken] = useState("ETH");

  return (
    <div className="w-full max-w-[380px] flex flex-row">
      <div
        className={`w-1/2 py-2 flex items-center rounded-l-xl border-2 transition-all duration-200 ${
          selectedToken === "ETH"
            ? "bg-[#F75B1E1A] border-[#F75B1E]"
            : "bg-white/10 border-transparent"
        }`}
      >
        <button
          onClick={() => setSelectedToken("ETH")}
          className="mx-2 flex flex-row space-x-2 w-full"
        >
          <Image
            src="/tokens/ethereum.svg"
            alt="ethereum-icon"
            height={40}
            width={40}
          />
          <div className="flex flex-col -space-y-0.5 text-start">
            <h1 className="text-white font-bold text-[16px]">ETH</h1>
            <p className="text-[11px] text-white/80 flex">balance: $2,300.46</p>
          </div>
        </button>
      </div>
      <div
        className={`w-1/2 py-2 flex items-center rounded-r-xl border-2 transition-all duration-200 ${
          selectedToken === "USDC"
            ? "bg-[#F75B1E1A] border-[#F75B1E]"
            : "bg-white/10 border-transparent"
        }`}
      >
        <button
          onClick={() => setSelectedToken("USDC")}
          className="mx-2 flex flex-row space-x-2 w-full"
        >
          <Image
            src="/tokens/usdc.svg"
            alt="usdc-icon"
            height={40}
            width={40}
          />
          <div className="flex flex-col -space-y-0.5 text-start">
            <h1 className="text-white font-bold text-[16px]">USDC</h1>
            <p className="text-[11px] text-white/80 flex">balance: $2,300.46</p>
          </div>
        </button>
      </div>
    </div>
  );
}
