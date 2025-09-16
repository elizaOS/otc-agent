"use client";

import { useEffect } from "react";
import { resumeFreshAuth } from "@/utils/x-share";

export function XShareResume() {
  useEffect(() => {
    // Best-effort resume for any pending X share
    resumeFreshAuth().catch(() => {});
  }, []);
  return null;
}
