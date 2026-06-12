import { search } from './api.js';
import { showDetail } from './detail.js';
import { getSectionColor } from './sections.js';

let debounceTimer = null;

export function initSearch() {
  const input = document.getElementById('omni-search');
  const results = document.getElementById('search-results');

  input.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    const q = input.value.trim();
    if (q.length < 2) {
      results.classList.add('hidden');
      results.innerHTML = '';
      return;
    }
    debounceTimer = setTimeout(() => performSearch(q), 250);
  });

  input.addEventListener('focus', () => {
    if (results.innerHTML) results.classList.remove('hidden');
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-container')) {
      results.classList.add('hidden');
    }
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      results.classList.add('hidden');
      input.blur();
    }
  });
}

async function performSearch(query) {
  const results = document.getElementById('search-results');
  try {
    const data = await search(query, { limit: 20 });
    const items = data.results || data.memories || [];

    if (items.length === 0) {
      results.innerHTML = '<div class="search-empty">No results found</div>';
      results.classList.remove('hidden');
      return;
    }

    results.innerHTML = items.map(item => {
      const color = getSectionColor(item.section);
      const preview = (item.body || '').substring(0, 80);
      return `
        <div class="search-result-item" data-memory-id="${item.id}">
          <span class="search-dot" style="background:${color}"></span>
          <div>
            <div class="search-result-title">${item.title}</div>
            <div class="search-result-preview">${preview}</div>
          </div>
        </div>
      `;
    }).join('');

    results.querySelectorAll('.search-result-item').forEach(el => {
      el.addEventListener('click', () => {
        showDetail(el.getAttribute('data-memory-id'));
        results.classList.add('hidden');
        document.getElementById('omni-search').value = '';
      });
    });

    results.classList.remove('hidden');
  } catch (e) {
    results.innerHTML = '<div class="search-empty">Search error</div>';
    results.classList.remove('hidden');
  }
}
