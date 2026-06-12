import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { createApp } from '../../server/app.js';

function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'memories-net-test-'));
}

function cleanupDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

describe('Network API — node data for client features', () => {
  let app;
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempDir();
    app = createApp(tmpDir);
  });

  afterEach(() => {
    cleanupDir(tmpDir);
  });

  it('each node includes a section field usable for filtering', async () => {
    await request(app).post('/api/memories').send({ title: 'Idea Node', section: 'Ideas' });
    await request(app).post('/api/memories').send({ title: 'Work Node', section: 'Work Memories' });

    const res = await request(app).get('/api/network');
    expect(res.status).toBe(200);

    const nodes = res.body.nodes;
    expect(nodes.length).toBeGreaterThanOrEqual(2);

    const ideaNode = nodes.find(n => n.title === 'Idea Node');
    const workNode = nodes.find(n => n.title === 'Work Node');
    expect(ideaNode).toBeDefined();
    expect(workNode).toBeDefined();
    expect(ideaNode.section).toBeDefined();
    expect(workNode.section).toBeDefined();
    // Sections should differ between different section types
    expect(ideaNode.section).not.toBe(workNode.section);
  });

  it('nodes from the same section share the same section value', async () => {
    await request(app).post('/api/memories').send({ title: 'A', section: 'Ideas' });
    await request(app).post('/api/memories').send({ title: 'B', section: 'Ideas' });

    const res = await request(app).get('/api/network');
    const nodes = res.body.nodes;
    const a = nodes.find(n => n.title === 'A');
    const b = nodes.find(n => n.title === 'B');
    expect(a.section).toBe(b.section);
  });

  it('edges include source and target fields matching node ids', async () => {
    const memA = await request(app).post('/api/memories').send({ title: 'Linked A', section: 'Ideas' });
    const memB = await request(app).post('/api/memories').send({ title: 'Linked B', section: 'Ideas' });
    await request(app).post(`/api/memories/${memA.body.id}/links`).send({ targetId: memB.body.id });

    const res = await request(app).get('/api/network');
    const edge = res.body.edges.find(
      e => (e.source === memA.body.id && e.target === memB.body.id) ||
           (e.source === memB.body.id && e.target === memA.body.id)
    );
    expect(edge).toBeDefined();
    expect(edge.type).toBe('explicit');
  });

  it('nodes have color field derived from their section', async () => {
    await request(app).post('/api/memories').send({ title: 'Colored', section: 'Ideas' });
    const res = await request(app).get('/api/network');
    const node = res.body.nodes.find(n => n.title === 'Colored');
    expect(node.color).toBeDefined();
    expect(node.color).toMatch(/^#/);
  });
});
