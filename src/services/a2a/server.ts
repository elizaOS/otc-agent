/**
 * A2A JSON-RPC Server for TheDesk OTC Trading
 * Enables agents to access OTC trading programmatically
 */

import { Router, Request, Response } from 'express';
import { ethers } from 'ethers';
import { v4 as uuidv4 } from 'uuid';

export interface A2AMessage {
  role: 'user' | 'agent';
  parts: Array<{ kind: string; text?: string; data?: Record<string, unknown> }>;
  messageId: string;
  kind: 'message';
}

export class DeskA2AServer {
  createRouter(): Router {
    const router = Router();

    // Agent Card
    router.get('/.well-known/agent-card.json', (req: Request, res: Response) => {
      res.json({
        name: 'TheDesk OTC',
        description: 'Over-the-counter trading desk for large token swaps',
        version: '1.0.0',
        capabilities: {
          'create-order': { description: 'Create OTC order', cost: '0.1 USDC' },
          'accept-order': { description: 'Accept OTC order', cost: '0' },
          'create-quote': { description: 'Request quote', cost: '0' },
          'accept-quote': { description: 'Accept quote', cost: '0' },
          'list-orders': { description: 'Browse orders', cost: '0' },
          'cancel-order': { description: 'Cancel order', cost: '0' }
        },
        protocols: ['A2A', 'x402', 'ERC-8004'],
        payment: {
          tokens: ['USDC', 'elizaOS', 'ETH'],
          methods: ['direct', 'paymaster']
        }
      });
    });

    // A2A JSON-RPC endpoint
    router.post('/a2a', async (req: Request, res: Response) => {
      await this.handleRequest(req, res);
    });

    return router;
  }

  private async handleRequest(req: Request, res: Response): Promise<void> {
    const request = req.body;

    if (request.method === 'message/send' || request.method === 'message/stream') {
      await this.handleMessageSend(request, res);
    } else {
      res.json({
        jsonrpc: '2.0',
        id: request.id,
        error: { code: -32601, message: `Unknown method: ${request.method}` }
      });
    }
  }

  private async handleMessageSend(request: any, res: Response): Promise<void> {
    const message = request.params?.message;
    const dataPart = message?.parts.find((p: any) => p.kind === 'data');
    const data = dataPart?.data || {};

    const result = await this.executeSkill(data.skillId, data);

    res.json({
      jsonrpc: '2.0',
      id: request.id,
      result: {
        role: 'agent',
        parts: [
          { kind: 'text', text: result.message },
          { kind: 'data', data: result.data }
        ],
        messageId: uuidv4(),
        kind: 'message'
      }
    });
  }

  private async executeSkill(skillId: string, data: any): Promise<{ message: string; data: any }> {
    switch (skillId) {
      case 'list-orders':
        return {
          message: 'Active OTC orders',
          data: {
            orders: [
              {
                id: '1',
                type: 'buy',
                tokenIn: 'USDC',
                tokenOut: 'ETH',
                amountIn: '10000',
                amountOut: '3.5',
                maker: '0x...',
                status: 'open'
              }
            ]
          }
        };

      case 'create-order':
        return {
          message: 'OTC order created',
          data: {
            orderId: '123',
            status: 'pending',
            requiresPayment: true,
            paymentAmount: '0.1 USDC'
          }
        };

      case 'accept-order':
        return {
          message: 'Order accepted',
          data: {
            orderId: data.orderId,
            txHash: '0x...',
            status: 'matched'
          }
        };

      default:
        throw new Error(`Unknown skill: ${skillId}`);
    }
  }
}

export function createDeskA2AServer(): Router {
  const server = new DeskA2AServer();
  return server.createRouter();
}

