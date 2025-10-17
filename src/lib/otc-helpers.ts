/**
 * OTC Contract helpers for parsing struct responses from viem
 */

export interface ParsedOffer {
  consignmentId: bigint;
  tokenId: string;
  beneficiary: string;
  tokenAmount: bigint;
  discountBps: bigint;
  createdAt: bigint;
  unlockTime: bigint;
  priceUsdPerToken: bigint;
  maxPriceDeviation: bigint;
  ethUsdPrice: bigint;
  currency: number;
  approved: boolean;
  paid: boolean;
  fulfilled: boolean;
  cancelled: boolean;
  payer: string;
  amountPaid: bigint;
}

/**
 * Parse an Offer struct from viem contract read.
 * Viem may return structs as arrays or objects depending on version/config.
 *
 * Struct order from OTC.sol (UPDATED with multi-token support):
 * 0. consignmentId (uint256)
 * 1. tokenId (bytes32)
 * 2. beneficiary (address)
 * 3. tokenAmount (uint256)
 * 4. discountBps (uint256)
 * 5. createdAt (uint256)
 * 6. unlockTime (uint256)
 * 7. priceUsdPerToken (uint256)
 * 8. maxPriceDeviation (uint256)
 * 9. ethUsdPrice (uint256)
 * 10. currency (uint8)
 * 11. approved (bool)
 * 12. paid (bool)
 * 13. fulfilled (bool)
 * 14. cancelled (bool)
 * 15. payer (address)
 * 16. amountPaid (uint256)
 */
export function parseOfferStruct(offerRaw: any): ParsedOffer {
  if (Array.isArray(offerRaw)) {
    return {
      consignmentId: offerRaw[0],
      tokenId: offerRaw[1],
      beneficiary: offerRaw[2],
      tokenAmount: offerRaw[3],
      discountBps: offerRaw[4],
      createdAt: offerRaw[5],
      unlockTime: offerRaw[6],
      priceUsdPerToken: offerRaw[7],
      maxPriceDeviation: offerRaw[8],
      ethUsdPrice: offerRaw[9],
      currency: offerRaw[10],
      approved: offerRaw[11],
      paid: offerRaw[12],
      fulfilled: offerRaw[13],
      cancelled: offerRaw[14],
      payer: offerRaw[15],
      amountPaid: offerRaw[16],
    };
  }
  return offerRaw as ParsedOffer;
}
