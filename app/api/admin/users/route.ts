// app/api/admin/users/route.ts
import { NextResponse } from "next/server";
import {
  getAllUsers,
  toggleUserActive,
  resetUserToken,
  resetUserPassword,
} from "@/lib/users";

export async function GET() {
  const users = await getAllUsers();
  return NextResponse.json({ ok: true, users });
}

export async function POST(req: Request) {
  const body = await req.json();
  const { action, id } = body as { action: string; id: string };

  if (!id || !action) {
    return NextResponse.json(
      { ok: false, error: "id y action son requeridos" },
      { status: 400 }
    );
  }

  try {
    if (action === "toggle") {
      const user = await toggleUserActive(id);
      if (!user) throw new Error("Usuario no encontrado");
      return NextResponse.json({ ok: true, user });
    }

    if (action === "reset-token") {
      const user = await resetUserToken(id);
      if (!user) throw new Error("Usuario no encontrado");
      return NextResponse.json({ ok: true, user });
    }

    if (action === "reset-password") {
      const result = await resetUserPassword(id);
      if (!result) throw new Error("Usuario no encontrado");
      return NextResponse.json({
        ok: true,
        user: result.user,
        newPassword: result.newPassword,
      });
    }

    return NextResponse.json(
      { ok: false, error: "Acción no soportada" },
      { status: 400 }
    );
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Error en la acción" },
      { status: 500 }
    );
  }
}
