// BM25 search engine for memories
// Implements the Okapi BM25 ranking function

const K1 = 1.5;
const B = 0.75;

function tokenize(text) {
  if (!text) return [];
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 0);
}

export class BM25SearchEngine {
  constructor() {
    this.documents = [];
    this.avgDl = 0;
    this.df = {}; // document frequency per term
    this.N = 0;
  }

  index(memories) {
    this.documents = memories.map(m => {
      const titleTokens = tokenize(m.title);
      const bodyTokens = tokenize(m.body || '');
      const tagTokens = (m.tags || []).flatMap(t => tokenize(t));
      const tokens = [...titleTokens, ...titleTokens, ...bodyTokens, ...tagTokens]; // title weighted 2x
      return {
        memory: m,
        tokens,
        titleTokens,
        bodyTokens,
        length: tokens.length,
      };
    });

    this.N = this.documents.length;
    this.avgDl = this.N > 0 ? this.documents.reduce((sum, d) => sum + d.length, 0) / this.N : 0;

    // Compute document frequency
    this.df = {};
    for (const doc of this.documents) {
      const uniqueTerms = new Set(doc.tokens);
      for (const term of uniqueTerms) {
        this.df[term] = (this.df[term] || 0) + 1;
      }
    }
  }

  search(query, { section, limit = 20 } = {}) {
    const queryTokens = tokenize(query);
    if (queryTokens.length === 0) return [];

    const results = [];

    for (const doc of this.documents) {
      if (section && doc.memory.section !== section) continue;

      let score = 0;
      const termFreqs = {};

      for (const token of doc.tokens) {
        termFreqs[token] = (termFreqs[token] || 0) + 1;
      }

      for (const term of queryTokens) {
        const tf = termFreqs[term] || 0;
        if (tf === 0) continue;

        const df = this.df[term] || 0;
        const idf = Math.log((this.N - df + 0.5) / (df + 0.5) + 1);
        const tfNorm = (tf * (K1 + 1)) / (tf + K1 * (1 - B + B * (doc.length / this.avgDl)));
        score += idf * tfNorm;
      }

      if (score > 0) {
        // Generate snippet
        const snippet = this._generateSnippet(doc.memory.body || doc.memory.title, queryTokens);

        results.push({
          id: doc.memory.id,
          title: doc.memory.title,
          section: doc.memory.section,
          score: Math.min(score / 10, 1), // normalize to 0-1 range
          matchSource: 'bm25',
          snippet,
        });
      }
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
  }

  _generateSnippet(text, queryTokens) {
    if (!text) return '';
    const words = text.split(/\s+/);
    const lowerWords = words.map(w => w.toLowerCase().replace(/[^\w]/g, ''));

    // Find the first occurrence of any query term
    let bestIdx = 0;
    for (let i = 0; i < lowerWords.length; i++) {
      if (queryTokens.some(qt => lowerWords[i].includes(qt))) {
        bestIdx = i;
        break;
      }
    }

    const start = Math.max(0, bestIdx - 5);
    const end = Math.min(words.length, bestIdx + 15);
    let snippet = words.slice(start, end).join(' ');

    if (start > 0) snippet = '...' + snippet;
    if (end < words.length) snippet = snippet + '...';

    return snippet;
  }
}
