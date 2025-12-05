// middleware.ts
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getSessionById } from "./lib/session";

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Rutas que NO se protegen (libres)
  if (
    pathname.startsWith("/login") ||
    pathname.startsWith("/api/auth")
  ) {
    return NextResponse.next();
  }

  const isAdminRoute = pathname.startsWith("/admin/usuarios");

  // Rutas que SÍ queremos proteger (requieren estar logueado)
  const protectedPrefixes = [
    "/",                     // ⬅️ ahora la página de inicio también pide sesión
    "/analisis",
    "/analyzer",
    "/test-pdf",
    "/api/analyze",
    "/api/commodity-prices",
    "/api/geocontext",
    "/api/mineral-info",
    "/api/nearby",
    "/api/staticmap",
  ];

  const needsAuth = isAdminRoute || protectedPrefixes.some((prefix) => {
    if (prefix === "/") {
      // caso especial: la raíz exacta "/"
      return pathname === "/";
    }
    return pathname === prefix || pathname.startsWith(`${prefix}/`);
  });

  if (!needsAuth) {
    return NextResponse.next();
  }

  // Buscamos cookie de sesión
  const sessionCookie = req.cookies.get("mq_session");

  if (!sessionCookie) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  const sessionId = sessionCookie.value;

  // Verificamos sesión en Redis
  const session = await getSessionById(sessionId);

  if (!session) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("next", pathname);
    const res = NextResponse.redirect(loginUrl);
    res.cookies.set("mq_session", "", { maxAge: 0, path: "/" });
    return res;
  }

  // Si es ruta admin, solo permitimos al usuario U001 (tú)
  if (isAdminRoute && session.userId !== "U001") {
    return NextResponse.redirect(new URL("/analisis", req.url));
  }

  // Todo bien → continuar
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/",                     // ⬅️ protegemos la raíz (dashboard)
    "/analisis/:path*",
    "/analyzer/:path*",
    "/test-pdf/:path*",
    "/admin/:path*",         // panel admin protegido
    "/api/analyze/:path*",
    "/api/commodity-prices/:path*",
    "/api/geocontext/:path*",
    "/api/mineral-info/:path*",
    "/api/nearby/:path*",
    "/api/staticmap/:path*",
  ],
};
