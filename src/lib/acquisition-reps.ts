export const ACQUISITION_REPS = [
  { id: "76369997", name: "Ursula Waked" },
  { id: "31558980", name: "Zein Fares" },
  { id: "76370000", name: "Mohammad Jehad Al-Barqawi" },
] as const;

export const DEAL_ONLY_REPS = [
  { id: "76369998", name: "Fadi Zanona" },
  { id: "76369995", name: "Mohammed Faizan" },
] as const;

export const DASHBOARD_REPS = [
  ...ACQUISITION_REPS.map((rep) => ({ ...rep, role: "acquisition" as const })),
  ...DEAL_ONLY_REPS.map((rep) => ({ ...rep, role: "deals-only" as const })),
];

export const ACQUISITION_OWNER_IDS = ACQUISITION_REPS.map((rep) => rep.id);
export const DEAL_ONLY_OWNER_IDS = DEAL_ONLY_REPS.map((rep) => rep.id);
export const DASHBOARD_OWNER_IDS = DASHBOARD_REPS.map((rep) => rep.id);

export const ACQUISITION_OWNER_ID_SET = new Set<string>(ACQUISITION_OWNER_IDS);
export const DEAL_ONLY_OWNER_ID_SET = new Set<string>(DEAL_ONLY_OWNER_IDS);
export const DASHBOARD_OWNER_ID_SET = new Set<string>(DASHBOARD_OWNER_IDS);
