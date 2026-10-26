import { z } from "zod";
const coord = { latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) };

// Note: no fare field. Any fare sent by a client is stripped by Zod and ignored.
// A pickup is EITHER a landmark (locationId; the server looks up its position) OR a GPS position (both coordinates).
export const pickupSchema = z.object({
  latitude: coord.latitude.optional(), longitude: coord.longitude.optional(),
  locationId: z.string().min(1).max(100).optional(),
}).refine((p) => !!p.locationId || (p.latitude !== undefined && p.longitude !== undefined),
  { message: "Choose a pickup landmark or use your current location." });
export const passengerCountSchema = z.coerce.number().int("Passengers must be a whole number.").min(1, "At least 1 passenger.").max(8, "That is more passengers than any vehicle seats.");
export const createRideSchema = z.object({
  pickup: pickupSchema,
  destinationLocationId: z.string().min(1).max(100),
  passengerCount: passengerCountSchema.default(1),
  paymentMethod: z.enum(["cash", "electronic"]),
  idempotencyKey: z.string().min(8).max(100),
}); // default z.object strips unknown keys, so a client-sent fare is dropped

export const locationUpdateSchema = z.object(coord);
export type CreateRideInput = z.infer<typeof createRideSchema>;

const optCoord = (s: z.ZodNumber) => z.preprocess((v) => (v === undefined || v === "" ? undefined : v), z.coerce.number().pipe(s).optional());
export const quoteQuerySchema = z.object({
  latitude: optCoord(coord.latitude), longitude: optCoord(coord.longitude),
  locationId: z.string().min(1).max(100).optional(),
  destinationLocationId: z.string().min(1).max(100),
  passengerCount: passengerCountSchema.default(1),
});
// The tricycle registration ("keke number") is optional. Unknown keys such as "role" are stripped, never trusted.
const optionalReg = z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), z.string().trim().min(3).max(20).optional());
// Seats = passengers the keke can legally and safely carry, NOT counting the driver. The upper limit is checked on the server
// against BABRIDE_MAX_VEHICLE_SEATS; 8 here is the database's hard ceiling.
export const passengerSeatsSchema = z.coerce.number({ invalid_type_error: "Enter the number of passenger seats." })
  .int("Seats must be a whole number.").min(1, "Enter at least 1 passenger seat.").max(8, "That is more seats than a keke can have.");
export const riderApplySchema = z.object({ vehicleRegistration: optionalReg, passengerSeats: passengerSeatsSchema });

export const availabilitySchema = z.object({ online: z.boolean() });

// Landmarks. The admin supplies a NAME and picks a point; coordinates come from the picker, never from typing.
// There is deliberately no "verified" field: unknown keys are stripped, so a client cannot mark a location ground verified.
const realPoint = (v: { latitude: number; longitude: number }) => !(Math.abs(v.latitude) < 0.001 && Math.abs(v.longitude) < 0.001);
export const nearestBodySchema = z.object({ latitude: coord.latitude, longitude: coord.longitude })
  .refine(realPoint, { message: "That location doesn't look valid." });
const POINT_MSG = "Choose a real location on the map. (0, 0) is not a campus position.";
export const locationSourceSchema = z.enum(["search", "gps", "map"]);
// Creating a landmark needs a NAME. A position is optional: leave it empty and the landmark is saved as "Not located yet"
// (it can still be picked by name; set its position later). If a position is given it must be complete and real.
export const addLocationSchema = z.object({
  name: z.string().trim().min(2, "Enter the landmark name.").max(80),
  description: z.string().trim().max(200).default(""),
  latitude: coord.latitude.optional(), longitude: coord.longitude.optional(),
  source: locationSourceSchema.optional(),
  pickupAllowed: z.boolean().default(true), destinationAllowed: z.boolean().default(true),
}).superRefine((v, ctx) => {
  if (v.latitude === undefined && v.longitude === undefined && v.source === undefined) return; // no position: fine
  if (v.latitude === undefined || v.longitude === undefined || v.source === undefined)
    return ctx.addIssue({ code: "custom", message: "Give both latitude and longitude, or leave the position empty." });
  if (!realPoint({ latitude: v.latitude, longitude: v.longitude })) ctx.addIssue({ code: "custom", message: POINT_MSG });
});
export const updateLocationDetailsSchema = z.object({
  name: z.string().trim().min(2, "Enter the landmark name.").max(80).optional(),
  description: z.string().trim().max(200).optional(),
  pickupAllowed: z.boolean().optional(), destinationAllowed: z.boolean().optional(), active: z.boolean().optional(),
}).refine((v) => Object.values(v).some((x) => x !== undefined), { message: "Nothing to change." });
export const vehicleCapacitySchema = z.object({ capacity: z.coerce.number().int("Seats must be a whole number.").min(1).max(8) });
export const setLocationPositionSchema = z.object({
  ...coord, source: locationSourceSchema, confirmReplaceVerified: z.boolean().default(false),
}).refine(realPoint, { message: POINT_MSG });
export const verifyLocationSchema = z.object({ confirm: z.literal(true, { errorMap: () => ({ message: "Confirm that you checked this position on the ground." }) }) });
export const geocodeQuerySchema = z.object({ q: z.string().trim().min(3, "Type at least 3 characters.").max(100) });
export type AddLocationInput = z.infer<typeof addLocationSchema>;
export type UpdateLocationDetailsInput = z.infer<typeof updateLocationDetailsSchema>;
export type SetLocationPositionInput = z.infer<typeof setLocationPositionSchema>;