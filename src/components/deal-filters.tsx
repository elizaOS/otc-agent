"use client";

import { ChainSelector } from "./chain-selector";
import type { Chain } from "@/config/chains";

interface DealFiltersProps {
  filters: {
    chains: Chain[];
    minMarketCap: number;
    maxMarketCap: number;
    negotiableTypes: ("negotiable" | "fixed")[];
    isFractionalized: boolean;
    searchQuery: string;
  };
  onFiltersChange: (filters: any) => void;
}

export function DealFilters({ filters, onFiltersChange }: DealFiltersProps) {
  const toggleNegotiableType = (type: "negotiable" | "fixed") => {
    if (filters.negotiableTypes.includes(type)) {
      // If this is the only selected type, invert: turn it off and turn the other on
      if (filters.negotiableTypes.length === 1) {
        const other = type === "negotiable" ? "fixed" : "negotiable";
        onFiltersChange({ ...filters, negotiableTypes: [other] });
      } else {
        // Remove this type
        const newTypes = filters.negotiableTypes.filter((t) => t !== type);
        onFiltersChange({ ...filters, negotiableTypes: newTypes });
      }
    } else {
      // Add type
      onFiltersChange({
        ...filters,
        negotiableTypes: [...filters.negotiableTypes, type],
      });
    }
  };

  const handleTypeSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    if (value === "all") {
      onFiltersChange({ ...filters, negotiableTypes: ["negotiable", "fixed"] });
    } else {
      onFiltersChange({
        ...filters,
        negotiableTypes: [value as "negotiable" | "fixed"],
      });
    }
  };

  const handleFracSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    onFiltersChange({ ...filters, isFractionalized: value === "true" });
  };

  const typeOptions = [
    {
      value: "negotiable" as const,
      icon: "🤝",
      label: "Offer",
      title: "Negotiable",
    },
    {
      value: "fixed" as const,
      icon: "🔒",
      label: "Fixed",
      title: "Fixed Price",
    },
  ];

  const typeSelectValue =
    filters.negotiableTypes.length === 2
      ? "all"
      : filters.negotiableTypes[0] || "negotiable";

  return (
    <>
      {/* Desktop: Search and Dropdowns */}
      <div className="hidden md:flex items-center gap-3 p-4 rounded-lg border border-zinc-200 dark:border-zinc-800 flex-wrap">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <input
            type="text"
            placeholder="Search tokens..."
            value={filters.searchQuery}
            onChange={(e) =>
              onFiltersChange({ ...filters, searchQuery: e.target.value })
            }
            className="w-full px-3 py-2 pl-9 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
          />
          <svg
            className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        </div>

        <ChainSelector
          selected={filters.chains}
          onChange={(chains) => onFiltersChange({ ...filters, chains })}
        />

        <div className="flex items-center gap-2">
          <label className="text-sm text-zinc-600 dark:text-zinc-400 whitespace-nowrap">
            Type:
          </label>
          <select
            value={typeSelectValue}
            onChange={handleTypeSelectChange}
            className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2 text-sm"
          >
            <option value="all">All</option>
            <option value="negotiable">Negotiable</option>
            <option value="fixed">Fixed Price</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-sm text-zinc-600 dark:text-zinc-400 whitespace-nowrap">
            Deal Size:
          </label>
          <select
            value={filters.isFractionalized ? "true" : "false"}
            onChange={handleFracSelectChange}
            className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2 text-sm"
          >
            <option value="false">All</option>
            <option value="true">Fractionalized</option>
          </select>
        </div>
      </div>

      {/* Mobile: Search and Toggle buttons */}
      <div className="md:hidden flex flex-col gap-2">
        {/* Mobile Search */}
        <div className="relative">
          <input
            type="text"
            placeholder="Search tokens..."
            value={filters.searchQuery}
            onChange={(e) =>
              onFiltersChange({ ...filters, searchQuery: e.target.value })
            }
            className="w-full px-3 py-2 pl-9 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
          />
          <svg
            className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        </div>

        {/* Mobile Filters */}
        <div className="flex items-stretch gap-1.5 p-2 rounded-lg border border-zinc-200 dark:border-zinc-800">
          <ChainSelector
            selected={filters.chains}
            onChange={(chains) => onFiltersChange({ ...filters, chains })}
          />

          <div className="w-px bg-zinc-200 dark:bg-zinc-800 flex-shrink-0 mx-0.5" />

          <div className="flex items-center gap-1 flex-1">
            {typeOptions.map(({ value, icon, label, title }) => {
              const isSelected = filters.negotiableTypes.includes(value);
              return (
                <button
                  key={value}
                  onClick={() => toggleNegotiableType(value)}
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
                  title={title}
                >
                  <span className="text-base leading-none">{icon}</span>
                  <span className="leading-none truncate">{label}</span>
                </button>
              );
            })}
          </div>

          <div className="w-px bg-zinc-200 dark:bg-zinc-800 flex-shrink-0 mx-0.5" />

          <button
            onClick={() =>
              onFiltersChange({
                ...filters,
                isFractionalized: !filters.isFractionalized,
              })
            }
            className={`
              flex-1 flex flex-col items-center justify-center gap-0.5
              px-2 py-1.5 rounded-lg text-xs font-medium
              transition-all duration-200 min-w-0
              ${
                filters.isFractionalized
                  ? "bg-zinc-200 dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm"
                  : "bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700"
              }
            `}
            title="Fractionalized only"
          >
            <span className="text-base leading-none">🧩</span>
            <span className="leading-none truncate">Frac</span>
          </button>
        </div>
      </div>
    </>
  );
}
