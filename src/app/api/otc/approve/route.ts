import { NextRequest, NextResponse } from "next/server";
import {
  createPublicClient,
  createWalletClient,
  http,
  type Abi,
  type Address,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base, baseSepolia, hardhat } from "viem/chains";
import otcArtifact from "@/contracts/artifacts/contracts/OTC.sol/OTC.json";
import { agentRuntime } from "@/lib/agent-runtime";
import { parseOfferStruct } from "@/lib/otc-helpers";
import { promises as fs } from "fs";
import path from "path";

function getChain() {
  const env = process.env.NODE_ENV;
  const network = process.env.NETWORK || "hardhat";
  if (env === "production") return base;
  if (network === "base-sepolia") return baseSepolia;
  return hardhat;
}

export async function POST(request: NextRequest) {
  // Resolve OTC address (env first, then devnet file fallback)
  const resolveOtcAddress = async (): Promise<Address> => {
    const envAddr = process.env.NEXT_PUBLIC_OTC_ADDRESS as Address | undefined;
    if (envAddr) return envAddr;

    const deployed = path.join(
      process.cwd(),
      "contracts/ignition/deployments/chain-31337/deployed_addresses.json",
    );
    const raw = await fs.readFile(deployed, "utf8");
    const json = JSON.parse(raw);
    const addr =
      (json["OTCModule#OTC"] as Address) ||
      (json["OTCDeskModule#OTC"] as Address) ||
      (json["ElizaOTCModule#ElizaOTC"] as Address) ||
      (json["OTCModule#desk"] as Address);
    if (!addr) throw new Error("No OTC address configured");
    return addr;
  };

  const OTC_ADDRESS = await resolveOtcAddress();
  const RAW_PK = process.env.APPROVER_PRIVATE_KEY as string | undefined;
  const APPROVER_PRIVATE_KEY =
    RAW_PK && /^0x[0-9a-fA-F]{64}$/.test(RAW_PK)
      ? (RAW_PK as `0x${string}`)
      : undefined;
  if (RAW_PK && !APPROVER_PRIVATE_KEY) {
    console.warn(
      "[Approve API] Ignoring invalid APPROVER_PRIVATE_KEY format. Falling back to impersonation.",
    );
  }

  // Parse body
  const contentType = request.headers.get("content-type") || "";
  let offerId: string | number | bigint;
  let chainType: string | undefined;
  let offerAddress: string | undefined;

  if (contentType.includes("application/json")) {
    const body = await request.json();
    offerId = body.offerId;
    chainType = body.chain;
    offerAddress = body.offerAddress;
  } else if (contentType.includes("application/x-www-form-urlencoded")) {
    const form = await request.formData();
    const v = form.get("offerId");
    if (!v) throw new Error("offerId required in form data");
    offerId = String(v);
  } else {
    const { searchParams } = new URL(request.url);
    const v = searchParams.get("offerId");
    if (!v) throw new Error("offerId required in query params");
    offerId = v;
  }

  console.log("[Approve API] Approving offer:", offerId, "chain:", chainType);

  // Handle Solana approval
  if (chainType === "solana") {
    if (!offerAddress) throw new Error("offerAddress required for Solana");
    console.log(
      "[Approve API] Processing Solana approval for offer:",
      offerAddress,
    );

    // Import Anchor and Solana libs dynamically
    const anchor = await import("@coral-xyz/anchor");
    const { Connection, PublicKey, Keypair } = await import("@solana/web3.js");

    const SOLANA_RPC =
      process.env.NEXT_PUBLIC_SOLANA_RPC || "http://127.0.0.1:8899";
    const SOLANA_DESK = process.env.NEXT_PUBLIC_SOLANA_DESK;

    if (!SOLANA_DESK) throw new Error("SOLANA_DESK not configured");

    const connection = new Connection(SOLANA_RPC, "confirmed");

    // Load owner/approver keypair from id.json
    const idlPath = path.join(
      process.cwd(),
      "solana/otc-program/target/idl/otc.json",
    );
    const keypairPath = path.join(process.cwd(), "solana/otc-program/id.json");
    const idl = JSON.parse(await fs.readFile(idlPath, "utf8"));
    const keypairData = JSON.parse(await fs.readFile(keypairPath, "utf8"));
    const approverKeypair = Keypair.fromSecretKey(Uint8Array.from(keypairData));

    // Create provider with the approver keypair
    const wallet = {
      publicKey: approverKeypair.publicKey,
      signTransaction: async (tx: any) => {
        tx.partialSign(approverKeypair);
        return tx;
      },
      signAllTransactions: async (txs: any[]) => {
        txs.forEach((tx) => tx.partialSign(approverKeypair));
        return txs;
      },
    };

    const provider = new anchor.AnchorProvider(connection, wallet as any, {
      commitment: "confirmed",
    });
    anchor.setProvider(provider);

    const program = new (anchor as any).Program(idl, provider);

    // Approve the offer
    const desk = new PublicKey(SOLANA_DESK);
    const offer = new PublicKey(offerAddress);

    const approveTx = await program.methods
      .approveOffer(new (anchor as any).BN(offerId))
      .accounts({
        desk,
        offer,
        approver: approverKeypair.publicKey,
      })
      .signers([approverKeypair])
      .rpc();

    console.log("[Approve API] ✅ Solana offer approved:", approveTx);

    // Fetch offer to get payment details
    const offerData = await program.account.offer.fetch(offer);

    // Auto-fulfill (backend pays)
    console.log("[Approve API] Auto-fulfilling Solana offer...");

    const { getAssociatedTokenAddress } = await import("@solana/spl-token");
    const deskData = await program.account.desk.fetch(desk);
    const tokenMint = new PublicKey(deskData.tokenMint);
    const deskTokenTreasury = await getAssociatedTokenAddress(
      tokenMint,
      desk,
      true,
    );

    let fulfillTx: string;

    if (offerData.currency === 0) {
      // Pay with SOL
      fulfillTx = await program.methods
        .fulfillOfferSol(new (anchor as any).BN(offerId))
        .accounts({
          desk,
          offer,
          deskTokenTreasury,
          payer: approverKeypair.publicKey,
          systemProgram: new PublicKey("11111111111111111111111111111111"),
        })
        .signers([approverKeypair])
        .rpc();
      console.log("[Approve API] ✅ Paid with SOL:", fulfillTx);
    } else {
      // Pay with USDC
      const usdcMint = new PublicKey(deskData.usdcMint);
      const deskUsdcTreasury = await getAssociatedTokenAddress(
        usdcMint,
        desk,
        true,
      );
      const payerUsdcAta = await getAssociatedTokenAddress(
        usdcMint,
        approverKeypair.publicKey,
        false,
      );

      fulfillTx = await program.methods
        .fulfillOfferUsdc(new (anchor as any).BN(offerId))
        .accounts({
          desk,
          offer,
          deskTokenTreasury,
          deskUsdcTreasury,
          payerUsdcAta,
          payer: approverKeypair.publicKey,
          tokenProgram: new PublicKey(
            "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
          ),
          systemProgram: new PublicKey("11111111111111111111111111111111"),
        })
        .signers([approverKeypair])
        .rpc();
      console.log("[Approve API] ✅ Paid with USDC:", fulfillTx);
    }

    return NextResponse.json({
      success: true,
      approved: true,
      autoFulfilled: true,
      chain: "solana",
      offerAddress,
      approvalTx: approveTx,
      fulfillTx,
    });
  }

  const chain = getChain();
  const publicClient = createPublicClient({ chain, transport: http() });
  const abi = otcArtifact.abi as Abi;

  // Resolve approver account: prefer PK; else use testWalletPrivateKey from deployment; else impersonate
  let account: any;
  let walletClient: any;
  let approverAddr: Address;

  if (APPROVER_PRIVATE_KEY) {
    account = privateKeyToAccount(APPROVER_PRIVATE_KEY);
    walletClient = createWalletClient({
      account,
      chain,
      transport: http(),
    });
    approverAddr = account.address;
  } else {
    const deploymentInfoPath = path.join(
      process.cwd(),
      "contracts/deployments/eliza-otc-deployment.json",
    );
    const raw = await fs.readFile(deploymentInfoPath, "utf8");
    const json = JSON.parse(raw);
    const testPk = json.testWalletPrivateKey as `0x${string}` | undefined;

    if (testPk && /^0x[0-9a-fA-F]{64}$/.test(testPk)) {
      account = privateKeyToAccount(testPk);
      walletClient = createWalletClient({
        account,
        chain,
        transport: http(),
      });
      approverAddr = account.address;
      console.log(
        "[Approve API] Using testWalletPrivateKey from deployment for approvals",
        { address: approverAddr },
      );
    } else {
      approverAddr = json.accounts.approver as Address;
      if (!approverAddr) throw new Error("approver address not found");

      // Impersonate approver on hardhat
      await fetch("http://127.0.0.1:8545", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "hardhat_impersonateAccount",
          params: [approverAddr],
          id: 1,
        }),
      });
      account = approverAddr;
      walletClient = createWalletClient({ chain, transport: http() });
      console.log("[Approve API] Impersonating approver account on Hardhat", {
        address: approverAddr,
      });
    }
  }

  // Ensure single approver mode (dev convenience)
  const currentRequired = (await publicClient.readContract({
    address: OTC_ADDRESS,
    abi,
    functionName: "requiredApprovals",
    args: [],
  } as any)) as bigint;

  console.log(
    "[Approve API] Current required approvals:",
    Number(currentRequired),
  );

  if (Number(currentRequired) !== 1) {
    console.log("[Approve API] Setting requiredApprovals to 1...");
    const deploymentInfoPath = path.join(
      process.cwd(),
      "contracts/deployments/eliza-otc-deployment.json",
    );
    const raw = await fs.readFile(deploymentInfoPath, "utf8");
    const json = JSON.parse(raw);
    const ownerAddr = json.accounts.owner as Address;

    await fetch("http://127.0.0.1:8545", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "hardhat_impersonateAccount",
        params: [ownerAddr],
        id: 1,
      }),
    });

    const { request: setReq } = await publicClient.simulateContract({
      address: OTC_ADDRESS,
      abi,
      functionName: "setRequiredApprovals",
      args: [1n],
      account: ownerAddr,
    });
    await createWalletClient({ chain, transport: http() }).writeContract({
      ...setReq,
      account: ownerAddr,
    });
    console.log("[Approve API] ✅ Set requiredApprovals to 1");
  } else {
    console.log("[Approve API] ✅ Already in single-approver mode");
  }

  // Check if already approved
  const offerRaw = (await publicClient.readContract({
    address: OTC_ADDRESS,
    abi,
    functionName: "offers",
    args: [BigInt(offerId)],
  } as any)) as any;

  const offer = parseOfferStruct(offerRaw);

  console.log("[Approve API] Offer state:", {
    approved: offer.approved,
    cancelled: offer.cancelled,
    beneficiary: offer.beneficiary,
  });

  if (offer.approved) {
    console.log("[Approve API] Offer already approved");
    return NextResponse.json({
      success: true,
      txHash: "already-approved",
      alreadyApproved: true,
    });
  }

  // Approve immediately
  const accountAddr = (account.address || account) as Address;

  console.log("[Approve API] Simulating approval...", {
    offerId,
    account: accountAddr,
    otcAddress: OTC_ADDRESS,
  });

  const { request: approveRequest } = await publicClient.simulateContract({
    address: OTC_ADDRESS,
    abi,
    functionName: "approveOffer",
    args: [BigInt(offerId)],
    account: accountAddr,
  });

  console.log("[Approve API] Sending approval tx...");
  const txHash = await walletClient.writeContract(approveRequest);

  console.log("[Approve API] Waiting for confirmation...", txHash);
  const approvalReceipt = await publicClient.waitForTransactionReceipt({
    hash: txHash,
  });

  console.log("[Approve API] Approval receipt:", {
    status: approvalReceipt.status,
    blockNumber: approvalReceipt.blockNumber,
    gasUsed: approvalReceipt.gasUsed?.toString(),
  });

  console.log("[Approve API] ✅ Offer approved:", offerId, "tx:", txHash);

  // Update quote status and financial data if we can find it
  const runtime = await agentRuntime.getRuntime();
  const quoteService = runtime.getService<any>("QuoteService");

  if (quoteService && offer.beneficiary) {
    const activeQuotes = await quoteService.getActiveQuotes();
    const matchingQuote = activeQuotes.find(
      (q: any) =>
        q.beneficiary.toLowerCase() === offer.beneficiary.toLowerCase(),
    );

    if (matchingQuote) {
      // Calculate financial values from on-chain offer data
      const tokenAmountWei = BigInt(offer.tokenAmount);
      const priceUsd8 = BigInt(offer.priceUsdPerToken);
      const discountBpsNum = Number(offer.discountBps);

      // totalUsd = (tokenAmount * priceUsdPerToken) / 1e18 (result in 8 decimals)
      const totalUsd8 = (tokenAmountWei * priceUsd8) / BigInt(1e18);
      const totalUsd = Number(totalUsd8) / 1e8;

      // discountUsd = totalUsd * discountBps / 10000
      const discountUsd8 = (totalUsd8 * BigInt(discountBpsNum)) / 10000n;
      const discountUsd = Number(discountUsd8) / 1e8;

      // discountedUsd = totalUsd - discountUsd
      const discountedUsd8 = totalUsd8 - discountUsd8;
      const discountedUsd = Number(discountedUsd8) / 1e8;

      // Determine payment currency and amount based on offer currency
      const paymentCurrency: "ETH" | "USDC" =
        offer.currency === 0 ? "ETH" : "USDC";
      let paymentAmount = "0";

      if (offer.currency === 0) {
        // Calculate required ETH
        const ethPrice = Number(offer.ethUsdPrice) / 1e8;
        paymentAmount = (discountedUsd / ethPrice).toFixed(6);
      } else {
        // USDC
        paymentAmount = discountedUsd.toFixed(2);
      }

      console.log("[Approve API] Calculated financial data:", {
        tokenAmount: offer.tokenAmount.toString(),
        totalUsd,
        discountUsd,
        discountedUsd,
        paymentAmount,
        paymentCurrency,
      });

      // Update quote status
      await quoteService.updateQuoteStatus(matchingQuote.quoteId, "approved", {
        offerId: String(offerId),
        transactionHash: txHash,
        blockNumber: Number(approvalReceipt.blockNumber),
        rejectionReason: "",
        approvalNote: "Approved via API",
      });

      // Update quote with financial data from contract
      const updatedQuote = await quoteService.getQuoteByQuoteId(
        matchingQuote.quoteId,
      );
      updatedQuote.tokenAmount = offer.tokenAmount.toString();
      updatedQuote.totalUsd = totalUsd;
      updatedQuote.discountUsd = discountUsd;
      updatedQuote.discountedUsd = discountedUsd;
      updatedQuote.paymentAmount = paymentAmount;
      updatedQuote.paymentCurrency = paymentCurrency;
      updatedQuote.discountBps = discountBpsNum;

      await runtime.setCache(`quote:${matchingQuote.quoteId}`, updatedQuote);

      console.log(
        "[Approve API] Updated quote with financial data:",
        matchingQuote.quoteId,
      );
    }
  }

  // If still not approved (multi-approver deployments), escalate approvals
  let approvedOfferRaw = (await publicClient.readContract({
    address: OTC_ADDRESS,
    abi,
    functionName: "offers",
    args: [BigInt(offerId)],
  } as any)) as any;

  let approvedOffer = parseOfferStruct(approvedOfferRaw);

  if (!approvedOffer.approved) {
    // Load known approver and agent from deployment file
    const deploymentInfoPath = path.join(
      process.cwd(),
      "contracts/deployments/eliza-otc-deployment.json",
    );
    const raw = await fs.readFile(deploymentInfoPath, "utf8");
    const json = JSON.parse(raw);
    const approver = json.accounts.approver as Address;
    const agentAddr = json.accounts.agent as Address;
    const candidates = [approver, agentAddr];

    for (const addr of candidates) {
      console.log("[Approve API] Attempting secondary approval by", addr);

      await fetch("http://127.0.0.1:8545", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "hardhat_impersonateAccount",
          params: [addr],
          id: 1,
        }),
      });

      const { request: req2 } = await publicClient.simulateContract({
        address: OTC_ADDRESS,
        abi,
        functionName: "approveOffer",
        args: [BigInt(offerId)],
        account: addr,
      });
      await createWalletClient({
        chain,
        transport: http(),
      }).writeContract({ ...req2, account: addr });

      // Re-read state after each attempt
      approvedOfferRaw = (await publicClient.readContract({
        address: OTC_ADDRESS,
        abi,
        functionName: "offers",
        args: [BigInt(offerId)],
      } as any)) as any;
      approvedOffer = parseOfferStruct(approvedOfferRaw);
      if (approvedOffer.approved) break;
    }
  }

  // Final verification that offer was approved
  console.log("[Approve API] Verifying final approval state...");

  approvedOfferRaw = (await publicClient.readContract({
    address: OTC_ADDRESS,
    abi,
    functionName: "offers",
    args: [BigInt(offerId)],
  } as any)) as any;

  approvedOffer = parseOfferStruct(approvedOfferRaw);

  console.log("[Approve API] Final offer state:", {
    offerId,
    approved: approvedOffer.approved,
    cancelled: approvedOffer.cancelled,
    paid: approvedOffer.paid,
    fulfilled: approvedOffer.fulfilled,
  });

  if (approvedOffer.cancelled) {
    return NextResponse.json({ error: "Offer is cancelled" }, { status: 400 });
  }

  if (!approvedOffer.approved) {
    throw new Error("Offer still not approved after all attempts");
  }

  // Check if approver should also fulfill
  const requireApproverToFulfill = (await publicClient.readContract({
    address: OTC_ADDRESS,
    abi,
    functionName: "requireApproverToFulfill",
    args: [],
  } as any)) as boolean;

  console.log(
    "[Approve API] requireApproverToFulfill:",
    requireApproverToFulfill,
  );

  let fulfillTxHash: `0x${string}` | undefined;

  // If approver-only fulfill is enabled, backend pays immediately after approval
  if (requireApproverToFulfill && !approvedOffer.paid) {
    console.log("[Approve API] Auto-fulfilling offer (approver-only mode)...");

    try {
      const accountAddr = (account.address || account) as Address;

      // Calculate required payment
      const currency = approvedOffer.currency;
      let valueWei: bigint | undefined;

      if (currency === 0) {
        // ETH payment required
        const requiredEth = (await publicClient.readContract({
          address: OTC_ADDRESS,
          abi,
          functionName: "requiredEthWei",
          args: [BigInt(offerId)],
        } as any)) as bigint;

        valueWei = requiredEth;
        console.log("[Approve API] Required ETH:", requiredEth.toString());
      } else {
        // USDC payment - need to approve first
        const usdcAddress = (await publicClient.readContract({
          address: OTC_ADDRESS,
          abi,
          functionName: "usdc",
          args: [],
        } as any)) as Address;

        const requiredUsdc = (await publicClient.readContract({
          address: OTC_ADDRESS,
          abi,
          functionName: "requiredUsdcAmount",
          args: [BigInt(offerId)],
        } as any)) as bigint;

        console.log("[Approve API] Required USDC:", requiredUsdc.toString());

        // Approve USDC
        const erc20Abi = [
          {
            type: "function",
            name: "approve",
            stateMutability: "nonpayable",
            inputs: [
              { name: "spender", type: "address" },
              { name: "amount", type: "uint256" },
            ],
            outputs: [{ name: "", type: "bool" }],
          },
        ] as Abi;

        const { request: approveUsdcReq } = await publicClient.simulateContract({
          address: usdcAddress,
          abi: erc20Abi,
          functionName: "approve",
          args: [OTC_ADDRESS, requiredUsdc],
          account: accountAddr,
        });

        await walletClient.writeContract(approveUsdcReq);
        console.log("[Approve API] USDC approved");
      }

      // Fulfill offer
      const { request: fulfillReq } = await publicClient.simulateContract({
        address: OTC_ADDRESS,
        abi,
        functionName: "fulfillOffer",
        args: [BigInt(offerId)],
        account: accountAddr,
        value: valueWei,
      });

      fulfillTxHash = await walletClient.writeContract(fulfillReq);
      console.log("[Approve API] Fulfill tx sent:", fulfillTxHash);

      await publicClient.waitForTransactionReceipt({ hash: fulfillTxHash });
      console.log("[Approve API] ✅ Offer fulfilled automatically");
    } catch (fulfillError) {
      console.error("[Approve API] ❌ Auto-fulfill failed:", fulfillError);
      
      // Check if offer got paid by another transaction during our attempt
      const recheckOffer = (await publicClient.readContract({
        address: OTC_ADDRESS,
        abi,
        functionName: "offers",
        args: [BigInt(offerId)],
      } as any)) as any;
      
      const recheckParsed = parseOfferStruct(recheckOffer);
      
      if (recheckParsed.paid) {
        console.log("[Approve API] ✅ Offer was paid by another transaction, continuing...");
        fulfillTxHash = undefined; // No fulfillTx from us, but offer is paid
      } else {
        // Offer is approved but not paid - this is a real error
        throw new Error(
          `Auto-fulfill failed: ${fulfillError instanceof Error ? fulfillError.message : String(fulfillError)}. Offer is approved but not paid.`
        );
      }
    }
  } else if (approvedOffer.paid) {
    console.log("[Approve API] ✅ Offer already paid, skipping auto-fulfill");
  } else if (!requireApproverToFulfill) {
    console.log(
      "[Approve API] ⚠️  requireApproverToFulfill is disabled. User must fulfill (pay) manually.",
    );
  }

  // Return success
  return NextResponse.json({
    success: true,
    approved: true,
    approvalTx: txHash,
    fulfillTx: fulfillTxHash,
    offerId: String(offerId),
    autoFulfilled: Boolean(fulfillTxHash),
    message: fulfillTxHash
      ? "Offer approved and fulfilled automatically"
      : "Offer approved. Please complete payment to fulfill the offer.",
  });
}
