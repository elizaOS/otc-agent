/**
 * A2A Server for TheDesk - OTC Trading Platform
 * Enables autonomous agents to discover and execute large token swaps
 * Implements x402 micropayments for premium features
 */

import express, { Request, Response } from 'express';
import cors from 'cors';
import { createPaymentRequirement, checkPayment, PAYMENT_TIERS } from './lib/x402';
import { checkUserBan } from './lib/erc8004';
import { Address } from 'viem';

const app = express();
const PORT = process.env.A2A_PORT || 5005;
const PAYMENT_RECIPIENT = (process.env.THEDESK_PAYMENT_RECIPIENT || 
  '0x0000000000000000000000000000000000000000') as Address;

app.use(cors());
app.use(express.json());

interface A2ARequest {
  jsonrpc: string;
  method: string;
  params?: {
    message?: {
      messageId: string;
      parts: Array<{
        kind: string;
        text?: string;
        data?: Record<string, unknown>;
      }>;
    };
  };
  id: number | string;
}

interface A2AResponse {
  jsonrpc: string;
  id: number | string;
  result?: {
    role: string;
    parts: Array<{
      kind: string;
      text?: string;
      data?: Record<string, unknown>;
    }>;
    messageId: string;
    kind: string;
  };
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

/**
 * Execute a skill and return results
 * Premium skills require payment via x402
 */
async function executeSkill(
  skillId: string,
  params: Record<string, unknown>,
  paymentHeader: string | null,
  userAddress?: string
): Promise<{
  message: string;
  data: Record<string, unknown>;
  requiresPayment?: unknown;
}> {
  // Check user ban status if address provided
  if (userAddress) {
    const banCheck = await checkUserBan(userAddress as Address);
    if (!banCheck.allowed) {
      throw new Error(`User is banned: ${banCheck.reason}`);
    }
  }

  switch (skillId) {
    // ============ FREE TIER SKILLS ============

    case 'get-supported-tokens': {
      return {
        message: 'Supported tokens for OTC trading',
        data: {
          tokens: [
            { symbol: 'ETH', network: 'base', minOrder: '10', maxOrder: '1000' },
            { symbol: 'USDC', network: 'base', minOrder: '10000', maxOrder: '10000000' },
            { symbol: 'WETH', network: 'base', minOrder: '10', maxOrder: '1000' },
            { symbol: 'elizaOS', network: 'jeju', minOrder: '1000', maxOrder: '1000000' },
            { symbol: 'SOL', network: 'solana', minOrder: '10', maxOrder: '10000' },
          ],
        },
      };
    }

    case 'get-market-info': {
      const token = params.token as string || 'ETH';
      return {
        message: `Current market info for ${token}`,
        data: {
          token,
          price: '0', // Would fetch from oracle
          volume24h: '0',
          liquidity: '0',
          spread: '0.5%',
          lastUpdate: Date.now(),
        },
      };
    }

    case 'get-quote-history': {
      const limit = (params.limit as number) || 10;
      return {
        message: `Recent ${limit} quotes`,
        data: {
          quotes: [],
          note: 'Quote history stored in database',
        },
      };
    }

    // ============ PAID TIER SKILLS ============

    case 'request-quote': {
      // Check payment for quote request
      const paymentCheck = await checkPayment(
        paymentHeader,
        PAYMENT_TIERS.QUOTE_REQUEST,
        PAYMENT_RECIPIENT
      );

      if (!paymentCheck.paid) {
        return {
          message: 'Payment required',
          data: {},
          requiresPayment: createPaymentRequirement(
            '/a2a',
            PAYMENT_TIERS.QUOTE_REQUEST,
            'OTC quote request fee',
            PAYMENT_RECIPIENT
          ),
        };
      }

      const fromToken = params.fromToken as string;
      const toToken = params.toToken as string;
      const amount = params.amount as string;

      return {
        message: 'Quote requested',
        data: {
          quoteId: `quote_${Date.now()}`,
          fromToken,
          toToken,
          amount,
          estimatedRate: '0', // Would calculate from oracle
          validUntil: Date.now() + 300000, // 5 minutes
          fee: PAYMENT_TIERS.QUOTE_REQUEST.toString(),
          status: 'pending_approval',
        },
      };
    }

    case 'execute-trade': {
      // Check payment for trade execution
      const tradeAmount = BigInt((params.amount as string) || '0');
      const tradeFee = (tradeAmount * BigInt(PAYMENT_TIERS.TRADE_FEE_BPS)) / BigInt(10000);

      const paymentCheck = await checkPayment(
        paymentHeader,
        tradeFee,
        PAYMENT_RECIPIENT
      );

      if (!paymentCheck.paid) {
        return {
          message: 'Payment required',
          data: {},
          requiresPayment: createPaymentRequirement(
            '/a2a',
            tradeFee,
            'OTC trade execution fee',
            PAYMENT_RECIPIENT
          ),
        };
      }

      const quoteId = params.quoteId as string;

      return {
        message: 'Trade execution initiated',
        data: {
          tradeId: `trade_${Date.now()}`,
          quoteId,
          status: 'executing',
          fee: tradeFee.toString(),
          settlement: paymentCheck.settlement,
        },
      };
    }

    case 'get-order-book': {
      // Premium feature - requires payment
      const paymentCheck = await checkPayment(
        paymentHeader,
        PAYMENT_TIERS.ORDERBOOK_ACCESS,
        PAYMENT_RECIPIENT
      );

      if (!paymentCheck.paid) {
        return {
          message: 'Payment required',
          data: {},
          requiresPayment: createPaymentRequirement(
            '/a2a',
            PAYMENT_TIERS.ORDERBOOK_ACCESS,
            'Order book access fee',
            PAYMENT_RECIPIENT
          ),
        };
      }

      const token = params.token as string;

      return {
        message: `Order book for ${token}`,
        data: {
          token,
          bids: [],
          asks: [],
          spread: '0.5%',
          depth: '0',
        },
      };
    }

    case 'create-limit-order': {
      // Check payment
      const paymentCheck = await checkPayment(
        paymentHeader,
        PAYMENT_TIERS.LIMIT_ORDER,
        PAYMENT_RECIPIENT
      );

      if (!paymentCheck.paid) {
        return {
          message: 'Payment required',
          data: {},
          requiresPayment: createPaymentRequirement(
            '/a2a',
            PAYMENT_TIERS.LIMIT_ORDER,
            'Limit order creation fee',
            PAYMENT_RECIPIENT
          ),
        };
      }

      return {
        message: 'Limit order created',
        data: {
          orderId: `order_${Date.now()}`,
          token: params.token,
          side: params.side,
          price: params.price,
          amount: params.amount,
          status: 'active',
        },
      };
    }

    case 'cancel-order': {
      // Free to cancel
      return {
        message: 'Order cancelled',
        data: {
          orderId: params.orderId,
          status: 'cancelled',
        },
      };
    }

    case 'get-trade-history': {
      // Premium feature
      const paymentCheck = await checkPayment(
        paymentHeader,
        PAYMENT_TIERS.HISTORY_ACCESS,
        PAYMENT_RECIPIENT
      );

      if (!paymentCheck.paid) {
        return {
          message: 'Payment required',
          data: {},
          requiresPayment: createPaymentRequirement(
            '/a2a',
            PAYMENT_TIERS.HISTORY_ACCESS,
            'Trade history access fee',
            PAYMENT_RECIPIENT
          ),
        };
      }

      return {
        message: 'Trade history',
        data: {
          trades: [],
          totalVolume: '0',
          note: 'Historical trades stored in database',
        },
      };
    }

    default:
      throw new Error('Unknown skill');
  }
}

// Serve main agent card at /.well-known/agent-card.json
app.get('/.well-known/agent-card.json', (_req: Request, res: Response) => {
  res.json({
    protocolVersion: '0.3.0',
    name: 'TheDesk OTC Trading Platform',
    description: 'Over-the-counter trading desk for large token swaps on EVM and Solana',
    url: `http://localhost:${PORT}/a2a`,
    preferredTransport: 'http',
    provider: {
      organization: 'Jeju Network',
      url: 'https://jeju.network',
    },
    version: '1.0.0',
    capabilities: {
      streaming: false,
      pushNotifications: false,
      stateTransitionHistory: true,
      multiChain: true,
    },
    defaultInputModes: ['text', 'data'],
    defaultOutputModes: ['text', 'data'],
    skills: [
      {
        id: 'get-supported-tokens',
        name: 'Get Supported Tokens',
        description: 'List all tokens available for OTC trading',
        tags: ['query', 'tokens', 'free'],
        examples: ['What tokens can I trade?', 'Show supported tokens'],
      },
      {
        id: 'get-market-info',
        name: 'Get Market Info',
        description: 'Get current market information for a token',
        tags: ['query', 'market', 'free'],
        examples: ['Show ETH market info', 'What is the current USDC price?'],
      },
      {
        id: 'request-quote',
        name: 'Request OTC Quote',
        description: 'Request a quote for a large token swap',
        tags: ['action', 'trading', 'paid'],
        examples: ['Quote 100 ETH to USDC', 'Get quote for 1M USDC swap'],
        payment: {
          required: true,
          amount: PAYMENT_TIERS.QUOTE_REQUEST.toString(),
          currency: 'ETH',
        },
      },
      {
        id: 'execute-trade',
        name: 'Execute OTC Trade',
        description: 'Execute an approved OTC trade',
        tags: ['action', 'trading', 'paid'],
        examples: ['Execute quote abc123', 'Trade on quote xyz789'],
        payment: {
          required: true,
          type: 'percentage',
          basisPoints: PAYMENT_TIERS.TRADE_FEE_BPS,
        },
      },
      {
        id: 'get-order-book',
        name: 'Get Order Book',
        description: 'View current order book for a token pair',
        tags: ['query', 'market', 'paid'],
        examples: ['Show ETH/USDC order book', 'View orderbook'],
        payment: {
          required: true,
          amount: PAYMENT_TIERS.ORDERBOOK_ACCESS.toString(),
          currency: 'ETH',
        },
      },
      {
        id: 'create-limit-order',
        name: 'Create Limit Order',
        description: 'Place a limit order on the OTC desk',
        tags: ['action', 'trading', 'paid'],
        examples: ['Limit buy 10 ETH at $3000', 'Sell 100k USDC'],
        payment: {
          required: true,
          amount: PAYMENT_TIERS.LIMIT_ORDER.toString(),
          currency: 'ETH',
        },
      },
      {
        id: 'cancel-order',
        name: 'Cancel Order',
        description: 'Cancel an active limit order',
        tags: ['action', 'trading', 'free'],
        examples: ['Cancel order 123', 'Remove my limit order'],
      },
      {
        id: 'get-trade-history',
        name: 'Get Trade History',
        description: 'View your historical trades',
        tags: ['query', 'history', 'paid'],
        examples: ['Show my trades', 'Trade history'],
        payment: {
          required: true,
          amount: PAYMENT_TIERS.HISTORY_ACCESS.toString(),
          currency: 'ETH',
        },
      },
      {
        id: 'get-quote-history',
        name: 'Get Quote History',
        description: 'View recent quote requests',
        tags: ['query', 'history', 'free'],
        examples: ['Show recent quotes', 'Quote history'],
      },
    ],
  });
});

// A2A JSON-RPC endpoint
app.post('/a2a', async (req: Request, res: Response) => {
  const body: A2ARequest = req.body;
  const paymentHeader = req.headers['x-payment'] as string | undefined;

  if (body.method !== 'message/send') {
    return res.json({
      jsonrpc: '2.0',
      id: body.id,
      error: { code: -32601, message: 'Method not found' },
    });
  }

  const message = body.params?.message;
  if (!message || !message.parts) {
    return res.json({
      jsonrpc: '2.0',
      id: body.id,
      error: { code: -32602, message: 'Invalid params' },
    });
  }

  const dataPart = message.parts.find((p) => p.kind === 'data');
  if (!dataPart || !dataPart.data) {
    return res.json({
      jsonrpc: '2.0',
      id: body.id,
      error: { code: -32602, message: 'No data part found' },
    });
  }

  const skillId = dataPart.data.skillId as string;
  const params = (dataPart.data.params as Record<string, unknown>) || {};
  const userAddress = dataPart.data.userAddress as string | undefined;

  if (!skillId) {
    return res.json({
      jsonrpc: '2.0',
      id: body.id,
      error: { code: -32602, message: 'No skillId specified' },
    });
  }

  try {
    const result = await executeSkill(skillId, params, paymentHeader || null, userAddress);

    // Check if payment required
    if (result.requiresPayment) {
      return res.status(402).json({
        jsonrpc: '2.0',
        id: body.id,
        error: {
          code: 402,
          message: 'Payment Required',
          data: result.requiresPayment,
        },
      });
    }

    res.json({
      jsonrpc: '2.0',
      id: body.id,
      result: {
        role: 'agent',
        parts: [
          { kind: 'text', text: result.message },
          { kind: 'data', data: result.data },
        ],
        messageId: message.messageId,
        kind: 'message',
      },
    });
  } catch (error) {
    res.json({
      jsonrpc: '2.0',
      id: body.id,
      error: {
        code: -32603,
        message: error instanceof Error ? error.message : 'Internal error',
      },
    });
  }
});

// Health check endpoint
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'healthy', service: 'otc-desk-a2a' });
});

app.listen(PORT, () => {
  console.log(`🏦 TheDesk A2A Server running on http://localhost:${PORT}`);
  console.log(`   Agent Card: http://localhost:${PORT}/.well-known/agent-card.json`);
  console.log(`   A2A Endpoint: http://localhost:${PORT}/a2a`);
  console.log(`   Health Check: http://localhost:${PORT}/health`);
});

export default app;

