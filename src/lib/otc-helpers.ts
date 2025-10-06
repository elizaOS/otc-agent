/**
 * OTC Contract helpers for parsing struct responses from viem
 */

export interface ParsedOffer {
  beneficiary: string;
  tokenAmount: bigint;
  discountBps: bigint;
  createdAt: bigint;
  unlockTime: bigint;
  priceUsdPerToken: bigint;
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
 * Struct order from OTC.sol:
 * 0. beneficiary (address)
 * 1. tokenAmount (uint256)
 * 2. discountBps (uint256)
 * 3. createdAt (uint256)
 * 4. unlockTime (uint256)
 * 5. priceUsdPerToken (uint256)
 * 6. ethUsdPrice (uint256)
 * 7. currency (uint8)
 * 8. approved (bool)
 * 9. paid (bool)
 * 10. fulfilled (bool)
 * 11. cancelled (bool)
 * 12. payer (address)
 * 13. amountPaid (uint256)
 */
export function parseOfferStruct(offerRaw: any): ParsedOffer {
  if (Array.isArray(offerRaw)) {
    return {
      beneficiary: offerRaw[0],
      tokenAmount: offerRaw[1],
      discountBps: offerRaw[2],
      createdAt: offerRaw[3],
      unlockTime: offerRaw[4],
      priceUsdPerToken: offerRaw[5],
      ethUsdPrice: offerRaw[6],
      currency: offerRaw[7],
      approved: offerRaw[8],
      paid: offerRaw[9],
      fulfilled: offerRaw[10],
      cancelled: offerRaw[11],
      payer: offerRaw[12],
      amountPaid: offerRaw[13],
    };
  }
  return offerRaw as ParsedOffer;
}
