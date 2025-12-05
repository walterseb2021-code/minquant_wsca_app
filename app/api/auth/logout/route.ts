// app/api/auth/logout/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { deleteSession } from "@/lib/session";

export async function POST() {
  const cookieStore = cookies();
  const sessionCookie = cookieStore.get("mq_session");
  const sessionId = sessionCookie?.value;

  if (sessionId) {
    // Intentamos borrar la sesión de Redis (si falla, no rompemos logout)
    try {
      await deleteSession(sessionId);
    } catch (e) {
      console.error("No se pudo eliminar la sesión en Redis:", e);
    }
  }

  const res = NextResponse.json({ ok: true });

  // Borramos la cookie en el navegador
  res.cookies.set("mq_session", "", {
    maxAge: 0,
    path: "/",
  });

  return res;
}
