// components/assistant/AssistantDockGlobal.tsx
"use client";

import React from "react";
import { usePathname } from "next/navigation";
import AssistantDock from "@/components/assistant/AssistantDock";

export default function AssistantDockGlobal() {
  const pathname = usePathname();

  // En /analisis renderizamos un dock local con visibleState (más potente).
  if (pathname === "/analisis") return null;

  return <AssistantDock />;
}
