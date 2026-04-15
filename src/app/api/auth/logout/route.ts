import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getAdminSession } from "@/lib/auth";

export async function POST(req: Request) {
  const session = await getAdminSession();
  session.destroy();
  const cookieStore = await cookies();
  cookieStore.delete(process.env.SESSION_COOKIE_NAME ?? "wf_admin_session");
  return NextResponse.redirect(new URL("/login", req.url), { status: 303 });
}

