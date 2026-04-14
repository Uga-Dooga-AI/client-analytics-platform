import { describe, expect, it } from "vitest";
import {
  createSavedSegment,
  filterSavedSegmentsForProject,
  getSegmentBehavior,
  getSegmentLabel,
  parseSavedSegmentsCookie,
  serializeSavedSegmentsCookie,
} from "@/lib/segments";

describe("segments", () => {
  it("creates and round-trips saved segments through the cookie serializer", () => {
    const created = createSavedSegment(
      {
        label: "Meta iOS",
        description: "Paid Meta users on iOS",
        profileKey: "paid-ua",
        rules: {
          projectKey: "word-catcher",
          platform: "ios",
          company: "Meta",
        },
      },
      []
    );

    expect("segment" in created).toBe(true);
    if (!("segment" in created)) {
      return;
    }

    const roundTrip = parseSavedSegmentsCookie(serializeSavedSegmentsCookie([created.segment]));
    expect(roundTrip).toHaveLength(1);
    expect(roundTrip[0]?.label).toBe("Meta iOS");
    expect(roundTrip[0]?.rules.platform).toBe("ios");
  });

  it("filters saved segments by project scope and resolves labels", () => {
    const created = createSavedSegment(
      {
        label: "High value DE",
        profileKey: "high-value",
        rules: {
          projectKey: "2pg",
          country: "DE",
        },
      },
      []
    );

    expect("segment" in created).toBe(true);
    if (!("segment" in created)) {
      return;
    }

    const scoped = filterSavedSegmentsForProject([created.segment], "2pg");
    expect(scoped).toHaveLength(1);
    expect(getSegmentLabel(created.segment.id, scoped, "2pg")).toBe("High value DE");
  });

  it("applies saved segment behavior overrides on top of the selected profile", () => {
    const created = createSavedSegment(
      {
        label: "Narrow payers",
        profileKey: "payers",
        rules: {
          projectKey: "word-catcher",
          platform: "ios",
          company: "Meta",
          source: "Meta Ads",
        },
      },
      []
    );

    expect("segment" in created).toBe(true);
    if (!("segment" in created)) {
      return;
    }

    const behavior = getSegmentBehavior(created.segment.id, [created.segment]);
    expect(behavior.kind).toBe("saved");
    expect(behavior.profileKey).toBe("payers");
    expect(behavior.narrowingFactor).toBeLessThan(0.74);
  });
});
