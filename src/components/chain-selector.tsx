"use client";

import { SUPPORTED_CHAINS, type Chain } from "@/config/chains";

interface ChainSelectorProps {
  selected: Chain[];
  onChange: (chains: Chain[]) => void;
}

const chainIcons: Record<Chain, { icon: string; label: string }> = {
  ethereum: { icon: "Ξ", label: "ETH" },
  base: { icon: "🔵", label: "Base" },
  bsc: { icon: "🟡", label: "BSC" },
  solana: { icon: "◎", label: "SOL" },
  jeju: { icon: "🟣", label: "Jeju" },
};

export function ChainSelector({ selected, onChange }: ChainSelectorProps) {
  const chains: Chain[] = Object.keys(SUPPORTED_CHAINS) as Chain[];

  const toggleChain = (chain: Chain) => {
    if (selected.includes(chain)) {
      // If this is the only selected chain, invert: turn it off and turn all others on
      if (selected.length === 1) {
        const others = chains.filter((c) => c !== chain);
        onChange(others);
      } else {
        // Remove this chain
        const newSelection = selected.filter((c) => c !== chain);
        onChange(newSelection);
      }
    } else {
      // Add chain
      onChange([...selected, chain]);
    }
  };

  const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value as Chain | "all";
    if (value === "all") {
      onChange(chains);
    } else {
      onChange([value]);
    }
  };

  const selectValue =
    selected.length === chains.length ? "all" : selected[0] || chains[0];

  return (
    <>
      {/* Desktop: Dropdown */}
      <div className="hidden md:flex items-center gap-2">
        <label className="text-sm text-zinc-600 dark:text-zinc-400 whitespace-nowrap">
          Chain:
        </label>
        <select
          value={selectValue}
          onChange={handleSelectChange}
          className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2 text-sm"
        >
          <option value="all">All Chains</option>
          {chains.map((chain) => (
            <option key={chain} value={chain}>
              {SUPPORTED_CHAINS[chain]?.name}
            </option>
          ))}
        </select>
      </div>

      {/* Mobile: Toggle buttons */}
      <div className="md:hidden flex items-center gap-1 flex-1">
        {chains.map((chain) => {
          const { icon, label } = chainIcons[chain];
          const isSelected = selected.includes(chain);

          return (
            <button
              key={chain}
              onClick={() => toggleChain(chain)}
              className={`
                flex-1 flex flex-col items-center justify-center gap-0.5
                px-2 py-1.5 rounded-lg text-xs font-medium
                transition-all duration-200 min-w-0
                ${
                  isSelected
                    ? "bg-zinc-200 dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm"
                    : "bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700"
                }
              `}
              title={SUPPORTED_CHAINS[chain]?.name || chain}
            >
              <span className="text-base leading-none">{icon}</span>
              <span className="leading-none truncate">{label}</span>
            </button>
          );
        })}
      </div>
    </>
  );
}
