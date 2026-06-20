import { UserRole } from "./types";

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: "관리자",
  editor: "편집자",
  viewer: "조회자"
};

export function canEdit(role: UserRole | undefined): boolean {
  return role === "admin" || role === "editor";
}
