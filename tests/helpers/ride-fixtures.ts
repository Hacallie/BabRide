// Shared fixtures for service tests. Test identities only; not real people or accounts.
import type { Actor } from "@/lib/types";
export const student: Actor = { id: "test-student", name: "Test Student", role: "student" };
export const other: Actor = { id: "other-student", name: "Other", role: "student" };
export const rider: Actor = { id: "test-rider", name: "Test Rider", role: "rider" };
export const pending: Actor = { id: "test-rider-pending", name: "Test Applicant", role: "rider" };
export const admin: Actor = { id: "test-admin", name: "Test Admin", role: "admin" };
