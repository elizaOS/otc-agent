/**
 * Consolidated Type Definitions
 * Single source of truth for all shared types across the OTC Agent
 */

import { PaymentCurrency } from "@/services/database";
import type { Address } from "viem";
import type { Chain } from "@/config/chains";

// Re-export from specific type files
export type { ChatMessage } from "./chat-message";
export type { Citation, ChatStreamData } from "./chat";

// Re-export from plugin types
export type { PaymentCurrency, QuoteStatus, QuoteMemory, UserSessionMemory as PluginUserSessionMemory } from "@/lib/plugin-otc-desk/types";

//==============================================================================
// CHAIN TYPES
//==============================================================================

export type EVMChain = "base" | "bsc" | "jeju";
export type { Chain, ChainFamily, ChainConfig } from "@/config/chains";
export { SUPPORTED_CHAINS, isEVMChain, isSolanaChain, getChainConfig, getChainFromId, getChainFromNumericId, isJejuChainId } from "@/config/chains";

//==============================================================================
// OTC CONTRACT TYPES
//==============================================================================

/**
 * OTC Offer structure (matches Solidity contract)
 */
export interface Offer {
  beneficiary: Address;
  tokenAmount: bigint;
  discountBps: bigint;
  createdAt: bigint;
  unlockTime: bigint;
  priceUsdPerToken: bigint; // 8 decimals
  ethUsdPrice: bigint; // 8 decimals
  currency: number; // 0 = ETH, 1 = USDC
  approved: boolean;
  paid: boolean;
  fulfilled: boolean;
  cancelled: boolean;
  payer: Address;
  amountPaid: bigint;
}

/**
 * Consignment parameters for on-chain creation
 */
export interface ConsignmentParams {
  tokenId: string;
  amount: bigint;
  isNegotiable: boolean;
  fixedDiscountBps: number;
  fixedLockupDays: number;
  minDiscountBps: number;
  maxDiscountBps: number;
  minLockupDays: number;
  maxLockupDays: number;
  minDealAmount: bigint;
  maxDealAmount: bigint;
  isFractionalized: boolean;
  isPrivate: boolean;
  maxPriceVolatilityBps: number;
  maxTimeToExecute: number;
  gasDeposit: bigint;
}

/**
 * OTC Quote for XML parsing and frontend display
 */
export interface OTCQuote {
  quoteId: string;
  tokenSymbol: string;
  tokenAmount: number;
  tokenChain: string;
  discountBps: number;
  discountPercent: number;
  lockupDays: number;
  lockupMonths: number;
  paymentCurrency: PaymentCurrency;
  apr: number;
  totalUsd: number;
  discountedUsd: number;
  paymentAmount: string;
  signature?: string;
  isFixedPrice?: boolean;
}

/**
 * Quote accepted message
 */
export interface QuoteAccepted {
  quoteId: string;
  txHash: string;
}

//==============================================================================
// DATABASE TYPES
//==============================================================================

/**
 * Token in database
 */
export interface Token {
  id: string;
  symbol: string;
  name: string;
  contractAddress: string;
  chain: Chain;
  decimals: number;
  logoUrl: string;
  description: string;
  website?: string;
  twitter?: string;
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
}

/**
 * Token market data
 */
export interface TokenMarketData {
  tokenId: string;
  priceUsd: number;
  marketCap: number;
  volume24h: number;
  priceChange24h: number;
  liquidity: number;
  lastUpdated: number;
}

/**
 * OTC Consignment in database
 */
export interface OTCConsignment {
  id: string;
  tokenId: string;
  consignerAddress: string;
  consignerEntityId: string;
  totalAmount: string;
  remainingAmount: string;
  isNegotiable: boolean;
  fixedDiscountBps?: number;
  fixedLockupDays?: number;
  minDiscountBps: number;
  maxDiscountBps: number;
  minLockupDays: number;
  maxLockupDays: number;
  minDealAmount: string;
  maxDealAmount: string;
  isFractionalized: boolean;
  isPrivate: boolean;
  allowedBuyers?: string[];
  maxPriceVolatilityBps: number;
  maxTimeToExecuteSeconds: number;
  status: "active" | "paused" | "depleted" | "withdrawn";
  contractConsignmentId?: string;
  chain: Chain;
  createdAt: number;
  updatedAt: number;
  lastDealAt?: number;
}

/**
 * Consignment deal record
 */
export interface ConsignmentDeal {
  id: string;
  consignmentId: string;
  quoteId: string;
  tokenId: string;
  buyerAddress: string;
  amount: string;
  discountBps: number;
  lockupDays: number;
  executedAt: number;
  offerId?: string;
  status: "pending" | "executed" | "failed";
}

//==============================================================================
// USER SESSION TYPES
//==============================================================================

/**
 * User session memory
 */
export interface UserSessionMemory {
  id: string;
  entityId: string;
  walletAddress: string;
  chainFamily: "evm" | "solana";
  preferredChain?: string;
  lastActiveAt: number;
  sessionData?: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

//==============================================================================
// UTILITY TYPES
//==============================================================================

/**
 * Token with balance information
 */
export interface TokenWithBalance extends Token {
  balance: string;
  balanceFormatted: string;
  balanceUsd: number;
  priceUsd: number;
}

/**
 * Consignment creation result
 */
export interface ConsignmentCreationResult {
  txHash: `0x${string}`;
  consignmentId: bigint;
}

