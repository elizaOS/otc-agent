"use client";

import { BaseLogo, BscLogo, JejuLogo } from "@/components/icons/index";
import type { EVMChain } from "@/types";

interface EVMChainSelectorProps {
  onSelectChain: (chain: EVMChain) => void;
  onCancel?: () => void;
}

export function EVMChainSelector({ onSelectChain, onCancel }: EVMChainSelectorProps) {
  return (
    <div className="space-y-4">
      <h3 className="text-center text-lg sm:text-xl font-semibold mb-4 text-zinc-900 dark:text-white">
        Choose EVM Network
      </h3>
      <div className="grid grid-cols-1 gap-3">
        <button
          type="button"
          onClick={() => onSelectChain("base")}
          className="group rounded-xl p-6 sm:p-8 text-center transition-all duration-200 cursor-pointer text-white bg-[#0052ff] border-2 border-[#0047e5] hover:border-[#0052ff] hover:brightness-110 hover:shadow-lg hover:scale-[1.02] active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-[#0052ff] focus:ring-offset-2 focus:ring-offset-zinc-900"
        >
          <div className="flex items-center justify-center gap-4">
            <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-full bg-white/10 flex items-center justify-center group-hover:bg-white/20 transition-colors">
              <BaseLogo className="w-8 h-8 sm:w-10 sm:h-10" />
            </div>
            <div className="text-xl sm:text-2xl font-bold">Base</div>
          </div>
        </button>

        <button
          type="button"
          onClick={() => onSelectChain("bsc")}
          className="group rounded-xl p-6 sm:p-8 text-center transition-all duration-200 cursor-pointer text-white bg-[#F0B90B] border-2 border-[#D9A307] hover:border-[#F0B90B] hover:brightness-110 hover:shadow-lg hover:scale-[1.02] active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-[#F0B90B] focus:ring-offset-2 focus:ring-offset-zinc-900"
        >
          <div className="flex items-center justify-center gap-4">
            <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-full bg-white/10 flex items-center justify-center group-hover:bg-white/20 transition-colors">
              <BscLogo className="w-8 h-8 sm:w-10 sm:h-10" />
            </div>
            <div className="text-xl sm:text-2xl font-bold">BSC</div>
          </div>
        </button>

        <button
          type="button"
          onClick={() => onSelectChain("jeju")}
          className="group rounded-xl p-6 sm:p-8 text-center transition-all duration-200 cursor-pointer text-white bg-gradient-to-br from-purple-600 to-purple-800 border-2 border-purple-700 hover:border-purple-600 hover:brightness-110 hover:shadow-lg hover:scale-[1.02] active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-purple-600 focus:ring-offset-2 focus:ring-offset-zinc-900"
        >
          <div className="flex items-center justify-center gap-4">
            <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-full bg-white/10 flex items-center justify-center group-hover:bg-white/20 transition-colors">
              <JejuLogo className="w-8 h-8 sm:w-10 sm:h-10" />
            </div>
            <div className="text-xl sm:text-2xl font-bold">Jeju</div>
          </div>
        </button>
      </div>

      {onCancel && (
        <button
          type="button"
          onClick={onCancel}
          className="w-full px-4 py-2 text-sm text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors"
        >
          Cancel
        </button>
      )}
    </div>
  );
}

