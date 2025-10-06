"use client";

import { useState, useCallback } from "react";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { Dialog, DialogBody, DialogTitle } from "@/components/dialog";
import { Button } from "@/components/button";
import { useMultiWallet } from "@/components/multiwallet";
import { BaseLogo, SolanaLogo } from "@/components/icons";

export function NetworkConnectButton({
  className,
  children,
}: {
  className?: string;
  children?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const { openConnectModal } = useConnectModal();
  const { setVisible } = useWalletModal();
  const { setActiveFamily } = useMultiWallet();

  const onChooseEvm = useCallback(() => {
    setActiveFamily("evm");
    setOpen(false);
    openConnectModal?.();
  }, [openConnectModal, setActiveFamily]);

  const onChooseSolana = useCallback(() => {
    setActiveFamily("solana");
    setOpen(false);
    setVisible(true);
  }, [setActiveFamily, setVisible]);

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        color="orange"
        className={className}
      >
        {children ?? "Connect"}
      </Button>
      <Dialog open={open} onClose={setOpen} size="lg">
        <div className="p-6">
          <DialogTitle className="text-center mb-2">Choose a network</DialogTitle>
          <DialogBody className="pt-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div
                onClick={onChooseEvm}
                className="group rounded-xl p-6 text-left transition-all duration-200 cursor-pointer text-white bg-[#0052ff] border-2 border-[#0047e5] hover:border-[#0052ff] hover:brightness-110 hover:shadow-lg hover:scale-[1.02] active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-[#0052ff] focus:ring-offset-2 dark:focus:ring-offset-zinc-900"
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center group-hover:bg-white/20 transition-colors">
                    <BaseLogo className="w-6 h-6" />
                  </div>
                  <div className="text-lg font-bold">Base</div>
                </div>
                <div className="text-sm text-white/70 group-hover:text-white/90 transition-colors">
                  Connect with RainbowKit
                </div>
              </div>
              <div
                onClick={onChooseSolana}
                className="group rounded-xl p-6 text-left transition-all duration-200 cursor-pointer text-white bg-gradient-to-br from-[#9945FF] via-[#8752F3] to-[#14F195] border-2 border-[#9945FF]/50 hover:border-[#14F195]/50 hover:brightness-110 hover:shadow-lg hover:scale-[1.02] active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-[#9945FF] focus:ring-offset-2 dark:focus:ring-offset-zinc-900"
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center group-hover:bg-white/20 transition-colors">
                    <SolanaLogo className="w-6 h-6" />
                  </div>
                  <div className="text-lg font-bold">Solana</div>
                </div>
                <div className="text-sm text-white/70 group-hover:text-white/90 transition-colors">
                  Connect with Solana Wallet
                </div>
              </div>
            </div>
          </DialogBody>
        </div>
      </Dialog>
    </>
  );
}
