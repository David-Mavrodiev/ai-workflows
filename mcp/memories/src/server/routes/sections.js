import { Router } from 'express';
import { SECTIONS } from '../models/sections.js';

export function createSectionsRouter() {
  const router = Router();

  router.get('/', (req, res) => {
    res.json({ sections: SECTIONS });
  });

  return router;
}
