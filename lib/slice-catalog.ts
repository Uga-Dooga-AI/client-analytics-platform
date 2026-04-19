export type SliceOption = {
  value: string;
  label: string;
  count: number;
};

export type AppMetricaSliceDescriptor = {
  platform: string;
  country: string;
  source: string;
  count: number;
  firstSeen?: string | null;
  lastSeen?: string | null;
};

export type MirrorSliceDescriptor = {
  company: string;
  campaign: string;
  creative: string;
  count: number;
  firstSeen?: string | null;
  lastSeen?: string | null;
};

export type LiveSliceCatalog = {
  appmetricaDescriptors: AppMetricaSliceDescriptor[];
  mirrorDescriptors: MirrorSliceDescriptor[];
  mirrorOptions?: {
    companies: SliceOption[];
    campaigns: SliceOption[];
    creatives: SliceOption[];
  };
  events: SliceOption[];
  notes: string[];
};

export type LiveSliceSelection = {
  platform: string;
  country: string;
  source: string;
  company: string;
  campaign: string;
  creative: string;
};

type AppMetricaDimension = keyof Pick<AppMetricaSliceDescriptor, "platform" | "country" | "source">;
type MirrorDimension = keyof Pick<MirrorSliceDescriptor, "company" | "campaign" | "creative">;

function formatPlatformLabel(value: string) {
  if (value === "ios") {
    return "iOS";
  }

  if (value === "android") {
    return "Android";
  }

  if (value === "web") {
    return "Web";
  }

  return value;
}

function formatCountryLabel(value: string) {
  return value === "UNKNOWN" ? "Unknown country" : value;
}

function formatSourceLabel(value: string) {
  if (value === "organic") {
    return "Organic";
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === "google ads" || normalized === "google_ads") {
    return "Google Ads";
  }

  if (normalized === "unity ads" || normalized === "unity_ads" || normalized === "unityads") {
    return "Unity Ads";
  }

  if (normalized === "applovin" || normalized === "app_lovin") {
    return "AppLovin";
  }

  return value
    .split(/[\s_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatMirrorLabel(value: string) {
  return value === "unknown" ? "Unknown" : value;
}

function sortOptions(options: SliceOption[]) {
  return options.sort((left, right) => {
    if (right.count !== left.count) {
      return right.count - left.count;
    }

    return left.label.localeCompare(right.label);
  });
}

function buildAllOption(label: string, descriptors: Array<{ count: number }>) {
  return {
    value: "all",
    label,
    count: descriptors.reduce((sum, descriptor) => sum + descriptor.count, 0),
  } satisfies SliceOption;
}

function buildAppMetricaOptions(
  descriptors: AppMetricaSliceDescriptor[],
  dimension: AppMetricaDimension
) {
  const counts = new Map<string, number>();

  for (const descriptor of descriptors) {
    const key = descriptor[dimension];
    counts.set(key, (counts.get(key) ?? 0) + descriptor.count);
  }

  const formatLabel =
    dimension === "platform"
      ? formatPlatformLabel
      : dimension === "country"
        ? formatCountryLabel
        : formatSourceLabel;

  return [
    buildAllOption(
      dimension === "platform"
        ? "All platforms"
        : dimension === "country"
          ? "All countries"
          : "All traffic sources",
      descriptors
    ),
    ...sortOptions(
      Array.from(counts.entries()).map(([value, count]) => ({
        value,
        label: formatLabel(value),
        count,
      }))
    ),
  ];
}

function buildEmptyMirrorOptions() {
  return {
    companies: [buildAllOption("All companies", [])],
    campaigns: [buildAllOption("All campaigns", [])],
    creatives: [buildAllOption("All creatives", [])],
  };
}

function buildMirrorOptions(
  descriptors: MirrorSliceDescriptor[],
  dimension: MirrorDimension
) {
  const counts = new Map<string, number>();

  for (const descriptor of descriptors) {
    const key = descriptor[dimension];
    counts.set(key, (counts.get(key) ?? 0) + descriptor.count);
  }

  return [
    buildAllOption(
      dimension === "company"
        ? "All companies"
        : dimension === "campaign"
          ? "All campaigns"
          : "All creatives",
      descriptors
    ),
    ...sortOptions(
      Array.from(counts.entries()).map(([value, count]) => ({
        value,
        label: formatMirrorLabel(value),
        count,
      }))
    ),
  ];
}

function filterAppMetricaDescriptors(
  descriptors: AppMetricaSliceDescriptor[],
  selection: LiveSliceSelection,
  omit?: AppMetricaDimension
) {
  return descriptors.filter((descriptor) => {
    if (omit !== "platform" && selection.platform !== "all" && descriptor.platform !== selection.platform) {
      return false;
    }

    if (omit !== "country" && selection.country !== "all" && descriptor.country !== selection.country) {
      return false;
    }

    if (omit !== "source" && selection.source !== "all" && descriptor.source !== selection.source) {
      return false;
    }

    return true;
  });
}

function filterMirrorDescriptors(
  descriptors: MirrorSliceDescriptor[],
  selection: LiveSliceSelection,
  omit?: MirrorDimension
) {
  return descriptors.filter((descriptor) => {
    if (omit !== "company" && selection.company !== "all" && descriptor.company !== selection.company) {
      return false;
    }

    if (omit !== "campaign" && selection.campaign !== "all" && descriptor.campaign !== selection.campaign) {
      return false;
    }

    if (omit !== "creative" && selection.creative !== "all" && descriptor.creative !== selection.creative) {
      return false;
    }

    return true;
  });
}

export function defaultLiveSliceSelection(): LiveSliceSelection {
  return {
    platform: "all",
    country: "all",
    source: "all",
    company: "all",
    campaign: "all",
    creative: "all",
  };
}

export function resolveLiveSliceCatalogOptions(
  catalog: LiveSliceCatalog,
  selection: LiveSliceSelection
) {
  const platforms = buildAppMetricaOptions(
    filterAppMetricaDescriptors(catalog.appmetricaDescriptors, selection, "platform"),
    "platform"
  );
  const countries = buildAppMetricaOptions(
    filterAppMetricaDescriptors(catalog.appmetricaDescriptors, selection, "country"),
    "country"
  );
  const sources = buildAppMetricaOptions(
    filterAppMetricaDescriptors(catalog.appmetricaDescriptors, selection, "source"),
    "source"
  );
  const mirrorOptions =
    catalog.mirrorOptions && (
      catalog.mirrorOptions.companies.length > 0 ||
      catalog.mirrorOptions.campaigns.length > 0 ||
      catalog.mirrorOptions.creatives.length > 0
    )
      ? catalog.mirrorOptions
      : buildEmptyMirrorOptions();
  const companies =
    catalog.mirrorDescriptors.length > 0
      ? buildMirrorOptions(filterMirrorDescriptors(catalog.mirrorDescriptors, selection, "company"), "company")
      : mirrorOptions.companies;
  const campaigns =
    catalog.mirrorDescriptors.length > 0
      ? buildMirrorOptions(filterMirrorDescriptors(catalog.mirrorDescriptors, selection, "campaign"), "campaign")
      : mirrorOptions.campaigns;
  const creatives =
    catalog.mirrorDescriptors.length > 0
      ? buildMirrorOptions(filterMirrorDescriptors(catalog.mirrorDescriptors, selection, "creative"), "creative")
      : mirrorOptions.creatives;

  return {
    platforms,
    countries,
    sources,
    companies,
    campaigns,
    creatives,
    events: catalog.events,
  };
}
