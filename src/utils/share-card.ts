import type { OTCQuote } from "@/utils/xml-parser";

// Generate a simple share image using Canvas and return both File and dataUrl
export async function createQuoteShareImage(
  quote: OTCQuote,
): Promise<{ file: File; dataUrl: string }> {
  const width = 1200;
  const height = 630;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");

  // Background
  ctx.fillStyle = "#0a0a0a";
  ctx.fillRect(0, 0, width, height);

  // Accent gradient
  const grad = ctx.createLinearGradient(0, 0, width, height);
  grad.addColorStop(0, "#ff8c00");
  grad.addColorStop(1, "#ff4700");
  ctx.fillStyle = grad;
  ctx.globalAlpha = 0.12;
  ctx.fillRect(0, 0, width, height);
  ctx.globalAlpha = 1;

  // Title
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 64px Inter, Arial, sans-serif";
  ctx.fillText("ElizaOS OTC QUOTE", 60, 120);

  // Terms-focused content (no amount)
  const discount = (quote.discountPercent || quote.discountBps / 100).toFixed(
    2,
  );
  ctx.font = "bold 96px Inter, Arial, sans-serif";
  ctx.fillStyle = "#2ee072";
  ctx.fillText(`${discount}% discount`, 60, 260);

  ctx.fillStyle = "#ffffff";
  ctx.font = "48px Inter, Arial, sans-serif";
  const perToken = (quote.pricePerToken ?? 0).toFixed(6);
  ctx.fillText(`Per-token (pre-discount): $${perToken}`, 60, 340);
  ctx.fillText(`Lockup: ${quote.lockupMonths} months`, 60, 400);
  ctx.fillStyle = "#aaaaaa";
  ctx.font = "32px Inter, Arial, sans-serif";
  ctx.fillText("Choose your amount at acceptance", 60, 450);

  // Footer
  ctx.fillStyle = "#aaaaaa";
  ctx.font = "32px Inter, Arial, sans-serif";
  ctx.fillText("eliza otc desk", 60, 590);

  const blob: Blob | null = await new Promise((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", 0.92),
  );
  if (!blob) throw new Error("Failed to create image");
  const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
  const file = new File([blob], "eliza-otc-quote.jpg", { type: "image/jpeg" });
  return { file, dataUrl };
}

// Generate a share image for a completed deal (purchase)
export async function createDealShareImage(args: {
  tokenAmount: number;
  discountBps: number;
  lockupMonths: number;
  paymentCurrency?: "ETH" | "USDC";
}): Promise<{ file: File; dataUrl: string }> {
  const { tokenAmount, discountBps, lockupMonths, paymentCurrency } = args;

  const width = 1200;
  const height = 630;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");

  // Background
  ctx.fillStyle = "#0a0a0a";
  ctx.fillRect(0, 0, width, height);

  // Accent gradient
  const grad = ctx.createLinearGradient(0, 0, width, height);
  grad.addColorStop(0, "#00ff87");
  grad.addColorStop(1, "#00a3ff");
  ctx.fillStyle = grad;
  ctx.globalAlpha = 0.12;
  ctx.fillRect(0, 0, width, height);
  ctx.globalAlpha = 1;

  // Title
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 64px Inter, Arial, sans-serif";
  ctx.fillText("ElizaOS OTC DEAL", 60, 120);

  // Main numbers
  ctx.font = "bold 92px Inter, Arial, sans-serif";
  const amountText = `${tokenAmount.toLocaleString()} ElizaOS`;
  ctx.fillText(amountText, 60, 260);

  ctx.font = "bold 60px Inter, Arial, sans-serif";
  const discount = (discountBps / 100).toFixed(0);
  ctx.fillStyle = "#2ee072";
  ctx.fillText(`${discount}% discount`, 60, 350);

  ctx.fillStyle = "#ffffff";
  ctx.font = "48px Inter, Arial, sans-serif";
  ctx.fillText(
    `Lockup: ${Math.max(1, Math.round(lockupMonths))} months`,
    60,
    420,
  );
  if (paymentCurrency) {
    ctx.fillText(`Payment: ${paymentCurrency}`, 60, 480);
  }

  // Footer
  ctx.fillStyle = "#aaaaaa";
  ctx.font = "32px Inter, Arial, sans-serif";
  ctx.fillText("eliza otc desk", 60, 590);

  const blob: Blob | null = await new Promise((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", 0.92),
  );
  if (!blob) throw new Error("Failed to create image");
  const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
  const file = new File([blob], "eliza-otc-deal.jpg", { type: "image/jpeg" });
  return { file, dataUrl };
}
