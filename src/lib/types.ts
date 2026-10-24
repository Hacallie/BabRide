import type { RideStatus } from "@/lib/ride-state";

export type Role = "student" | "rider" | "admin";
export interface Actor { id: string; role: Role; name: string }

/** placeholder = no real position yet; selected = an admin chose a point (NOT checked on the ground); verified = confirmed on the ground. */
export type LocStatus = "placeholder" | "selected" | "verified";
export type LocSource = "search" | "gps" | "map" | "legacy";
export interface Loc {
  id: string; name: string; description: string;
  latitude: number; longitude: number;
  verified: boolean; // true ONLY after an explicit "ground verified" action
  status: LocStatus; source: LocSource | null;
  pickupAllowed: boolean; destinationAllowed: boolean; active: boolean;
}

export type PaymentStatus = "outstanding" | "collected";

export interface Ride {
  id: string;
  studentId: string; studentName: string;
  riderId: string | null; riderName: string | null; vehicleReg: string | null;
  pickup: { latitude: number; longitude: number; locationId: string | null; label: string };
  destination: { id: string; name: string };
  fareKobo: number; currency: string;
  paymentMethod: "cash" | "electronic"; paymentStatus: PaymentStatus;
  status: RideStatus; requestedAt: string; cancellationReason: string | null;
}

export type RiderApproval = "pending" | "approved" | "rejected" | "suspended";
export interface RiderInfo {
  userId: string; name: string; approval: RiderApproval; online: boolean;
  vehicle: { registration: string | null; approval: "pending" | "approved" | "rejected" } | null;
}