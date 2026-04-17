// Live dashboard pages now read from the control plane by default.
// Keep the flag only as a compatibility shim while the remaining data modules are migrated.
export const DATA_SOURCE = (process.env.DATA_SOURCE ?? "bigquery") as "mock" | "bigquery";

export * from "./experiments";
export * from "./funnels";
export * from "./cohorts";
export * from "./forecasts";
export * from "./acquisition";
export * from "./access";
export * from "./settings";
export * from "./overview";
