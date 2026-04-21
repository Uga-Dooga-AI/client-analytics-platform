import { describe, expect, it } from "vitest";

import { formatForecastDisplayTriplet } from "@/lib/forecast-display-format";

describe("formatForecastDisplayTriplet", () => {
  it("raises chart precision when rounded percent bounds would collapse", () => {
    expect(
      formatForecastDisplayTriplet(71.77, 71.75, 72.01, "%", "chart")
    ).toEqual({
      decimals: 2,
      valueText: "71.77%",
      lowerText: "71.75%",
      upperText: "72.01%",
    });
  });

  it("keeps default chart precision when the rounded range is already distinct", () => {
    expect(
      formatForecastDisplayTriplet(71.77, 66.57, 71.77, "%", "chart")
    ).toEqual({
      decimals: 1,
      valueText: "71.8%",
      lowerText: "66.6%",
      upperText: "71.8%",
    });
  });

  it("raises matrix precision past integer rounding when needed", () => {
    expect(
      formatForecastDisplayTriplet(71.77, 71.75, 72.01, "%", "matrix")
    ).toEqual({
      decimals: 2,
      valueText: "71.77%",
      lowerText: "71.75%",
      upperText: "72.01%",
    });
  });
});
