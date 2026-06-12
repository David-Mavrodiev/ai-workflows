/**
 * Brain-mcp-backed storage for specs.
 *
 * Replaces the file-backed SpecStore. Each spec is stored as multiple linked
 * notes in the "Tasks & Specs" section of brain-mcp:
 *   - 1 metadata note (body = JSON of SpecMetadata)
 *   - up to 4 doc notes (body = Markdown content)
 *
 * Notes are identified by tags:
 *   - spec-id:<guid>   — groups all notes belonging to one spec
 *   - doc-type:metadata | spec | plan | implementation | validation
 *   - spec             — marks this as a spec
 */
import { randomUUID } from "node:crypto";
import { MemoriesApiClient, buildQuery } from "./api.js";
import {
  DOCS,
  defaultGates,
  type DocName,
  type SpecMetadata,
} from "./types.js";
import { log } from "./logger.js";

const SECTION = "Tasks & Specs";
const KIND_TAG = "spec";

interface MemoryNote {
  id: string;
  title: string;
  section: string;
  tags: string[];
  body?: string;
  links?: string[];
  createdAt: string;
  updatedAt: string;
}

interface ListResponse {
  memories: MemoryNote[];
  count: number;
}

export class BrainMcpStore {
  constructor(private readonly api: MemoriesApiClient) {}

  /** Verify the Memories API is reachable. */
  async healthCheck(): Promise<void> {
    const res = await this.api.get("/sections");
    if (!res.ok) {
      throw new Error(
        `brain-mcp health check failed (HTTP ${res.status}). ` +
          "Is the Memories app running on port 3466?"
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  private specIdTag(id: string): string {
    return `spec-id:${id}`;
  }

  private docTypeTag(docType: string): string {
    return `doc-type:${docType}`;
  }

  /** Find all brain-mcp notes belonging to a spec. */
  private async findNotesBySpecId(specId: string): Promise<MemoryNote[]> {
    const res = await this.api.get(
      `/memories${buildQuery({ section: SECTION, tag: this.specIdTag(specId) })}`
    );
    if (!res.ok) {
      throw new Error(`Failed to query notes for spec ${specId}: HTTP ${res.status}`);
    }
    return (res.body as ListResponse).memories ?? [];
  }

  /** Find a single note by spec ID + doc type. */
  private async findNote(
    specId: string,
    docType: string
  ): Promise<MemoryNote | null> {
    const notes = await this.findNotesBySpecId(specId);
    const tag = this.docTypeTag(docType);
    return notes.find((n) => n.tags.includes(tag)) ?? null;
  }

  /** Fetch a note's full content (including body) by its brain-mcp ID. */
  private async getFullNote(noteId: string): Promise<MemoryNote> {
    const res = await this.api.get(`/memories/${encodeURIComponent(noteId)}`);
    if (!res.ok) {
      throw new Error(`Failed to get note ${noteId}: HTTP ${res.status}`);
    }
    return res.body as MemoryNote;
  }

  /** Create a note in brain-mcp. */
  private async createNote(
    title: string,
    body: string,
    tags: string[]
  ): Promise<MemoryNote> {
    const res = await this.api.post("/memories", {
      title,
      section: SECTION,
      body,
      tags,
    });
    if (!res.ok) {
      throw new Error(`Failed to create note "${title}": HTTP ${res.status}`);
    }
    return res.body as MemoryNote;
  }

  /** Update a note's body and/or tags. */
  private async updateNote(
    noteId: string,
    patch: { title?: string; body?: string; tags?: string[] }
  ): Promise<MemoryNote> {
    const res = await this.api.put(
      `/memories/${encodeURIComponent(noteId)}`,
      patch
    );
    if (!res.ok) {
      throw new Error(`Failed to update note ${noteId}: HTTP ${res.status}`);
    }
    return res.body as MemoryNote;
  }

  /** Link two notes together. */
  private async linkNotes(sourceId: string, targetId: string): Promise<void> {
    const res = await this.api.post(
      `/memories/${encodeURIComponent(sourceId)}/links`,
      { targetId }
    );
    // 409 = link already exists, which is fine
    if (!res.ok && res.status !== 409) {
      log(`Warning: failed to link ${sourceId} → ${targetId}: HTTP ${res.status}`);
    }
  }

  /** Delete a note by its brain-mcp ID. */
  private async deleteNote(noteId: string): Promise<void> {
    const res = await this.api.delete(
      `/memories/${encodeURIComponent(noteId)}`
    );
    if (!res.ok && res.status !== 404) {
      log(`Warning: failed to delete note ${noteId}: HTTP ${res.status}`);
    }
  }

  /** Parse a metadata note's body back into SpecMetadata. */
  private parseMetadata(note: MemoryNote): SpecMetadata {
    if (!note.body) {
      throw new Error(`Metadata note ${note.id} has no body.`);
    }
    return JSON.parse(note.body) as SpecMetadata;
  }

  // ---------------------------------------------------------------------------
  // Public API (mirrors SpecStore)
  // ---------------------------------------------------------------------------

  /** Check if a spec exists. */
  async exists(id: string): Promise<boolean> {
    const note = await this.findNote(id, "metadata");
    return note !== null;
  }

  /** List all specs (newest updated first). */
  async list(): Promise<SpecMetadata[]> {
    const res = await this.api.get(
      `/memories${buildQuery({ section: SECTION, tag: KIND_TAG })}`
    );
    if (!res.ok) {
      throw new Error(`Failed to list specs: HTTP ${res.status}`);
    }
    const notes = (res.body as ListResponse).memories ?? [];
    const metaNotes = notes.filter((n) =>
      n.tags.includes(this.docTypeTag("metadata"))
    );

    const out: SpecMetadata[] = [];
    for (const note of metaNotes) {
      try {
        const full = await this.getFullNote(note.id);
        out.push(this.parseMetadata(full));
      } catch {
        // Skip unreadable metadata
      }
    }
    out.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
    return out;
  }

  /** Get a spec's metadata. */
  async getMetadata(id: string): Promise<SpecMetadata> {
    const note = await this.findNote(id, "metadata");
    if (!note) throw new Error(`No spec with id "${id}".`);
    const full = await this.getFullNote(note.id);
    return this.parseMetadata(full);
  }

  /** Create a new spec with a fresh GUID and seeded metadata. */
  async create(
    title: string,
    specContent?: string,
    tags?: string[]
  ): Promise<SpecMetadata> {
    const id = randomUUID();
    const now = new Date().toISOString();
    const meta: SpecMetadata = {
      id,
      title,
      state: "draft",
      phase: "requirement",
      gates: defaultGates(),
      tags: tags ?? [],
      branch: null,
      pullRequest: null,
      notes: "",
      createdAt: now,
      updatedAt: now,
    };

    const metaTags = [
      KIND_TAG,
      this.docTypeTag("metadata"),
      this.specIdTag(id),
      ...(tags ?? []),
    ];

    const metaNote = await this.createNote(
      title,
      JSON.stringify(meta, null, 2),
      metaTags
    );

    // Create spec.md doc note if content provided
    if (specContent) {
      const docNote = await this.createNote(
        `${title} — spec`,
        specContent,
        [KIND_TAG, this.docTypeTag("spec"), this.specIdTag(id)]
      );
      await this.linkNotes(metaNote.id, docNote.id);
    } else {
      const docNote = await this.createNote(
        `${title} — spec`,
        `# ${title}\n\n> TODO: spec not yet written.\n`,
        [KIND_TAG, this.docTypeTag("spec"), this.specIdTag(id)]
      );
      await this.linkNotes(metaNote.id, docNote.id);
    }

    return meta;
  }

  /** Read a phase doc's content. */
  async readDoc(id: string, doc: DocName): Promise<string | null> {
    if (!(await this.exists(id))) throw new Error(`No spec with id "${id}".`);
    const note = await this.findNote(id, doc);
    if (!note) return null;
    const full = await this.getFullNote(note.id);
    return full.body ?? null;
  }

  /** Write (create or update) a phase doc. */
  async writeDoc(id: string, doc: DocName, content: string): Promise<void> {
    if (!(await this.exists(id))) throw new Error(`No spec with id "${id}".`);

    const existing = await this.findNote(id, doc);
    if (existing) {
      await this.updateNote(existing.id, { body: content });
    } else {
      const meta = await this.getMetadata(id);
      const docNote = await this.createNote(
        `${meta.title} — ${doc}`,
        content,
        [KIND_TAG, this.docTypeTag(doc), this.specIdTag(id)]
      );
      // Link to metadata note
      const metaNote = await this.findNote(id, "metadata");
      if (metaNote) {
        await this.linkNotes(metaNote.id, docNote.id);
      }
    }
    // Touch metadata updatedAt
    await this.touchUpdatedAt(id);
  }

  /** List which docs exist for a spec. */
  async presentDocs(id: string): Promise<DocName[]> {
    const notes = await this.findNotesBySpecId(id);
    const docNames = Object.keys(DOCS) as DocName[];
    return docNames.filter((d) =>
      notes.some((n) => n.tags.includes(this.docTypeTag(d)))
    );
  }

  /** Patch metadata fields and bump updatedAt. */
  async updateMetadata(
    id: string,
    patch: Partial<Omit<SpecMetadata, "id" | "createdAt">>
  ): Promise<SpecMetadata> {
    const note = await this.findNote(id, "metadata");
    if (!note) throw new Error(`No spec with id "${id}".`);

    const full = await this.getFullNote(note.id);
    const meta = this.parseMetadata(full);

    const next: SpecMetadata = {
      ...meta,
      ...patch,
      gates: patch.gates ? { ...meta.gates, ...patch.gates } : meta.gates,
      id: meta.id,
      createdAt: meta.createdAt,
      updatedAt: new Date().toISOString(),
    };

    // Update the note body with new metadata JSON
    const updatedTags = [
      KIND_TAG,
      this.docTypeTag("metadata"),
      this.specIdTag(id),
      ...(next.tags ?? []),
    ];

    await this.updateNote(note.id, {
      title: next.title,
      body: JSON.stringify(next, null, 2),
      tags: updatedTags,
    });

    return next;
  }

  /** Permanently delete a spec and all its notes. */
  async delete(id: string): Promise<void> {
    const notes = await this.findNotesBySpecId(id);
    if (notes.length === 0) throw new Error(`No spec with id "${id}".`);
    for (const note of notes) {
      await this.deleteNote(note.id);
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async touchUpdatedAt(id: string): Promise<void> {
    const note = await this.findNote(id, "metadata");
    if (!note) return;
    const full = await this.getFullNote(note.id);
    const meta = this.parseMetadata(full);
    meta.updatedAt = new Date().toISOString();
    await this.updateNote(note.id, {
      body: JSON.stringify(meta, null, 2),
    });
  }
}
