import { z } from "zod";
const coord = { latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) };

// Note: no fare field. Any fare sent by a client is stripped by Zod and ignored.
export const createRideSchema = z.object({
  pickup: z.object({ ...coord, locationId: z.string().min(1).max(100).optional() }),
  destinationLocationId: z.string().min(1).max(100),
  paymentMethod: z.enum(["cash", "electronic"]),
  idempotencyKey: z.string().min(8).max(100),
}); // default z.object strips unknown keys, so a client-sent fare is dropped

export const locationUpdateSchema = z.object(coord);
export type CreateRideInput = z.infer<typeof createRideSchema>;

export const quoteQuerySchema = z.object({
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
  locationId: z.string().min(1).max(100).optional(),
  destinationLocationId: z.string().min(1).max(100),
});
// The tricycle registration ("keke number") is optional. Unknown keys such as "role" are stripped, never trusted.
const optionalReg = z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), z.string().trim().min(3).max(20).optional());
export const riderApplySchema = z.object({ vehicleRegistration: optionalReg });
export const availabilitySchema = z.object({ online: z.boolean() });

// Landmarks. The admin supplies a NAME and picks a point; coordinates come from the picker, never from typing.
// There is deliberately no "verified" field: unknown keys are stripped, so a client cannot mark a location ground verified.
const realPoint = (v: { latitude: number; longitude: number }) => !(Math.abs(v.latitude) < 0.001 && Math.abs(v.longitude) < 0.001);
const POINT_MSG = "Choose a real location on the map. (0, 0) is not a campus position.";
export const locationSourceSchema = z.enum(["search", "gps", "map"]);
export const addLocationSchema = z.object({
  name: z.string().trim().min(2, "Enter the landmark name.").max(80),
  description: z.string().trim().max(200).default(""),
  ...coord,
  source: locationSourceSchema,
  pickupAllowed: z.boolean().default(true), destinationAllowed: z.boolean().default(true),
}).refine(realPoint, { message: POINT_MSG });
export const setLocationPositionSchema = z.object({
  ...coord, source: locationSourceSchema, confirmReplaceVerified: z.boolean().default(false),
}).refine(realPoint, { message: POINT_MSG });
export const verifyLocationSchema = z.object({ confirm: z.literal(true, { errorMap: () => ({ message: "Confirm that you checked this position on the ground." }) }) });
export const geocodeQuerySchema = z.object({ q: z.string().trim().min(3, "Type at least 3 characters.").max(100) });
export type AddLocationInput = z.infer<typeof addLocationSchema>;
export type SetLocationPositionInput = z.infer<typeof setLocationPositionSchema>;