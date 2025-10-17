export function formatTokenAmount(amountWei: bigint | string): string {
  const amount = typeof amountWei === "string" ? BigInt(amountWei) : amountWei;
  const num = Number(amount) / 1e18;
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(2)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(2)}K`;
  return num.toLocaleString(undefined, { maximumFractionDigits: 6 });
}

export function formatUsd(amount: number): string {
  if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(2)}M`;
  if (amount >= 1_000)
    return amount.toLocaleString(undefined, { maximumFractionDigits: 0 });
  return amount.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

export function formatDate(tsSeconds: bigint): string {
  const d = new Date(Number(tsSeconds) * 1000);
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
