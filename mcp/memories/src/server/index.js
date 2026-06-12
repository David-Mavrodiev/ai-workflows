import { createApp } from './app.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const storagePath = process.env.MEMORIES_STORAGE_PATH
  || path.resolve(__dirname, '..', '..', 'memories-storage');

const PORT = process.env.PORT || 3466;

const app = createApp(storagePath);

app.listen(PORT, () => {
  console.log(`Memories server running at http://localhost:${PORT}`);
  console.log(`Storage directory: ${storagePath}`);
});
