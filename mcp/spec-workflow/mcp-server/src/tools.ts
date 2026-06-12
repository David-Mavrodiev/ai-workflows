import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { BrainMcpStore } from "./brain-store.js";
import { DOC_NAMES, PHASES, STATES } from "./types.js";
import { SPEC_INTERVIEW, SPEC_TEMPLATE } from "./interview.js";

type ToolResult = {
  content: { type: "text"; text: string }[];
  isError?: boolean;
};

function ok(text: string): ToolResult {
  return { content: [{ type: "text", text }] };
}

function fail(text: string): ToolResult {
  return { content: [{ type: "text", text }], isError: true };
}

function asJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

async function guard<T>(fn: () => Promise<T>): Promise<ToolResult> {
  try {
    const result = await fn();
    return ok(typeof result === "string" ? result : asJson(result));
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err));
  }
}

/** Register every spec-workflow tool on the given MCP server. */
export function registerTools(server: McpServer, store: BrainMcpStore): void {
  // ---------------------------------------------------------------------------
  // Interview / templates
  // ---------------------------------------------------------------------------

  server.registerTool(
    "get_spec_questions",
    {
      title: "Get spec interview questions",
      description:
        "Return the structured interview used to generate a spec, plus a " +
        "markdown spec template. Call this first when starting a new spec, " +
        "then ask the developer the questions in small batches and synthesize " +
        "their answers into spec.md using save_spec.",
      inputSchema: {},
    },
    async () =>
      ok(asJson({ interview: SPEC_INTERVIEW, template: SPEC_TEMPLATE }))
  );

  // ---------------------------------------------------------------------------
  // CRUD
  // ---------------------------------------------------------------------------

  server.registerTool(
    "list_specs",
    {
      title: "List specs",
      description:
        "List all specs with their metadata (id, title, state, phase, gates, " +
        "branch, PR, timestamps), newest first. Use for a dashboard / status view.",
      inputSchema: {},
    },
    async () => guard(async () => store.list())
  );

  server.registerTool(
    "get_spec",
    {
      title: "Get a spec",
      description:
        "Get a spec's metadata, the spec.md content, and the list of which " +
        "phase docs (plan/implementation/validation) exist. Use read_doc to " +
        "fetch a specific doc's full content.",
      inputSchema: {
        id: z.string().describe("The spec GUID."),
      },
    },
    async ({ id }) =>
      guard(async () => ({
        metadata: await store.getMetadata(id),
        spec: await store.readDoc(id, "spec"),
        docsPresent: await store.presentDocs(id),
      }))
  );

  server.registerTool(
    "create_spec",
    {
      title: "Create a spec",
      description:
        "Create a new spec folder with a fresh GUID and seeded metadata.json " +
        "(state 'draft', phase 'requirement'). Optionally provide the initial " +
        "spec.md content (otherwise a TODO placeholder is written). Returns the " +
        "new metadata including the generated id.",
      inputSchema: {
        title: z.string().describe("Short human-readable title for the task."),
        spec: z
          .string()
          .optional()
          .describe("Initial spec.md content (Markdown). May be added later via save_spec."),
        tags: z.array(z.string()).optional().describe("Optional tags."),
      },
    },
    async ({ title, spec, tags }) =>
      guard(async () => store.create(title, spec, tags))
  );

  server.registerTool(
    "save_spec",
    {
      title: "Save spec content",
      description:
        "Write (overwrite) the spec.md for a spec. Use after the interview to " +
        "persist the synthesized specification.",
      inputSchema: {
        id: z.string().describe("The spec GUID."),
        content: z.string().describe("Full spec.md content (Markdown)."),
      },
    },
    async ({ id, content }) =>
      guard(async () => {
        await store.writeDoc(id, "spec", content);
        return `Saved spec.md for ${id}.`;
      })
  );

  server.registerTool(
    "read_doc",
    {
      title: "Read a phase doc",
      description:
        "Read one of a spec's living documents. doc is one of: " +
        DOC_NAMES.join(", ") +
        ". Returns null content if the doc does not exist yet.",
      inputSchema: {
        id: z.string().describe("The spec GUID."),
        doc: z.enum(DOC_NAMES as [string, ...string[]]).describe("Which document to read."),
      },
    },
    async ({ id, doc }) =>
      guard(async () => ({ doc, content: await store.readDoc(id, doc as never) }))
  );

  server.registerTool(
    "write_doc",
    {
      title: "Write a phase doc",
      description:
        "Write (overwrite) one of a spec's living documents (" +
        DOC_NAMES.join(", ") +
        "). Used by the planner/implementer/validator agents to persist " +
        "plan.md, implementation.md, and validation.md.",
      inputSchema: {
        id: z.string().describe("The spec GUID."),
        doc: z.enum(DOC_NAMES as [string, ...string[]]).describe("Which document to write."),
        content: z.string().describe("Full document content (Markdown)."),
      },
    },
    async ({ id, doc, content }) =>
      guard(async () => {
        await store.writeDoc(id, doc as never, content);
        return `Saved ${doc}.md for ${id}.`;
      })
  );

  server.registerTool(
    "update_metadata",
    {
      title: "Update spec metadata",
      description:
        "Patch a spec's metadata.json. Provide only the fields to change. " +
        "Use this to advance the phase, set/clear gates, record the branch or " +
        "pull request, change the lifecycle state, or append notes.",
      inputSchema: {
        id: z.string().describe("The spec GUID."),
        title: z.string().optional(),
        state: z.enum(STATES as unknown as [string, ...string[]]).optional(),
        phase: z.enum(PHASES as unknown as [string, ...string[]]).optional(),
        gates: z
          .object({
            requirement: z.boolean().optional(),
            plan: z.boolean().optional(),
            implementation: z.boolean().optional(),
            review: z.boolean().optional(),
            validation: z.boolean().optional(),
          })
          .optional()
          .describe("Partial gates patch; merged with existing gates."),
        tags: z.array(z.string()).optional(),
        branch: z.string().nullable().optional(),
        pullRequest: z.string().nullable().optional(),
        notes: z.string().optional(),
      },
    },
    async ({ id, ...patch }) =>
      guard(async () => store.updateMetadata(id, patch as never))
  );

  server.registerTool(
    "delete_spec",
    {
      title: "Delete a spec",
      description:
        "Permanently delete a spec and all its documents. Requires confirmTitle " +
        "to exactly match the spec's current title, to prevent accidental loss.",
      inputSchema: {
        id: z.string().describe("The spec GUID."),
        confirmTitle: z
          .string()
          .describe("Must exactly match the spec's current title."),
      },
    },
    async ({ id, confirmTitle }) =>
      guard(async () => {
        const meta = await store.getMetadata(id);
        if (confirmTitle !== meta.title) {
          throw new Error(
            `confirmTitle "${confirmTitle}" does not match the spec title "${meta.title}". Aborting.`
          );
        }
        await store.delete(id);
        return `Deleted spec ${id} ("${meta.title}").`;
      })
  );
}
