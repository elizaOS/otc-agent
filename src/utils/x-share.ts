"use client";

// Client-side helpers for X (Twitter) sharing via our backend endpoints

export type XCredentials = {
  userId?: string;
  username?: string;
  screen_name?: string;
  oauth1Token?: string;
  oauth1TokenSecret?: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
};

export type PendingShare = {
  text: string;
  dataUrl: string;
};

const STORAGE_KEY = "twitter-oauth-token";
const OAUTH_REDIRECT_ORIGIN_KEY = "OAUTH_REDIRECT_ORIGIN";
const PENDING_DEAL_SHARE_KEY = "pending-deal-share";

function getApiUrl(): string {
  if (typeof process !== "undefined" && process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL as string;
  }
  if (typeof window !== "undefined") {
    return window.location.origin;
  }
  return "";
}

export function getXCreds(): XCredentials | null {
  if (typeof window === "undefined") return null;
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return null;
  try {
    return JSON.parse(stored) as XCredentials;
  } catch {
    return null;
  }
}

export function setPendingShare(pending: PendingShare) {
  if (typeof window === "undefined") return;
  localStorage.setItem(PENDING_DEAL_SHARE_KEY, JSON.stringify(pending));
}

export function clearPendingShare() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(PENDING_DEAL_SHARE_KEY);
}

// Returns true if already authenticated (has oauth1 creds); false if redirected
export function ensureXAuth(pending?: PendingShare): boolean {
  const creds = getXCreds();
  if (creds && creds.oauth1Token && creds.oauth1TokenSecret) return true;
  if (typeof window === "undefined") return false;

  const apiUrl = getApiUrl();
  const origin =
    window.location.pathname + window.location.search + window.location.hash;
  localStorage.setItem(OAUTH_REDIRECT_ORIGIN_KEY, origin);
  if (pending) setPendingShare(pending);
  if (!apiUrl) return false;
  window.location.href = `${apiUrl}/api/share/oauth/request_token?oauth_version=1.0a`;
  return false;
}

export async function shareOnX(
  text: string,
  dataUrl: string,
  creds?: XCredentials | null,
): Promise<{ success: boolean; tweetId?: string; tweetUrl?: string }> {
  const apiUrl = getApiUrl();
  const c = creds ?? getXCreds();
  if (!c?.oauth1Token || !c?.oauth1TokenSecret) {
    throw new Error("Missing X OAuth credentials");
  }

  // 1) Upload media
  const uploadResp = await fetch(`${apiUrl}/api/share/upload-media`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Twitter-OAuth-Token": c.oauth1Token,
      "X-Twitter-OAuth-Token-Secret": c.oauth1TokenSecret,
    },
    body: JSON.stringify({ image: dataUrl }),
  });
  if (!uploadResp.ok) {
    const err = await safeText(uploadResp);
    throw new Error(err || "Failed to upload media to X");
  }
  const uploadJson = (await uploadResp.json()) as { media_id_string?: string };
  const mediaId = uploadJson.media_id_string;
  if (!mediaId) throw new Error("No media_id returned from upload");

  // 2) Tweet
  const tweetResp = await fetch(`${apiUrl}/api/share/tweet`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Twitter-OAuth-Token": c.oauth1Token,
      "X-Twitter-OAuth-Token-Secret": c.oauth1TokenSecret,
    },
    body: JSON.stringify({ text, media_ids: [mediaId] }),
  });
  if (!tweetResp.ok) {
    const err = await safeText(tweetResp);
    throw new Error(err || "Failed to create tweet");
  }
  const posted = (await tweetResp.json()) as {
    tweet?: { data?: { id?: string } };
  };
  const id = posted?.tweet?.data?.id;
  const username = c.screen_name || c.username;
  const tweetUrl =
    id && username ? `https://twitter.com/${username}/status/${id}` : undefined;
  return { success: true, tweetId: id, tweetUrl };
}

export async function resumeFreshAuth(): Promise<
  | { resumed: false }
  | { resumed: true; success: boolean; error?: string; tweetUrl?: string }
> {
  if (typeof window === "undefined") return { resumed: false };
  const url = new URL(window.location.href);
  const isFresh = url.searchParams.get("fresh_auth") === "true";
  const pendingRaw = localStorage.getItem(PENDING_DEAL_SHARE_KEY);
  if (!isFresh || !pendingRaw) return { resumed: false };

  try {
    const pending = JSON.parse(pendingRaw) as PendingShare;
    const creds = getXCreds();
    if (!creds?.oauth1Token || !creds?.oauth1TokenSecret) {
      return {
        resumed: true,
        success: false,
        error: "Missing credentials after auth.",
      };
    }
    const result = await shareOnX(pending.text, pending.dataUrl, creds);
    clearPendingShare();
    // Clean URL param
    url.searchParams.delete("fresh_auth");
    window.history.replaceState({}, "", url.toString());
    return { resumed: true, success: true, tweetUrl: result.tweetUrl };
  } catch (e) {
    return {
      resumed: true,
      success: false,
      error: e instanceof Error ? e.message : "Failed to resume share",
    };
  }
}

async function safeText(r: Response) {
  try {
    return await r.text();
  } catch {
    return "";
  }
}

export const XShareStorageKeys = {
  STORAGE_KEY,
  OAUTH_REDIRECT_ORIGIN_KEY,
  PENDING_DEAL_SHARE_KEY,
};
