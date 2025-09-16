declare module "@solana/wallet-adapter-react" {
  import type { PublicKey } from "@solana/web3.js";
  export interface WalletContextState {
    publicKey: PublicKey | null;
    connected: boolean;
    connect: () => Promise<void>;
    disconnect: () => Promise<void>;
  }
  export function useWallet(): WalletContextState;
  export const ConnectionProvider: any;
  export const WalletProvider: any;
}

declare module "@solana/wallet-adapter-react-ui" {
  import type React, {
    CSSProperties,
    PropsWithChildren,
    ReactElement,
    MouseEvent,
    ReactNode,
    ImgHTMLAttributes,
  } from "react";
  import type { Adapter } from "@solana/wallet-adapter-base";
  export function useWalletModal(): { visible: boolean; setVisible: (v: boolean) => void };

  export interface WalletIconProps
    extends ImgHTMLAttributes<HTMLImageElement> {
    wallet: null | { adapter: Pick<Adapter, "name" | "icon"> };
  }

  export type ButtonProps = PropsWithChildren<{
    className?: string;
    disabled?: boolean;
    endIcon?: ReactElement;
    onClick?: (e: MouseEvent<HTMLButtonElement>) => void;
    startIcon?: ReactElement;
    style?: CSSProperties;
    tabIndex?: number;
  }>;

  export const WalletMultiButton: React.FC<ButtonProps>;
  export const WalletModalProvider: React.FC<{ children?: ReactNode }>;
}

declare module "@solana/wallet-adapter-wallets" {
  export class PhantomWalletAdapter {}
  export class SolflareWalletAdapter {}
}
