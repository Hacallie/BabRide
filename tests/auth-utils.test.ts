import { describe, expect, it } from "vitest";
import {
  LOGIN_ERROR_TEXT, callbackUrl, canOpen, describeAuthError, describeSessionProblem, destinationFor, flagOn,
  homeFor, nameProblem, normalizeEmail, passwordProblem, safeNext,
} from "@/lib/auth-utils";
import * as authUtils from "@/lib/auth-utils";

describe("sign-in options", () => {
  it("has no email-code or magic-link helpers left (only Google and email + password remain)", () => {
    expect("normalizeCode" in authUtils).toBe(false);
    expect("OTP_COOLDOWN_SECONDS" in authUtils).toBe(false);
    expect("COOLDOWN_KEY" in authUtils).toBe(false);
  });
  it("never tells the user to use an emailed code", () => {
    for (const t of Object.values(LOGIN_ERROR_TEXT)) expect(/code from the email|email code/i.test(t)).toBe(false);
  });
});

describe("callback URL", () => {
  it("is built from the CURRENT origin, never a hard-coded domain", () => {
    expect(callbackUrl("http://localhost:3000")).toBe("http://localhost:3000/auth/callback");
    expect(callbackUrl("https://app.example.test")).toBe("https://app.example.test/auth/callback");
  });
});

describe("redirect safety", () => {
  it("allows only listed same-site paths", () => {
    expect(safeNext("/student")).toBe("/student");
    expect(safeNext("/rider/join?x=1")).toBe("/rider/join");
    for (const bad of ["https://evil.test", "//evil.test", "/\\evil", "/admin\n", "/unknown", "", null, undefined]) expect(safeNext(bad as string | null)).toBeNull();
  });
  it("sends each role only to its own area", () => {
    expect(homeFor("admin")).toBe("/admin");
    expect(destinationFor("student", "/admin")).toBe("/student");
    expect(destinationFor("rider", "/student")).toBe("/rider");
    expect(destinationFor("student", "/rider/join")).toBe("/rider/join");
    expect(canOpen("admin", "/student")).toBe(false);
  });
});

describe("form validation", () => {
  it("normalises and validates email", () => {
    expect(normalizeEmail("  Ada@Example.COM ")).toBe("ada@example.com");
    expect(normalizeEmail("nope")).toBeNull();
    expect(normalizeEmail("a b@c.de")).toBeNull();
  });
  it("checks password length before calling the provider", () => {
    expect(passwordProblem("short")).toBe("Use at least 8 characters.");
    expect(passwordProblem("long enough pw")).toBeNull();
    expect(passwordProblem("x".repeat(73))).toBe("Use 72 characters or fewer.");
  });
  it("requires a plausible name", () => {
    expect(nameProblem(" ")).toBe("Enter your full name.");
    expect(nameProblem("Ada Obi")).toBeNull();
  });
  it("reads on/off flags tolerantly", () => {
    expect(flagOn(" TRUE ")).toBe(true); expect(flagOn("yes")).toBe(true);
    expect(flagOn(undefined)).toBe(false); expect(flagOn("false")).toBe(false);
  });
});

describe("error messages", () => {
  it("are friendly and never leak provider text", () => {
    expect(describeAuthError({ code: "invalid_credentials", message: "Invalid login credentials" })).toBe("Incorrect email or password.");
    expect(describeAuthError({ code: "user_already_exists" })).toMatch(/already exists/);
    expect(describeAuthError({ message: "User already registered" })).toMatch(/Sign in instead/);
    expect(describeAuthError({ code: "email_not_confirmed" })).toMatch(/confirm your email/i);
    expect(describeAuthError({ code: "weak_password" })).toMatch(/stronger password/);
    expect(describeAuthError({ status: 429 })).toMatch(/Too many attempts/);
    expect(describeAuthError({ message: "Failed to fetch" })).toMatch(/No connection/);
    expect(describeAuthError({ message: "SELECT * FROM secrets" })).toBe("Something went wrong. Please try again.");
  });
  it("explains a rejected session without exposing values", () => {
    expect(describeSessionProblem({ status: 401 }, false)).toMatch(/couldn't verify/);
    expect(describeSessionProblem({ status: 401 }, true)).toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
    expect(describeSessionProblem({ status: 403, message: "Suspended." })).toBe("Suspended.");
  });
});
