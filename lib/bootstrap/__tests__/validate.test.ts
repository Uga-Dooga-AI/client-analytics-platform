import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { validateBootstrapConfig } from "../validate";

describe("validateBootstrapConfig", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("does not throw when key is exactly 32 characters", () => {
    process.env.SUPERADMIN_BOOTSTRAP_KEY = "a".repeat(32);
    expect(() => validateBootstrapConfig()).not.toThrow();
  });

  it("does not throw when key is longer than 32 characters", () => {
    process.env.SUPERADMIN_BOOTSTRAP_KEY = "a".repeat(64);
    expect(() => validateBootstrapConfig()).not.toThrow();
  });

  it("throws when SUPERADMIN_BOOTSTRAP_KEY is not set", () => {
    delete process.env.SUPERADMIN_BOOTSTRAP_KEY;
    expect(() => validateBootstrapConfig()).toThrow(
      /SUPERADMIN_BOOTSTRAP_KEY is not set/
    );
  });

  it("throws when key is shorter than 32 characters", () => {
    process.env.SUPERADMIN_BOOTSTRAP_KEY = "short";
    expect(() => validateBootstrapConfig()).toThrow(
      /must be >= 32 characters/
    );
  });

  it("throws when key is exactly 31 characters", () => {
    process.env.SUPERADMIN_BOOTSTRAP_KEY = "a".repeat(31);
    expect(() => validateBootstrapConfig()).toThrow(
      /must be >= 32 characters/
    );
  });

  it("error message includes actual key length", () => {
    process.env.SUPERADMIN_BOOTSTRAP_KEY = "abc";
    expect(() => validateBootstrapConfig()).toThrow(/Got 3/);
  });
});
