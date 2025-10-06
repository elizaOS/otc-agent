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
  try {
    // Resolve OTC address (env first, then devnet file fallback)
    const resolveOtcAddress = async (): Promise<Address | undefined> => {
      const envAddr = process.env.NEXT_PUBLIC_OTC_ADDRESS as Address | undefined;
      if (envAddr) return envAddr;
      try {
        const deployed = path.join(
          process.cwd(),
          "contracts/ignition/deployments/chain-31337/deployed_addresses.json",
        );
        const raw = await fs.readFile(deployed, "utf8");
        const json = JSON.parse(raw);
        const addr =
          (json?.["OTCModule#OTC"] as Address | undefined) ||
          (json?.["OTCDeskModule#OTC"] as Address | undefined) ||
          (json?.["ElizaOTCModule#ElizaOTC"] as Address | undefined) ||
          (json?.["OTCModule#desk"] as Address | undefined);
        return addr;
      } catch {
        return undefined;
      }
    };

    const OTC_ADDRESS = await resolveOtcAddress();
    const RAW_PK = process.env.APPROVER_PRIVATE_KEY as string | undefined;
    const APPROVER_PRIVATE_KEY = RAW_PK && /^0x[0-9a-fA-F]{64}$/.test(RAW_PK) ? (RAW_PK as `0x${string}`) : undefined;
    if (RAW_PK && !APPROVER_PRIVATE_KEY) {
      console.warn('[Approve API] Ignoring invalid APPROVER_PRIVATE_KEY format. Falling back to impersonation.');
    }

    // Robust body parsing (accept JSON, form, or query param fallback)
    let offerId: string | number | bigint | undefined;
    try {
      const contentType = request.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        const raw = await request.text();
        if (raw && raw.trim().length > 0) {
          const parsed = JSON.parse(raw);
          offerId = parsed?.offerId;
        }
      } else if (contentType.includes("application/x-www-form-urlencoded")) {
        const form = await request.formData();
        const v = form.get("offerId");
        offerId = typeof v === 'string' ? v : undefined;
      }
    } catch (e) {
      console.warn('[Approve API] Failed to parse body as JSON/form:', e);
    }
    if (!offerId) {
      const { searchParams } = new URL(request.url);
      const v = searchParams.get('offerId');
      offerId = v ?? offerId;
    }

    if (!offerId) {
      return NextResponse.json({ error: "offerId required" }, { status: 400 });
    }

    console.log('[Approve API] Approving offer:', offerId);

    const chain = getChain();
    const publicClient = createPublicClient({ chain, transport: http() });
    if (!OTC_ADDRESS) {
      console.error('[Approve API] Missing OTC address');
      return NextResponse.json({ error: "OTC address not configured" }, { status: 500 });
    }

    // Resolve approver account: prefer PK; else use testWalletPrivateKey from deployment; else impersonate
    let account: any;
    let walletClient: any;
    let approverAddr: Address | undefined;
    if (APPROVER_PRIVATE_KEY) {
      try {
        account = privateKeyToAccount(APPROVER_PRIVATE_KEY);
        walletClient = createWalletClient({ account, chain, transport: http() });
      } catch (e) {
        console.warn('[Approve API] Invalid APPROVER_PRIVATE_KEY. Will try test wallet.');
      }
    }
    if (!walletClient) {
      try {
        const deploymentInfoPath = path.join(
          process.cwd(),
          "contracts/deployments/eliza-otc-deployment.json",
        );
        const raw = await fs.readFile(deploymentInfoPath, "utf8");
        const json = JSON.parse(raw);
        const testPk = json?.testWalletPrivateKey as `0x${string}` | undefined;
        if (testPk && /^0x[0-9a-fA-F]{64}$/.test(testPk)) {
          account = privateKeyToAccount(testPk);
          walletClient = createWalletClient({ account, chain, transport: http() });
          console.warn('[Approve API] Using testWalletPrivateKey from deployment for approvals');
        }
      } catch {}
    }
    if (!walletClient) {
      try {
        const deploymentInfoPath = path.join(
          process.cwd(),
          "contracts/deployments/eliza-otc-deployment.json",
        );
        const raw = await fs.readFile(deploymentInfoPath, "utf8");
        const json = JSON.parse(raw);
        approverAddr = json?.accounts?.approver as Address | undefined;
        if (!approverAddr) throw new Error('approver address not found');
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
        account = approverAddr; // use impersonated external account
        walletClient = createWalletClient({ chain, transport: http() });
        console.warn('[Approve API] Impersonating approver account on Hardhat');
      } catch (e) {
        console.error('[Approve API] Missing approver PK and cannot impersonate');
        return NextResponse.json({ error: "Approver account not configured" }, { status: 500 });
      }
    }
    const abi = otcArtifact.abi as Abi;

    // Ensure approvals config allows immediate approval (dev convenience)
    try {
      const deploymentInfoPath = path.join(
        process.cwd(),
        "contracts/deployments/eliza-otc-deployment.json",
      );
      const raw = await fs.readFile(deploymentInfoPath, "utf8");
      const json = JSON.parse(raw);
      const ownerAddr = json?.accounts?.owner as Address | undefined;
      if (ownerAddr) {
        await fetch("http://127.0.0.1:8545", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", method: "hardhat_impersonateAccount", params: [ownerAddr], id: 1 }),
        });
        // If requiredApprovals > 1, set to 1 for instant approval in dev
        const currentRequired = (await publicClient.readContract({
          address: OTC_ADDRESS,
          abi,
          functionName: "requiredApprovals",
          args: [],
        } as any)) as bigint;
        if (Number(currentRequired) !== 1) {
          const { request: setReq } = await publicClient.simulateContract({
            address: OTC_ADDRESS,
            abi,
            functionName: "setRequiredApprovals",
            args: [1n],
            account: ownerAddr,
          });
          await createWalletClient({ chain, transport: http() }).writeContract({ ...setReq, account: ownerAddr });
        }
      }
    } catch {}

    // Check if already approved
    const offerRaw = (await publicClient.readContract({
      address: OTC_ADDRESS,
      abi,
      functionName: "offers",
      args: [BigInt(offerId)],
    } as any)) as any;

    const offer = parseOfferStruct(offerRaw);

    console.log('[Approve API] Offer state:', {
      approved: offer.approved,
      cancelled: offer.cancelled,
      beneficiary: offer.beneficiary,
    });

    if (offer.approved) {
      console.log('[Approve API] Offer already approved');
      return NextResponse.json({ success: true, txHash: "already-approved", alreadyApproved: true });
    }

    // Approve immediately
    let txHash: `0x${string}` | undefined;
    let approvalReceipt: any;
    try {
      console.log('[Approve API] Simulating approval...', {
        offerId,
        account: account?.address || account,
        otcAddress: OTC_ADDRESS,
      });
      
      const { request: approveRequest } = await publicClient.simulateContract({
        address: OTC_ADDRESS,
        abi,
        functionName: "approveOffer",
        args: [BigInt(offerId)],
        account: (account as any),
      });

      console.log('[Approve API] Sending approval tx...');
      txHash = await walletClient.writeContract({ ...approveRequest, account: (account as any) });
      
      console.log('[Approve API] Waiting for confirmation...', txHash);
      approvalReceipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      
      console.log('[Approve API] Approval receipt:', {
        status: approvalReceipt.status,
        blockNumber: approvalReceipt.blockNumber,
        gasUsed: approvalReceipt.gasUsed?.toString(),
      });
    } catch (e: any) {
      const msg = String(e?.message || e);
      console.error('[Approve API] Approval error:', msg);
      if (msg.includes('already approved')) {
        console.warn('[Approve API] Approver already approved. Continuing.');
      } else {
        throw e;
      }
    }

    console.log('[Approve API] ✅ Offer approved:', offerId, 'tx:', txHash || 'already-approved');

    // Update quote status if we can find it
    try {
      const runtime = await agentRuntime.getRuntime();
      const quoteService = runtime.getService<any>("QuoteService");
      
      if (quoteService && offer.beneficiary) {
        const activeQuotes = await quoteService.getActiveQuotes();
        const matchingQuote = activeQuotes.find((q: any) => 
          q.beneficiary?.toLowerCase() === offer.beneficiary.toLowerCase()
        );
        
        if (matchingQuote) {
          await quoteService.updateQuoteStatus(matchingQuote.quoteId, "approved", {
            offerId: String(offerId),
            transactionHash: txHash || 'already-approved',
            blockNumber: Number(approvalReceipt?.blockNumber ?? 0),
            rejectionReason: "",
            approvalNote: "Approved via API",
          });
          console.log('[Approve API] Updated quote status:', matchingQuote.quoteId);
        }
      }
    } catch (quoteErr) {
      console.warn('[Approve API] Quote update failed (non-critical):', quoteErr);
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
      try {
        // Load known approver and agent from deployment file
        const deploymentInfoPath = path.join(
          process.cwd(),
          "contracts/deployments/eliza-otc-deployment.json",
        );
        const raw = await fs.readFile(deploymentInfoPath, "utf8");
        const json = JSON.parse(raw);
        const approver = json?.accounts?.approver as Address | undefined;
        const agentAddr = json?.accounts?.agent as Address | undefined;
        const candidates = [approver, agentAddr].filter((x): x is Address => Boolean(x));

        for (const addr of candidates) {
          if (!addr) continue;
          console.log('[Approve API] Attempting secondary approval by', addr);
          try {
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
            // simulate + write
            const { request: req2 } = await publicClient.simulateContract({
              address: OTC_ADDRESS,
              abi,
              functionName: "approveOffer",
              args: [BigInt(offerId)],
              account: addr,
            });
            await createWalletClient({ chain, transport: http() }).writeContract({ ...req2, account: addr });
          } catch (e: any) {
            const msg = String(e?.message || e);
            if (msg.includes('already approved')) {
              console.warn('[Approve API] Secondary approver already approved');
            } else {
              console.warn('[Approve API] Secondary approval attempt failed:', msg);
            }
          }
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
      } catch (e) {
        console.warn('[Approve API] Multi-approver escalation failed:', e);
      }
    }

    // Fulfill immediately in the same request (synchronous end-to-end)
    console.log('[Approve API] Proceeding to fulfillment for offer:', offerId);
    
    // Wait a bit for state to settle, then refresh offer state
    await new Promise(r => setTimeout(r, 1000));
    
    approvedOfferRaw = (await publicClient.readContract({
      address: OTC_ADDRESS,
      abi,
      functionName: "offers",
      args: [BigInt(offerId)],
    } as any)) as any;

    approvedOffer = parseOfferStruct(approvedOfferRaw);

    console.log('[Approve API] Final offer state before fulfillment:', {
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
      console.error('[Approve API] ❌ Offer still not approved after all attempts');
      return NextResponse.json({ 
        error: "Offer not approved", 
        details: {
          offerId: String(offerId),
          approvalTx: txHash,
          offerState: {
            approved: approvedOffer.approved,
            cancelled: approvedOffer.cancelled,
          }
        }
      }, { status: 400 });
    }

    if (approvedOffer.paid || approvedOffer.fulfilled) {
      console.log('[Approve API] Offer already fulfilled, returning');
      return NextResponse.json({ success: true, approvedTx: txHash, fulfilled: true });
    }

    let fulfillTx: `0x${string}` | undefined;
    if (Number(approvedOffer.currency) === 1) {
      // USDC fulfill path
      const usdcAddress = (await publicClient.readContract({
        address: OTC_ADDRESS,
        abi,
        functionName: "usdc",
        args: [],
      } as any)) as Address;

      const erc20Abi = [
        {
          type: "function",
          name: "allowance",
          stateMutability: "view",
          inputs: [
            { name: "owner", type: "address" },
            { name: "spender", type: "address" },
          ],
          outputs: [{ name: "", type: "uint256" }],
        },
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
      ] as const satisfies Abi;

      const required = (await publicClient.readContract({
        address: OTC_ADDRESS,
        abi,
        functionName: "requiredUsdcAmount",
        args: [BigInt(offerId)],
      } as any)) as bigint;

      const currentAllowance = (await publicClient.readContract({
        address: usdcAddress,
        abi: erc20Abi as any,
        functionName: "allowance",
        args: [typeof account === 'string' ? account : account.address, OTC_ADDRESS],
      } as any)) as bigint;

      if (currentAllowance < required) {
        console.log('[Approve API] Approving USDC allowance:', required.toString());
        await walletClient.writeContract({
          address: usdcAddress,
          abi: erc20Abi as any,
          functionName: "approve",
          args: [OTC_ADDRESS, required],
          account,
        } as any);
      }

      console.log('[Approve API] Sending fulfill (USDC)...');
      fulfillTx = await walletClient.writeContract({
        address: OTC_ADDRESS,
        abi,
        functionName: "fulfillOffer",
        args: [BigInt(offerId)],
        account: (account as any),
      } as any);
    } else {
      // ETH fulfill path
      const requiredWei = (await publicClient.readContract({
        address: OTC_ADDRESS,
        abi,
        functionName: "requiredEthWei",
        args: [BigInt(offerId)],
      } as any)) as bigint;

      console.log('[Approve API] Sending fulfill (ETH)...');
      fulfillTx = await walletClient.writeContract({
        address: OTC_ADDRESS,
        abi,
        functionName: "fulfillOffer",
        args: [BigInt(offerId)],
        account: (account as any),
        value: requiredWei,
      } as any);
    }

    const fulfillReceipt = await publicClient.waitForTransactionReceipt({ hash: fulfillTx! });
    console.log('[Approve API] ✅ Offer fulfilled:', offerId, 'tx:', fulfillTx);

    // Update quote to executed
    try {
      const runtime = await agentRuntime.getRuntime();
      const quoteService = runtime.getService<any>("QuoteService");
      if (quoteService && approvedOffer.beneficiary) {
        const entityActiveQuotes = await quoteService.getActiveQuotes();
        const match = entityActiveQuotes.find((q: any) => 
          q.beneficiary?.toLowerCase() === approvedOffer.beneficiary.toLowerCase()
        );

        // Compute USD values from on-chain fields
        const tokenAmountWei = BigInt(approvedOffer.tokenAmount ?? 0n);
        const pricePerToken8 = BigInt(approvedOffer.priceUsdPerToken ?? 0n);
        const ethUsd8 = BigInt(approvedOffer.ethUsdPrice ?? 0n);
        const dbps = BigInt(approvedOffer.discountBps ?? 0n);
        const tokenAmount = Number(tokenAmountWei) / 1e18;
        const totalUsd = Number((tokenAmountWei * pricePerToken8) / 10n ** 18n) / 1e8;
        const discountedUsd = totalUsd * Number(10_000n - dbps) / 10_000;
        const discountUsd = totalUsd - discountedUsd;

        if (match) {
          await quoteService.updateQuoteExecution(match.quoteId, {
            tokenAmount: String(tokenAmount),
            totalUsd,
            discountUsd,
            discountedUsd,
            paymentCurrency: Number(approvedOffer.currency) === 1 ? "USDC" : "ETH",
            paymentAmount: String(discountedUsd),
            offerId: String(offerId),
            transactionHash: fulfillTx!,
            blockNumber: Number(fulfillReceipt?.blockNumber ?? 0),
          });
        }
      }
    } catch (err) {
      console.warn('[Approve API] Quote execution update failed (non-critical):', err);
    }

    return NextResponse.json({ success: true, approvedTx: txHash, fulfillTx });
  } catch (error) {
    console.error('[Approve API] Error:', error);
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : String(error),
        details: error instanceof Error ? error.stack : undefined
      },
      { status: 500 }
    );
  }
}
