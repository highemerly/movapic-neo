import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function GET() {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }
  const cookieStore = await cookies();
  cookieStore.delete("ann");
  return NextResponse.json({ ok: true });
}
