import { MODEL_REGISTRY } from './modelRegistry.js';

// Embedding provider abstraction layer
// Wraps Transformers.js model loading, prefix handling, pooling, and normalization

export class EmbeddingProvider {
  constructor() {
    this.model = null;
    this.tokenizer = null;
    this.activeModelId = null;
    this.pipeline = null;
  }

  async loadModel(modelId) {
    const modelEntry = MODEL_REGISTRY.find(m => m.id === modelId);
    if (!modelEntry) throw new Error(`Unknown model: ${modelId}`);

    try {
      // Dynamic import of Transformers.js
      const { pipeline } = await import('@huggingface/transformers');
      this.pipeline = await pipeline('feature-extraction', modelEntry.huggingFaceId, {
        quantized: true,
      });
      this.activeModelId = modelId;
    } catch (err) {
      throw new Error(`Failed to load model ${modelId}: ${err.message}`);
    }
  }

  async embed(text, type = 'document') {
    if (!this.activeModelId || !this.pipeline) {
      throw new Error('No model loaded');
    }

    const modelEntry = MODEL_REGISTRY.find(m => m.id === this.activeModelId);

    // Apply prefix
    let prefixedText = text;
    if (type === 'query' && modelEntry.queryPrefix) {
      prefixedText = modelEntry.queryPrefix + text;
    } else if (type === 'document' && modelEntry.documentPrefix) {
      prefixedText = modelEntry.documentPrefix + text;
    }

    const output = await this.pipeline(prefixedText, {
      pooling: modelEntry.pooling,
      normalize: modelEntry.normalize,
    });

    // Convert to flat Float32Array
    return new Float32Array(output.data);
  }

  isLoaded() {
    return this.activeModelId !== null && this.pipeline !== null;
  }

  getActiveModelId() {
    return this.activeModelId;
  }

  getDimensions() {
    if (!this.activeModelId) return null;
    const modelEntry = MODEL_REGISTRY.find(m => m.id === this.activeModelId);
    return modelEntry?.dimensions || null;
  }
}

// Cosine similarity between two vectors
export function cosineSimilarity(a, b) {
  if (a.length !== b.length) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}
