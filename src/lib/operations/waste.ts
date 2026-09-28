/** Shared waste reasons: the UI and both API routes must agree. */
export const WASTE_REASONS = [
  "Expired",
  "Spoiled",
  "Overproduction",
  "Customer Return",
  "Preparation Error",
  "Contamination",
  "Equipment Failure",
  "Other",
] as const;
