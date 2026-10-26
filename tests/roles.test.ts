import { beforeEach, describe, expect, it } from "vitest";
import { getMemoryRepo, resetMemoryStore } from "./helpers/memory-repo";
import { riderApplySchema } from "@/lib/schemas";
import { adminDashboard, adminRiderAction, createRide, requireRole, riderApply, riderRequests } from "@/lib/service";
import { canOpen, destinationFor } from "@/lib/auth-utils";
import { admin, other, rider, student } from "./helpers/ride-fixtures";

const repo = getMemoryRepo();
beforeEach(() => resetMemoryStore());

describe("role escalation", () => {
  it("ignores a client-sent role when applying to be a rider", () => {
    const parsed = riderApplySchema.parse({ role: "admin", vehicleRegistration: "ab123", account_status: "active", passengerSeats: 3 });
    expect(Object.keys(parsed).sort()).toEqual(["passengerSeats", "vehicleRegistration"]) // role / account_status are stripped;
  });
  it("applying makes a PENDING rider; it never approves or creates an admin", async () => {
    const r = await riderApply(repo, other, undefined, 3);
    expect(r).toMatchObject({ approval: "pending", online: false });
    expect(r.vehicle).toMatchObject({ approval: "pending" });
  });
  it("an administrator cannot apply as a rider", async () => {
    await expect(riderApply(repo, admin, undefined, 3)).rejects.toMatchObject({ status: 403 });
  });
  it("students and riders cannot use admin operations", async () => {
    for (const who of [student, rider])
      for (const op of [() => adminDashboard(repo, who), () => adminRiderAction(repo, who, "test-rider-pending", "approve")])
        await expect(op()).rejects.toMatchObject({ status: 403, code: "FORBIDDEN" });
    await expect(adminDashboard(repo, null)).rejects.toMatchObject({ status: 401 });
  });
  it("requireRole is exact: no role inherits another's access", () => {
    expect(() => requireRole(admin, "student")).toThrow();
    expect(() => requireRole(rider, "student")).toThrow();
    expect(requireRole(student, "student").id).toBe(student.id);
  });
});

describe("keke number is optional", () => {
  it("accepts an empty body, an empty string or a number", () => {
    expect(riderApplySchema.parse({ passengerSeats: 3 }).vehicleRegistration).toBeUndefined();
    expect(riderApplySchema.parse({ vehicleRegistration: "   ", passengerSeats: 3 }).vehicleRegistration).toBeUndefined();
    expect(riderApplySchema.parse({ vehicleRegistration: "ab-123", passengerSeats: 3 }).vehicleRegistration).toBe("ab-123");
    expect(riderApplySchema.safeParse({ vehicleRegistration: "x", passengerSeats: 3 }).success).toBe(false);
  });
  it("a rider without a number can still be approved", async () => {
    await riderApply(repo, other, undefined, 3);
    await adminRiderAction(repo, admin, other.id, "approve");
    expect((await repo.getRider(other.id))?.vehicle).toMatchObject({ registration: null, approval: "approved" });
  });
});

describe("rider and student separation", () => {
  it("riders cannot book; students cannot see the rider request feed", async () => {
    await expect(createRide(repo, rider, { pickup: { latitude: 0, longitude: 0, locationId: "loc-1" }, destinationLocationId: "loc-2", paymentMethod: "cash", idempotencyKey: "role-key-0001" })).rejects.toMatchObject({ status: 403 });
    await expect(riderRequests(repo, student)).rejects.toMatchObject({ status: 403 });
  });
  it("each role lands only in its own area after sign-in", () => {
    expect(destinationFor("student", "/rider")).toBe("/student");
    expect(destinationFor("rider", "/student")).toBe("/rider");
    expect(destinationFor("student", "/admin")).toBe("/student");
    expect(destinationFor("rider", "/admin")).toBe("/rider");
    expect(canOpen("admin", "/student")).toBe(false);
  });
});