import { Router } from 'express';

export function createSkillsRouter(storage) {
  const router = Router();

  router.get('/coverage', (req, res) => {
    try {
      const { tag } = req.query;
      if (!tag) {
        return res.status(400).json({ error: 'tag query parameter is required' });
      }
      const coverage = storage.getSkillCoverage(tag);
      res.json(coverage);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
