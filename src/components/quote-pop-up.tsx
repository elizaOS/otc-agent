import Image from "next/image";
import { useState } from "react";
import AmountSlider from "./amount-slider";
import TokenSelecter from "./token-selector";
import { Button } from "./button";

export default function QuotePopUp() {
  const info = [
    { label: "Your Discount", value: "15%" },
    { label: "Maturity", value: "6 months" },
    { label: "Maturity date", value: "09/24/25" },
    { label: "Est. $ELIZA", value: "$10,107" },
  ];

  return (
    <div className="p-8 h-full w-full max-w-[680px] max-h-[500px] bg-[#171717] rounded-2xl">
      <h1 className="tex-white font-bold text-[20px] lg:text-[24px]">
        Your Quote
      </h1>
      <div className="flex justify-between flex-row items-center w-full mt-4">
        <h1 className="font-medium text-[18px]">Pay with</h1>
        <TokenSelecter />
      </div>
      <div className="mt-6">
        <AmountSlider />
      </div>
      <div className="mt-8 border-t border-[#353535] border-dashed"></div>
      <div className="mt-4 flex text-start flex-row justify-between w-full">
        {info.map((item, index) => (
          <div key={index} className="flex flex-col space-y-1">
            <p className="text-[12px] text-white/60">{item.label}</p>
            <h1 className="text-[24px] text-white">{item.value}</h1>
          </div>
        ))}
      </div>
      <div className="flex flex-row justify-end space-x-3 mt-6">
        <button className="rounded-lg py-1 px-2 border-white/20 border-[1px] text-[12px] bg-[#1C1C1D]/20">
          Cancel
        </button>
        <button className="rounded-lg py-1 px-2 text-[12px] bg-[#FF5800] font-bold">
          Buy Now
        </button>
      </div>
    </div>
  );
}
