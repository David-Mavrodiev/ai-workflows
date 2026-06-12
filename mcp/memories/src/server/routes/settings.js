import { Router } from 'express';

export function createSettingsRouter(storage) {
  const router = Router();

  router.get('/', (req, res) => {
    try {
      const settings = storage.getSettings();
      res.json(settings);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.put('/', (req, res) => {
    try {
      const current = storage.getSettings();
      const { storagePath, theme, activeModel } = req.body;

      if (theme !== undefined) {
        if (theme !== 'light' && theme !== 'dark') {
          return res.status(400).json({ error: 'theme must be "light" or "dark"' });
        }
        current.theme = theme;
      }
      if (storagePath !== undefined) {
        current.storagePath = storagePath;
      }
      if (activeModel !== undefined) {
        current.activeModel = activeModel;
        current.semanticSearchEnabled = activeModel !== null;
      }

      const updated = storage.saveSettings(current);
      res.json(updated);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  return router;
}
