// middleware.ts
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getSessionById } from "./lib/session";

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Rutas libres
  if (pathname.startsWith("/login") || pathname.startsWith("/api/auth")) {
    return NextResponse.next();
  }

  const isAdminRoute = pathname.startsWith("/admin/usuarios");

  // Rutas protegidas (requieren sesión)
  const protectedPrefixes = [
    "/",
    "/analisis",
    "/analyzer",
    "/test-pdf",
    "/admin", // <-- protege admin también
    "/api/analyze",
    "/api/commodity-prices",
    "/api/geocontext",
    "/api/mineral-info",
    "/api/nearby",
    "/api/staticmap",
    "/api/admin", // <-- protege endpoints admin
  ];

  const needsAuth = protectedPrefixes.some((prefix) => {
    if (prefix === "/") return pathname === "/";
    return pathname === prefix || pathname.startsWith(`${prefix}/`);
  });

  if (!needsAuth) return NextResponse.next();

  const sessionCookie = req.cookies.get("mq_session");
  if (!sessionCookie) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  const sessionId = sessionCookie.value;
  const session = await getSessionById(sessionId);

  if (!session) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("next", pathname);
    const res = NextResponse.redirect(loginUrl);
    res.cookies.set("mq_session", "", { maxAge: 0, path: "/" });
    return res;
  }

  // ✅ Admin solo para U000
  if (isAdminRoute && session.userId !== "U000") {
    return NextResponse.redirect(new URL("/analisis", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/",
    "/analisis/:path*",
    "/analyzer/:path*",
    "/test-pdf/:path*",
    "/admin/:path*",
    "/api/analyze/:path*",
    "/api/commodity-prices/:path*",
    "/api/geocontext/:path*",
    "/api/mineral-info/:path*",
    "/api/nearby/:path*",
    "/api/staticmap/:path*",
    "/api/admin/:path*",
  ],
};
