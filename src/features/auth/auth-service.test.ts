import { describe, expect, it } from "vitest";

import { authFailure, signUp, signUpSchema } from "./auth-service";

describe("signUpSchema", () => {
  it("requires the profile fields used by the signup trigger", () => {
    expect(
      signUpSchema.safeParse({
        email: "lemon@example.com",
        password: "long-enough",
        displayName: "레몬 친구",
        timeZone: "Asia/Seoul",
      }).success,
    ).toBe(true);
    expect(
      signUpSchema.safeParse({
        email: "lemon@example.com",
        password: "long-enough",
        displayName: "",
        timeZone: "Not/AZone",
      }).success,
    ).toBe(false);
  });

  it("maps duplicate and rate-limit failures to public app codes", () => {
    expect(authFailure({ message: "User already registered", status: 422 }).code).toBe("CONFLICT");
    expect(authFailure({ message: "too many requests", status: 429 }).code).toBe("RATE_LIMITED");
  });

  it("returns INVALID_INPUT before contacting auth for invalid signup data", async () => {
    await expect(
      signUp({ email: "wrong", password: "short", displayName: "", timeZone: "Not/AZone" }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });
});
