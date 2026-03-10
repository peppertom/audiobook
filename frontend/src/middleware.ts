import { NextRequest, NextResponse } from "next/server";

const PUBLIC_PATHS = ["/auth/signin", "/auth/register"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public auth routes
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Allow Next.js internals and static files
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/api/")
  ) {
    return NextResponse.next();
  }

  // Check session cookie (set by auth-context on login)
  const session = request.cookies.get("audiobook_session");
  if (!session?.value) {
    const signinUrl = request.nextUrl.clone();
    signinUrl.pathname = "/auth/signin";
    return NextResponse.redirect(signinUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
