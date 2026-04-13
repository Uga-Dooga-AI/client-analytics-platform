export type UserRole =
  | "super_admin"
  | "admin"
  | "analyst"
  | "ab_analyst"
  | "viewer";

export interface AuthClaims {
  uid: string;
  email: string;
  role: UserRole;
  approved: boolean;
}

export interface AuthUser extends AuthClaims {
  displayName: string | null;
  avatarUrl: string | null;
}
