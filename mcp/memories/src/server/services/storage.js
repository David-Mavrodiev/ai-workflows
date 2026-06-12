import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { nanoid } from 'nanoid';
import { SECTIONS, sectionNameToFolderName, folderNameToSectionName, VALID_SECTION_NAMES, KNOWLEDGE_TYPES } from '../models/sections.js';

export function initStorage(storagePath) {
  // Create storage directory if it doesn't exist
  if (!fs.existsSync(storagePath)) {
    fs.mkdirSync(storagePath, { recursive: true });
  }

  // Git init if not already a git repo.
  // Skip when the storage path is already inside a git work tree (e.g. this
  // folder is tracked by a parent repo) so we don't create a nested repo that
  // breaks `git add` in the parent.
  const gitDir = path.join(storagePath, '.git');
  if (!fs.existsSync(gitDir)) {
    let insideExistingRepo = false;
    try {
      const out = execSync('git rev-parse --is-inside-work-tree', {
        cwd: storagePath,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      insideExistingRepo = out.toString().trim() === 'true';
    } catch {
      // Not a git repo (or git unavailable) — fine, we'll init below.
    }
    if (!insideExistingRepo) {
      try {
        execSync('git init', { cwd: storagePath, stdio: 'pipe' });
      } catch {
        // Git may not be available — continue without it
      }
    }
  }

  // Create section folders
  for (const section of SECTIONS) {
    const sectionDir = path.join(storagePath, section.id);
    if (!fs.existsSync(sectionDir)) {
      fs.mkdirSync(sectionDir, { recursive: true });
    }
  }

  return new StorageService(storagePath);
}

export class StorageService {
  constructor(storagePath) {
    this.storagePath = storagePath;
  }

  // --- Settings ---

  getSettings() {
    const settingsPath = path.join(this.storagePath, 'settings.json');
    if (fs.existsSync(settingsPath)) {
      return JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    }
    return {
      storagePath: this.storagePath,
      theme: 'light',
      activeModel: null,
      semanticSearchEnabled: false,
    };
  }

  saveSettings(settings) {
    const settingsPath = path.join(this.storagePath, 'settings.json');
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
    return settings;
  }

  // --- Memory CRUD ---

  createMemory({ title, section, body, tags, knowledgeType }) {
    const id = nanoid(10);
    const now = new Date().toISOString();
    const folderName = sectionNameToFolderName(section);
    if (!folderName) throw new Error(`Invalid section: ${section}`);

    const memoryDir = path.join(this.storagePath, folderName, id);
    fs.mkdirSync(memoryDir, { recursive: true });

    const meta = {
      id,
      title,
      section,
      tags: tags || [],
      links: [],
      knowledgeType: section === 'Skill Building' ? knowledgeType : null,
      createdAt: now,
      updatedAt: now,
    };

    fs.writeFileSync(path.join(memoryDir, 'meta.json'), JSON.stringify(meta, null, 2), 'utf-8');
    fs.writeFileSync(path.join(memoryDir, 'memory.md'), body || '', 'utf-8');

    return { ...meta, body: body || '' };
  }

  getMemory(id) {
    const memoryDir = this._findMemoryDir(id);
    if (!memoryDir) return null;

    const meta = JSON.parse(fs.readFileSync(path.join(memoryDir, 'meta.json'), 'utf-8'));
    const body = fs.readFileSync(path.join(memoryDir, 'memory.md'), 'utf-8');
    return { ...meta, body };
  }

  listMemories({ section, tag } = {}) {
    const memories = [];

    for (const sec of SECTIONS) {
      if (section && sec.name !== section) continue;

      const sectionDir = path.join(this.storagePath, sec.id);
      if (!fs.existsSync(sectionDir)) continue;

      const entries = fs.readdirSync(sectionDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const metaPath = path.join(sectionDir, entry.name, 'meta.json');
        if (!fs.existsSync(metaPath)) continue;

        const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
        if (tag && !meta.tags.includes(tag)) continue;

        // List responses exclude body
        memories.push({
          id: meta.id,
          title: meta.title,
          section: meta.section,
          tags: meta.tags,
          knowledgeType: meta.knowledgeType,
          createdAt: meta.createdAt,
          updatedAt: meta.updatedAt,
        });
      }
    }

    return memories;
  }

  updateMemory(id, updates) {
    const memoryDir = this._findMemoryDir(id);
    if (!memoryDir) return null;

    const metaPath = path.join(memoryDir, 'meta.json');
    const bodyPath = path.join(memoryDir, 'memory.md');
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
    const oldSection = meta.section;

    if (updates.title !== undefined) meta.title = updates.title;
    if (updates.tags !== undefined) meta.tags = updates.tags;
    if (updates.knowledgeType !== undefined) meta.knowledgeType = updates.knowledgeType;

    // Handle section move
    if (updates.section !== undefined && updates.section !== oldSection) {
      const newFolderName = sectionNameToFolderName(updates.section);
      if (!newFolderName) throw new Error(`Invalid section: ${updates.section}`);

      meta.section = updates.section;

      // If moving to Skill Building, knowledgeType must be provided
      if (updates.section === 'Skill Building' && !updates.knowledgeType && !meta.knowledgeType) {
        throw new Error('knowledgeType is required when moving to Skill Building');
      }

      // If moving out of Skill Building, clear knowledgeType
      if (oldSection === 'Skill Building' && updates.section !== 'Skill Building') {
        meta.knowledgeType = null;
      }

      // Move directory
      const newSectionDir = path.join(this.storagePath, newFolderName);
      const newMemoryDir = path.join(newSectionDir, id);
      if (!fs.existsSync(newSectionDir)) {
        fs.mkdirSync(newSectionDir, { recursive: true });
      }
      fs.renameSync(memoryDir, newMemoryDir);

      // Update paths for writing
      meta.updatedAt = new Date().toISOString();
      fs.writeFileSync(path.join(newMemoryDir, 'meta.json'), JSON.stringify(meta, null, 2), 'utf-8');

      if (updates.body !== undefined) {
        fs.writeFileSync(path.join(newMemoryDir, 'memory.md'), updates.body, 'utf-8');
      }

      const body = fs.readFileSync(path.join(newMemoryDir, 'memory.md'), 'utf-8');
      return { ...meta, body };
    }

    meta.updatedAt = new Date().toISOString();
    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf-8');

    if (updates.body !== undefined) {
      fs.writeFileSync(bodyPath, updates.body, 'utf-8');
    }

    const body = fs.readFileSync(bodyPath, 'utf-8');
    return { ...meta, body };
  }

  deleteMemory(id) {
    const memoryDir = this._findMemoryDir(id);
    if (!memoryDir) return false;

    fs.rmSync(memoryDir, { recursive: true, force: true });

    // Clean up links in other memories
    this._removeLinksTo(id);

    return true;
  }

  bulkDelete(ids) {
    let deleted = 0;
    const deletedIds = [];

    for (const id of ids) {
      if (this.deleteMemory(id)) {
        deleted++;
        deletedIds.push(id);
      }
    }

    return { deleted, ids: deletedIds };
  }

  // --- Links ---

  addLink(sourceId, targetId) {
    if (sourceId === targetId) {
      throw new Error('Cannot link a memory to itself');
    }

    const sourceDir = this._findMemoryDir(sourceId);
    const targetDir = this._findMemoryDir(targetId);

    if (!sourceDir) throw new Error(`Source memory not found: ${sourceId}`);
    if (!targetDir) throw new Error(`Target memory not found: ${targetId}`);

    const sourceMeta = JSON.parse(fs.readFileSync(path.join(sourceDir, 'meta.json'), 'utf-8'));
    const targetMeta = JSON.parse(fs.readFileSync(path.join(targetDir, 'meta.json'), 'utf-8'));

    if (sourceMeta.links.includes(targetId)) {
      throw new Error('Link already exists');
    }

    // Add bidirectional link
    sourceMeta.links.push(targetId);
    if (!targetMeta.links.includes(sourceId)) {
      targetMeta.links.push(sourceId);
    }

    fs.writeFileSync(path.join(sourceDir, 'meta.json'), JSON.stringify(sourceMeta, null, 2), 'utf-8');
    fs.writeFileSync(path.join(targetDir, 'meta.json'), JSON.stringify(targetMeta, null, 2), 'utf-8');

    return {
      source: sourceId,
      target: targetId,
      createdAt: new Date().toISOString(),
    };
  }

  getLinks(memoryId) {
    const memoryDir = this._findMemoryDir(memoryId);
    if (!memoryDir) return null;

    const meta = JSON.parse(fs.readFileSync(path.join(memoryDir, 'meta.json'), 'utf-8'));
    const links = [];

    // Explicit links
    for (const linkedId of meta.links) {
      const linkedDir = this._findMemoryDir(linkedId);
      if (!linkedDir) continue;
      const linkedMeta = JSON.parse(fs.readFileSync(path.join(linkedDir, 'meta.json'), 'utf-8'));
      links.push({
        id: linkedMeta.id,
        title: linkedMeta.title,
        section: linkedMeta.section,
        linkType: 'explicit',
      });
    }

    // Auto-links from shared tags
    if (meta.tags.length > 0) {
      const allMemories = this.listMemories();
      for (const other of allMemories) {
        if (other.id === memoryId) continue;
        if (meta.links.includes(other.id)) continue; // already explicit

        const sharedTags = meta.tags.filter(t => other.tags.includes(t));
        if (sharedTags.length > 0) {
          links.push({
            id: other.id,
            title: other.title,
            section: other.section,
            linkType: 'auto',
            sharedTags,
          });
        }
      }
    }

    return { memoryId, links };
  }

  deleteLink(sourceId, targetId) {
    const sourceDir = this._findMemoryDir(sourceId);
    const targetDir = this._findMemoryDir(targetId);

    if (!sourceDir || !targetDir) return false;

    const sourceMeta = JSON.parse(fs.readFileSync(path.join(sourceDir, 'meta.json'), 'utf-8'));
    const targetMeta = JSON.parse(fs.readFileSync(path.join(targetDir, 'meta.json'), 'utf-8'));

    const sourceIdx = sourceMeta.links.indexOf(targetId);
    const targetIdx = targetMeta.links.indexOf(sourceId);

    if (sourceIdx === -1 && targetIdx === -1) return false;

    if (sourceIdx !== -1) sourceMeta.links.splice(sourceIdx, 1);
    if (targetIdx !== -1) targetMeta.links.splice(targetIdx, 1);

    fs.writeFileSync(path.join(sourceDir, 'meta.json'), JSON.stringify(sourceMeta, null, 2), 'utf-8');
    fs.writeFileSync(path.join(targetDir, 'meta.json'), JSON.stringify(targetMeta, null, 2), 'utf-8');

    return true;
  }

  // Check if a link is explicit (stored) vs auto (derived from tags)
  isExplicitLink(sourceId, targetId) {
    const sourceDir = this._findMemoryDir(sourceId);
    if (!sourceDir) return false;
    const sourceMeta = JSON.parse(fs.readFileSync(path.join(sourceDir, 'meta.json'), 'utf-8'));
    return sourceMeta.links.includes(targetId);
  }

  // --- Network ---

  getNetwork() {
    const allMemories = this.listMemories();
    const sectionMap = {};
    for (const s of SECTIONS) {
      sectionMap[s.name] = s;
    }

    const nodes = allMemories.map(m => ({
      id: m.id,
      title: m.title,
      section: sectionMap[m.section]?.id || m.section,
      color: sectionMap[m.section]?.color || '#888',
    }));

    const edges = [];
    const edgeSet = new Set();

    // Explicit links
    for (const m of allMemories) {
      const memDir = this._findMemoryDir(m.id);
      if (!memDir) continue;
      const meta = JSON.parse(fs.readFileSync(path.join(memDir, 'meta.json'), 'utf-8'));
      for (const linkedId of meta.links) {
        const key = [m.id, linkedId].sort().join('->');
        if (!edgeSet.has(key)) {
          edgeSet.add(key);
          edges.push({ source: m.id, target: linkedId, type: 'explicit' });
        }
      }
    }

    // Auto-links from shared tags
    for (let i = 0; i < allMemories.length; i++) {
      for (let j = i + 1; j < allMemories.length; j++) {
        const a = allMemories[i];
        const b = allMemories[j];
        const sharedTags = a.tags.filter(t => b.tags.includes(t));
        if (sharedTags.length > 0) {
          const key = [a.id, b.id].sort().join('->');
          if (!edgeSet.has(key)) {
            edgeSet.add(key);
            edges.push({ source: a.id, target: b.id, type: 'auto', sharedTags });
          }
        }
      }
    }

    return { nodes, edges };
  }

  // --- Skills ---

  getSkillCoverage(tag) {
    const memories = this.listMemories({ section: 'Skill Building', tag });
    const coverage = {};
    for (const kt of KNOWLEDGE_TYPES) {
      const matching = memories.filter(m => m.knowledgeType === kt);
      coverage[kt] = { covered: matching.length > 0, memoryCount: matching.length };
    }
    const coveredCount = KNOWLEDGE_TYPES.filter(kt => coverage[kt].covered).length;
    return {
      tag,
      coverage,
      coveredCount,
      totalTypes: KNOWLEDGE_TYPES.length,
      skillTransferable: coveredCount === KNOWLEDGE_TYPES.length,
    };
  }

  // --- Tags ---

  getAllTags() {
    const tagCounts = {};
    const allMemories = this.listMemories();
    for (const m of allMemories) {
      for (const tag of m.tags) {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      }
    }
    return Object.entries(tagCounts).map(([name, count]) => ({ name, count }));
  }

  // --- Helpers ---

  _findMemoryDir(id) {
    for (const section of SECTIONS) {
      const dir = path.join(this.storagePath, section.id, id);
      if (fs.existsSync(dir) && fs.existsSync(path.join(dir, 'meta.json'))) {
        return dir;
      }
    }
    return null;
  }

  _removeLinksTo(deletedId) {
    for (const section of SECTIONS) {
      const sectionDir = path.join(this.storagePath, section.id);
      if (!fs.existsSync(sectionDir)) continue;

      const entries = fs.readdirSync(sectionDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const metaPath = path.join(sectionDir, entry.name, 'meta.json');
        if (!fs.existsSync(metaPath)) continue;

        const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
        const idx = meta.links.indexOf(deletedId);
        if (idx !== -1) {
          meta.links.splice(idx, 1);
          fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf-8');
        }
      }
    }
  }

  isEmpty() {
    for (const section of SECTIONS) {
      const sectionDir = path.join(this.storagePath, section.id);
      if (!fs.existsSync(sectionDir)) continue;
      const entries = fs.readdirSync(sectionDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && fs.existsSync(path.join(sectionDir, entry.name, 'meta.json'))) {
          return false;
        }
      }
    }
    return true;
  }
}
