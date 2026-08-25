import { NextResponse, type NextRequest } from "next/server";
import { COOKIE, sign } from "@/lib/session";

const THIRTY_DAYS = 60 * 60 * 24 * 30;

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const password = String(form.get("password") ?? "");
  const from = String(form.get("from") ?? "/") || "/";
  const expected = process.env.APP_PASSWORD ?? "";
  const secret = process.env.AUTH_SECRET ?? "";

  if (!expected || password !== expected) {
    return NextResponse.redirect(new URL(`/signin?error=1&from=${encodeURIComponent(from)}`, req.url), 303);
  }

  const token = await sign({ exp: Date.now() + THIRTY_DAYS * 1000 }, secret);
  const res = NextResponse.redirect(new URL(from.startsWith("/") ? from : "/", req.url), 303);
  res.cookies.set(COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: THIRTY_DAYS,
  });
  return res;
}
