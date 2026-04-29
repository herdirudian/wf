import { prisma } from "@/lib/prisma";
import { headers } from "next/headers";

export type ActivityLogParams = {
  adminUserId?: string;
  action: string;
  resource?: string;
  resourceId?: string;
  payload?: any;
};

export async function logActivity(params: ActivityLogParams) {
  try {
    const headerList = await headers();
    const ipAddress = headerList.get("x-forwarded-for") || headerList.get("x-real-ip");
    const userAgent = headerList.get("user-agent");

    await prisma.activityLog.create({
      data: {
        adminUserId: params.adminUserId,
        action: params.action,
        resource: params.resource,
        resourceId: params.resourceId,
        payload: params.payload ? JSON.stringify(params.payload) : null,
        ipAddress: ipAddress ? String(ipAddress) : null,
        userAgent: userAgent ? String(userAgent) : null,
      },
    });
  } catch (e) {
    console.error("Failed to log activity:", e);
  }
}
