import { Router } from 'express';

export function createNetworkRouter(storage) {
  const router = Router();

  router.get('/', (req, res) => {
    try {
      const network = storage.getNetwork();
      res.json(network);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
