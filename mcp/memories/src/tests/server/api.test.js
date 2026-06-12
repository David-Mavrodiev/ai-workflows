import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { createApp } from '../../server/app.js';

function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'memories-test-'));
}

function cleanupDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

describe('Memories API', () => {
  let app;
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempDir();
    app = createApp(tmpDir);
  });

  afterEach(() => {
    cleanupDir(tmpDir);
  });

  describe('GET /api/sections', () => {
    it('returns all 8 sections with id, name, and color', async () => {
      const res = await request(app).get('/api/sections');
      expect(res.status).toBe(200);
      expect(res.body.sections).toHaveLength(8);
      expect(res.body.sections[0]).toHaveProperty('id');
      expect(res.body.sections[0]).toHaveProperty('name');
      expect(res.body.sections[0]).toHaveProperty('color');
    });
  });

  describe('POST /api/memories', () => {
    it('creates a memory with all required fields', async () => {
      const res = await request(app)
        .post('/api/memories')
        .send({ title: 'Test Memory', section: 'Ideas', body: 'Hello world' });
      expect(res.status).toBe(201);
      expect(res.body.id).toBeDefined();
      expect(res.body.title).toBe('Test Memory');
      expect(res.body.section).toBe('Ideas');
      expect(res.body.body).toBe('Hello world');
      expect(res.body.createdAt).toBeDefined();
      expect(res.body.updatedAt).toBeDefined();
    });

    it('returns 400 for missing title', async () => {
      const res = await request(app)
        .post('/api/memories')
        .send({ section: 'Ideas' });
      expect(res.status).toBe(400);
    });

    it('returns 400 for invalid section', async () => {
      const res = await request(app)
        .post('/api/memories')
        .send({ title: 'Test', section: 'InvalidSection' });
      expect(res.status).toBe(400);
    });

    it('requires knowledgeType for Skill Building memories', async () => {
      const res = await request(app)
        .post('/api/memories')
        .send({ title: 'Test', section: 'Skill Building' });
      expect(res.status).toBe(400);
    });

    it('creates Skill Building memory with knowledgeType', async () => {
      const res = await request(app)
        .post('/api/memories')
        .send({ title: 'Test', section: 'Skill Building', knowledgeType: 'fact' });
      expect(res.status).toBe(201);
      expect(res.body.knowledgeType).toBe('fact');
    });
  });

  describe('GET /api/memories', () => {
    it('lists memories without body field', async () => {
      await request(app)
        .post('/api/memories')
        .send({ title: 'My Memory', section: 'Ideas', body: 'secret content' });
      const res = await request(app).get('/api/memories?section=Ideas');
      expect(res.status).toBe(200);
      const ideaMemories = res.body.memories.filter(m => m.title === 'My Memory');
      expect(ideaMemories.length).toBeGreaterThanOrEqual(1);
      expect(ideaMemories[0].body).toBeUndefined();
    });

    it('filters by section', async () => {
      await request(app).post('/api/memories').send({ title: 'A', section: 'Ideas' });
      await request(app).post('/api/memories').send({ title: 'B', section: 'Work Memories' });
      const res = await request(app).get('/api/memories?section=Work Memories');
      expect(res.body.memories.every(m => m.section === 'Work Memories')).toBe(true);
    });

    it('filters by tag', async () => {
      await request(app).post('/api/memories').send({ title: 'Tagged', section: 'Ideas', tags: ['test-tag'] });
      const res = await request(app).get('/api/memories?tag=test-tag');
      expect(res.body.memories.some(m => m.tags.includes('test-tag'))).toBe(true);
    });
  });

  describe('GET /api/memories/:id', () => {
    it('returns full memory with body', async () => {
      const created = await request(app)
        .post('/api/memories')
        .send({ title: 'Full', section: 'Ideas', body: 'Full body here' });
      const res = await request(app).get(`/api/memories/${created.body.id}`);
      expect(res.status).toBe(200);
      expect(res.body.body).toBe('Full body here');
    });

    it('returns 404 for missing memory', async () => {
      const res = await request(app).get('/api/memories/nonexistent');
      expect(res.status).toBe(404);
    });
  });

  describe('PUT /api/memories/:id', () => {
    it('partially updates a memory', async () => {
      const created = await request(app)
        .post('/api/memories')
        .send({ title: 'Original', section: 'Ideas', body: 'Original body', tags: ['keep'] });
      const res = await request(app)
        .put(`/api/memories/${created.body.id}`)
        .send({ title: 'Updated' });
      expect(res.status).toBe(200);
      expect(res.body.title).toBe('Updated');
      expect(res.body.body).toBe('Original body');
      expect(res.body.tags).toEqual(['keep']);
    });

    it('updates updatedAt timestamp', async () => {
      const created = await request(app)
        .post('/api/memories')
        .send({ title: 'Time Test', section: 'Ideas' });
      // Small delay to ensure timestamp differs
      await new Promise(r => setTimeout(r, 10));
      const res = await request(app)
        .put(`/api/memories/${created.body.id}`)
        .send({ title: 'Time Test Updated' });
      expect(res.body.updatedAt).not.toBe(created.body.createdAt);
    });

    it('clears knowledgeType when moving out of Skill Building', async () => {
      const created = await request(app)
        .post('/api/memories')
        .send({ title: 'Skill', section: 'Skill Building', knowledgeType: 'fact' });
      const res = await request(app)
        .put(`/api/memories/${created.body.id}`)
        .send({ section: 'Ideas' });
      expect(res.status).toBe(200);
      expect(res.body.knowledgeType).toBeNull();
    });

    it('requires knowledgeType when moving to Skill Building', async () => {
      const created = await request(app)
        .post('/api/memories')
        .send({ title: 'Move me', section: 'Ideas' });
      const res = await request(app)
        .put(`/api/memories/${created.body.id}`)
        .send({ section: 'Skill Building' });
      expect(res.status).toBe(400);
    });
  });

  describe('DELETE /api/memories/:id', () => {
    it('deletes a memory and returns 204', async () => {
      const created = await request(app)
        .post('/api/memories')
        .send({ title: 'Delete Me', section: 'Ideas' });
      const res = await request(app).delete(`/api/memories/${created.body.id}`);
      expect(res.status).toBe(204);
      const check = await request(app).get(`/api/memories/${created.body.id}`);
      expect(check.status).toBe(404);
    });

    it('cleans up links when a memory is deleted', async () => {
      const a = await request(app).post('/api/memories').send({ title: 'A', section: 'Ideas' });
      const b = await request(app).post('/api/memories').send({ title: 'B', section: 'Ideas' });
      await request(app).post(`/api/memories/${a.body.id}/links`).send({ targetId: b.body.id });
      await request(app).delete(`/api/memories/${a.body.id}`);
      const links = await request(app).get(`/api/memories/${b.body.id}/links`);
      expect(links.body.links.find(l => l.id === a.body.id)).toBeUndefined();
    });
  });

  describe('POST /api/memories/bulk-delete', () => {
    it('deletes multiple memories', async () => {
      const a = await request(app).post('/api/memories').send({ title: 'A', section: 'Ideas' });
      const b = await request(app).post('/api/memories').send({ title: 'B', section: 'Ideas' });
      const res = await request(app)
        .post('/api/memories/bulk-delete')
        .send({ ids: [a.body.id, b.body.id] });
      expect(res.status).toBe(200);
      expect(res.body.deleted).toBe(2);
    });

    it('silently skips nonexistent IDs', async () => {
      const a = await request(app).post('/api/memories').send({ title: 'A', section: 'Ideas' });
      const res = await request(app)
        .post('/api/memories/bulk-delete')
        .send({ ids: [a.body.id, 'nonexistent'] });
      expect(res.body.deleted).toBe(1);
    });
  });

  describe('Links API', () => {
    it('creates a link between two memories', async () => {
      const a = await request(app).post('/api/memories').send({ title: 'A', section: 'Ideas' });
      const b = await request(app).post('/api/memories').send({ title: 'B', section: 'Ideas' });
      const res = await request(app)
        .post(`/api/memories/${a.body.id}/links`)
        .send({ targetId: b.body.id });
      expect(res.status).toBe(201);
      expect(res.body.source).toBe(a.body.id);
      expect(res.body.target).toBe(b.body.id);
    });

    it('rejects self-linking', async () => {
      const a = await request(app).post('/api/memories').send({ title: 'A', section: 'Ideas' });
      const res = await request(app)
        .post(`/api/memories/${a.body.id}/links`)
        .send({ targetId: a.body.id });
      expect(res.status).toBe(400);
    });

    it('rejects duplicate links', async () => {
      const a = await request(app).post('/api/memories').send({ title: 'A', section: 'Ideas' });
      const b = await request(app).post('/api/memories').send({ title: 'B', section: 'Ideas' });
      await request(app).post(`/api/memories/${a.body.id}/links`).send({ targetId: b.body.id });
      const res = await request(app)
        .post(`/api/memories/${a.body.id}/links`)
        .send({ targetId: b.body.id });
      expect(res.status).toBe(409);
    });

    it('returns explicit and auto links', async () => {
      const a = await request(app).post('/api/memories').send({ title: 'A', section: 'Ideas', tags: ['shared'] });
      const b = await request(app).post('/api/memories').send({ title: 'B', section: 'Ideas', tags: ['shared'] });
      const c = await request(app).post('/api/memories').send({ title: 'C', section: 'Ideas' });
      await request(app).post(`/api/memories/${a.body.id}/links`).send({ targetId: c.body.id });

      const res = await request(app).get(`/api/memories/${a.body.id}/links`);
      expect(res.body.links.some(l => l.linkType === 'explicit' && l.id === c.body.id)).toBe(true);
      expect(res.body.links.some(l => l.linkType === 'auto' && l.id === b.body.id)).toBe(true);
    });

    it('deletes an explicit link', async () => {
      const a = await request(app).post('/api/memories').send({ title: 'A', section: 'Ideas' });
      const b = await request(app).post('/api/memories').send({ title: 'B', section: 'Ideas' });
      await request(app).post(`/api/memories/${a.body.id}/links`).send({ targetId: b.body.id });
      const res = await request(app).delete(`/api/memories/${a.body.id}/links/${b.body.id}`);
      expect(res.status).toBe(204);
    });
  });

  describe('GET /api/search', () => {
    it('returns BM25 search results', async () => {
      await request(app).post('/api/memories').send({
        title: 'Deployment Guide',
        section: 'Development Memories',
        body: 'How to deploy the application to production',
      });
      const res = await request(app).get('/api/search?q=deployment');
      expect(res.status).toBe(200);
      expect(res.body.results.length).toBeGreaterThanOrEqual(1);
      expect(res.body.searchMode).toBe('bm25_only');
    });

    it('includes semantic index headers', async () => {
      const res = await request(app).get('/api/search?q=test');
      expect(res.headers['x-semantic-index-status']).toBeDefined();
      expect(res.headers['x-semantic-index-model']).toBeDefined();
    });
  });

  describe('GET /api/network', () => {
    it('returns nodes and edges', async () => {
      const a = await request(app).post('/api/memories').send({ title: 'A', section: 'Ideas' });
      const b = await request(app).post('/api/memories').send({ title: 'B', section: 'Ideas' });
      await request(app).post(`/api/memories/${a.body.id}/links`).send({ targetId: b.body.id });

      const res = await request(app).get('/api/network');
      expect(res.status).toBe(200);
      expect(res.body.nodes.length).toBeGreaterThanOrEqual(2);
      expect(res.body.edges.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('GET /api/skills/coverage', () => {
    it('returns knowledge type coverage for a tag', async () => {
      await request(app).post('/api/memories').send({
        title: 'Fact', section: 'Skill Building', knowledgeType: 'fact', tags: ['test-skill'],
      });
      await request(app).post('/api/memories').send({
        title: 'Concept', section: 'Skill Building', knowledgeType: 'concept', tags: ['test-skill'],
      });

      const res = await request(app).get('/api/skills/coverage?tag=test-skill');
      expect(res.status).toBe(200);
      expect(res.body.coverage.fact.covered).toBe(true);
      expect(res.body.coverage.concept.covered).toBe(true);
      expect(res.body.coverage.process.covered).toBe(false);
      expect(res.body.skillTransferable).toBe(false);
    });
  });

  describe('GET /api/tags', () => {
    it('returns tags with counts', async () => {
      await request(app).post('/api/memories').send({ title: 'A', section: 'Ideas', tags: ['t1', 't2'] });
      await request(app).post('/api/memories').send({ title: 'B', section: 'Ideas', tags: ['t1'] });

      const res = await request(app).get('/api/tags');
      expect(res.status).toBe(200);
      const t1 = res.body.tags.find(t => t.name === 't1');
      expect(t1).toBeDefined();
      expect(t1.count).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Settings and Models', () => {
    it('returns default settings', async () => {
      const res = await request(app).get('/api/settings');
      expect(res.status).toBe(200);
      expect(res.body.theme).toBe('light');
    });

    it('updates settings', async () => {
      const res = await request(app).put('/api/settings').send({ theme: 'dark' });
      expect(res.status).toBe(200);
      expect(res.body.theme).toBe('dark');
    });

    it('lists models from registry', async () => {
      const res = await request(app).get('/api/models');
      expect(res.status).toBe(200);
      expect(res.body.models.length).toBe(5);
      expect(res.body.models[0]).toHaveProperty('dimensions');
      expect(res.body.models[0]).toHaveProperty('speed');
      expect(res.body.models[0]).toHaveProperty('quality');
    });
  });
});
