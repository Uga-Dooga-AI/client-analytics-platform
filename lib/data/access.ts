import {
  MOCK_ACCESS_MEMBERS,
  MOCK_ACCESS_REQUESTS,
  MOCK_ROLE_MATRIX,
  type AccessMember,
  type AccessRequest,
} from "@/lib/mock-data";

export async function getAccessMembers(): Promise<AccessMember[]> {
  return MOCK_ACCESS_MEMBERS;
}

export async function getAccessRequests(): Promise<AccessRequest[]> {
  return MOCK_ACCESS_REQUESTS;
}

export async function getRoleMatrix(): Promise<typeof MOCK_ROLE_MATRIX> {
  return MOCK_ROLE_MATRIX;
}
