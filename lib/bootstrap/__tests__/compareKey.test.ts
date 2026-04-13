import { describe, it, expect } from "vitest";
import { compareBootstrapKey } from "../compareKey";

const KEY = "super-secret-bootstrap-key-32chars!";

describe("compareBootstrapKey", () => {
  it("returns true when keys match exactly", () => {
    expect(compareBootstrapKey(KEY, KEY)).toBe(true);
  });

  it("returns false when provided key is empty", () => {
    expect(compareBootstrapKey("", KEY)).toBe(false);
  });

  it("returns false when provided key is shorter than expected", () => {
    expect(compareBootstrapKey(KEY.slice(0, -1), KEY)).toBe(false);
  });

  it("returns false when provided key is longer than expected", () => {
    expect(compareBootstrapKey(KEY + "x", KEY)).toBe(false);
  });

  it("returns false when keys are same length but differ by one char", () => {
    const wrong = KEY.slice(0, -1) + "X";
    expect(compareBootstrapKey(wrong, KEY)).toBe(false);
  });

  it("returns false when keys are same length but completely different", () => {
    const same_length = "a".repeat(KEY.length);
    expect(compareBootstrapKey(same_length, KEY)).toBe(false);
  });

  it("returns false when both are empty strings", () => {
    expect(compareBootstrapKey("", "")).toBe(true); // length 0 === 0, content equal
  });

  it("handles unicode / multi-byte characters correctly", () => {
    const unicodeKey = "ключ-bootstrap-32-chars-unicode!!";
    expect(compareBootstrapKey(unicodeKey, unicodeKey)).toBe(true);
    expect(compareBootstrapKey(unicodeKey + "x", unicodeKey)).toBe(false);
  });
});
