/**
 * Financial Calculations Utility
 * Consolidated discount, APR, and payment calculations
 */

import type { PaymentCurrency } from "@/types";

/**
 * Calculate financial values from token amount and price
 */
export function calculateFinancials(params: {
  tokenAmountWei: bigint;
  priceUsdPerToken8Decimals: bigint;
  discountBps: number;
  ethUsdPrice8Decimals?: bigint;
  currency: 0 | 1; // 0 = ETH, 1 = USDC
}): {
  totalUsd: number;
  discountUsd: number;
  discountedUsd: number;
  paymentAmount: string;
  paymentCurrency: PaymentCurrency;
} {
  const { tokenAmountWei, priceUsdPerToken8Decimals, discountBps, ethUsdPrice8Decimals, currency } = params;

  // totalUsd = (tokenAmount * priceUsdPerToken) / 1e18 (result in 8 decimals)
  const totalUsd8 = (tokenAmountWei * priceUsdPerToken8Decimals) / BigInt(1e18);
  const totalUsd = Number(totalUsd8) / 1e8;

  // discountUsd = totalUsd * discountBps / 10000
  const discountUsd8 = (totalUsd8 * BigInt(discountBps)) / 10000n;
  const discountUsd = Number(discountUsd8) / 1e8;

  // discountedUsd = totalUsd - discountUsd
  const discountedUsd8 = totalUsd8 - discountUsd8;
  const discountedUsd = Number(discountedUsd8) / 1e8;

  // Calculate payment amount and currency
  const paymentCurrency: PaymentCurrency = currency === 0 ? "ETH" : "USDC";
  let paymentAmount = "0";

  if (currency === 0) {
    // Calculate required ETH
    if (!ethUsdPrice8Decimals) throw new Error("ETH price required for ETH payments");
    const ethPrice = Number(ethUsdPrice8Decimals) / 1e8;
    paymentAmount = (discountedUsd / ethPrice).toFixed(6);
  } else {
    // USDC
    paymentAmount = discountedUsd.toFixed(2);
  }

  return {
    totalUsd,
    discountUsd,
    discountedUsd,
    paymentAmount,
    paymentCurrency,
  };
}

/**
 * Calculate APR from discount and lockup period
 */
export function calculateAPR(discountBps: number, lockupMonths: number): number {
  if (lockupMonths <= 0) return 0;
  const discountPercent = discountBps / 100;
  return (discountPercent / lockupMonths) * 12;
}

/**
 * Validate discount is within allowed range
 */
export function validateDiscount(discountBps: number, maxDiscountBps: number = 2500): void {
  if (discountBps < 0) throw new Error("Discount cannot be negative");
  if (discountBps > maxDiscountBps) {
    throw new Error(`Discount cannot exceed ${maxDiscountBps / 100}%`);
  }
}

/**
 * Validate lockup period is within allowed range
 */
export function validateLockup(lockupDays: number, minDays: number = 1, maxDays: number = 365): void {
  if (lockupDays < minDays) throw new Error(`Lockup must be at least ${minDays} days`);
  if (lockupDays > maxDays) throw new Error(`Lockup cannot exceed ${maxDays} days`);
}

/**
 * Format payment amount based on currency
 */
export function formatPaymentAmount(amountPaid: bigint, currency: 0 | 1): string {
  if (currency === 0) {
    // ETH (18 decimals)
    return (Number(amountPaid) / 1e18).toFixed(6);
  }
  // USDC (6 decimals)
  return (Number(amountPaid) / 1e6).toFixed(2);
}

