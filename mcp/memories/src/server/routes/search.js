import { Router } from 'express';
import { BM25SearchEngine } from '../services/bm25.js';

export function createSearchRouter(storage) {
  const router = Router();

  router.get('/', (req, res) => {
    try {
      const { q, section, limit } = req.query;

      if (!q) {
        return res.json({ results: [], count: 0, searchMode: 'bm25_only' });
      }

      const maxResults = Math.min(parseInt(limit) || 20, 100);

      // Get all memories with bodies for search indexing
      const allMemories = storage.listMemories({ section });
      const memoriesWithBodies = allMemories.map(m => {
        const full = storage.getMemory(m.id);
        return full || m;
      });

      // BM25 search
      const bm25 = new BM25SearchEngine();
      bm25.index(memoriesWithBodies);
      const bm25Results = bm25.search(q, { section, limit: maxResults });

      // Determine search mode based on semantic search state
      const settings = storage.getSettings();
      const semanticEnabled = settings.activeModel && settings.semanticSearchEnabled;
      const searchMode = semanticEnabled ? 'hybrid' : 'bm25_only';

      // Set semantic index headers
      const semanticStatus = semanticEnabled ? 'ready' : 'disabled';
      res.set('X-Semantic-Index-Status', semanticStatus);
      res.set('X-Semantic-Index-Coverage', semanticEnabled ? '100%' : '0%');
      res.set('X-Semantic-Index-Pending', '0');
      res.set('X-Semantic-Index-Model', settings.activeModel || 'none');

      res.json({
        results: bm25Results,
        count: bm25Results.length,
        searchMode,
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
