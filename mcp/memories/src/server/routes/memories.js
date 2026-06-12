import { Router } from 'express';
import { VALID_SECTION_NAMES, KNOWLEDGE_TYPES } from '../models/sections.js';

export function createMemoriesRouter(storage) {
  const router = Router();

  // List memories
  router.get('/', (req, res) => {
    try {
      const { section, tag } = req.query;
      if (section && !VALID_SECTION_NAMES.includes(section)) {
        return res.status(400).json({ error: 'Invalid section', valid: VALID_SECTION_NAMES });
      }
      const memories = storage.listMemories({ section, tag });
      res.json({ memories, count: memories.length });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Bulk delete
  router.post('/bulk-delete', (req, res) => {
    try {
      const { ids } = req.body;
      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: 'ids is required and must be a non-empty array' });
      }
      const result = storage.bulkDelete(ids);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Get single memory
  router.get('/:id', (req, res) => {
    try {
      const memory = storage.getMemory(req.params.id);
      if (!memory) {
        return res.status(404).json({ error: 'Memory not found', id: req.params.id });
      }
      res.json(memory);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Create memory
  router.post('/', (req, res) => {
    try {
      const { title, section, body, tags, knowledgeType } = req.body;

      if (!title) {
        return res.status(400).json({ error: 'title is required' });
      }
      if (!section) {
        return res.status(400).json({ error: 'section is required' });
      }
      if (!VALID_SECTION_NAMES.includes(section)) {
        return res.status(400).json({ error: 'Invalid section', valid: VALID_SECTION_NAMES });
      }
      if (section === 'Skill Building' && !knowledgeType) {
        return res.status(400).json({ error: 'knowledgeType is required for Skill Building memories' });
      }
      if (knowledgeType && !KNOWLEDGE_TYPES.includes(knowledgeType)) {
        return res.status(400).json({ error: 'Invalid knowledgeType', valid: KNOWLEDGE_TYPES });
      }

      const memory = storage.createMemory({ title, section, body, tags, knowledgeType });
      res.status(201).json(memory);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // Update memory
  router.put('/:id', (req, res) => {
    try {
      const existing = storage.getMemory(req.params.id);
      if (!existing) {
        return res.status(404).json({ error: 'Memory not found', id: req.params.id });
      }

      const { title, body, section, tags, knowledgeType } = req.body;

      if (section !== undefined && !VALID_SECTION_NAMES.includes(section)) {
        return res.status(400).json({ error: 'Invalid section', valid: VALID_SECTION_NAMES });
      }

      // Moving to Skill Building requires knowledgeType
      if (section === 'Skill Building' && existing.section !== 'Skill Building' && !knowledgeType) {
        return res.status(400).json({ error: 'knowledgeType is required when moving to Skill Building' });
      }

      const updates = {};
      if (title !== undefined) updates.title = title;
      if (body !== undefined) updates.body = body;
      if (section !== undefined) updates.section = section;
      if (tags !== undefined) updates.tags = tags;
      if (knowledgeType !== undefined) updates.knowledgeType = knowledgeType;

      const updated = storage.updateMemory(req.params.id, updates);
      res.json(updated);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // Delete memory
  router.delete('/:id', (req, res) => {
    try {
      const deleted = storage.deleteMemory(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: 'Memory not found', id: req.params.id });
      }
      res.status(204).send();
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Add link
  router.post('/:id/links', (req, res) => {
    try {
      const { targetId } = req.body;
      if (!targetId) {
        return res.status(400).json({ error: 'targetId is required' });
      }

      const result = storage.addLink(req.params.id, targetId);
      res.status(201).json(result);
    } catch (err) {
      if (err.message === 'Cannot link a memory to itself') {
        return res.status(400).json({ error: err.message });
      }
      if (err.message === 'Link already exists') {
        return res.status(409).json({ error: err.message });
      }
      if (err.message.includes('not found')) {
        return res.status(404).json({ error: err.message });
      }
      res.status(500).json({ error: err.message });
    }
  });

  // Get links
  router.get('/:id/links', (req, res) => {
    try {
      const result = storage.getLinks(req.params.id);
      if (!result) {
        return res.status(404).json({ error: 'Memory not found', id: req.params.id });
      }
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Delete link
  router.delete('/:id/links/:targetId', (req, res) => {
    try {
      const { id, targetId } = req.params;

      // Check if it's an auto-link (not explicit)
      if (!storage.isExplicitLink(id, targetId) && !storage.isExplicitLink(targetId, id)) {
        return res.status(400).json({ error: 'Cannot delete auto-links (they are derived from tags)' });
      }

      const deleted = storage.deleteLink(id, targetId);
      if (!deleted) {
        return res.status(404).json({ error: 'Link not found' });
      }
      res.status(204).send();
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
