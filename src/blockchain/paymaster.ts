/**
 * Multicoin Paymaster Integration for TheDesk
 * Supports gas payments in elizaOS, CLANKER, VIRTUAL, CLANKERMON and other ERC-20 tokens
 */

import { Address, createPublicClient, http, parseAbi, encodePacked } from 'viem';
import { base, baseSepolia } from 'viem/chains';

// Paymaster Factory ABI
const PAYMASTER_FACTORY_ABI = parseAbi([
  'function getAllPaymasters() external view returns (address[] memory)',
  'function getPaymasterByToken(address token) external view returns (address)',
  'function paymasterStake(address paymaster) external view returns (uint256)',
]);

// Paymaster ABI
const PAYMASTER_ABI = parseAbi([
  'function token() external view returns (address)',
  'function getQuote(uint256 ethAmount) external view returns (uint256)',
]);

// Contract addresses
const PAYMASTER_FACTORY_ADDRESS = (process.env.NEXT_PUBLIC_PAYMASTER_FACTORY_ADDRESS ||
  '0x0000000000000000000000000000000000000000') as Address;

// Minimum ETH stake threshold for paymasters (10 ETH)
const MIN_STAKE_THRESHOLD = BigInt(10) * BigInt(10 ** 18);

export interface PaymasterInfo {
  address: Address;
  token: Address;
  stake: bigint;
  available: boolean;
}

export interface PaymasterQuote {
  paymaster: Address;
  token: Address;
  ethAmount: bigint;
  tokenAmount: bigint;
}

/**
 * Get public client for blockchain interactions
 */
function getPublicClient() {
  const network = process.env.NEXT_PUBLIC_NETWORK || 'base-sepolia';
  const chain = network === 'base' ? base : baseSepolia;
  
  return createPublicClient({
    chain,
    transport: http(process.env.NEXT_PUBLIC_RPC_URL),
  });
}

/**
 * Get all available paymasters with sufficient stake
 */
export async function getAvailablePaymasters(minStake: bigint = MIN_STAKE_THRESHOLD): Promise<PaymasterInfo[]> {
  if (PAYMASTER_FACTORY_ADDRESS === '0x0000000000000000000000000000000000000000') {
    console.warn('[Paymaster] Factory not configured, returning empty list');
    return [];
  }

  try {
    const client = getPublicClient();
    
    // Get all paymasters from factory
    const paymasters = await client.readContract({
      address: PAYMASTER_FACTORY_ADDRESS,
      abi: PAYMASTER_FACTORY_ABI,
      functionName: 'getAllPaymasters',
    }) as Address[];

    // Get details for each paymaster
    const paymasterDetails = await Promise.all(
      paymasters.map(async (paymasterAddr) => {
        try {
          const [token, stake] = await Promise.all([
            client.readContract({
              address: paymasterAddr,
              abi: PAYMASTER_ABI,
              functionName: 'token',
            }),
            client.readContract({
              address: PAYMASTER_FACTORY_ADDRESS,
              abi: PAYMASTER_FACTORY_ABI,
              functionName: 'paymasterStake',
              args: [paymasterAddr],
            }),
          ]);

          return {
            address: paymasterAddr,
            token: token as Address,
            stake: stake as bigint,
            available: (stake as bigint) >= minStake,
          };
        } catch (error) {
          console.error(`[Paymaster] Error fetching details for ${paymasterAddr}:`, error);
          return null;
        }
      })
    );

    return paymasterDetails.filter((pm): pm is PaymasterInfo => pm !== null && pm.available);
  } catch (error) {
    console.error('[Paymaster] Error fetching paymasters:', error);
    return [];
  }
}

/**
 * Get paymaster for a specific token
 */
export async function getPaymasterForToken(tokenAddress: Address): Promise<Address | null> {
  if (PAYMASTER_FACTORY_ADDRESS === '0x0000000000000000000000000000000000000000') {
    return null;
  }

  try {
    const client = getPublicClient();
    
    const paymaster = await client.readContract({
      address: PAYMASTER_FACTORY_ADDRESS,
      abi: PAYMASTER_FACTORY_ABI,
      functionName: 'getPaymasterByToken',
      args: [tokenAddress],
    }) as Address;

    // Verify paymaster has sufficient stake
    const stake = await client.readContract({
      address: PAYMASTER_FACTORY_ADDRESS,
      abi: PAYMASTER_FACTORY_ABI,
      functionName: 'paymasterStake',
      args: [paymaster],
    }) as bigint;

    if (stake >= MIN_STAKE_THRESHOLD) {
      return paymaster;
    }

    return null;
  } catch (error) {
    console.error(`[Paymaster] Error getting paymaster for token ${tokenAddress}:`, error);
    return null;
  }
}

/**
 * Get quote for gas payment in specific token
 */
export async function getPaymasterQuote(
  paymasterAddress: Address,
  ethAmount: bigint
): Promise<PaymasterQuote | null> {
  try {
    const client = getPublicClient();
    
    const [token, tokenAmount] = await Promise.all([
      client.readContract({
        address: paymasterAddress,
        abi: PAYMASTER_ABI,
        functionName: 'token',
      }),
      client.readContract({
        address: paymasterAddress,
        abi: PAYMASTER_ABI,
        functionName: 'getQuote',
        args: [ethAmount],
      }),
    ]);

    return {
      paymaster: paymasterAddress,
      token: token as Address,
      ethAmount,
      tokenAmount: tokenAmount as bigint,
    };
  } catch (error) {
    console.error('[Paymaster] Error getting quote:', error);
    return null;
  }
}

/**
 * Generate ERC-4337 paymaster data
 * Format: paymasterAddress + verificationGasLimit + postOpGasLimit + paymasterData
 */
export function generatePaymasterData(
  paymasterAddress: Address,
  verificationGasLimit: bigint = BigInt(100000),
  postOpGasLimit: bigint = BigInt(50000)
): `0x${string}` {
  return encodePacked(
    ['address', 'uint128', 'uint128'],
    [paymasterAddress, BigInt(verificationGasLimit), BigInt(postOpGasLimit)]
  );
}

/**
 * Estimate gas cost in tokens for a transaction
 */
export async function estimateTokenCost(
  tokenAddress: Address,
  gasLimit: bigint,
  gasPrice: bigint
): Promise<bigint | null> {
  const paymaster = await getPaymasterForToken(tokenAddress);
  if (!paymaster) {
    return null;
  }

  const ethCost = gasLimit * gasPrice;
  const quote = await getPaymasterQuote(paymaster, ethCost);
  
  return quote?.tokenAmount || null;
}

/**
 * Check if user has sufficient token balance for gas payment
 */
export async function canPayGasWithToken(
  userAddress: Address,
  tokenAddress: Address,
  requiredAmount: bigint
): Promise<boolean> {
  try {
    const client = getPublicClient();
    
    const balance = await client.readContract({
      address: tokenAddress,
      abi: parseAbi(['function balanceOf(address) view returns (uint256)']),
      functionName: 'balanceOf',
      args: [userAddress],
    }) as bigint;

    return balance >= requiredAmount;
  } catch (error) {
    console.error('[Paymaster] Error checking balance:', error);
    return false;
  }
}

// Export singleton instance
export const paymasterService = {
  getAvailablePaymasters,
  getPaymasterForToken,
  getPaymasterQuote,
  generatePaymasterData,
  estimateTokenCost,
  canPayGasWithToken,
};
