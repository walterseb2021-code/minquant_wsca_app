"use client";

import React from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();

  const [userId, setUserId] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const cleanId = userId.trim().toUpperCase();
      const cleanPassword = password.trim().toUpperCase();

      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: cleanId,
          password: cleanPassword,
        }),
      });

      if (!res.ok) {
        setError("ID o contraseña incorrectos.");
        return;
      }

      // Login OK -> ir al inicio
      router.push("/");
    } catch (err) {
      console.error(err);
      setError("Error interno al iniciar sesión. Inténtalo de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-lg">
        <h1 className="text-2xl font-bold mb-1 text-center">MinQuant_WSCA</h1>
        <p className="text-xs text-slate-400 text-center mb-6">
          Acceso con ID (U000–U040) y contraseña.  
          Los datos se convierten automáticamente a <b>MAYÚSCULAS</b>.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* ID */}
          <div>
            <label className="block text-sm font-medium text-slate-200 mb-1">
              ID de usuario
            </label>
            <input
              type="text"
              value={userId}
              onChange={(e) => setUserId(e.target.value.toUpperCase())}
              className="w-full rounded-md bg-slate-950 border border-slate-700 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
              placeholder="U000, U001, U002..."
              autoComplete="off"
            />
          </div>

          {/* Password con botón mostrar/ocultar */}
          <div>
            <label className="block text-sm font-medium text-slate-200 mb-1">
              Contraseña
            </label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value.toUpperCase())}
                className="w-full rounded-md bg-slate-950 border border-slate-700 px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                placeholder="MQ-0001, ADMIN-WSCA-2025..."
                autoComplete="off"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute inset-y-0 right-0 px-3 text-xs text-slate-300 hover:text-emerald-400 focus:outline-none"
              >
                {showPassword ? "Ocultar" : "Ver"}
              </button>
            </div>
            <p className="mt-1 text-[11px] text-slate-400">
              Lo que escribas se convertirá en <b>MAYÚSCULAS</b> automáticamente.
            </p>
          </div>

          {error && (
            <p className="text-xs text-red-400 bg-red-950/40 border border-red-800 rounded-md px-2 py-1">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-2 rounded-md bg-emerald-500 hover:bg-emerald-600 text-sm font-semibold py-2.5 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? "Ingresando..." : "Iniciar sesión"}
          </button>
        </form>

        <p className="mt-4 text-[11px] text-slate-500 text-center">
          Ejemplo: <b>U000 / ADMIN-WSCA-2025</b> (administrador)  
          o <b>U001 / MQ-0001</b> para usuarios estándar.
        </p>
      </div>
    </main>
  );
}
