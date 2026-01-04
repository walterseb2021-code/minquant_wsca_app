import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getSessionById } from "./lib/session";
import { getUserById } from "./lib/users";

const ADMIN_ID = "U000";
const TRIAL_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname.startsWith("/login") || pathname.startsWith("/api/auth")) {
    return NextResponse.next();
  }

  const protectedPaths = [
    "/",
    "/analisis",
    "/analyzer",
    "/test-pdf",
    "/admin",
    "/api/analyze",
    "/api/commodity-prices",
    "/api/geocontext",
    "/api/mineral-info",
    "/api/nearby",
    "/api/staticmap",
  ];

  const needsAuth = protectedPaths.some(p =>
    pathname === p || pathname.startsWith(`${p}/`)
  );

  if (!needsAuth) return NextResponse.next();

  const cookie = req.cookies.get("mq_session");
  if (!cookie) {
    const url = new URL("/login", req.url);
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  const session = await getSessionById(cookie.value);
  if (!session) {
    const res = NextResponse.redirect(new URL("/login", req.url));
    res.cookies.set("mq_session", "", { maxAge: 0, path: "/" });
    return res;
  }

  const user = await getUserById(session.userId);
  if (!user || !user.active) {
    const res = NextResponse.redirect(new URL("/login", req.url));
    res.cookies.set("mq_session", "", { maxAge: 0, path: "/" });
    return res;
  }

  if (user.id !== ADMIN_ID) {
    const expiresAt = user.createdAt + TRIAL_DAYS * DAY_MS;
    if (Date.now() > expiresAt) {
      const res = NextResponse.redirect(new URL("/login", req.url));
      res.cookies.set("mq_session", "", { maxAge: 0, path: "/" });
      return res;
    }
  }

  if (pathname.startsWith("/admin") && user.id !== ADMIN_ID) {
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
    "/api/:path*",
  ],
};
