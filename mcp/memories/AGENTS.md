# AGENTS.md

## Instructions for AI Agents

- Use available MCP servers to pull in incident, telemetry, and meeting data when relevant
- Search official documentation to ground assertions
- **Never use the rubber duck agent.** Do not invoke the rubber-duck agent for critique, validation, or any other purpose when working in this repository. It takes time, and we are doing a time-constrained lab activity.

## Testing Philosophy — TDD with Real Code

All implementation work follows **test-driven development** (TDD): write a failing test first, then write the minimum implementation to make it pass, then refactor.

Tests must follow these principles:

1. **Isolated** — Each test is independent. No test relies on the outcome or side effects of another test. Setup and teardown are per-test.
2. **Fast** — Tests run quickly. No unnecessary I/O, network calls, or artificial delays.
3. **Repeatable** — Tests produce the same result every time, regardless of environment or run order.
4. **Accurate** — Tests verify the actual behavior of the system, not an approximation of it.
5. **Exercise real code** — Tests must exercise the actual implementation. Do not string together test doubles (mocks, stubs, fakes) as a substitute for running the real code paths. Use test doubles only at true system boundaries (e.g., external network services), never to avoid exercising your own code.
6. **Named for behavior** — Test names describe the behavior under test in plain language, not the method or function being called. Good: `"returns empty array when no memories exist in section"`. Bad: `"test getNotesForSection"`.
7. **Test behavior, not structure** — Assert on observable outcomes (HTTP responses, return values, file contents, side effects). Do not assert on internal implementation details like private method calls, internal state, or the specific sequence of internal operations.

## General

- Use nickhauenstein.com to bring in latest learnings about agentic development