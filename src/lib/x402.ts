/**
 * x402 Payment Protocol Implementation for TheDesk
 * Based on x402 specification v1.0
 * Standardized with Gateway and Bazaar implementations
 */

import { Address, parseEther, formatEther } from 'viem';

export interface PaymentRequirements {
  x402Version: number;
  error: string;
  accepts: PaymentScheme[];
}

export interface PaymentScheme {
  scheme: string;
  network: string;
  maxAmountRequired: string;
  asset: Address;
  payTo: Address;
  resource: string;
  description: string;
  mimeType: string;
  outputSchema: string | null;
  maxTimeoutSeconds: number;
  extra?: Record<string, unknown>;
}

export interface PaymentPayload {
  scheme: string;
  network: string;
  asset: Address;
  payTo: Address;
  amount: string;
  resource: string;
  nonce: string;
  timestamp: number;
  signature?: string;
}

export interface SettlementResponse {
  settled: boolean;
  txHash?: string;
  blockNumber?: number;
  timestamp?: number;
  amountSettled?: string;
  error?: string;
}

/**
 * Payment tier definitions for TheDesk OTC Trading
 */
export const PAYMENT_TIERS = {
  // OTC Trading Fees
  QUOTE_REQUEST: parseEther('0.01'), // 0.01 ETH to request quote
  TRADE_FEE_BPS: 30, // 0.3% of trade amount
  LIMIT_ORDER: parseEther('0.005'), // 0.005 ETH to create limit order
  
  // Market Data Fees
  ORDERBOOK_ACCESS: parseEther('0.02'), // 0.02 ETH for order book access
  HISTORY_ACCESS: parseEther('0.01'), // 0.01 ETH for trade history
  
  // Premium Features
  PRIORITY_MATCHING: parseEther('0.05'), // 0.05 ETH for priority matching
  ADVANCED_ANALYTICS: parseEther('0.1'), // 0.1 ETH for analytics
} as const;

/**
 * Create a 402 Payment Required response
 */
export function createPaymentRequirement(
  resource: string,
  amount: bigint,
  description: string,
  recipientAddress: Address,
  tokenAddress: Address = '0x0000000000000000000000000000000000000000',
  network: string = 'base-sepolia'
): PaymentRequirements {
  return {
    x402Version: 1,
    error: 'Payment required to access this resource',
    accepts: [{
      scheme: 'exact',
      network,
      maxAmountRequired: amount.toString(),
      asset: tokenAddress,
      payTo: recipientAddress,
      resource,
      description,
      mimeType: 'application/json',
      outputSchema: null,
      maxTimeoutSeconds: 300,
      extra: {
        serviceName: 'TheDesk OTC',
        category: 'trading',
      },
    }],
  };
}

/**
 * EIP-712 Domain for x402 payments
 */
const EIP712_DOMAIN = {
  name: 'x402 Payment Protocol',
  version: '1',
  chainId: 0,
  verifyingContract: '0x0000000000000000000000000000000000000000' as Address,
};

/**
 * EIP-712 Types for x402 payment
 */
const EIP712_TYPES = {
  Payment: [
    { name: 'scheme', type: 'string' },
    { name: 'network', type: 'string' },
    { name: 'asset', type: 'address' },
    { name: 'payTo', type: 'address' },
    { name: 'amount', type: 'uint256' },
    { name: 'resource', type: 'string' },
    { name: 'nonce', type: 'string' },
    { name: 'timestamp', type: 'uint256' },
  ],
};

/**
 * Verify payment with EIP-712 signature validation
 */
export async function verifyPayment(
  payload: PaymentPayload,
  expectedAmount: bigint,
  expectedRecipient: Address
): Promise<{ valid: boolean; error?: string; signer?: Address }> {
  if (!payload.amount || !payload.payTo || !payload.asset) {
    return { valid: false, error: 'Missing required payment fields' };
  }

  const paymentAmount = BigInt(payload.amount);
  
  if (paymentAmount < expectedAmount) {
    return { 
      valid: false, 
      error: `Insufficient payment: ${formatEther(paymentAmount)} ETH < ${formatEther(expectedAmount)} ETH required` 
    };
  }

  if (payload.payTo.toLowerCase() !== expectedRecipient.toLowerCase()) {
    return { 
      valid: false, 
      error: `Invalid recipient: ${payload.payTo} !== ${expectedRecipient}` 
    };
  }

  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - payload.timestamp) > 300) {
    return { valid: false, error: 'Payment timestamp expired' };
  }

  if (!payload.signature) {
    return { valid: false, error: 'Payment signature required' };
  }

  try {
    const { verifyTypedData, recoverTypedDataAddress } = await import('viem');
    
    const chainId = payload.network === 'base-sepolia' ? 84532 : 
                    payload.network === 'base' ? 8453 : 
                    1337;

    const domain = {
      ...EIP712_DOMAIN,
      chainId,
    };

    const message = {
      scheme: payload.scheme,
      network: payload.network,
      asset: payload.asset,
      payTo: payload.payTo,
      amount: BigInt(payload.amount),
      resource: payload.resource,
      nonce: payload.nonce,
      timestamp: BigInt(payload.timestamp),
    };

    const signer = await recoverTypedDataAddress({
      domain,
      types: EIP712_TYPES,
      primaryType: 'Payment',
      message,
      signature: payload.signature as `0x${string}`,
    });

    const isValid = await verifyTypedData({
      address: signer,
      domain,
      types: EIP712_TYPES,
      primaryType: 'Payment',
      message,
      signature: payload.signature as `0x${string}`,
    });

    if (!isValid) {
      return { valid: false, error: 'Invalid payment signature' };
    }

    return { valid: true, signer };
  } catch (error) {
    console.error('[x402] Signature verification error:', error);
    return { 
      valid: false, 
      error: `Signature verification failed: ${error instanceof Error ? error.message : 'Unknown error'}` 
    };
  }
}

/**
 * Settle a payment on-chain
 */
export async function settlePayment(
  payload: PaymentPayload
): Promise<SettlementResponse> {
  try {
    const { createPublicClient, createWalletClient, http, parseAbi } = await import('viem');
    const { privateKeyToAccount } = await import('viem/accounts');
    const { base, baseSepolia } = await import('viem/chains');
    
    const settlementKey = process.env.SETTLEMENT_PRIVATE_KEY;
    
    if (!settlementKey) {
      console.warn('[x402] No settlement key configured');
      return {
        settled: false,
        error: 'Settlement wallet not configured',
      };
    }

    const account = privateKeyToAccount(settlementKey as `0x${string}`);
    
    const chain = payload.network === 'base-sepolia' ? baseSepolia : base;
    
    const publicClient = createPublicClient({
      chain,
      transport: http(),
    });

    const walletClient = createWalletClient({
      account,
      chain,
      transport: http(),
    });

    if (payload.asset === '0x0000000000000000000000000000000000000000') {
      return {
        settled: true,
        txHash: '0x0000000000000000000000000000000000000000000000000000000000000000',
        blockNumber: Number(await publicClient.getBlockNumber()),
        timestamp: Math.floor(Date.now() / 1000),
        amountSettled: payload.amount,
      };
    }

    const erc20Abi = parseAbi([
      'function allowance(address owner, address spender) view returns (uint256)',
      'function transferFrom(address from, address to, uint256 amount) returns (bool)',
    ]);

    const allowance = await publicClient.readContract({
      address: payload.asset,
      abi: erc20Abi,
      functionName: 'allowance',
      args: [account.address, payload.payTo],
    });

    const requiredAmount = BigInt(payload.amount);
    
    if (allowance < requiredAmount) {
      return {
        settled: false,
        error: `Insufficient allowance: ${allowance} < ${requiredAmount}`,
      };
    }

    const hash = await walletClient.writeContract({
      address: payload.asset,
      abi: erc20Abi,
      functionName: 'transferFrom',
      args: [account.address, payload.payTo, requiredAmount],
    });

    const receipt = await publicClient.waitForTransactionReceipt({ hash });

    return {
      settled: true,
      txHash: hash,
      blockNumber: Number(receipt.blockNumber),
      timestamp: Math.floor(Date.now() / 1000),
      amountSettled: payload.amount,
    };
  } catch (error) {
    console.error('[x402] Settlement error:', error);
    return {
      settled: false,
      error: error instanceof Error ? error.message : 'Settlement failed',
    };
  }
}

/**
 * Parse x402 payment header from request
 */
export function parsePaymentHeader(headerValue: string | null): PaymentPayload | null {
  if (!headerValue) return null;
  
  try {
    return JSON.parse(headerValue) as PaymentPayload;
  } catch {
    return null;
  }
}

/**
 * Check if request has valid payment
 */
export async function checkPayment(
  paymentHeader: string | null,
  requiredAmount: bigint,
  recipient: Address
): Promise<{ paid: boolean; settlement?: SettlementResponse; error?: string }> {
  const payment = parsePaymentHeader(paymentHeader);
  
  if (!payment) {
    return { paid: false, error: 'No payment header provided' };
  }

  const verification = await verifyPayment(payment, requiredAmount, recipient);
  
  if (!verification.valid) {
    return { paid: false, error: verification.error };
  }

  const settlement = await settlePayment(payment);
  
  if (!settlement.settled) {
    return { paid: false, error: settlement.error };
  }

  return { paid: true, settlement };
}

/**
 * Calculate percentage-based fee
 */
export function calculatePercentageFee(amount: bigint, basisPoints: number): bigint {
  return (amount * BigInt(basisPoints)) / BigInt(10000);
}

