import type { AccessMember, AccessRequest } from "@/lib/mock-data";
import { listAccessRequests, listUsers } from "@/lib/auth/store";

export async function getAccessMembers(): Promise<AccessMember[]> {
  const users = await listUsers();

  return users.map((user) => ({
    name: user.displayName ?? "Unnamed user",
    email: user.email,
    role: user.role,
    status: user.approved ? "active" : "invited",
    lastActive: user.lastLoginAt?.toISOString() ?? "Never",
    scope: user.preAdded ? "Pre-added" : "Platform",
  }));
}

export async function getAccessRequests(): Promise<AccessRequest[]> {
  const requests = await listAccessRequests({ status: "all" });

  return requests.map((request) => ({
    name: request.displayName ?? "Unnamed requester",
    email: request.email,
    requestedRole: request.assignedRole ?? "viewer",
    requestedAt: request.requestedAt.toISOString(),
    project: "Platform",
    status: request.status === "pending" ? "pending" : "approved",
  }));
}

export async function getRoleMatrix() {
  return [
    { role: "super_admin", experiments: "Full", forecasts: "Full", settings: "Full", access: "Full" },
    { role: "admin", experiments: "Full", forecasts: "Full", settings: "Edit", access: "Review requests" },
    { role: "analyst", experiments: "Analyze", forecasts: "View + queue", settings: "View", access: "None" },
    { role: "ab_analyst", experiments: "Analyze + compare", forecasts: "View", settings: "View", access: "None" },
    { role: "viewer", experiments: "View", forecasts: "View", settings: "View", access: "None" },
  ] as const;
}
