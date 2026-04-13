import {
  MOCK_DATA_SOURCES,
  MOCK_PROJECT_BINDINGS,
  MOCK_METRIC_CATALOG,
  type DataSourceBinding,
  type ProjectBinding,
} from "@/lib/mock-data";

export async function getDataSources(): Promise<DataSourceBinding[]> {
  return MOCK_DATA_SOURCES;
}

export async function getProjectBindings(): Promise<ProjectBinding[]> {
  return MOCK_PROJECT_BINDINGS;
}

export async function getMetricCatalog(): Promise<typeof MOCK_METRIC_CATALOG> {
  return MOCK_METRIC_CATALOG;
}
