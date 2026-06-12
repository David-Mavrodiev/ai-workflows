import { Router } from 'express';

export function createSemanticIndexRouter(storage) {
  const router = Router();
  let rebuildJob = null;

  router.get('/status', (req, res) => {
    try {
      const settings = storage.getSettings();
      const allMemories = storage.listMemories();
      const totalMemories = allMemories.length;

      if (!settings.activeModel) {
        return res.json({
          status: 'disabled',
          model: null,
          totalMemories,
          indexedMemories: 0,
          pendingMemories: totalMemories,
          coveragePercent: 0,
          lastIndexedAt: null,
          rebuildInProgress: false,
          cachedIndexes: [],
        });
      }

      const indexedMemories = rebuildJob?.completed ? totalMemories : 0;
      const pendingMemories = totalMemories - indexedMemories;
      const coveragePercent = totalMemories > 0 ? Math.round((indexedMemories / totalMemories) * 100) : 100;
      const status = coveragePercent >= 98 ? 'ready' : 'stale';

      res.json({
        status: rebuildJob?.inProgress ? 'building' : status,
        model: settings.activeModel,
        totalMemories,
        indexedMemories,
        pendingMemories,
        coveragePercent,
        lastIndexedAt: rebuildJob?.completedAt || null,
        rebuildInProgress: rebuildJob?.inProgress || false,
        cachedIndexes: settings.activeModel ? [settings.activeModel] : [],
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/rebuild', (req, res) => {
    try {
      const settings = storage.getSettings();

      if (!settings.activeModel) {
        return res.status(409).json({
          error: 'No embeddings model is configured. Download a model from /api/models first.',
          status: 'disabled',
        });
      }

      const allMemories = storage.listMemories();
      const pendingMemories = rebuildJob?.completed ? 0 : allMemories.length;

      if (pendingMemories === 0) {
        return res.json({
          status: 'ready',
          message: 'Semantic index is already up to date.',
          coveragePercent: 100,
          pendingMemories: 0,
        });
      }

      if (rebuildJob?.inProgress) {
        return res.status(202).json({
          status: 'building',
          jobId: rebuildJob.jobId,
          message: 'Rebuild already in progress.',
          pendingMemories: Math.max(0, pendingMemories - (rebuildJob.processed || 0)),
          progress: rebuildJob.progress || '0%',
        });
      }

      const jobId = `rebuild-${new Date().toISOString().slice(0, 10)}-001`;
      rebuildJob = {
        jobId,
        inProgress: true,
        completed: false,
        pendingMemories,
        processed: 0,
        progress: '0%',
      };

      // Simulate background rebuild
      setTimeout(() => {
        if (rebuildJob && rebuildJob.jobId === jobId) {
          rebuildJob.inProgress = false;
          rebuildJob.completed = true;
          rebuildJob.completedAt = new Date().toISOString();
          rebuildJob.progress = '100%';
          rebuildJob.processed = pendingMemories;
        }
      }, 100);

      res.status(202).json({
        status: 'building',
        jobId,
        message: `Incremental index rebuild queued. ${pendingMemories} memories pending.`,
        pendingMemories,
        estimatedDurationSeconds: Math.ceil(pendingMemories * 2.5),
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
