// app/api/auth/login/route.ts
import { NextResponse } from "next/server";
import { validateCredentials, ensureAdminUser } from "@/lib/users";
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

    await ensureAdminUser();

    const normalizedId = String(id).trim().toUpperCase();
    const cleanPassword = String(password).trim(); // NO fuerces mayúsculas aquí

    const result = await validateCredentials({
      id: normalizedId,
      password: cleanPassword,
    });

    if (result === "TRIAL_EXPIRED") {
      return NextResponse.json(
        {
          ok: false,
          error: "Acceso de prueba vencido (30 días). Solicita reactivación al administrador.",
          code: "TRIAL_EXPIRED",
        },
        { status: 403 }
      );
    }

    if (!result) {
      return NextResponse.json(
        { ok: false, error: "Credenciales inválidas o usuario inactivo" },
        { status: 401 }
      );
    }

    const session = await createSession(result.id);

    const res = NextResponse.json({ ok: true, user: result });

    res.cookies.set("mq_session", session.id, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24 * 7,
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
