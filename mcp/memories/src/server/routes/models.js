import { Router } from 'express';
import { MODEL_REGISTRY } from '../services/modelRegistry.js';

export function createModelsRouter(storage) {
  const router = Router();
  const downloadStatus = {};

  router.get('/', (req, res) => {
    try {
      const settings = storage.getSettings();
      const models = MODEL_REGISTRY.map(model => ({
        ...model,
        downloaded: downloadStatus[model.id]?.downloaded || false,
        active: settings.activeModel === model.id,
      }));
      res.json({ models });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/:id/download', (req, res) => {
    try {
      const model = MODEL_REGISTRY.find(m => m.id === req.params.id);
      if (!model) {
        return res.status(404).json({ error: 'Unknown model ID', id: req.params.id });
      }

      // Mark as downloading (simulate background download)
      downloadStatus[model.id] = { downloaded: false, downloading: true };

      // In a real implementation, this would trigger actual download via Transformers.js
      // For now, mark as downloaded after a brief delay
      setTimeout(() => {
        downloadStatus[model.id] = { downloaded: true, downloading: false };
      }, 100);

      res.status(202).json({
        modelId: model.id,
        status: 'downloading',
        message: 'Download started. Check GET /api/models for progress.',
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Expose download status for testing
  router._downloadStatus = downloadStatus;

  return router;
}
