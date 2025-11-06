/**
 * X402 Payment Middleware for TheDesk
 */

import { ethers } from 'ethers';

const SERVICES = {
  "create-order": "0.1 USDC",
  "premium-matching": "1 USDC"
};

export class X402PaymentHandler {
  async verifyPayment(txHash: string, service: string, user: string): Promise<boolean> {
    // Verify transaction on Jeju chain
    const provider = new ethers.JsonRpcProvider(process.env.JEJU_RPC_URL || 'http://localhost:8545');
    const receipt = await provider.getTransactionReceipt(txHash);
    return receipt?.status === 1;
  }

  async requirePayment(service: keyof typeof SERVICES) {
    return (req: any, res: any, next: any) => {
      const payment = req.headers['payment'];
      if (!payment) {
        res.status(402).json({
          error: 'Payment Required',
          service,
          amount: SERVICES[service],
          currency: 'elizaOS'
        });
        return;
      }
      next();
    };
  }
}

export const x402 = new X402PaymentHandler();
