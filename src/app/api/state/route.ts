import { NextResponse, type NextRequest } from "next/server";
import { getState, setState, dbConfigured } from "@/lib/db";

// Personal, single-user store (behind the password gate). Saves one JSON
// document of the owner's settings to Postgres; falls back to client
// localStorage when the DB isn't provisioned yet.
export const dynamic = "force-dynamic";

export async function GET() {
  if (!dbConfigured()) return NextResponse.json({ data: null, db: false });
  try {
    return NextResponse.json({ data: await getState(), db: true });
  } catch (e) {
    return NextResponse.json({ data: null, db: false, error: String(e) });
  }
}

export async function PUT(req: NextRequest) {
  if (!dbConfigured()) return NextResponse.json({ ok: false, db: false });
  try {
    await setState(await req.json());
    return NextResponse.json({ ok: true, db: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
