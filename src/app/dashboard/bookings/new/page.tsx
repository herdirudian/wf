import { AdminBookingCreate } from "@/components/bookings/AdminBookingCreate";
import { requireAdmin } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function NewBookingPage() {
  const adminUser = await requireAdmin();
  if (adminUser.role === "owner") redirect("/dashboard/bookings");
  return <AdminBookingCreate />;
}

