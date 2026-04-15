import { getIronSession } from "iron-session";
import type { SessionOptions } from "iron-session";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export type AdminSessionData = {
  adminUser?: {
    id: string;
    email: string;
    role: string;
  };
};

function sessionOptions(): SessionOptions {
  const password = process.env.SESSION_PASSWORD;
  const cookieName = process.env.SESSION_COOKIE_NAME ?? "wf_admin_session";

  if (!password || password.length < 32) {
    throw new Error("SESSION_PASSWORD must be set and at least 32 characters");
  }

  return {
    password,
    cookieName,
    cookieOptions: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
    },
  };
}

export async function getAdminSession() {
  const cookieStore = await cookies();
  return getIronSession<AdminSessionData>(cookieStore, sessionOptions());
}

export async function requireAdmin() {
  const session = await getAdminSession();
  if (!session.adminUser) redirect("/login");
  const role =
    typeof (session.adminUser as any)?.role === "string" && String((session.adminUser as any).role).trim()
      ? String((session.adminUser as any).role)
      : "administrator";
  return { ...session.adminUser, role };
}

export async function requireAdminMutation() {
  const session = await getAdminSession();
  if (!session.adminUser) {
    return { error: "Unauthorized", status: 401 };
  }
  const role =
    typeof (session.adminUser as any)?.role === "string" && String((session.adminUser as any).role).trim()
      ? String((session.adminUser as any).role)
      : "administrator";
  if (role === "owner") {
    return { error: "Owner hanya memiliki akses read-only", status: 403 };
  }
  return { user: { ...session.adminUser, role }, error: null };
}

