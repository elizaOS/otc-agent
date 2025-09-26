"use client";

import { XMarkIcon } from "@heroicons/react/24/outline";
import clsx from "clsx";
import Link from "next/link";
import { useState } from "react";
import { usePathname } from "next/navigation";

import { Dialog } from "@/components/dialog";
import { DiscordIcon, XIcon } from "@/components/icons";
import { Logo } from "@/components/logo";
import { WalletConnector } from "./wallet-connector";
import { useMultiWallet } from "@/components/multiwallet";

export function Header() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { paymentPairLabel } = useMultiWallet();
  const pathname = usePathname();

  const NavLinks = ({ mobile = false }) => (
    <>
      <Link
        href="/"
        className={clsx(
          "text-sm font-semibold m-1 p-1",
          mobile
            ? clsx(
                "-mx-3 block rounded-lg px-3 py-2 text-base/7 font-semibold hover:bg-zinc-50 dark:hover:bg-zinc-900",
                pathname === "/"
                  ? "text-zinc-900 dark:text-white"
                  : "text-zinc-600 dark:text-zinc-400",
              )
            : clsx(
                pathname === "/"
                  ? "text-zinc-900 dark:text-white"
                  : "text-zinc-600 dark:text-zinc-400",
                "hover:text-zinc-900 dark:hover:text-white",
              ),
        )}
        onClick={() => setMobileMenuOpen(false)}
        aria-current={pathname === "/" ? "page" : undefined}
      >
        Trading Desk
      </Link>
      <Link
        href="/my-deals"
        className={clsx(
          "text-sm font-semibold m-1 p-1",
          mobile
            ? clsx(
                "-mx-3 block rounded-lg px-3 py-2 text-base/7 font-semibold hover:bg-zinc-50 dark:hover:bg-zinc-900",
                pathname === "/my-deals"
                  ? "text-zinc-900 dark:text-white"
                  : "text-zinc-600 dark:text-zinc-400",
              )
            : clsx(
                pathname === "/my-deals"
                  ? "text-zinc-900 dark:text-white"
                  : "text-zinc-600 dark:text-zinc-400",
                "hover:text-zinc-900 dark:hover:text-white",
              ),
        )}
        onClick={() => setMobileMenuOpen(false)}
        aria-current={pathname === "/my-deals" ? "page" : undefined}
      >
        My Deals
      </Link>
      <Link
        href="/how-it-works"
        className={clsx(
          "text-sm font-semibold m-1 p-1",
          mobile
            ? clsx(
                "-mx-3 block rounded-lg px-3 py-2 text-base/7 font-semibold hover:bg-zinc-50 dark:hover:bg-zinc-900",
                pathname === "/how-it-works"
                  ? "text-zinc-900 dark:text-white"
                  : "text-zinc-600 dark:text-zinc-400",
              )
            : clsx(
                pathname === "/how-it-works"
                  ? "text-zinc-900 dark:text-white"
                  : "text-zinc-600 dark:text-zinc-400",
                "hover:text-zinc-900 dark:hover:text-white",
              ),
        )}
        onClick={() => setMobileMenuOpen(false)}
        aria-current={pathname === "/how-it-works" ? "page" : undefined}
      >
        How It Works
      </Link>
    </>
  );

  return (
    <header className="fixed top-0 left-0 right-0 z-20 bg-transparent">
      <nav className="px-4 lg:px-6 w-full" aria-label="Global">
        <div className="flex items-center justify-between py-4 gap-4 flex-nowrap">
          <div className="flex shrink-0">
            <Link href="/" className="-m-1.5 p-1.5">
              <Logo width={290} height={22} />
            </Link>
          </div>

          <div className="flex-1 min-w-0 flex items-center justify-center gap-x-8 overflow-x-auto whitespace-nowrap">
            <NavLinks />
          </div>
          <div className="flex items-center justify-end whitespace-nowrap shrink-0">
            <div className="pl-4">
              <WalletConnector onConnectionChange={() => {}} />
            </div>
          </div>
        </div>
      </nav>

      <Dialog
        open={mobileMenuOpen}
        onClose={setMobileMenuOpen}
        className="lg:hidden"
        variant="slideout"
      >
        <div className="px-6 py-6 h-full">
          <div className="flex items-center justify-between">
            <Link
              href="/"
              className="-m-1.5 p-1.5"
              onClick={() => setMobileMenuOpen(false)}
            >
              <Logo width={128} height={32} />
            </Link>
            <button
              type="button"
              className="-m-2.5 rounded-md p-2.5 text-zinc-700 dark:text-zinc-400"
              onClick={() => setMobileMenuOpen(false)}
            >
              <span className="sr-only">Close menu</span>
              <XMarkIcon className="h-6 w-6" aria-hidden="true" />
            </button>
          </div>
          <div className="mt-6 flow-root">
            <div className="space-y-2 py-6">
              <NavLinks mobile />
            </div>
          </div>
        </div>
      </Dialog>
    </header>
  );
}