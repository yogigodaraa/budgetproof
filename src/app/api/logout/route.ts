import { NextResponse, type NextRequest } from "next/server";
import { COOKIE } from "@/lib/session";

export async function POST(req: NextRequest) {
  const res = NextResponse.redirect(new URL("/signin", req.url), 303);
  res.cookies.set(COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
