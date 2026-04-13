export type Experiment = {
  id: string;
  name: string;
  project: string;
  status: "running" | "paused" | "concluded";
  variants: number;
  exposures: number;
  lift: number | null;
  pValue: number | null;
  startDate: string;
};

export type ExperimentVariant = {
  label: string;
  users: number;
  activationRate: number;
  revenuePerUser: number;
  lift: number;
};

export type ExperimentGuardrail = {
  label: string;
  value: string;
  status: "ok" | "warn" | "risk";
};

export type ExperimentDetail = {
  id: string;
  hypothesis: string;
  primaryMetric: string;
  owner: string;
  decisionDate: string;
  variants: ExperimentVariant[];
  guardrails: ExperimentGuardrail[];
  ciBand: {
    label: string;
    bandLeft: string;
    bandWidth: string;
    pointLeft: string;
    value: string;
  };
};

export type KpiMetric = {
  label: string;
  value: string;
  change: number;
  unit?: string;
};

export type FunnelStep = {
  label: string;
  users: number;
  completionRate: number;
  dropoffRate: number;
};

export type Funnel = {
  id: string;
  name: string;
  project: string;
  status: "healthy" | "watch" | "risk";
  entryEvent: string;
  completionEvent: string;
  sampleSize: number;
  completionRate: number;
  medianTimeMinutes: number;
  topDropoff: string;
  steps: FunnelStep[];
};

export type FunnelCohortRow = {
  segment: string;
  dimension: "platform" | "country" | "date";
  users: number;
  conversionRate: number;
  vsAvg: number;
};

export type FunnelDetail = {
  funnelId: string;
  avgTimeToCompleteMinutes: number;
  cohortRows: FunnelCohortRow[];
};

export const MOCK_FUNNEL_DETAILS: FunnelDetail[] = [
  {
    funnelId: "fnl-onboarding",
    avgTimeToCompleteMinutes: 4.8,
    cohortRows: [
      { segment: "iOS", dimension: "platform", users: 28820, conversionRate: 74.1, vsAvg: 2.7 },
      { segment: "Android", dimension: "platform", users: 19390, conversionRate: 67.3, vsAvg: -4.1 },
      { segment: "Russia", dimension: "country", users: 14240, conversionRate: 73.2, vsAvg: 1.8 },
      { segment: "USA", dimension: "country", users: 9810, conversionRate: 70.6, vsAvg: -0.8 },
      { segment: "Brazil", dimension: "country", users: 7420, conversionRate: 68.1, vsAvg: -3.3 },
      { segment: "Other", dimension: "country", users: 16740, conversionRate: 71.9, vsAvg: 0.5 },
    ],
  },
  {
    funnelId: "fnl-paywall",
    avgTimeToCompleteMinutes: 1.2,
    cohortRows: [
      { segment: "iOS", dimension: "platform", users: 12240, conversionRate: 11.2, vsAvg: 2.5 },
      { segment: "Android", dimension: "platform", users: 6880, conversionRate: 4.4, vsAvg: -4.3 },
      { segment: "Russia", dimension: "country", users: 5810, conversionRate: 9.1, vsAvg: 0.4 },
      { segment: "USA", dimension: "country", users: 4320, conversionRate: 12.3, vsAvg: 3.6 },
      { segment: "Germany", dimension: "country", users: 2640, conversionRate: 10.8, vsAvg: 2.1 },
      { segment: "Other", dimension: "country", users: 6350, conversionRate: 6.9, vsAvg: -1.8 },
    ],
  },
  {
    funnelId: "fnl-return",
    avgTimeToCompleteMinutes: 1404,
    cohortRows: [
      { segment: "iOS", dimension: "platform", users: 15380, conversionRate: 42.1, vsAvg: 2.9 },
      { segment: "Android", dimension: "platform", users: 11000, conversionRate: 35.2, vsAvg: -4.0 },
      { segment: "Russia", dimension: "country", users: 8940, conversionRate: 40.5, vsAvg: 1.3 },
      { segment: "USA", dimension: "country", users: 5420, conversionRate: 38.8, vsAvg: -0.4 },
      { segment: "Brazil", dimension: "country", users: 4810, conversionRate: 36.1, vsAvg: -3.1 },
      { segment: "Other", dimension: "country", users: 7210, conversionRate: 39.7, vsAvg: 0.5 },
    ],
  },
];

export type CohortDefinition = {
  id: string;
  name: string;
  project: string;
  trigger: string;
  population: number;
  window: string;
  platform: "iOS" | "Android" | "All";
};

export type CohortHeatmapRow = {
  cohortLabel: string;
  population: number;
  values: number[];
};

export type ForecastRun = {
  id: string;
  project: string;
  metric: string;
  status: "completed" | "running" | "needs_review";
  generatedAt: string;
  horizonDays: number;
  modelVersion: string;
  mae: string;
  coverage: string;
};

export type ForecastCard = {
  id: string;
  project: string;
  metric: string;
  status: "stable" | "converging" | "wide";
  horizonLabel: string;
  summary: string;
  points: Array<{
    date: string;
    value: number;
    ci: string;
  }>;
};

export type AccessMember = {
  name: string;
  email: string;
  role: "super_admin" | "admin" | "analyst" | "ab_analyst" | "viewer";
  status: "active" | "invited";
  lastActive: string;
  scope: string;
};

export type AccessRequest = {
  name: string;
  email: string;
  requestedRole: string;
  requestedAt: string;
  project: string;
  status: "pending" | "approved";
};

export type DataSourceBinding = {
  source: string;
  project: string;
  deliveryMode: string;
  status: "deferred" | "ready_for_key" | "mock_only";
  lastSync: string;
  notes: string;
};

export type ProjectBinding = {
  projectKey: string;
  owner: string;
  servingMode: string;
  sources: string[];
  status: "planned" | "shell_live" | "partial_data";
};

export const MOCK_EXPERIMENTS: Experiment[] = [
  {
    id: "exp-001",
    name: "Onboarding flow v2",
    project: "2PG",
    status: "running",
    variants: 2,
    exposures: 12430,
    lift: 4.2,
    pValue: 0.034,
    startDate: "2026-03-28",
  },
  {
    id: "exp-002",
    name: "Paywall position test",
    project: "Word Catcher",
    status: "running",
    variants: 3,
    exposures: 8910,
    lift: null,
    pValue: null,
    startDate: "2026-04-05",
  },
  {
    id: "exp-003",
    name: "Push notification timing",
    project: "Words in Word",
    status: "concluded",
    variants: 2,
    exposures: 31200,
    lift: -1.1,
    pValue: 0.41,
    startDate: "2026-02-14",
  },
  {
    id: "exp-004",
    name: "Daily challenge CTA",
    project: "2PG",
    status: "running",
    variants: 2,
    exposures: 5680,
    lift: 7.8,
    pValue: 0.019,
    startDate: "2026-04-10",
  },
  {
    id: "exp-005",
    name: "Revenue model A/B",
    project: "Word Catcher",
    status: "paused",
    variants: 2,
    exposures: 18750,
    lift: 2.1,
    pValue: 0.12,
    startDate: "2026-03-01",
  },
];

export const MOCK_EXPERIMENT_DETAILS: Record<string, ExperimentDetail> = {
  "exp-001": {
    id: "exp-001",
    hypothesis: "A shorter onboarding path improves D1 activation without damaging early monetization.",
    primaryMetric: "D1 activation rate",
    owner: "Product Growth",
    decisionDate: "2026-04-16",
    variants: [
      { label: "Control", users: 6180, activationRate: 42.1, revenuePerUser: 0.93, lift: 0 },
      { label: "Variant", users: 6250, activationRate: 45.8, revenuePerUser: 0.99, lift: 4.2 },
    ],
    guardrails: [
      { label: "Crash-free sessions", value: "99.31%", status: "ok" },
      { label: "Tutorial completion time", value: "+3.8%", status: "warn" },
      { label: "Day-0 payer rate", value: "+1.2%", status: "ok" },
    ],
    ciBand: {
      label: "Activation lift · 95% CI",
      bandLeft: "42%",
      bandWidth: "24%",
      pointLeft: "56%",
      value: "+4.2%",
    },
  },
  "exp-002": {
    id: "exp-002",
    hypothesis: "Moving the paywall higher in the post-level flow increases payer conversion without pushing down retention.",
    primaryMetric: "Revenue per active user",
    owner: "Monetization",
    decisionDate: "2026-04-18",
    variants: [
      { label: "A", users: 2980, activationRate: 18.2, revenuePerUser: 1.47, lift: 0 },
      { label: "B", users: 2930, activationRate: 17.8, revenuePerUser: 1.42, lift: -1.8 },
      { label: "C", users: 3000, activationRate: 18.6, revenuePerUser: 1.49, lift: 1.3 },
    ],
    guardrails: [
      { label: "D1 retention", value: "-0.7pp", status: "warn" },
      { label: "Refund rate", value: "0.34%", status: "ok" },
      { label: "Tutorial exits", value: "+6.1%", status: "risk" },
    ],
    ciBand: {
      label: "Revenue lift · 95% CI",
      bandLeft: "30%",
      bandWidth: "28%",
      pointLeft: "44%",
      value: "−1.8%",
    },
  },
};

export const MOCK_KPIS: KpiMetric[] = [
  { label: "Active experiments", value: "3", change: 0 },
  { label: "Total exposures (30d)", value: "27,020", change: 12.4, unit: "%" },
  { label: "Avg. lift (running)", value: "+6.0", change: 1.8, unit: "pp" },
  { label: "Concluded this month", value: "1", change: -1 },
];

export const MOCK_FRESHNESS = {
  lastIngestion: "2026-04-12T14:30:00Z",
  nextScheduled: "2026-04-12T20:00:00Z",
  status: "ok" as const,
};

export const MOCK_FUNNELS: Funnel[] = [
  {
    id: "fnl-onboarding",
    name: "First session onboarding",
    project: "Word Catcher",
    status: "healthy",
    entryEvent: "session_start",
    completionEvent: "tutorial_complete",
    sampleSize: 48210,
    completionRate: 71.4,
    medianTimeMinutes: 4.8,
    topDropoff: "Tutorial hint 2",
    steps: [
      { label: "Session start", users: 48210, completionRate: 100, dropoffRate: 0 },
      { label: "Tutorial start", users: 45502, completionRate: 94.4, dropoffRate: 5.6 },
      { label: "Hint 1 done", users: 40980, completionRate: 85.0, dropoffRate: 9.4 },
      { label: "Hint 2 done", users: 36240, completionRate: 75.2, dropoffRate: 11.6 },
      { label: "Tutorial complete", users: 34422, completionRate: 71.4, dropoffRate: 3.8 },
    ],
  },
  {
    id: "fnl-paywall",
    name: "Paywall purchase path",
    project: "2PG",
    status: "watch",
    entryEvent: "paywall_view",
    completionEvent: "purchase_success",
    sampleSize: 19120,
    completionRate: 8.7,
    medianTimeMinutes: 1.2,
    topDropoff: "Store sheet opened",
    steps: [
      { label: "Paywall view", users: 19120, completionRate: 100, dropoffRate: 0 },
      { label: "CTA tap", users: 5220, completionRate: 27.3, dropoffRate: 72.7 },
      { label: "Store sheet", users: 2730, completionRate: 14.3, dropoffRate: 47.7 },
      { label: "Purchase success", users: 1664, completionRate: 8.7, dropoffRate: 5.5 },
    ],
  },
  {
    id: "fnl-return",
    name: "Day-1 return path",
    project: "Words in Word",
    status: "risk",
    entryEvent: "install_day0",
    completionEvent: "session_day1",
    sampleSize: 26380,
    completionRate: 39.2,
    medianTimeMinutes: 1404,
    topDropoff: "Push permission accepted",
    steps: [
      { label: "Install", users: 26380, completionRate: 100, dropoffRate: 0 },
      { label: "Push prompt shown", users: 22210, completionRate: 84.2, dropoffRate: 15.8 },
      { label: "Push accepted", users: 11120, completionRate: 42.2, dropoffRate: 42.0 },
      { label: "Day-1 session", users: 10336, completionRate: 39.2, dropoffRate: 3.0 },
    ],
  },
];

export const MOCK_COHORT_DEFINITIONS: CohortDefinition[] = [
  {
    id: "cohort-install-ios",
    name: "Install cohort · iOS",
    project: "Word Catcher",
    trigger: "first_open",
    population: 16240,
    window: "Weekly cohorts · last 8 weeks",
    platform: "iOS",
  },
  {
    id: "cohort-install-android",
    name: "Install cohort · Android",
    project: "Word Catcher",
    trigger: "first_open",
    population: 14310,
    window: "Weekly cohorts · last 8 weeks",
    platform: "Android",
  },
  {
    id: "cohort-paywall-view",
    name: "Paywall viewers",
    project: "2PG",
    trigger: "paywall_view",
    population: 8230,
    window: "Monthly cohorts · last 4 periods",
    platform: "All",
  },
  {
    id: "cohort-return-wiw",
    name: "Day-1 returners",
    project: "Words in Word",
    trigger: "session_day1",
    population: 11840,
    window: "Weekly cohorts · last 6 weeks",
    platform: "All",
  },
];

export const MOCK_COHORT_GRID: CohortHeatmapRow[] = [
  { cohortLabel: "Mar 03", population: 2410, values: [100, 62, 49, 39, 31, 23] },
  { cohortLabel: "Mar 10", population: 2286, values: [100, 61, 47, 37, 29, 21] },
  { cohortLabel: "Mar 17", population: 2512, values: [100, 63, 50, 41, 32, 24] },
  { cohortLabel: "Mar 24", population: 2654, values: [100, 64, 51, 42, 33, 25] },
  { cohortLabel: "Mar 31", population: 2720, values: [100, 60, 46, 35, 27, 19] },
  { cohortLabel: "Apr 07", population: 2814, values: [100, 65, 52, 44, 35, 0] },
];

export const MOCK_COHORT_TRENDS = {
  labels: ["Mar 03", "Mar 10", "Mar 17", "Mar 24", "Mar 31", "Apr 07"],
  iosD7: [39, 37, 41, 42, 35, 44],
  androidD7: [34, 33, 35, 36, 31, 37],
  iosD30: [23, 21, 24, 25, 19, 0],
  androidD30: [18, 17, 19, 19, 15, 0],
};

export const MOCK_FORECAST_RUNS: ForecastRun[] = [
  {
    id: "fr-240412-1704",
    project: "Word Catcher",
    metric: "D30 revenue / payer",
    status: "completed",
    generatedAt: "Apr 12 · 17:04",
    horizonDays: 30,
    modelVersion: "v1.2.0",
    mae: "4.1%",
    coverage: "93%",
  },
  {
    id: "fr-240412-1308",
    project: "2PG",
    metric: "Paywall conversion",
    status: "needs_review",
    generatedAt: "Apr 12 · 13:08",
    horizonDays: 21,
    modelVersion: "v1.2.0",
    mae: "6.8%",
    coverage: "88%",
  },
  {
    id: "fr-240412-0902",
    project: "Words in Word",
    metric: "D7 retention",
    status: "running",
    generatedAt: "Apr 12 · 09:02",
    horizonDays: 14,
    modelVersion: "v1.1.8",
    mae: "—",
    coverage: "—",
  },
];

export const MOCK_FORECAST_CARDS: ForecastCard[] = [
  {
    id: "fc-word-catcher",
    project: "Word Catcher",
    metric: "Revenue / user",
    status: "stable",
    horizonLabel: "30-day outlook",
    summary: "Confidence band narrowed after three stable runs.",
    points: [
      { date: "Apr 14", value: 1.28, ci: "±0.05" },
      { date: "Apr 18", value: 1.31, ci: "±0.05" },
      { date: "Apr 22", value: 1.33, ci: "±0.06" },
      { date: "Apr 26", value: 1.36, ci: "±0.06" },
    ],
  },
  {
    id: "fc-2pg",
    project: "2PG",
    metric: "Paywall conversion",
    status: "wide",
    horizonLabel: "21-day outlook",
    summary: "Interval remains wide because experiment exposure is still uneven across variants.",
    points: [
      { date: "Apr 14", value: 8.4, ci: "±1.6" },
      { date: "Apr 18", value: 8.8, ci: "±1.5" },
      { date: "Apr 22", value: 9.0, ci: "±1.4" },
      { date: "Apr 26", value: 9.2, ci: "±1.4" },
    ],
  },
];

export const MOCK_ACCESS_MEMBERS: AccessMember[] = [
  {
    name: "Analyst",
    email: "analyst@example.com",
    role: "admin",
    status: "active",
    lastActive: "Today, 11:24",
    scope: "All projects",
  },
  {
    name: "Product Manager",
    email: "pm@example.com",
    role: "ab_analyst",
    status: "active",
    lastActive: "Today, 09:10",
    scope: "Word Catcher, 2PG",
  },
  {
    name: "Client Viewer",
    email: "client@example.com",
    role: "viewer",
    status: "invited",
    lastActive: "Invite pending",
    scope: "Client review workspace",
  },
];

export const MOCK_ACCESS_REQUESTS: AccessRequest[] = [
  {
    name: "Growth Ops",
    email: "growth@example.com",
    requestedRole: "analyst",
    requestedAt: "Apr 12, 16:40",
    project: "All projects",
    status: "pending",
  },
  {
    name: "Client Success",
    email: "cs@example.com",
    requestedRole: "viewer",
    requestedAt: "Apr 11, 10:15",
    project: "Word Catcher",
    status: "approved",
  },
];

export const MOCK_ROLE_MATRIX = [
  { role: "viewer", experiments: "View", forecasts: "View", settings: "No", access: "No" },
  { role: "analyst", experiments: "View / annotate", forecasts: "View", settings: "No", access: "No" },
  { role: "ab_analyst", experiments: "View / compare", forecasts: "View", settings: "No", access: "No" },
  { role: "admin", experiments: "Edit", forecasts: "View / approve", settings: "Edit", access: "Invite" },
];

export const MOCK_DATA_SOURCES: DataSourceBinding[] = [
  {
    source: "AppMetrica · Word Catcher",
    project: "Word Catcher",
    deliveryMode: "Logs API · D+1 batch",
    status: "ready_for_key",
    lastSync: "Waiting on token",
    notes: "UI shell and source binding screen are ready. Only token and app id are missing.",
  },
  {
    source: "AppMetrica · Words in Word",
    project: "Words in Word",
    deliveryMode: "Logs API · D+1 batch",
    status: "deferred",
    lastSync: "Deferred",
    notes: "Planned after Word Catcher ingestion is validated.",
  },
  {
    source: "BigQuery · 2PG",
    project: "2PG",
    deliveryMode: "Serving marts",
    status: "ready_for_key",
    lastSync: "Waiting on service account",
    notes: "Warehouse model is designed; credentials are the only missing input.",
  },
  {
    source: "User Acquisition export",
    project: "Cross-project",
    deliveryMode: "Future connection",
    status: "mock_only",
    lastSync: "Mock shell only",
    notes: "Does not block route implementation or UI QA.",
  },
];

export const MOCK_PROJECT_BINDINGS: ProjectBinding[] = [
  {
    projectKey: "word_catcher",
    owner: "Client Service",
    servingMode: "Shell live · data deferred",
    sources: ["AppMetrica", "BigQuery"],
    status: "shell_live",
  },
  {
    projectKey: "words_in_word",
    owner: "Client Service",
    servingMode: "Shell live · source deferred",
    sources: ["AppMetrica"],
    status: "shell_live",
  },
  {
    projectKey: "2pg",
    owner: "Client Service",
    servingMode: "Partial warehouse planned",
    sources: ["BigQuery"],
    status: "planned",
  },
];

export const MOCK_METRIC_CATALOG = [
  { metric: "d1_activation_rate", owner: "Product", grain: "experiment_daily", status: "Canonical" },
  { metric: "revenue_per_active_user", owner: "Monetization", grain: "experiment_daily", status: "Canonical" },
  { metric: "tutorial_completion_rate", owner: "Growth", grain: "funnel_daily", status: "Draft" },
  { metric: "forecast_ci_width", owner: "Data Science", grain: "forecast_run", status: "Canonical" },
];

export type ConfidenceSeriesPoint = {
  label: string;
  value: number;
  lower: number;
  upper: number;
  actual?: number | null;
};

export type ForecastTrajectory = {
  id: string;
  project: string;
  metric: string;
  unit: string;
  subtitle: string;
  series: ConfidenceSeriesPoint[];
};

export type AcquisitionTrajectory = {
  id: string;
  project: string;
  title: string;
  unit: string;
  subtitle: string;
  series: ConfidenceSeriesPoint[];
};

export type AcquisitionBreakdownRow = {
  groupBy: "country" | "source" | "campaign" | "company" | "none";
  project: string;
  label: string;
  platform: "iOS" | "Android" | "Web";
  segments: string[];
  tags: string[];
  spend: number;
  installs: number;
  cpi: number;
  d30Roas: number;
  d60Roas: number;
  paybackDays: number;
  confidence: string;
};

export const MOCK_FORECAST_TRAJECTORIES: ForecastTrajectory[] = [
  {
    id: "traj-wc-revenue",
    project: "Word Catcher",
    metric: "Revenue / user forecast",
    unit: "$",
    subtitle: "Projected value by cohort date with 95% confidence band",
    series: [
      { label: "Apr 14", value: 1.28, lower: 1.22, upper: 1.34, actual: 1.27 },
      { label: "Apr 18", value: 1.31, lower: 1.25, upper: 1.38, actual: 1.3 },
      { label: "Apr 22", value: 1.33, lower: 1.27, upper: 1.4, actual: 1.32 },
      { label: "Apr 26", value: 1.36, lower: 1.29, upper: 1.43, actual: null },
      { label: "Apr 30", value: 1.39, lower: 1.31, upper: 1.47, actual: null },
    ],
  },
  {
    id: "traj-2pg-paywall",
    project: "2PG",
    metric: "Paywall conversion forecast",
    unit: "%",
    subtitle: "Experiment-aware projection with interval width preserved",
    series: [
      { label: "Apr 14", value: 8.4, lower: 6.9, upper: 9.8, actual: 8.1 },
      { label: "Apr 18", value: 8.8, lower: 7.3, upper: 10.2, actual: 8.5 },
      { label: "Apr 22", value: 9.0, lower: 7.6, upper: 10.4, actual: 8.8 },
      { label: "Apr 26", value: 9.2, lower: 7.8, upper: 10.6, actual: null },
      { label: "Apr 30", value: 9.4, lower: 7.9, upper: 10.9, actual: null },
    ],
  },
  {
    id: "traj-wiw-retention",
    project: "Words in Word",
    metric: "D7 retention forecast",
    unit: "%",
    subtitle: "Retention projection before final publish",
    series: [
      { label: "Apr 14", value: 37.2, lower: 35.4, upper: 39.1, actual: 36.8 },
      { label: "Apr 18", value: 37.6, lower: 35.7, upper: 39.6, actual: 37.1 },
      { label: "Apr 22", value: 38.1, lower: 36.2, upper: 40.1, actual: 37.7 },
      { label: "Apr 26", value: 38.5, lower: 36.5, upper: 40.6, actual: null },
      { label: "Apr 30", value: 38.9, lower: 36.8, upper: 41.1, actual: null },
    ],
  },
];

export const MOCK_ACQUISITION_TRAJECTORIES: AcquisitionTrajectory[] = [
  {
    id: "ua-wc-roas",
    project: "Word Catcher",
    title: "ROAS by install date · D60",
    unit: "%",
    subtitle: "Notebook-style ROAS curve with lower and upper confidence bounds",
    series: [
      { label: "Mar 10", value: 74, lower: 68, upper: 81, actual: 71 },
      { label: "Mar 17", value: 79, lower: 72, upper: 86, actual: 76 },
      { label: "Mar 24", value: 83, lower: 76, upper: 91, actual: 82 },
      { label: "Mar 31", value: 88, lower: 80, upper: 96, actual: 87 },
      { label: "Apr 07", value: 92, lower: 83, upper: 101, actual: null },
      { label: "Apr 14", value: 95, lower: 85, upper: 105, actual: null },
    ],
  },
  {
    id: "ua-wc-payback",
    project: "Word Catcher",
    title: "Payback trajectory",
    unit: "%",
    subtitle: "Cumulative ROAS by lifetime day with confidence band",
    series: [
      { label: "D7", value: 23, lower: 20, upper: 26, actual: 22 },
      { label: "D14", value: 39, lower: 35, upper: 44, actual: 38 },
      { label: "D30", value: 58, lower: 53, upper: 64, actual: 57 },
      { label: "D60", value: 92, lower: 84, upper: 101, actual: null },
      { label: "D90", value: 111, lower: 101, upper: 123, actual: null },
      { label: "D120", value: 124, lower: 112, upper: 138, actual: null },
    ],
  },
  {
    id: "ua-2pg-roas",
    project: "2PG",
    title: "ROAS by install date · D60",
    unit: "%",
    subtitle: "Android-heavy monetization mix with wider interval",
    series: [
      { label: "Mar 10", value: 61, lower: 54, upper: 68, actual: 58 },
      { label: "Mar 17", value: 65, lower: 58, upper: 73, actual: 62 },
      { label: "Mar 24", value: 69, lower: 61, upper: 77, actual: 67 },
      { label: "Mar 31", value: 73, lower: 64, upper: 82, actual: 71 },
      { label: "Apr 07", value: 76, lower: 67, upper: 86, actual: null },
      { label: "Apr 14", value: 79, lower: 69, upper: 90, actual: null },
    ],
  },
  {
    id: "ua-2pg-payback",
    project: "2PG",
    title: "Payback trajectory",
    unit: "%",
    subtitle: "Cumulative ROAS by lifetime day with delayed recovery",
    series: [
      { label: "D7", value: 18, lower: 15, upper: 21, actual: 17 },
      { label: "D14", value: 31, lower: 27, upper: 35, actual: 30 },
      { label: "D30", value: 49, lower: 43, upper: 55, actual: 47 },
      { label: "D60", value: 79, lower: 70, upper: 89, actual: null },
      { label: "D90", value: 97, lower: 86, upper: 109, actual: null },
      { label: "D120", value: 108, lower: 95, upper: 122, actual: null },
    ],
  },
  {
    id: "ua-wiw-roas",
    project: "Words in Word",
    title: "ROAS by install date · D60",
    unit: "%",
    subtitle: "Stabilizing acquisition cohorts with tighter confidence",
    series: [
      { label: "Mar 10", value: 83, lower: 77, upper: 90, actual: 82 },
      { label: "Mar 17", value: 87, lower: 80, upper: 93, actual: 85 },
      { label: "Mar 24", value: 91, lower: 84, upper: 98, actual: 90 },
      { label: "Mar 31", value: 95, lower: 87, upper: 103, actual: 93 },
      { label: "Apr 07", value: 99, lower: 90, upper: 108, actual: null },
      { label: "Apr 14", value: 103, lower: 93, upper: 113, actual: null },
    ],
  },
  {
    id: "ua-wiw-payback",
    project: "Words in Word",
    title: "Payback trajectory",
    unit: "%",
    subtitle: "Cumulative ROAS by lifetime day with premium retention contribution",
    series: [
      { label: "D7", value: 25, lower: 22, upper: 28, actual: 24 },
      { label: "D14", value: 43, lower: 39, upper: 47, actual: 42 },
      { label: "D30", value: 64, lower: 58, upper: 70, actual: 63 },
      { label: "D60", value: 99, lower: 91, upper: 108, actual: null },
      { label: "D90", value: 119, lower: 109, upper: 130, actual: null },
      { label: "D120", value: 132, lower: 120, upper: 145, actual: null },
    ],
  },
];

export const MOCK_ACQUISITION_BREAKDOWN: AcquisitionBreakdownRow[] = [
  {
    groupBy: "country",
    project: "Word Catcher",
    label: "US",
    platform: "iOS",
    segments: ["all", "paid-ua", "high-value"],
    tags: ["roas", "ua", "monetization"],
    spend: 18240,
    installs: 6840,
    cpi: 2.67,
    d30Roas: 64,
    d60Roas: 94,
    paybackDays: 87,
    confidence: "Tight",
  },
  {
    groupBy: "country",
    project: "Word Catcher",
    label: "DE",
    platform: "Android",
    segments: ["all", "paid-ua", "new-users"],
    tags: ["roas", "ua"],
    spend: 11620,
    installs: 5390,
    cpi: 2.16,
    d30Roas: 58,
    d60Roas: 89,
    paybackDays: 96,
    confidence: "Medium",
  },
  {
    groupBy: "source",
    project: "Word Catcher",
    label: "Google Ads",
    platform: "iOS",
    segments: ["all", "paid-ua", "payers"],
    tags: ["roas", "ua", "monetization"],
    spend: 14210,
    installs: 4970,
    cpi: 2.86,
    d30Roas: 67,
    d60Roas: 98,
    paybackDays: 84,
    confidence: "Tight",
  },
  {
    groupBy: "campaign",
    project: "Word Catcher",
    label: "Spring Puzzle ROAS",
    platform: "Android",
    segments: ["all", "paid-ua", "new-users"],
    tags: ["roas", "ua", "experiments"],
    spend: 9310,
    installs: 4320,
    cpi: 2.15,
    d30Roas: 61,
    d60Roas: 92,
    paybackDays: 92,
    confidence: "Medium",
  },
  {
    groupBy: "company",
    project: "Word Catcher",
    label: "Google",
    platform: "iOS",
    segments: ["all", "paid-ua", "payers"],
    tags: ["roas", "ua", "monetization"],
    spend: 18870,
    installs: 6510,
    cpi: 2.9,
    d30Roas: 66,
    d60Roas: 97,
    paybackDays: 86,
    confidence: "Tight",
  },
  {
    groupBy: "none",
    project: "Word Catcher",
    label: "Selected slice",
    platform: "iOS",
    segments: ["all", "paid-ua", "payers", "high-value"],
    tags: ["roas", "ua", "monetization", "retention"],
    spend: 30110,
    installs: 11280,
    cpi: 2.67,
    d30Roas: 63,
    d60Roas: 93,
    paybackDays: 89,
    confidence: "Tight",
  },
  {
    groupBy: "country",
    project: "2PG",
    label: "US",
    platform: "Android",
    segments: ["all", "paid-ua", "payers"],
    tags: ["roas", "ua", "monetization"],
    spend: 22110,
    installs: 9150,
    cpi: 2.42,
    d30Roas: 51,
    d60Roas: 81,
    paybackDays: 111,
    confidence: "Wide",
  },
  {
    groupBy: "source",
    project: "2PG",
    label: "AppLovin",
    platform: "Android",
    segments: ["all", "paid-ua", "returning"],
    tags: ["roas", "ua"],
    spend: 16740,
    installs: 7620,
    cpi: 2.2,
    d30Roas: 48,
    d60Roas: 77,
    paybackDays: 118,
    confidence: "Wide",
  },
  {
    groupBy: "campaign",
    project: "2PG",
    label: "Paywall test burst",
    platform: "Android",
    segments: ["all", "paid-ua", "new-users"],
    tags: ["roas", "ua", "experiments"],
    spend: 8420,
    installs: 3910,
    cpi: 2.15,
    d30Roas: 46,
    d60Roas: 74,
    paybackDays: 124,
    confidence: "Wide",
  },
  {
    groupBy: "company",
    project: "2PG",
    label: "Meta",
    platform: "Android",
    segments: ["all", "paid-ua", "payers"],
    tags: ["roas", "ua", "monetization"],
    spend: 14390,
    installs: 5780,
    cpi: 2.49,
    d30Roas: 53,
    d60Roas: 82,
    paybackDays: 109,
    confidence: "Medium",
  },
  {
    groupBy: "none",
    project: "2PG",
    label: "Selected slice",
    platform: "Android",
    segments: ["all", "paid-ua", "new-users", "payers"],
    tags: ["roas", "ua", "monetization", "retention"],
    spend: 36500,
    installs: 14880,
    cpi: 2.45,
    d30Roas: 50,
    d60Roas: 79,
    paybackDays: 114,
    confidence: "Medium",
  },
  {
    groupBy: "country",
    project: "Words in Word",
    label: "GB",
    platform: "iOS",
    segments: ["all", "paid-ua", "high-value"],
    tags: ["roas", "ua", "retention"],
    spend: 12840,
    installs: 4710,
    cpi: 2.73,
    d30Roas: 68,
    d60Roas: 101,
    paybackDays: 78,
    confidence: "Tight",
  },
  {
    groupBy: "source",
    project: "Words in Word",
    label: "Google Ads",
    platform: "iOS",
    segments: ["all", "paid-ua", "returning"],
    tags: ["roas", "ua", "retention"],
    spend: 11970,
    installs: 4380,
    cpi: 2.73,
    d30Roas: 71,
    d60Roas: 104,
    paybackDays: 75,
    confidence: "Tight",
  },
  {
    groupBy: "campaign",
    project: "Words in Word",
    label: "High retention sweep",
    platform: "iOS",
    segments: ["all", "paid-ua", "high-value"],
    tags: ["roas", "ua", "retention", "experiments"],
    spend: 7640,
    installs: 2810,
    cpi: 2.72,
    d30Roas: 73,
    d60Roas: 108,
    paybackDays: 72,
    confidence: "Tight",
  },
  {
    groupBy: "company",
    project: "Words in Word",
    label: "Google",
    platform: "iOS",
    segments: ["all", "paid-ua", "high-value"],
    tags: ["roas", "ua", "retention"],
    spend: 14110,
    installs: 5160,
    cpi: 2.73,
    d30Roas: 70,
    d60Roas: 103,
    paybackDays: 76,
    confidence: "Tight",
  },
  {
    groupBy: "none",
    project: "Words in Word",
    label: "Selected slice",
    platform: "iOS",
    segments: ["all", "paid-ua", "returning", "high-value"],
    tags: ["roas", "ua", "retention", "monetization"],
    spend: 28750,
    installs: 10420,
    cpi: 2.76,
    d30Roas: 69,
    d60Roas: 102,
    paybackDays: 77,
    confidence: "Tight",
  },
];
