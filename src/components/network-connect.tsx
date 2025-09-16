"use client";

import { useState, useCallback } from "react";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { Dialog, DialogBody, DialogTitle } from "@/components/dialog";
import { Button } from "@/components/button";
import { useMultiWallet } from "@/components/multiwallet";

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
      <Button onClick={() => setOpen(true)} color="orange" className={className}>
        {children ?? "Connect"}
      </Button>
      <Dialog open={open} onClose={setOpen} size="sm">
        <div className="p-4">
        <DialogTitle>Choose a network</DialogTitle>
        <DialogBody className="pt-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <button
              type="button"
              onClick={onChooseEvm}
              className="rounded-xl p-4 sm:p-5 text-left transition-all duration-200 cursor-pointer text-white bg-[#0052ff] border border-[#0047e5] hover:brightness-110 hover:shadow-md active:scale-[0.99] focus:outline-none focus:ring-2 focus:ring-[#ff8c00]/30"
            >
              <div className="text-sm font-semibold">Base</div>
              <div className="text-xs text-white/80">Connect with RainbowKit</div>
            </button>
            <button
              type="button"
              onClick={onChooseSolana}
              className="rounded-xl p-4 sm:p-5 text-left transition-all duration-200 cursor-pointer text-white bg-gradient-to-r from-[#9945FF] via-[#8752F3] to-[#14F195] border border-transparent hover:brightness-110 hover:shadow-md active:scale-[0.99] focus:outline-none focus:ring-2 focus:ring-[#ff8c00]/30"
            >
              <div className="text-sm font-semibold">Solana</div>
              <div className="text-xs text-white/85">Connect with Solana Wallet</div>
            </button>
          </div>
        </DialogBody>
        </div>
      </Dialog>
    </>
  );
}


