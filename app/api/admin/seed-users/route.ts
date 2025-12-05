// app/api/admin/seed-users/route.ts
import { NextResponse } from "next/server";
import { seedUsers } from "@/lib/users";

export async function POST() {
  try {
    const users = await seedUsers(40);

    return NextResponse.json({
      ok: true,
      message: "Se crearon 40 usuarios.",
      // Devuelvo IDs + tokens + contraseña inicial SOLO aquí
      users,
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        ok: false,
        error: err?.message ?? "Error al crear usuarios",
      },
      { status: 400 }
    );
  }
}
