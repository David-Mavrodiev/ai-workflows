import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { MemoriesApiClient, buildQuery, type ApiResponse } from "./api.js";

/** Valid notebook section names accepted by the Memories API. */
const SECTIONS = [
  "Ideas",
  "Work Memories",
  "Development Memories",
  "Investigation Memories",
  "Miscellaneous Memories",
  "People & Teams",
  "Skill Building",
  "Tasks & Specs",
] as const;

const SECTION_LIST = SECTIONS.join(", ");

/** The five Dr. Ruth Colvin Clark knowledge types for Skill Building memories. */
const KNOWLEDGE_TYPES = [
  "fact",
  "concept",
  "process",
  "procedure",
  "principle",
] as const;

type ToolResult = {
  content: { type: "text"; text: string }[];
  isError?: boolean;
};

/** Wrap text as a successful MCP tool result. */
function ok(text: string): ToolResult {
  return { content: [{ type: "text", text }] };
}

/** Wrap text as an error MCP tool result (returned, not thrown). */
function fail(text: string): ToolResult {
  return { content: [{ type: "text", text }], isError: true };
}

/** Pretty-print a JSON value for the agent. */
function asJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

/**
 * Translate a non-OK API response into a descriptive error result. The
 * Memories API returns `{ error: ... }` bodies on failure, so surface those.
 */
function apiError(action: string, res: ApiResponse): ToolResult {
  const detail =
    res.body && typeof res.body === "object"
      ? asJson(res.body)
      : String(res.body ?? "");
  return fail(`${action} failed (HTTP ${res.status}).\n${detail}`.trim());
}

/** Append semantic-index health headers (if any) to a result string. */
function withIndexHeaders(text: string, res: ApiResponse): string {
  const keys = Object.keys(res.headers);
  if (keys.length === 0) return text;
  const lines = keys.map((k) => `${k}: ${res.headers[k]}`);
  return `${text}\n\nSemantic index headers:\n${lines.join("\n")}`;
}

/**
 * Register every Memories tool on the given MCP server.
 */
export function registerTools(server: McpServer, api: MemoriesApiClient): void {
  // ---------------------------------------------------------------------------
  // Core CRUD
  // ---------------------------------------------------------------------------

  server.registerTool(
    "list_memories",
    {
      title: "List memories",
      description:
        "List memories in the memories notebook. Optionally filter by section " +
        `name (${SECTION_LIST}).`,
      inputSchema: {
        section: z
          .enum(SECTIONS)
          .optional()
          .describe(`Optional section filter. One of: ${SECTION_LIST}.`),
      },
    },
    async ({ section }) => {
      const res = await api.get(`/memories${buildQuery({ section })}`);
      if (!res.ok) return apiError("Listing memories", res);
      return ok(asJson(res.body));
    }
  );

  server.registerTool(
    "get_note",
    {
      title: "Get a memory",
      description: "Get the full content of a specific memory by its ID.",
      inputSchema: {
        id: z.string().describe("The ID of the memory to retrieve."),
      },
    },
    async ({ id }) => {
      const res = await api.get(`/memories/${encodeURIComponent(id)}`);
      if (!res.ok) return apiError(`Getting memory ${id}`, res);
      return ok(asJson(res.body));
    }
  );

  server.registerTool(
    "create_note",
    {
      title: "Create a memory",
      description:
        "Create a new memory. Choose the target section from: " +
        `${SECTION_LIST}. Memories in the 'Skill Building' section REQUIRE a ` +
        "knowledgeType (one of: fact, concept, process, procedure, principle). " +
        "Before creating a memory, you MUST call list_memories for the target " +
        "section and set existingMemoryTitlesChecked to true, confirming you " +
        "checked for duplicate titles.",
      inputSchema: {
        title: z.string().describe("The memory title."),
        section: z
          .enum(SECTIONS)
          .describe(`Target section. One of: ${SECTION_LIST}.`),
        body: z
          .string()
          .optional()
          .describe("Memory content as Markdown (may include Mermaid blocks)."),
        tags: z
          .array(z.string())
          .optional()
          .describe("Tags for categorization and auto-linking."),
        knowledgeType: z
          .enum(KNOWLEDGE_TYPES)
          .optional()
          .describe(
            "Required when section is 'Skill Building'. One of: " +
              KNOWLEDGE_TYPES.join(", ") +
              "."
          ),
        existingMemoryTitlesChecked: z
          .boolean()
          .describe(
            "MUST be true. Confirms you called list_memories for the target " +
              "section and checked for duplicate titles first."
          ),
      },
    },
    async ({
      title,
      section,
      body,
      tags,
      knowledgeType,
      existingMemoryTitlesChecked,
    }) => {
      if (!existingMemoryTitlesChecked) {
        return fail(
          "Refusing to create: you must first call list_memories for the " +
            "target section to check for duplicate titles, then set " +
            "existingMemoryTitlesChecked to true."
        );
      }
      if (section === "Skill Building" && !knowledgeType) {
        return fail(
          "Skill Building memories require a knowledgeType (one of: " +
            KNOWLEDGE_TYPES.join(", ") +
            ")."
        );
      }
      const payload: Record<string, unknown> = { title, section };
      if (body !== undefined) payload.body = body;
      if (tags !== undefined) payload.tags = tags;
      if (knowledgeType !== undefined) payload.knowledgeType = knowledgeType;

      const res = await api.post("/memories", payload);
      if (!res.ok) return apiError("Creating memory", res);
      return ok(`Created memory:\n${asJson(res.body)}`);
    }
  );

  server.registerTool(
    "update_note",
    {
      title: "Update a memory",
      description:
        "Update an existing memory. Only fields provided will be changed.",
      inputSchema: {
        id: z.string().describe("The ID of the memory to update."),
        title: z.string().optional().describe("Updated title."),
        body: z.string().optional().describe("Updated Markdown content."),
        tags: z
          .array(z.string())
          .optional()
          .describe("Replaces the entire tag list."),
      },
    },
    async ({ id, title, body, tags }) => {
      const payload: Record<string, unknown> = {};
      if (title !== undefined) payload.title = title;
      if (body !== undefined) payload.body = body;
      if (tags !== undefined) payload.tags = tags;

      if (Object.keys(payload).length === 0) {
        return fail("Provide at least one field to update (title, body, tags).");
      }

      const res = await api.put(
        `/memories/${encodeURIComponent(id)}`,
        payload
      );
      if (!res.ok) return apiError(`Updating memory ${id}`, res);
      return ok(`Updated memory:\n${asJson(res.body)}`);
    }
  );

  server.registerTool(
    "delete_note",
    {
      title: "Delete a memory",
      description:
        "Permanently delete a memory by its ID. You MUST first call get_note " +
        "to retrieve the memory, then provide the exact title in confirmTitle " +
        "to confirm deletion.",
      inputSchema: {
        id: z.string().describe("The ID of the memory to delete."),
        confirmTitle: z
          .string()
          .describe(
            "The exact current title of the memory, proving you retrieved it " +
              "with get_note first."
          ),
      },
    },
    async ({ id, confirmTitle }) => {
      // Verify the provided title matches the live memory before deleting.
      const current = await api.get(`/memories/${encodeURIComponent(id)}`);
      if (!current.ok) return apiError(`Getting memory ${id}`, current);

      const actualTitle =
        current.body && typeof current.body === "object"
          ? (current.body as { title?: unknown }).title
          : undefined;

      if (actualTitle !== confirmTitle) {
        return fail(
          `confirmTitle does not match. The memory's actual title is ` +
            `"${String(actualTitle)}". Call get_note first and pass the exact ` +
            "title to confirm deletion."
        );
      }

      const res = await api.delete(`/memories/${encodeURIComponent(id)}`);
      if (!res.ok) return apiError(`Deleting memory ${id}`, res);
      return ok(`Deleted memory ${id} ("${confirmTitle}").`);
    }
  );

  // ---------------------------------------------------------------------------
  // Search & linking
  // ---------------------------------------------------------------------------

  server.registerTool(
    "search_notes",
    {
      title: "Search memories",
      description:
        "Search across all memories using full-text and semantic search. " +
        "Returns matching memories ranked by relevance.",
      inputSchema: {
        query: z.string().describe("The search query."),
      },
    },
    async ({ query }) => {
      const res = await api.get(`/search${buildQuery({ q: query })}`);
      if (!res.ok) return apiError("Searching memories", res);
      return ok(withIndexHeaders(asJson(res.body), res));
    }
  );

  server.registerTool(
    "link_memories",
    {
      title: "Link two memories",
      description:
        "Link two memories together. You MUST provide a linkReason explaining " +
        "the relationship. The reason is logged but not stored on the memory " +
        "itself.",
      inputSchema: {
        sourceMemoryId: z.string().describe("ID of the source memory."),
        targetMemoryId: z.string().describe("ID of the target memory to link to."),
        linkReason: z
          .string()
          .describe("Why these memories should be linked. Required."),
      },
    },
    async ({ sourceMemoryId, targetMemoryId, linkReason }) => {
      if (!linkReason.trim()) {
        return fail("linkReason is required and must be non-empty.");
      }
      const res = await api.post(
        `/memories/${encodeURIComponent(sourceMemoryId)}/links`,
        { targetId: targetMemoryId }
      );
      if (!res.ok) return apiError("Linking memories", res);
      return ok(
        `Linked ${sourceMemoryId} -> ${targetMemoryId}.\n` +
          `Reason: ${linkReason}\n${asJson(res.body)}`
      );
    }
  );

  server.registerTool(
    "list_tags",
    {
      title: "List tags",
      description: "List all tags currently in use across all memories.",
      inputSchema: {},
    },
    async () => {
      const res = await api.get("/tags");
      if (!res.ok) return apiError("Listing tags", res);
      return ok(asJson(res.body));
    }
  );

  server.registerTool(
    "list_sections",
    {
      title: "List sections",
      description: "List all notebook sections with their display names.",
      inputSchema: {},
    },
    async () => {
      const res = await api.get("/sections");
      if (!res.ok) return apiError("Listing sections", res);
      return ok(asJson(res.body));
    }
  );

  server.registerTool(
    "get_skill_coverage",
    {
      title: "Get skill coverage",
      description:
        "Check knowledge coverage for a subject. Returns which of the 5 " +
        "knowledge types (fact, concept, process, procedure, principle) have " +
        "memories tagged with this subject. When all 5 are present, the skill " +
        "is considered transferable.",
      inputSchema: {
        subjectTag: z
          .string()
          .describe("The subject tag to check coverage for."),
      },
    },
    async ({ subjectTag }) => {
      const res = await api.get(
        `/skills/coverage${buildQuery({ tag: subjectTag })}`
      );
      if (!res.ok) return apiError("Getting skill coverage", res);
      return ok(asJson(res.body));
    }
  );

  // ---------------------------------------------------------------------------
  // Semantic index
  // ---------------------------------------------------------------------------

  server.registerTool(
    "check_semantic_index",
    {
      title: "Check semantic index",
      description:
        "Check the status of the semantic search index. Returns coverage " +
        "percentage, number of pending memories, and whether a rebuild is " +
        "needed. Use this BEFORE calling rebuild_semantic_index to verify a " +
        "rebuild is actually necessary.",
      inputSchema: {},
    },
    async () => {
      const res = await api.get("/semantic-index/status");
      if (!res.ok) return apiError("Checking semantic index", res);
      return ok(asJson(res.body));
    }
  );

  server.registerTool(
    "rebuild_semantic_index",
    {
      title: "Rebuild semantic index",
      description:
        "Queue a semantic index rebuild. This is idempotent — safe to call " +
        "even if a rebuild is already running. You MUST first call " +
        "check_semantic_index and set indexStatusChecked to true, confirming " +
        "the index actually needs rebuilding. The search API returns " +
        "X-Semantic-Index-Status headers that indicate when a rebuild is needed.",
      inputSchema: {
        indexStatusChecked: z
          .boolean()
          .describe(
            "MUST be true. Confirms you called check_semantic_index and the " +
              "index needs rebuilding."
          ),
      },
    },
    async ({ indexStatusChecked }) => {
      if (!indexStatusChecked) {
        return fail(
          "Refusing to rebuild: first call check_semantic_index, then set " +
            "indexStatusChecked to true if a rebuild is warranted."
        );
      }
      const res = await api.post("/semantic-index/rebuild");
      if (!res.ok) return apiError("Rebuilding semantic index", res);
      return ok(asJson(res.body));
    }
  );
}
