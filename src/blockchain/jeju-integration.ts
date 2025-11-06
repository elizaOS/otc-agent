/**
 * Jeju chain integration for TheDesk
 * Adds support for Jeju network alongside existing EVM and Solana chains
 */

import { ethers } from 'ethers';

const BAZAAR_ABI = [
  'function createListing(uint8 assetType, address assetContract, uint256 tokenId, uint256 amount, uint8 currency, address customCurrencyAddress, uint256 price, uint256 duration) external returns (uint256)',
  'function buyListing(uint256 listingId) external payable',
  'function getListing(uint256 listingId) external view returns (tuple(uint256 listingId, address seller, uint8 assetType, address assetContract, uint256 tokenId, uint256 amount, uint8 currency, address customCurrencyAddress, uint256 price, uint8 listingType, uint8 status, uint256 createdAt, uint256 expiresAt))'
];

const PLAYER_TRADE_ESCROW_ABI = [
  'function createTrade(address playerB) external returns (uint256)',
  'function depositItems(uint256 tradeId, tuple(address tokenContract, uint256 tokenId, uint256 amount, uint8 tokenType)[] memory items) external',
  'function confirmTrade(uint256 tradeId) external'
];

export class JejuIntegration {
  private provider: ethers.Provider;
  private chainId: number;

  constructor() {
    const rpcUrl = process.env.NEXT_PUBLIC_JEJU_RPC_URL || 'http://localhost:8545';
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
    this.chainId = parseInt(process.env.NEXT_PUBLIC_JEJU_CHAIN_ID || '420691');
  }

  /**
   * Get Jeju chain config for wallet connection
   */
  getChainConfig() {
    return {
      id: this.chainId,
      name: 'Jeju Network',
      network: 'jeju',
      nativeCurrency: {
        name: 'Ether',
        symbol: 'ETH',
        decimals: 18
      },
      rpcUrls: {
        default: { http: [process.env.NEXT_PUBLIC_JEJU_RPC_URL || 'http://localhost:8545'] },
        public: { http: [process.env.NEXT_PUBLIC_JEJU_RPC_URL || 'http://localhost:8545'] }
      },
      blockExplorers: {
        default: { name: 'Jeju Explorer', url: 'http://localhost:4000' }
      }
    };
  }

  /**
   * Create OTC order on Jeju Bazaar (cross-app trading)
   */
  async createCrossAppOrder(
    signer: ethers.Signer,
    tokenAddress: string,
    amount: bigint,
    price: bigint,
    acceptedCurrency: number // 0=ETH, 1=HG, 2=USDC, 3=CUSTOM
  ): Promise<string> {
    const bazaarAddr = process.env.NEXT_PUBLIC_BAZAAR_ADDRESS;
    if (!bazaarAddr) throw new Error('Bazaar address not configured');

    const bazaar = new ethers.Contract(bazaarAddr, BAZAAR_ABI, signer);

    // Create listing for ERC20 tokens
    const tx = await bazaar.createListing(
      2, // AssetType.ERC20
      tokenAddress,
      0, // tokenId (0 for ERC20)
      amount,
      acceptedCurrency,
      ethers.ZeroAddress,
      price,
      7 * 24 * 60 * 60 // 7 days
    );

    await tx.wait();
    return tx.hash;
  }

  /**
   * Accept cross-app trade offer
   */
  async acceptCrossAppTrade(
    signer: ethers.Signer,
    listingId: number,
    paymentAmount: bigint
  ): Promise<string> {
    const bazaarAddr = process.env.NEXT_PUBLIC_BAZAAR_ADDRESS;
    if (!bazaarAddr) throw new Error('Bazaar address not configured');

    const bazaar = new ethers.Contract(bazaarAddr, BAZAAR_ABI, signer);

    const tx = await bazaar.buyListing(listingId, { value: paymentAmount });
    await tx.wait();

    return tx.hash;
  }

  /**
   * Get available cross-app tokens (from Hyperscape, Caliguland, etc.)
   */
  async getCrossAppTokens(): Promise<Array<{
    name: string;
    symbol: string;
    address: string;
    source: string;
  }>> {
    return [
      {
        name: 'Hyperscape Gold',
        symbol: 'HG',
        address: process.env.NEXT_PUBLIC_GOLD_CONTRACT_ADDRESS || '',
        source: 'Hyperscape MMO'
      },
      {
        name: 'elizaOS',
        symbol: 'ELIZA',
        address: process.env.NEXT_PUBLIC_ELIZAOS_TOKEN_ADDRESS || '',
        source: 'Jeju Protocol'
      },
      {
        name: 'CLANKER',
        symbol: 'CLANKER',
        address: process.env.NEXT_PUBLIC_CLANKER_TOKEN_ADDRESS || '',
        source: 'Base Protocol'
      },
      {
        name: 'VIRTUAL',
        symbol: 'VIRTUAL',
        address: process.env.NEXT_PUBLIC_VIRTUAL_TOKEN_ADDRESS || '',
        source: 'Virtuals Protocol'
      }
    ];
  }

  /**
   * Check if user can trade on Jeju (not banned)
   */
  async checkTradingAccess(address: string): Promise<{ allowed: boolean; reason?: string }> {
    const banManagerAddr = process.env.NEXT_PUBLIC_BAN_MANAGER_ADDRESS;
    if (!banManagerAddr) return { allowed: true };

    try {
      const banManager = new ethers.Contract(
        banManagerAddr,
        ['function isAccessAllowed(uint256 agentId, bytes32 appId) external view returns (bool)'],
        this.provider
      );

      const appId = ethers.id('otc-desk');
      const allowed = await banManager.isAccessAllowed(address, appId);

      return { allowed };
    } catch (error) {
      console.error('Ban check error:', error);
      return { allowed: true }; // Fail open
    }
  }
}

export const jejuIntegration = new JejuIntegration();

