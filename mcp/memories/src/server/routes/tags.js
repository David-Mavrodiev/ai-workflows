import { Router } from 'express';

export function createTagsRouter(storage) {
  const router = Router();

  router.get('/', (req, res) => {
    try {
      const tags = storage.getAllTags();
      res.json({ tags });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
