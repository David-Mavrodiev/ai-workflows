import fs from 'fs';
import path from 'path';
import { cosineSimilarity } from './embeddingProvider.js';

// Semantic index — per-model vector cache stored on disk

export class SemanticIndex {
  constructor(storagePath) {
    this.storagePath = storagePath;
    this.indexDir = path.join(storagePath, '.semantic-indexes');
    if (!fs.existsSync(this.indexDir)) {
      fs.mkdirSync(this.indexDir, { recursive: true });
    }
  }

  _getModelIndexPath(modelId) {
    return path.join(this.indexDir, `${modelId}.json`);
  }

  loadIndex(modelId) {
    const indexPath = this._getModelIndexPath(modelId);
    if (fs.existsSync(indexPath)) {
      const data = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
      return data;
    }
    return { modelId, entries: {}, lastIndexedAt: null };
  }

  saveIndex(modelId, index) {
    const indexPath = this._getModelIndexPath(modelId);
    fs.writeFileSync(indexPath, JSON.stringify(index), 'utf-8');
  }

  addEntry(modelId, memoryId, embedding, updatedAt) {
    const index = this.loadIndex(modelId);
    index.entries[memoryId] = {
      embedding: Array.from(embedding),
      indexedAt: new Date().toISOString(),
      memoryUpdatedAt: updatedAt,
    };
    index.lastIndexedAt = new Date().toISOString();
    this.saveIndex(modelId, index);
  }

  removeEntry(modelId, memoryId) {
    const index = this.loadIndex(modelId);
    delete index.entries[memoryId];
    this.saveIndex(modelId, index);
  }

  search(modelId, queryEmbedding, limit = 20) {
    const index = this.loadIndex(modelId);
    const results = [];

    for (const [memoryId, entry] of Object.entries(index.entries)) {
      const score = cosineSimilarity(queryEmbedding, new Float32Array(entry.embedding));
      results.push({ memoryId, score });
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
  }

  getStats(modelId, totalMemories) {
    const index = this.loadIndex(modelId);
    const indexedMemories = Object.keys(index.entries).length;
    const pendingMemories = totalMemories - indexedMemories;
    const coveragePercent = totalMemories > 0 ? Math.round((indexedMemories / totalMemories) * 100) : 100;

    return {
      indexedMemories,
      pendingMemories,
      coveragePercent,
      lastIndexedAt: index.lastIndexedAt,
    };
  }

  getPendingMemories(modelId, allMemories) {
    const index = this.loadIndex(modelId);
    return allMemories.filter(m => {
      const entry = index.entries[m.id];
      if (!entry) return true; // not indexed
      return entry.memoryUpdatedAt !== m.updatedAt; // outdated
    });
  }

  getCachedModelIds() {
    if (!fs.existsSync(this.indexDir)) return [];
    return fs.readdirSync(this.indexDir)
      .filter(f => f.endsWith('.json'))
      .map(f => f.replace('.json', ''));
  }
}
