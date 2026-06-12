/** Phases a spec moves through. */
export const PHASES = [
  "requirement",
  "plan",
  "implementation",
  "review",
  "validation",
  "done",
] as const;
export type Phase = (typeof PHASES)[number];

/** High-level lifecycle state shown in dashboards. */
export const STATES = [
  "draft",
  "specifying",
  "planned",
  "implementing",
  "in-review",
  "validating",
  "done",
  "abandoned",
] as const;
export type State = (typeof STATES)[number];

/** The living documents stored per spec, by short name. */
export const DOCS = {
  spec: "spec.md",
  plan: "plan.md",
  implementation: "implementation.md",
  validation: "validation.md",
} as const;
export type DocName = keyof typeof DOCS;
export const DOC_NAMES = Object.keys(DOCS) as DocName[];

/** Quality gates, mirroring the task-workflow gates. */
export interface Gates {
  requirement: boolean;
  plan: boolean;
  implementation: boolean;
  review: boolean;
  validation: boolean;
}

/** metadata.json — the machine-readable record for a spec. */
export interface SpecMetadata {
  id: string;
  title: string;
  state: State;
  phase: Phase;
  gates: Gates;
  tags: string[];
  branch: string | null;
  pullRequest: string | null;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export function defaultGates(): Gates {
  return {
    requirement: false,
    plan: false,
    implementation: false,
    review: false,
    validation: false,
  };
}
