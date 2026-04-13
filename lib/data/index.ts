// Data source feature flag: DATA_SOURCE=mock (default) | bigquery
// Switch to "bigquery" once GCP credentials are available (UGAA-1166, UGAA-1167).
export const DATA_SOURCE = (process.env.DATA_SOURCE ?? "mock") as "mock" | "bigquery";

export * from "./experiments";
export * from "./funnels";
export * from "./cohorts";
export * from "./forecasts";
export * from "./acquisition";
export * from "./access";
export * from "./settings";
export * from "./overview";
