import { NextResponse, type NextRequest } from "next/server";
import { COOKIE, verify } from "@/lib/session";

export async function middleware(req: NextRequest) {
  const ok = await verify(req.cookies.get(COOKIE)?.value, process.env.AUTH_SECRET ?? "");
  if (ok) return NextResponse.next();
  const url = req.nextUrl.clone();
  url.pathname = "/signin";
  url.search = `?from=${encodeURIComponent(req.nextUrl.pathname)}`;
  return NextResponse.redirect(url);
}

// Gate everything except the sign-in page, the login/logout API, and static assets.
export const config = {
  matcher: ["/((?!signin|api/login|api/logout|_next/static|_next/image|favicon.ico).*)"],
};
