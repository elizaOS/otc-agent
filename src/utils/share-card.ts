// Load and cache the business image
let businessImageCache: HTMLImageElement | null = null;

async function loadBusinessImage(): Promise<HTMLImageElement> {
  if (businessImageCache) return businessImageCache;

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      businessImageCache = img;
      resolve(img);
    };
    img.onerror = reject;
    img.src = "/business.png";
  });
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
  ctx.fillStyle = "#333333";
  ctx.fillRect(0, 0, width, height);

  // Accent gradient
  // const grad = ctx.createLinearGradient(0, 0, width, height);
  // grad.addColorStop(0, "#00ff87");
  // grad.addColorStop(1, "#00a3ff");
  // ctx.fillStyle = grad;
  // ctx.globalAlpha = 0.12;
  // ctx.fillRect(0, 0, width, height);
  // ctx.globalAlpha = 1;

  // Load and draw business image at full height, offset 20% off right edge
  const businessImg = await loadBusinessImage();
  const imgHeight = height;
  const imgWidth = (businessImg.width / businessImg.height) * imgHeight;
  // Position so 20% extends beyond the right edge
  ctx.drawImage(businessImg, width - imgWidth * 0.8, 0, imgWidth, imgHeight);

  // Title
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 64px Inter, Arial, sans-serif";
  ctx.fillText("OTC DEAL", 60, 120);

  // Main numbers - split amount and ticker for different colors
  ctx.font = "bold 92px Inter, Arial, sans-serif";
  const amountNumber = `${tokenAmount.toLocaleString()} `;
  ctx.fillStyle = "#ffffff";
  ctx.fillText(amountNumber, 60, 260);

  // Measure the number text to position the ticker next to it
  const numberWidth = ctx.measureText(amountNumber).width;
  ctx.fillStyle = "#60a5fa"; // Nice blue for the token ticker
  ctx.fillText("tokens", 60 + numberWidth + 20, 260);

  // Discount in orange
  ctx.font = "bold 60px Inter, Arial, sans-serif";
  const discount = (discountBps / 100).toFixed(0);
  ctx.fillStyle = "#fb923c"; // Orange color
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

  const blob: Blob | null = await new Promise((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", 0.92),
  );
  if (!blob) throw new Error("Failed to create image");
  const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
  const file = new File([blob], "eliza-otc-deal.jpg", { type: "image/jpeg" });
  return { file, dataUrl };
}
