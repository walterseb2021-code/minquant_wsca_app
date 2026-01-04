import { NextResponse } from "next/server";
import { validateCredentials, ensureAdminUser } from "@/lib/users";
import { createSession } from "@/lib/session";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ ok: false, error: "Formato inválido" }, { status: 400 });
    }

    const { id, password } = body;
    if (!id || !password) {
      return NextResponse.json({ ok: false, error: "ID y contraseña requeridos" }, { status: 400 });
    }

    await ensureAdminUser();

    const result = await validateCredentials({
      id: String(id).trim().toUpperCase(),
      password: String(password).trim(),
    });

    if (result === "TRIAL_EXPIRED") {
      return NextResponse.json(
        { ok: false, error: "Tu periodo de prueba ha finalizado." },
        { status: 403 }
      );
    }

    if (!result) {
      return NextResponse.json(
        { ok: false, error: "ID o contraseña incorrectos." },
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
    console.error("Login error:", err);
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 });
  }
}
