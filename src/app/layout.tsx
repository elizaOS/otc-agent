import type { Metadata, Viewport } from "next";

import { siteConfig } from "@/app/constants";
import { inter } from "@/app/fonts";
import "@/app/globals.css";
import { ProgressBar } from "@/app/progress-bar";
import { Toaster } from "@/app/toaster";
import { Header } from "@/components/header";
import { Providers } from "@/components/providers";
import { XShareResume } from "@/components/x-share-resume";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "white",
};

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.url),
  title: `${siteConfig.name} - Learn about the Eliza Agent Framework`,
  description: siteConfig.description,
  openGraph: {
    siteName: siteConfig.name,
    title: "The Documentation for Eliza",
    description: siteConfig.description,
    images: [siteConfig.ogImage],
    type: "website",
    url: siteConfig.url,
    locale: "en_US",
  },
  icons: siteConfig.icons,
  twitter: {
    card: "summary_large_image",
    site: siteConfig.name,
    title: "The Documentation for Eliza",
    description: siteConfig.description,
    images: [siteConfig.ogImage],
    creator: siteConfig.creator,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html suppressHydrationWarning lang="en" className={inter.className}>
      <body className="min-h-dvh antialiased bg-white text-black scheme-light dark:bg-black dark:text-white dark:scheme-dark selection:!bg-[#fff0dd] dark:selection:!bg-[#3d2b15] overscroll-none">
        <Providers>
          <div className="flex h-dvh w-full flex-col overflow-hidden">
            <Header />
            <main className="flex-1 flex flex-col overflow-hidden">
              {children}
            </main>
          </div>
        </Providers>
        <XShareResume />
        <ProgressBar />
        <Toaster />
      </body>
    </html>
  );
}
