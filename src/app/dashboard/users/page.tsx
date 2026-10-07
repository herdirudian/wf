import { requireAdmin } from "@/lib/auth";
import { UserManager } from "@/components/users/UserManager";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const adminUser = await requireAdmin();
  const role = adminUser.role || "administrator";
  if (role === "front_office") {
    redirect("/dashboard");
  }
  return <UserManager currentUserRole={role} />;
}