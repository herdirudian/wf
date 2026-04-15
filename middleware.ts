import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const cookieName = process.env.SESSION_COOKIE_NAME ?? "wf_admin_session";

function isPublicApi(pathname: string) {
  if (pathname === "/api/auth/login") return true;
  if (pathname === "/api/auth/logout") return true;
  if (pathname.startsWith("/api/public/")) return true;
  if (pathname.startsWith("/api/webhooks/")) return true;
  return false;
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const hasSessionCookie = req.cookies.has(cookieName);

  if (pathname === "/login" && hasSessionCookie) {
    const url = req.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  const isDashboard = pathname === "/dashboard" || pathname.startsWith("/dashboard/");
  const isApi = pathname === "/api" || pathname.startsWith("/api/");

  if (isDashboard && !hasSessionCookie) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (isApi && !isPublicApi(pathname) && !hasSessionCookie) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/login", "/api/:path*"],
};

