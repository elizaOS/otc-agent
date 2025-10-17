"use client";

import dynamic from "next/dynamic";

const ConsignPageClient = dynamic(() => import("./ConsignPageClient"), {
  ssr: false,
});

export default function ConsignPage() {
  return <ConsignPageClient />;
}
