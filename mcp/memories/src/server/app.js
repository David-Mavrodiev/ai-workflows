import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { initStorage } from './services/storage.js';
import { createMemoriesRouter } from './routes/memories.js';
import { createSectionsRouter } from './routes/sections.js';
import { createTagsRouter } from './routes/tags.js';
import { createSearchRouter } from './routes/search.js';
import { createNetworkRouter } from './routes/network.js';
import { createSkillsRouter } from './routes/skills.js';
import { createSettingsRouter } from './routes/settings.js';
import { createModelsRouter } from './routes/models.js';
import { createSemanticIndexRouter } from './routes/semanticIndex.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createApp(storagePath) {
  const app = express();
  app.use(express.json());

  // Serve static client files
  app.use(express.static(path.join(__dirname, '..', 'client')));

  // Initialize storage and get the storage service
  const storage = initStorage(storagePath);

  // Mount API routes
  app.use('/api/memories', createMemoriesRouter(storage));
  app.use('/api/sections', createSectionsRouter());
  app.use('/api/tags', createTagsRouter(storage));
  app.use('/api/search', createSearchRouter(storage));
  app.use('/api/network', createNetworkRouter(storage));
  app.use('/api/skills', createSkillsRouter(storage));
  app.use('/api/settings', createSettingsRouter(storage));
  app.use('/api/models', createModelsRouter(storage));
  app.use('/api/semantic-index', createSemanticIndexRouter(storage));

  // SPA fallback — serve index.html for non-API routes
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
      res.sendFile(path.join(__dirname, '..', 'client', 'index.html'));
    }
  });

  app.storage = storage;
  return app;
}
