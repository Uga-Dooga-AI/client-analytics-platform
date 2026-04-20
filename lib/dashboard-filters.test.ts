import { describe, expect, it } from "vitest";
import {
  parseDashboardSearchParams,
  serializeDashboardFilters,
  type DashboardFilters,
} from "@/lib/dashboard-filters";

describe("dashboard filters", () => {
  it("parses a custom day step from search params", () => {
    const filters = parseDashboardSearchParams(
      new URLSearchParams("granularity=custom&stepDays=15&project=word-catcher"),
      "/forecasts"
    );

    expect(filters.granularityKey).toBe("custom");
    expect(filters.granularityDays).toBe(15);
  });

  it("clamps custom day step into the supported 1..28 range", () => {
    const filters = parseDashboardSearchParams(
      new URLSearchParams("granularity=custom&stepDays=44&project=word-catcher"),
      "/forecasts"
    );

    expect(filters.granularityKey).toBe("custom");
    expect(filters.granularityDays).toBe(28);
  });

  it("serializes custom day step explicitly for round-tripping", () => {
    const filters: DashboardFilters = {
      projectKey: "word-catcher",
      rangeKey: "30d",
      granularityKey: "custom",
      granularityDays: 11,
      from: "2026-03-20",
      to: "2026-04-18",
      platform: "all",
      segment: "all",
      groupBy: "none",
      tag: "all",
    };

    const params = serializeDashboardFilters(filters);

    expect(params.get("granularity")).toBe("custom");
    expect(params.get("stepDays")).toBe("11");
  });
});
