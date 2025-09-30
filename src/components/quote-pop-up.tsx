import Image from "next/image";
import { useState } from "react";

export default function QuotePopUp() {
  return (
    <div className="p-8 h-full w-full max-w-[680px] max-h-[440px] bg-[#171717] rounded-2xl">
      <h1 className="tex-white font-bold text-[20px] lg:text-[24px]">
        Your Quote
      </h1>
      <div className="flex justify-between flex-row items-center w-full mt-4">
        <h1 className="font-medium text-[18px]">Pay with</h1>

        <TokenSelecter />
      </div>
    </div>
  );
}

function TokenSelecter() {
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
