// app/api/geocontext/route.ts
import { NextResponse } from "next/server";

/**
 * Esta ruta está obsoleta y se mantiene solo para compatibilidad.
 * En su lugar usa /api/geosources o /api/staticmap.
 */
export async function GET() {
  return NextResponse.json({
    message: "Ruta /api/geocontext obsoleta. Usa /api/geosources o /api/staticmap.",
    status: "deprecated",
  });
}
