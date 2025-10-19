"use client";

import { useState, useCallback } from "react";
import { Dialog, DialogBody, DialogTitle } from "@/components/dialog";
import { Button } from "@/components/button";
import { useMultiWallet } from "@/components/multiwallet";
import { EVMLogo, SolanaLogo } from "@/components/icons/index";
import { EVMChainSelectorModal } from "@/components/evm-chain-selector-modal";

/**
 * NetworkConnectButton - Unified wallet connection
 * Shows modal to choose EVM (Base, BSC, Jeju) or Solana network
 * - EVM: Uses Privy for EVM wallet connection (MetaMask, Coinbase, etc.)
 * - Solana: Uses Solana wallet-adapter for native Solana wallets (Phantom, Solflare, etc.)
 *
 * IMPORTANT: If used inside another modal, provide onBeforeOpen callback
 * to close parent modal first (prevents modal nesting issues)
 */
export function NetworkConnectButton({
  className,
  children,
  onBeforeOpen,
}: {
  className?: string;
  children?: React.ReactNode;
  onBeforeOpen?: () => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [showEVMChainSelector, setShowEVMChainSelector] = useState(false);
  const { setActiveFamily, connectSolanaWallet } = useMultiWallet();

  const handleButtonClick = useCallback(async () => {
    // Close parent modal first if provided (avoids modal nesting)
    if (onBeforeOpen) {
      await onBeforeOpen();
      // Small delay to let parent modal close animation complete
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    setOpen(true);
  }, [onBeforeOpen]);

  const onChooseEvm = useCallback(() => {
    console.log("[NetworkConnect] EVM chosen, showing chain selector...");
    setShowEVMChainSelector(true);
  }, []);

  const onChooseSolana = useCallback(() => {
    console.log("[NetworkConnect] Solana chosen, setting family and connecting...");
    setActiveFamily("solana");
    setOpen(false);
    connectSolanaWallet();
  }, [setActiveFamily, connectSolanaWallet]);

  const handleEVMChainSelected = useCallback(() => {
    // Close parent modal after EVM chain is selected and connection initiated
    setOpen(false);
  }, []);

  return (
    <>
      <Button onClick={handleButtonClick} color="orange" className={className}>
        {children ?? "Connect"}
      </Button>
      <Dialog open={open} onClose={setOpen} size="lg">
        <div className="p-6">
          {!showEVMChainSelector ? (
            <>
              <DialogTitle className="text-center mb-2">
                Choose a network
              </DialogTitle>
              <DialogBody className="pt-4">
                <div className="bg-zinc-900/50 backdrop-blur-sm rounded-2xl p-6 border border-zinc-800/50 shadow-xl">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <button
                      type="button"
                      onClick={onChooseEvm}
                      className="group rounded-xl p-8 sm:p-10 text-center transition-all duration-200 cursor-pointer text-white bg-gradient-to-br from-blue-600 to-blue-800 border-2 border-blue-700 hover:border-blue-600 hover:brightness-110 hover:shadow-lg hover:scale-[1.02] active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2 focus:ring-offset-zinc-900"
                    >
                      <div className="flex flex-col items-center gap-4">
                        <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-white/10 flex items-center justify-center group-hover:bg-white/20 transition-colors">
                          <EVMLogo className="w-10 h-10 sm:w-12 sm:h-12" />
                        </div>
                        <div className="text-2xl sm:text-3xl font-bold">EVM</div>
                        <div className="text-xs text-white/70">Base, BSC, Jeju</div>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={onChooseSolana}
                      className="group rounded-xl p-8 sm:p-10 text-center transition-all duration-200 cursor-pointer text-white bg-gradient-to-br from-[#9945FF] via-[#8752F3] to-[#14F195] border-2 border-[#9945FF]/50 hover:border-[#14F195]/50 hover:brightness-110 hover:shadow-lg hover:scale-[1.02] active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-[#9945FF] focus:ring-offset-2 focus:ring-offset-zinc-900"
                    >
                      <div className="flex flex-col items-center gap-4">
                        <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-white/10 flex items-center justify-center group-hover:bg-white/20 transition-colors">
                          <SolanaLogo className="w-10 h-10 sm:w-12 sm:h-12" />
                        </div>
                        <div className="text-2xl sm:text-3xl font-bold">Solana</div>
                      </div>
                    </button>
                  </div>
                </div>
              </DialogBody>
            </>
          ) : null}
        </div>
      </Dialog>
      
      <EVMChainSelectorModal
        isOpen={showEVMChainSelector}
        onClose={() => setShowEVMChainSelector(false)}
        onChainSelected={handleEVMChainSelected}
      />
    </>
  );
}
