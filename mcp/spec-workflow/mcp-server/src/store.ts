/**
 * File-backed storage for specs.
 *
 * Layout (base dir resolved from SPECS_DIR / --specs-dir, default ~/specs):
 *   <base>/<guid>/metadata.json
 *   <base>/<guid>/spec.md
 *   <base>/<guid>/plan.md
 *   <base>/<guid>/implementation.md
 *   <base>/<guid>/validation.md
 */
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  DOCS,
  defaultGates,
  type DocName,
  type SpecMetadata,
} from "./types.js";

/** Expand a leading ~ to the user's home directory. */
function expandHome(p: string): string {
  if (p === "~") return os.homedir();
  if (p.startsWith("~/") || p.startsWith("~\\")) {
    return path.join(os.homedir(), p.slice(2));
  }
  return p;
}

export class SpecStore {
  readonly baseDir: string;

  constructor(baseDir: string) {
    this.baseDir = path.resolve(expandHome(baseDir));
  }

  /** Ensure the base directory exists. */
  ensureBase(): void {
    fs.mkdirSync(this.baseDir, { recursive: true });
  }

  specDir(id: string): string {
    return path.join(this.baseDir, id);
  }

  private metadataPath(id: string): string {
    return path.join(this.specDir(id), "metadata.json");
  }

  private docPath(id: string, doc: DocName): string {
    return path.join(this.specDir(id), DOCS[doc]);
  }

  exists(id: string): boolean {
    return fs.existsSync(this.metadataPath(id));
  }

  /** List all specs (newest updated first). */
  list(): SpecMetadata[] {
    this.ensureBase();
    const entries = fs
      .readdirSync(this.baseDir, { withFileTypes: true })
      .filter((e) => e.isDirectory());
    const out: SpecMetadata[] = [];
    for (const e of entries) {
      const metaPath = path.join(this.baseDir, e.name, "metadata.json");
      if (!fs.existsSync(metaPath)) continue;
      try {
        out.push(JSON.parse(fs.readFileSync(metaPath, "utf-8")) as SpecMetadata);
      } catch {
        // Skip unreadable/corrupt metadata rather than failing the whole list.
      }
    }
    out.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
    return out;
  }

  getMetadata(id: string): SpecMetadata {
    const p = this.metadataPath(id);
    if (!fs.existsSync(p)) throw new Error(`No spec with id "${id}".`);
    return JSON.parse(fs.readFileSync(p, "utf-8")) as SpecMetadata;
  }

  private writeMetadata(meta: SpecMetadata): void {
    fs.writeFileSync(
      this.metadataPath(meta.id),
      JSON.stringify(meta, null, 2) + "\n",
      "utf-8"
    );
  }

  /** Create a new spec folder with a fresh GUID and seeded metadata. */
  create(title: string, specContent?: string, tags?: string[]): SpecMetadata {
    this.ensureBase();
    const id = randomUUID();
    const dir = this.specDir(id);
    fs.mkdirSync(dir, { recursive: true });
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
    this.writeMetadata(meta);
    fs.writeFileSync(
      this.docPath(id, "spec"),
      specContent ?? `# ${title}\n\n> TODO: spec not yet written.\n`,
      "utf-8"
    );
    return meta;
  }

  readDoc(id: string, doc: DocName): string | null {
    if (!this.exists(id)) throw new Error(`No spec with id "${id}".`);
    const p = this.docPath(id, doc);
    return fs.existsSync(p) ? fs.readFileSync(p, "utf-8") : null;
  }

  writeDoc(id: string, doc: DocName, content: string): void {
    if (!this.exists(id)) throw new Error(`No spec with id "${id}".`);
    fs.writeFileSync(this.docPath(id, doc), content, "utf-8");
    this.touch(id);
  }

  /** List which docs exist for a spec. */
  presentDocs(id: string): DocName[] {
    return (Object.keys(DOCS) as DocName[]).filter((d) =>
      fs.existsSync(this.docPath(id, d))
    );
  }

  /** Patch metadata fields and bump updatedAt. */
  updateMetadata(
    id: string,
    patch: Partial<Omit<SpecMetadata, "id" | "createdAt">>
  ): SpecMetadata {
    const meta = this.getMetadata(id);
    const next: SpecMetadata = {
      ...meta,
      ...patch,
      gates: patch.gates ? { ...meta.gates, ...patch.gates } : meta.gates,
      id: meta.id,
      createdAt: meta.createdAt,
      updatedAt: new Date().toISOString(),
    };
    this.writeMetadata(next);
    return next;
  }

  private touch(id: string): void {
    const meta = this.getMetadata(id);
    meta.updatedAt = new Date().toISOString();
    this.writeMetadata(meta);
  }

  /** Permanently delete a spec folder. */
  delete(id: string): void {
    if (!this.exists(id)) throw new Error(`No spec with id "${id}".`);
    fs.rmSync(this.specDir(id), { recursive: true, force: true });
  }
}
