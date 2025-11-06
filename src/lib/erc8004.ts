/**
 * ERC-8004 Registry and Reputation Integration for TheDesk
 * Implements user ban checking and reputation verification
 */

import { Address, createPublicClient, http, parseAbi } from 'viem';
import { base, baseSepolia } from 'viem/chains';

// ERC-8004 contract ABIs
const IDENTITY_REGISTRY_ABI = parseAbi([
  'function agentExists(uint256 agentId) external view returns (bool)',
  'function getAgentAddress(uint256 agentId) external view returns (address)',
  'function getAgentId(address agentAddress) external view returns (uint256)',
]);

const BAN_MANAGER_ABI = parseAbi([
  'function isAccessAllowed(uint256 agentId, bytes32 appId) external view returns (bool)',
  'function isBanned(uint256 agentId) external view returns (bool)',
  'function getBanReason(uint256 agentId) external view returns (string memory)',
  'function getBanExpiry(uint256 agentId) external view returns (uint256)',
]);

const REPUTATION_MANAGER_ABI = parseAbi([
  'function getReputation(uint256 agentId) external view returns (uint256)',
  'function hasMinimumReputation(uint256 agentId, uint256 minScore) external view returns (bool)',
]);

// Contract addresses
const IDENTITY_REGISTRY_ADDRESS = (process.env.NEXT_PUBLIC_IDENTITY_REGISTRY_ADDRESS ||
  '0x0000000000000000000000000000000000000000') as Address;

const BAN_MANAGER_ADDRESS = (process.env.NEXT_PUBLIC_BAN_MANAGER_ADDRESS ||
  '0x0000000000000000000000000000000000000000') as Address;

const REPUTATION_MANAGER_ADDRESS = (process.env.NEXT_PUBLIC_REPUTATION_MANAGER_ADDRESS ||
  '0x0000000000000000000000000000000000000000') as Address;

// TheDesk app ID for ERC-8004
const THEDESK_APP_ID = '0x' + Buffer.from('otc-desk-otc').toString('hex').padEnd(64, '0');

export interface BanCheckResult {
  allowed: boolean;
  reason?: string;
  bannedUntil?: number;
}

export interface ReputationCheck {
  score: number;
  meetsMinimum: boolean;
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
 * Check if a user is banned from using TheDesk
 */
export async function checkUserBan(userAddress: Address): Promise<BanCheckResult> {
  // If no ban manager configured, allow access
  if (BAN_MANAGER_ADDRESS === '0x0000000000000000000000000000000000000000') {
    console.warn('[ERC-8004] Ban manager not configured, allowing access');
    return { allowed: true };
  }

  try {
    const client = getPublicClient();
    
    // Get user's agent ID from Identity Registry
    let agentId: bigint;
    try {
      agentId = await client.readContract({
        address: IDENTITY_REGISTRY_ADDRESS,
        abi: IDENTITY_REGISTRY_ABI,
        functionName: 'getAgentId',
        args: [userAddress],
      });
    } catch (error) {
      // User not registered in Identity Registry
      console.log('[ERC-8004] User not registered in Identity Registry, allowing access');
      return { allowed: true };
    }

    // Check if user is banned globally
    const isBanned = await client.readContract({
      address: BAN_MANAGER_ADDRESS,
      abi: BAN_MANAGER_ABI,
      functionName: 'isBanned',
      args: [agentId],
    });

    if (isBanned) {
      const [reason, expiry] = await Promise.all([
        client.readContract({
          address: BAN_MANAGER_ADDRESS,
          abi: BAN_MANAGER_ABI,
          functionName: 'getBanReason',
          args: [agentId],
        }),
        client.readContract({
          address: BAN_MANAGER_ADDRESS,
          abi: BAN_MANAGER_ABI,
          functionName: 'getBanExpiry',
          args: [agentId],
        }),
      ]);

      return {
        allowed: false,
        reason: reason as string,
        bannedUntil: Number(expiry),
      };
    }

    // Check app-specific access
    const isAllowed = await client.readContract({
      address: BAN_MANAGER_ADDRESS,
      abi: BAN_MANAGER_ABI,
      functionName: 'isAccessAllowed',
      args: [agentId, THEDESK_APP_ID as `0x${string}`],
    });

    if (!isAllowed) {
      return {
        allowed: false,
        reason: 'Access denied for TheDesk',
      };
    }

    return { allowed: true };
  } catch (error) {
    console.error('[ERC-8004] Error checking ban status:', error);
    // Fail open - allow access if we can't check
    return { allowed: true };
  }
}

/**
 * Get user's reputation score
 */
export async function getUserReputation(userAddress: Address): Promise<ReputationCheck> {
  if (REPUTATION_MANAGER_ADDRESS === '0x0000000000000000000000000000000000000000') {
    console.warn('[ERC-8004] Reputation manager not configured');
    return { score: 0, meetsMinimum: true };
  }

  try {
    const client = getPublicClient();
    
    // Get user's agent ID
    let agentId: bigint;
    try {
      agentId = await client.readContract({
        address: IDENTITY_REGISTRY_ADDRESS,
        abi: IDENTITY_REGISTRY_ABI,
        functionName: 'getAgentId',
        args: [userAddress],
      });
    } catch (error) {
      // User not registered
      return { score: 0, meetsMinimum: true };
    }

    // Get reputation score
    const score = await client.readContract({
      address: REPUTATION_MANAGER_ADDRESS,
      abi: REPUTATION_MANAGER_ABI,
      functionName: 'getReputation',
      args: [agentId],
    });

    // Check if meets minimum threshold (e.g., 50 for basic trading)
    const minThreshold = BigInt(50);
    const meetsMinimum = await client.readContract({
      address: REPUTATION_MANAGER_ADDRESS,
      abi: REPUTATION_MANAGER_ABI,
      functionName: 'hasMinimumReputation',
      args: [agentId, minThreshold],
    });

    return {
      score: Number(score),
      meetsMinimum: Boolean(meetsMinimum),
    };
  } catch (error) {
    console.error('[ERC-8004] Error checking reputation:', error);
    return { score: 0, meetsMinimum: true };
  }
}

/**
 * Check if user is registered in Identity Registry
 */
export async function isUserRegistered(userAddress: Address): Promise<boolean> {
  if (IDENTITY_REGISTRY_ADDRESS === '0x0000000000000000000000000000000000000000') {
    return true; // No registry configured, assume registered
  }

  try {
    const client = getPublicClient();
    
    const agentId = await client.readContract({
      address: IDENTITY_REGISTRY_ADDRESS,
      abi: IDENTITY_REGISTRY_ABI,
      functionName: 'getAgentId',
      args: [userAddress],
    });

    return agentId !== BigInt(0);
  } catch (error) {
    console.error('[ERC-8004] Error checking registration:', error);
    return true; // Fail open
  }
}

/**
 * Comprehensive user verification for trading
 */
export async function verifyUserForTrading(userAddress: Address): Promise<{
  allowed: boolean;
  registered: boolean;
  reputation: ReputationCheck;
  banStatus: BanCheckResult;
}> {
  const [registered, reputation, banStatus] = await Promise.all([
    isUserRegistered(userAddress),
    getUserReputation(userAddress),
    checkUserBan(userAddress),
  ]);

  return {
    allowed: registered && banStatus.allowed && reputation.meetsMinimum,
    registered,
    reputation,
    banStatus,
  };
}

