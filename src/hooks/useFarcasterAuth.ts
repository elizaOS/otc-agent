"use client";

import { useEffect, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useLoginToMiniApp } from "@privy-io/react-auth/farcaster";
import miniappSdk from "@farcaster/miniapp-sdk";

/**
 * useFarcasterAuth - Handles Farcaster Mini App authentication via Privy
 * Privy now manages all authentication including Farcaster
 */
export function useFarcasterAuth() {
  const { ready, authenticated } = usePrivy();
  const { initLoginToMiniApp, loginToMiniApp } = useLoginToMiniApp();
  const [isSDKLoaded, setIsSDKLoaded] = useState(false);
  const [isFarcasterContext, setIsFarcasterContext] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // Initialize Farcaster SDK
  useEffect(() => {
    if (typeof window === "undefined") return;

    if (miniappSdk && !isSDKLoaded) {
      setIsSDKLoaded(true);

      // Check if we're in a Farcaster context
      miniappSdk.context
        .then((context) => {
          if (context) {
            setIsFarcasterContext(true);
            miniappSdk.actions.ready();
          }
        })
        .catch(() => {
          setIsFarcasterContext(false);
        });
    }
  }, [isSDKLoaded]);

  // Auto-login when in Farcaster Mini App context
  useEffect(() => {
    if (!ready || authenticated || !isFarcasterContext || isLoggingIn) return;

    const performAutoLogin = async () => {
      try {
        setIsLoggingIn(true);

        // Initialize a new login attempt to get a nonce for the Farcaster wallet to sign
        const { nonce } = await initLoginToMiniApp();

        // Request a signature from Farcaster
        const result = await miniappSdk.actions.signIn({ nonce });

        // Send the received signature from Farcaster to Privy for authentication
        await loginToMiniApp({
          message: result.message,
          signature: result.signature,
        });
      } catch (error) {
        console.error("[Farcaster Auth] Auto-login failed:", error);
      } finally {
        setIsLoggingIn(false);
      }
    };

    performAutoLogin();
  }, [
    ready,
    authenticated,
    isFarcasterContext,
    isLoggingIn,
    initLoginToMiniApp,
    loginToMiniApp,
  ]);

  return {
    isSDKLoaded,
    isFarcasterContext,
    isLoggingIn,
    ready,
    authenticated,
  };
}
