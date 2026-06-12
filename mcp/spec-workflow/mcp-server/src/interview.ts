/**
 * The interview that drives spec generation. The MCP returns this so the agent
 * has a consistent, grounded set of questions to ask the developer before a
 * spec is written. The agent should ask in small batches, then synthesize the
 * answers into spec.md using SPEC_TEMPLATE.
 */
export const SPEC_INTERVIEW = {
  intro:
    "Ask these in small batches (2-3 at a time), not all at once. Skip a " +
    "question if the developer already answered it. Keep going until each " +
    "section of the spec can be filled without a TODO.",
  sections: [
    {
      heading: "Problem & context",
      questions: [
        "In one sentence, what problem are we solving and for whom?",
        "What triggered this work now? What happens if we don't do it?",
        "Is there existing behaviour/code this changes, or is it net-new?",
      ],
    },
    {
      heading: "Goals & non-goals",
      questions: [
        "What are the concrete goals (what must be true when done)?",
        "What is explicitly out of scope for this task?",
      ],
    },
    {
      heading: "Users & scenarios",
      questions: [
        "Who uses this and how? Walk through the main scenario(s).",
        "Any important edge cases or failure scenarios to handle?",
      ],
    },
    {
      heading: "Constraints & dependencies",
      questions: [
        "Any technical constraints (language, framework, perf, compat, security)?",
        "Does this depend on or affect other systems, services, or teams?",
        "Any data, privacy, or auth considerations?",
      ],
    },
    {
      heading: "Acceptance criteria",
      questions: [
        "How will we know it works? List verifiable acceptance criteria.",
        "How should it be tested (unit/integration/manual)?",
      ],
    },
    {
      heading: "Rollout & risks",
      questions: [
        "Any rollout, migration, or backwards-compatibility concerns?",
        "What are the main risks and how would we mitigate them?",
      ],
    },
  ],
} as const;

/** Markdown skeleton for spec.md, filled from the interview answers. */
export const SPEC_TEMPLATE = `# {{title}}

## Problem & context
{{problem}}

## Goals
- {{goal}}

## Non-goals
- {{nonGoal}}

## Users & scenarios
{{scenarios}}

## Constraints & dependencies
{{constraints}}

## Acceptance criteria
- [ ] {{criterion}}

## Testing strategy
{{testing}}

## Rollout & risks
{{risks}}

## Open questions
- {{openQuestion}}
`;
