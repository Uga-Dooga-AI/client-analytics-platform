type DisplayVariant = "chart" | "matrix";

const MAX_DECIMALS_BY_VARIANT: Record<DisplayVariant, number> = {
  chart: 2,
  matrix: 2,
};

export function formatForecastDisplayTriplet(
  value: number | null,
  lower: number | null,
  upper: number | null,
  unit: string,
  variant: DisplayVariant
) {
  const finiteValues = [value, lower, upper].filter(isFiniteNumber);
  const decimals = resolveDisplayDecimals(
    finiteValues,
    unit,
    variant,
    MAX_DECIMALS_BY_VARIANT[variant]
  );

  return {
    decimals,
    valueText: formatForecastDisplayValue(value, unit, decimals),
    lowerText: formatForecastDisplayValue(lower, unit, decimals),
    upperText: formatForecastDisplayValue(upper, unit, decimals),
  };
}

export function formatForecastDisplayValue(
  value: number | null,
  unit: string,
  decimals: number
) {
  if (!isFiniteNumber(value)) {
    return "—";
  }

  if (unit === "$") {
    return `$${value.toFixed(Math.max(decimals, 2))}`;
  }

  if (unit === "") {
    return new Intl.NumberFormat("en-US", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(value);
  }

  if (unit === "m") {
    return `${value.toFixed(Math.max(decimals, 1))}m`;
  }

  return `${value.toFixed(decimals)}${unit}`;
}

function resolveDisplayDecimals(
  values: number[],
  unit: string,
  variant: DisplayVariant,
  maxDecimals: number
) {
  if (values.length <= 1) {
    return defaultDecimalsForUnit(unit, variant);
  }

  const distinctNumericCount = new Set(values.map((value) => value.toFixed(6))).size;
  let decimals = defaultDecimalsForUnit(unit, variant);
  while (decimals < maxDecimals) {
    const distinctFormattedCount = new Set(
      values.map((value) => formatComparableValue(value, unit, decimals))
    ).size;
    if (distinctFormattedCount >= distinctNumericCount) {
      break;
    }
    decimals += 1;
  }
  return decimals;
}

function defaultDecimalsForUnit(unit: string, variant: DisplayVariant) {
  if (variant === "matrix") {
    return unit === "$" ? 2 : 0;
  }

  if (unit === "$") {
    return 2;
  }

  if (unit === "") {
    return 0;
  }

  return 1;
}

function formatComparableValue(value: number, unit: string, decimals: number) {
  if (unit === "") {
    return value.toFixed(decimals);
  }

  if (unit === "$") {
    return value.toFixed(Math.max(decimals, 2));
  }

  if (unit === "m") {
    return value.toFixed(Math.max(decimals, 1));
  }

  return value.toFixed(decimals);
}

function isFiniteNumber(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
