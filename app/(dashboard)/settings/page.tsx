import { TopFilterRail } from "@/components/top-filter-rail";
import { SettingsControlPlane } from "@/components/settings/control-plane";
import {
  getAnalyticsSettingsSnapshot,
  serializeProjectBundle,
} from "@/lib/platform/store";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const snapshot = await getAnalyticsSettingsSnapshot();

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      <TopFilterRail title="Settings" />
      <SettingsControlPlane
        initialProjects={snapshot.projects.map(serializeProjectBundle)}
        metricCatalog={snapshot.metricCatalog}
      />
    </div>
  );
}
