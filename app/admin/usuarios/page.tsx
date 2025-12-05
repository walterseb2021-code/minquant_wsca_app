// app/admin/usuarios/page.tsx
"use client";

import { useEffect, useState } from "react";

type User = {
  id: string;
  name: string;
  token: string;
  active: boolean;
  createdAt: number;
};

type SeedUser = User & { passwordPlain?: string };

export default function AdminUsuariosPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function loadUsers() {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/users", { cache: "no-store" });
      const data = await res.json();
      if (data.ok) {
        setUsers(data.users as User[]);
      } else {
        setMessage(data.error || "No se pudieron cargar los usuarios.");
      }
    } catch (e) {
      setMessage("Error de red al cargar usuarios.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadUsers();
  }, []);

  async function seed40Users() {
    if (!confirm("Esto intentará crear 40 usuarios iniciales. ¿Continuar?")) return;
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/seed-users", { method: "POST" });
      const data = await res.json();
      if (data.ok) {
        const seeded = data.users as SeedUser[];

        setUsers(
          seeded.map((u) => ({
            id: u.id,
            name: u.name,
            token: u.token,
            active: u.active,
            createdAt: u.createdAt,
          }))
        );

        // Muestra en consola las credenciales iniciales
        console.log("=== Usuarios creados (ID, Token, Password) ===");
        seeded.forEach((u) => {
          console.log(
            `${u.id}\t${u.name}\tTOKEN: ${u.token}\tPASS: ${u.passwordPlain}`
          );
        });

        setMessage(
          "Se crearon 40 usuarios. Revisa la consola del navegador (F12) para ver ID, token y contraseña inicial."
        );
      } else {
        setMessage(data.error || "No se pudieron crear los usuarios.");
      }
    } catch (e) {
      setMessage("Error de red al crear usuarios.");
    } finally {
      setLoading(false);
    }
  }

  async function handleAction(id: string, action: "toggle" | "reset-token" | "reset-password") {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action }),
      });

      const data = await res.json();
      if (!data.ok) {
        setMessage(data.error || "Error al ejecutar acción.");
        return;
      }

      if (action === "reset-password") {
        alert(
          `Nueva contraseña para ${data.user.id}:\n\n${data.newPassword}\n\nGuárdala en un lugar seguro.`
        );
      }

      if (action === "reset-token") {
        alert(
          `Nuevo token para ${data.user.id}:\n\n${data.user.token}\n\nCopia y guarda el valor si vas a entregarlo al usuario.`
        );
      }

      await loadUsers();
    } catch (e) {
      setMessage("Error de red al ejecutar acción.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50 p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold">Panel de usuarios – MinQuant_WSCA</h1>
            <p className="text-sm text-slate-300">
              Administra las claves de acceso (token + contraseña) para hasta 40 usuarios.
            </p>
          </div>

          <button
            onClick={seed40Users}
            className="rounded-xl px-4 py-2 text-sm font-semibold bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50"
            disabled={loading}
          >
            Crear 40 usuarios iniciales
          </button>
        </header>

        {message && (
          <div className="rounded-xl bg-slate-800 px-4 py-3 text-sm">
            {message}
          </div>
        )}

        <div className="overflow-x-auto rounded-xl bg-slate-900 border border-slate-800">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-slate-900/60 border-b border-slate-800">
                <th className="px-3 py-2 text-left">ID</th>
                <th className="px-3 py-2 text-left">Nombre</th>
                <th className="px-3 py-2 text-left">Token (corto)</th>
                <th className="px-3 py-2 text-left">Estado</th>
                <th className="px-3 py-2 text-left">Creado</th>
                <th className="px-3 py-2 text-left">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {users.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-4 text-center text-slate-400">
                    No hay usuarios todavía. Usa el botón &quot;Crear 40 usuarios iniciales&quot;.
                  </td>
                </tr>
              )}

              {users.map((u) => (
                <tr
                  key={u.id}
                  className="border-t border-slate-800 hover:bg-slate-900/40"
                >
                  <td className="px-3 py-2 font-mono text-xs">{u.id}</td>
                  <td className="px-3 py-2">{u.name}</td>
                  <td className="px-3 py-2 font-mono text-xs">
                    {u.token.slice(0, 8)}…
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        u.active
                          ? "bg-emerald-500/20 text-emerald-300"
                          : "bg-rose-500/20 text-rose-300"
                      }`}
                    >
                      {u.active ? "Activo" : "Inactivo"}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-400">
                    {new Date(u.createdAt).toLocaleString()}
                  </td>
                  <td className="px-3 py-2 space-x-2">
                    <button
                      onClick={() => handleAction(u.id, "toggle")}
                      className="rounded-lg border border-slate-700 px-2 py-1 text-xs hover:bg-slate-800"
                      disabled={loading}
                    >
                      {u.active ? "Desactivar" : "Activar"}
                    </button>
                    <button
                      onClick={() => handleAction(u.id, "reset-token")}
                      className="rounded-lg border border-slate-700 px-2 py-1 text-xs hover:bg-slate-800"
                      disabled={loading}
                    >
                      Nuevo token
                    </button>
                    <button
                      onClick={() => handleAction(u.id, "reset-password")}
                      className="rounded-lg border border-slate-700 px-2 py-1 text-xs hover:bg-slate-800"
                      disabled={loading}
                    >
                      Nueva contraseña
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {loading && (
          <p className="text-xs text-slate-400">
            Procesando... espera a que termine la acción.
          </p>
        )}
      </div>
    </main>
  );
}
