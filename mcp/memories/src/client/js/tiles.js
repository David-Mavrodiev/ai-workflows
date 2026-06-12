import { getMemories } from './api.js';
import { getSectionColor, getActiveSection } from './sections.js';
import { showDetail } from './detail.js';
import { getSelectedIds, toggleSelection, clearSelection, isSelected } from './bulk.js';

const KNOWLEDGE_TYPE_COLORS = {
  fact: '#FF7043',
  concept: '#42A5F5',
  process: '#66BB6A',
  procedure: '#AB47BC',
  principle: '#FFA726',
};

let memories = [];
let currentSectionFilter = null;

export function getMemoriesList() {
  return memories;
}

function groupByRecency(mems) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekAgo = new Date(today); weekAgo.setDate(weekAgo.getDate() - 7);
  const monthAgo = new Date(today); monthAgo.setMonth(monthAgo.getMonth() - 1);

  const groups = { 'Today': [], 'This Week': [], 'This Month': [], 'Older': [] };

  for (const m of mems) {
    const d = new Date(m.updatedAt || m.createdAt);
    if (d >= today) groups['Today'].push(m);
    else if (d >= weekAgo) groups['This Week'].push(m);
    else if (d >= monthAgo) groups['This Month'].push(m);
    else groups['Older'].push(m);
  }
  return groups;
}

function createTileElement(memory) {
  const tile = document.createElement('div');
  tile.className = 'memory-tile';
  tile.setAttribute('data-memory-id', memory.id);
  tile.setAttribute('draggable', 'true');

  const sectionName = memory.section;
  const isSkillBuilding = sectionName === 'Skill Building';
  const borderColor = isSkillBuilding && memory.knowledgeType
    ? KNOWLEDGE_TYPE_COLORS[memory.knowledgeType] || getSectionColor(sectionName)
    : getSectionColor(sectionName);

  tile.style.borderLeftColor = borderColor;

  const selected = isSelected(memory.id);
  const preview = (memory.body || '').substring(0, 120).replace(/</g, '&lt;');
  const tagsHtml = (memory.tags || []).map(t => `<span class="tile-tag">${t}</span>`).join('');
  const ktBadge = isSkillBuilding && memory.knowledgeType
    ? `<span class="kt-badge" style="background:${KNOWLEDGE_TYPE_COLORS[memory.knowledgeType] || '#999'}">${memory.knowledgeType}</span>`
    : '';

  tile.innerHTML = `
    <div class="tile-checkbox-area">
      <input type="checkbox" class="tile-checkbox" ${selected ? 'checked' : ''} title="Select">
    </div>
    <div class="tile-content">
      <div class="tile-header">
        <span class="tile-title">${memory.title || 'Untitled'}</span>
        ${ktBadge}
      </div>
      <p class="tile-preview">${preview || '<em>No content</em>'}</p>
      <div class="tile-tags">${tagsHtml}</div>
    </div>
  `;

  // Checkbox
  const cb = tile.querySelector('.tile-checkbox');
  cb.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleSelection(memory.id);
  });

  // Click to show detail
  tile.addEventListener('click', (e) => {
    if (e.target.closest('.tile-checkbox-area')) return;
    document.querySelectorAll('.memory-tile.active').forEach(el => el.classList.remove('active'));
    tile.classList.add('active');
    showDetail(memory.id);
  });

  // Drag start
  tile.addEventListener('dragstart', (e) => {
    e.dataTransfer.setData('text/memory-id', memory.id);
    tile.classList.add('dragging');
  });
  tile.addEventListener('dragend', () => {
    tile.classList.remove('dragging');
  });

  // Drop target (for linking)
  tile.addEventListener('dragover', (e) => {
    e.preventDefault();
    tile.classList.add('link-drop-target');
  });
  tile.addEventListener('dragleave', () => {
    tile.classList.remove('link-drop-target');
  });
  tile.addEventListener('drop', (e) => {
    e.preventDefault();
    tile.classList.remove('link-drop-target');
    const sourceId = e.dataTransfer.getData('text/memory-id');
    if (sourceId && sourceId !== memory.id && window.__onDropToTile) {
      window.__onDropToTile(sourceId, memory.id);
    }
  });

  return tile;
}

export function renderTiles(mems) {
  const container = document.getElementById('tiles-container');
  container.innerHTML = '';

  if (!mems || mems.length === 0) {
    container.innerHTML = '<div class="tiles-empty"><p>No memories yet. Create one!</p></div>';
    return;
  }

  const groups = groupByRecency(mems);
  for (const [label, items] of Object.entries(groups)) {
    if (items.length === 0) continue;
    const group = document.createElement('div');
    group.className = 'tile-group';

    const header = document.createElement('div');
    header.className = 'tile-group-header';
    header.innerHTML = `
      <span class="tile-group-label">${label}</span>
      <span class="tile-group-count">${items.length}</span>
      <span class="tile-group-chevron">▼</span>
    `;
    header.addEventListener('click', () => {
      group.classList.toggle('collapsed');
    });
    group.appendChild(header);

    const list = document.createElement('div');
    list.className = 'tile-group-list';
    for (const m of items) {
      list.appendChild(createTileElement(m));
    }
    group.appendChild(list);
    container.appendChild(group);
  }
}

export async function loadTiles(sectionName) {
  currentSectionFilter = sectionName;
  const heading = document.getElementById('tiles-heading');
  heading.textContent = sectionName || 'All Memories';

  try {
    const params = {};
    if (sectionName) params.section = sectionName;
    const data = await getMemories(params);
    memories = data.memories || [];
    renderTiles(memories);
  } catch (e) {
    console.error('Failed to load memories:', e);
  }
}

export function refreshTiles() {
  loadTiles(currentSectionFilter);
}
