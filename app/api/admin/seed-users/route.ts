// app/api/admin/seed-users/route.ts
import { NextResponse } from "next/server";
import { seedUsers, getAllUsers } from "@/lib/users";

export async function POST() {
  try {
    // Crea SOLO los que falten (según tu lib/users.ts corregido)
    const created = await seedUsers(40);

    // Lista total para confirmar que ya están en Redis
    const all = await getAllUsers();

    return NextResponse.json({
      ok: true,
      message:
        created.length > 0
          ? `Se crearon ${created.length} usuarios nuevos.`
          : "No se creó ningún usuario (ya existían).",
      createdCount: created.length,
      totalUsersNow: all.length,
      // Devuelve SOLO los creados (con passwordPlain)
      users: created,
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
