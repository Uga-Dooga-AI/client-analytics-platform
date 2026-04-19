export const FORECAST_HORIZON_DAY_OPTIONS = [7, 14, 30, 60, 90, 120, 180, 240, 270, 360, 720] as const;

export type ForecastHorizonDay = (typeof FORECAST_HORIZON_DAY_OPTIONS)[number];

export const DEFAULT_FORECAST_HORIZON_DAYS: ForecastHorizonDay[] = [30, 60, 120];

export function normalizeForecastHorizonDays(
  input: string | readonly string[] | readonly number[] | null | undefined
): ForecastHorizonDay[] {
  const allowed = new Set<number>(FORECAST_HORIZON_DAY_OPTIONS);
  const values = Array.isArray(input)
    ? input
    : typeof input === "string"
      ? input.split(",")
      : [];

  const normalized = FORECAST_HORIZON_DAY_OPTIONS.filter((day) =>
    values.some((value) => Number(value) === day)
  );

  return normalized.length > 0 ? normalized : [...DEFAULT_FORECAST_HORIZON_DAYS];
}

export function serializeForecastHorizonDays(input: readonly number[]) {
  return normalizeForecastHorizonDays(input).join(",");
}
