// components/LogoutButton.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LogoutButton() {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleLogout() {
    setLoading(true);
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
      });
    } catch (e) {
      // aunque falle, forzamos salida igual
      console.error("Error al cerrar sesión:", e);
    } finally {
      setLoading(false);
      router.push("/login");
    }
  }

  return (
    <button
      onClick={handleLogout}
      disabled={loading}
      className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-1 text-xs sm:text-sm hover:bg-slate-800 disabled:opacity-50"
    >
      {loading ? "Saliendo..." : "Cerrar sesión"}
    </button>
  );
}
