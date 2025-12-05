// app/api/auth/login/route.ts
import { NextResponse } from "next/server";
import { validateCredentials } from "@/lib/users";
import { createSession } from "@/lib/session";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);

    if (!body) {
      return NextResponse.json(
        { ok: false, error: "Formato de datos inválido." },
        { status: 400 }
      );
    }

    const { id, password } = body;

    if (!id || !password) {
      return NextResponse.json(
        { ok: false, error: "id y password son requeridos" },
        { status: 400 }
      );
    }

    // Normalizamos el ID (mayúsculas y sin espacios)
    const normalizedId = String(id).trim().toUpperCase();

    // 1. Validar credenciales contra Redis
    const user = await validateCredentials({
      id: normalizedId,
      password: String(password),
    });

    if (!user) {
      return NextResponse.json(
        { ok: false, error: "Credenciales inválidas o usuario inactivo" },
        { status: 401 }
      );
    }

    // 2. Crear sesión y guardarla en Redis
    const session = await createSession(user.id);

    // 3. Responder OK y agregar cookie
    const res = NextResponse.json({ ok: true, user });

    res.cookies.set("mq_session", session.id, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24 * 7, // 7 días
      path: "/",
    });

    return res;
  } catch (err) {
    console.error("Error en /api/auth/login:", err);
    return NextResponse.json(
      { ok: false, error: "Error interno al iniciar sesión." },
      { status: 500 }
    );
  }
}
