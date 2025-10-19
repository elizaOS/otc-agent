"use client";

import { Dialog } from "@/components/dialog";
import { EVMChainSelector } from "@/components/evm-chain-selector";
import { useMultiWallet } from "@/components/multiwallet";
import type { EVMChain } from "@/types";

interface EVMChainSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onChainSelected?: (chain: EVMChain) => void;
}

/**
 * EVM Chain Selector Modal - Consolidated component
 * Wraps EVMChainSelector in a Dialog and handles the connection flow
 * 
 * This eliminates duplicate modal logic across 8+ components
 */
export function EVMChainSelectorModal({ 
  isOpen, 
  onClose,
  onChainSelected 
}: EVMChainSelectorModalProps) {
  const { setActiveFamily, setSelectedEVMChain, login } = useMultiWallet();

  const handleSelectChain = (chain: EVMChain) => {
    setSelectedEVMChain(chain);
    setActiveFamily("evm");
    onClose();
    
    // Notify parent if callback provided
    if (onChainSelected) {
      onChainSelected(chain);
    }
    
    // Trigger wallet connection
    login();
  };

  return (
    <Dialog open={isOpen} onClose={onClose} size="lg">
      <div className="p-6">
        <EVMChainSelector
          onSelectChain={handleSelectChain}
          onCancel={onClose}
        />
      </div>
    </Dialog>
  );
}

