import { requireAdmin } from "@/lib/auth";
import { UserManager } from "@/components/users/UserManager";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const adminUser = await requireAdmin();
  return <UserManager currentUserRole={adminUser.role || "administrator"} />;
}