import { describe, expect, it, beforeEach } from "vitest";
import { getApiBase, setSessionToken, getSessionToken, clearAuthTokens } from "./api";

describe("desktop api helpers", () => {
  beforeEach(() => {
    clearAuthTokens();
  });

  it("defaults to the production Vercel API", () => {
    expect(getApiBase()).toBe("https://cus-compliance-crm.vercel.app");
  });

  it("stores and clears session tokens", () => {
    setSessionToken("abc123");
    expect(getSessionToken()).toBe("abc123");
    clearAuthTokens();
    expect(getSessionToken()).toBeNull();
  });
});
