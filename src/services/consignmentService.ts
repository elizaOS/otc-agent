import {
  ConsignmentDB,
  ConsignmentDealDB,
  type OTCConsignment,
  type ConsignmentDeal,
} from "./database";
import type { Chain } from "@/config/chains";
import { walletToEntityId } from "@/lib/entityId";

export interface ConsignmentParams {
  tokenId: string;
  consignerAddress: string;
  amount: string;
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
  chain: Chain;
}

export class ConsignmentService {
  async createConsignment(params: ConsignmentParams): Promise<OTCConsignment> {
    if (!params.isNegotiable) {
      if (
        params.fixedDiscountBps === undefined ||
        params.fixedLockupDays === undefined
      ) {
        throw new Error(
          "Fixed consignments must specify fixedDiscountBps and fixedLockupDays",
        );
      }
    }

    if (BigInt(params.minDealAmount) > BigInt(params.maxDealAmount)) {
      throw new Error("minDealAmount cannot exceed maxDealAmount");
    }

    if (BigInt(params.amount) < BigInt(params.minDealAmount)) {
      throw new Error("Total amount must be at least minDealAmount");
    }

    if (params.minDiscountBps > params.maxDiscountBps) {
      throw new Error("minDiscountBps cannot exceed maxDiscountBps");
    }

    if (params.minLockupDays > params.maxLockupDays) {
      throw new Error("minLockupDays cannot exceed maxLockupDays");
    }

    const consignment = await ConsignmentDB.createConsignment({
      tokenId: params.tokenId,
      consignerAddress: params.consignerAddress.toLowerCase(),
      consignerEntityId: walletToEntityId(params.consignerAddress),
      totalAmount: params.amount,
      remainingAmount: params.amount,
      isNegotiable: params.isNegotiable,
      fixedDiscountBps: params.fixedDiscountBps,
      fixedLockupDays: params.fixedLockupDays,
      minDiscountBps: params.minDiscountBps,
      maxDiscountBps: params.maxDiscountBps,
      minLockupDays: params.minLockupDays,
      maxLockupDays: params.maxLockupDays,
      minDealAmount: params.minDealAmount,
      maxDealAmount: params.maxDealAmount,
      isFractionalized: params.isFractionalized,
      isPrivate: params.isPrivate,
      allowedBuyers: params.allowedBuyers?.map((a) => a.toLowerCase()),
      maxPriceVolatilityBps: params.maxPriceVolatilityBps,
      maxTimeToExecuteSeconds: params.maxTimeToExecuteSeconds,
      status: "active",
      chain: params.chain,
    });

    return consignment;
  }

  async updateConsignment(
    consignmentId: string,
    updates: Partial<OTCConsignment>,
  ): Promise<OTCConsignment> {
    const consignment = await ConsignmentDB.getConsignment(consignmentId);

    if (consignment.remainingAmount !== consignment.totalAmount) {
      const restrictedFields: Array<keyof OTCConsignment> = [
        "totalAmount",
        "minDealAmount",
        "maxDealAmount",
        "isFractionalized",
      ];
      for (const field of restrictedFields) {
        if (updates[field] !== undefined) {
          throw new Error(`Cannot modify ${field} after deals have been made`);
        }
      }
    }

    return await ConsignmentDB.updateConsignment(consignmentId, updates);
  }

  async withdrawConsignment(consignmentId: string): Promise<void> {
    const consignment = await ConsignmentDB.getConsignment(consignmentId);

    if (consignment.status === "withdrawn") {
      throw new Error("Consignment already withdrawn");
    }

    await ConsignmentDB.updateConsignment(consignmentId, {
      status: "withdrawn",
    });
  }

  async getConsignment(consignmentId: string): Promise<OTCConsignment> {
    return await ConsignmentDB.getConsignment(consignmentId);
  }

  async getConsignmentsByToken(
    tokenId: string,
    filters?: {
      includePrivate?: boolean;
      requesterAddress?: string;
      minAmount?: string;
    },
  ): Promise<OTCConsignment[]> {
    let consignments = await ConsignmentDB.getConsignmentsByToken(tokenId);

    if (!filters?.includePrivate) {
      consignments = consignments.filter((c) => !c.isPrivate);
    }

    if (filters?.includePrivate && filters?.requesterAddress) {
      const requester = filters.requesterAddress.toLowerCase();
      consignments = consignments.filter((c) => {
        if (!c.isPrivate) return true;
        if (c.consignerAddress === requester) return true;
        if (c.allowedBuyers?.includes(requester)) return true;
        return false;
      });
    }

    if (filters?.minAmount) {
      consignments = consignments.filter(
        (c) => BigInt(c.remainingAmount) >= BigInt(filters.minAmount),
      );
    }

    return consignments;
  }

  async getConsignerConsignments(
    consignerAddress: string,
  ): Promise<OTCConsignment[]> {
    return await ConsignmentDB.getConsignmentsByConsigner(
      consignerAddress.toLowerCase(),
    );
  }

  async getAllConsignments(filters?: {
    chain?: Chain;
    tokenId?: string;
    isNegotiable?: boolean;
  }): Promise<OTCConsignment[]> {
    return await ConsignmentDB.getAllConsignments(filters);
  }

  async reserveAmount(consignmentId: string, amount: string): Promise<void> {
    const { agentRuntime } = await import("@/lib/agent-runtime");
    const runtime = await agentRuntime.getRuntime();

    const lockKey = `consignment_lock:${consignmentId}`;
    const existingLock = await runtime.getCache<boolean>(lockKey);
    if (existingLock) {
      throw new Error("Consignment is being modified, try again");
    }

    await runtime.setCache(lockKey, true);

    const consignment = await ConsignmentDB.getConsignment(consignmentId);

    if (consignment.status !== "active") {
      await runtime.deleteCache(lockKey);
      throw new Error("Consignment is not active");
    }

    const remaining = BigInt(consignment.remainingAmount);
    const reserve = BigInt(amount);

    if (reserve > remaining) {
      await runtime.deleteCache(lockKey);
      throw new Error("Insufficient remaining amount");
    }

    if (reserve < BigInt(consignment.minDealAmount)) {
      await runtime.deleteCache(lockKey);
      throw new Error("Amount below minimum deal size");
    }

    if (reserve > BigInt(consignment.maxDealAmount)) {
      await runtime.deleteCache(lockKey);
      throw new Error("Amount exceeds maximum deal size");
    }

    const newRemaining = (remaining - reserve).toString();
    const status = newRemaining === "0" ? "depleted" : "active";

    await ConsignmentDB.updateConsignment(consignmentId, {
      remainingAmount: newRemaining,
      status,
      lastDealAt: Date.now(),
    });

    await runtime.deleteCache(lockKey);
  }

  async releaseReservation(
    consignmentId: string,
    amount: string,
  ): Promise<void> {
    const consignment = await ConsignmentDB.getConsignment(consignmentId);
    const newRemaining = (
      BigInt(consignment.remainingAmount) + BigInt(amount)
    ).toString();
    const status = newRemaining === "0" ? "depleted" : "active";

    await ConsignmentDB.updateConsignment(consignmentId, {
      remainingAmount: newRemaining,
      status,
    });
  }

  async recordDeal(params: {
    consignmentId: string;
    quoteId: string;
    tokenId: string;
    buyerAddress: string;
    amount: string;
    discountBps: number;
    lockupDays: number;
    offerId?: string;
  }): Promise<ConsignmentDeal> {
    return await ConsignmentDealDB.createDeal({
      consignmentId: params.consignmentId,
      quoteId: params.quoteId,
      tokenId: params.tokenId,
      buyerAddress: params.buyerAddress.toLowerCase(),
      amount: params.amount,
      discountBps: params.discountBps,
      lockupDays: params.lockupDays,
      executedAt: Date.now(),
      offerId: params.offerId,
      status: "executed",
    });
  }

  async getConsignmentDeals(consignmentId: string): Promise<ConsignmentDeal[]> {
    return await ConsignmentDealDB.getDealsByConsignment(consignmentId);
  }

  findSuitableConsignment(
    consignments: OTCConsignment[],
    amount: string,
    discountBps: number,
    lockupDays: number,
  ): OTCConsignment | null {
    for (const c of consignments) {
      if (BigInt(amount) < BigInt(c.minDealAmount)) continue;
      if (BigInt(amount) > BigInt(c.maxDealAmount)) continue;
      if (BigInt(amount) > BigInt(c.remainingAmount)) continue;

      if (c.isNegotiable) {
        if (discountBps < c.minDiscountBps || discountBps > c.maxDiscountBps)
          continue;
        if (lockupDays < c.minLockupDays || lockupDays > c.maxLockupDays)
          continue;
      } else {
        if (discountBps !== c.fixedDiscountBps) continue;
        if (lockupDays !== c.fixedLockupDays) continue;
      }

      return c;
    }

    return null;
  }
}
