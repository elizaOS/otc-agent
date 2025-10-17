import { useEffect, useState } from "react";
import type { OTCConsignment, Chain } from "@/services/database";

export function useConsignments(filters?: {
  tokenId?: string;
  chain?: Chain;
  isNegotiable?: boolean;
}) {
  const [consignments, setConsignments] = useState<OTCConsignment[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadConsignments() {
      const params = new URLSearchParams();
      if (filters?.tokenId) params.append("tokenId", filters.tokenId);
      if (filters?.chain) params.append("chain", filters.chain);
      if (filters?.isNegotiable !== undefined)
        params.append("isNegotiable", String(filters.isNegotiable));

      const response = await fetch(`/api/consignments?${params.toString()}`);
      const data = await response.json();

      if (data.success) {
        setConsignments(data.consignments || []);
      }
      setIsLoading(false);
    }

    loadConsignments();
  }, [filters?.tokenId, filters?.chain, filters?.isNegotiable]);

  return { consignments, isLoading };
}

export function useConsignment(consignmentId: string | null) {
  const [consignment, setConsignment] = useState<OTCConsignment | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!consignmentId) {
      setIsLoading(false);
      return;
    }

    async function loadConsignment() {
      const response = await fetch(`/api/consignments/${consignmentId}`);
      const data = await response.json();

      if (data.success) {
        setConsignment(data.consignment);
      }
      setIsLoading(false);
    }

    loadConsignment();
  }, [consignmentId]);

  return { consignment, isLoading };
}

export function useConsignerConsignments(consignerAddress: string | null) {
  const [consignments, setConsignments] = useState<OTCConsignment[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!consignerAddress) {
      setIsLoading(false);
      return;
    }

    async function loadConsignments() {
      const response = await fetch(
        `/api/consignments?consigner=${consignerAddress}`,
      );
      const data = await response.json();

      if (data.success) {
        setConsignments(data.consignments || []);
      }
      setIsLoading(false);
    }

    loadConsignments();
  }, [consignerAddress]);

  return { consignments, isLoading };
}
