import { bulkDeleteMemories, updateMemory, getTags } from './api.js';
import { refreshTiles } from './tiles.js';
import { showDetail } from './detail.js';
import { getSectionsList } from './sections.js';
import { showDialog } from './app.js';

let selectedIds = new Set();

export function getSelectedIds() {
  return selectedIds;
}

export function isSelected(id) {
  return selectedIds.has(id);
}

export function toggleSelection(id) {
  if (selectedIds.has(id)) {
    selectedIds.delete(id);
  } else {
    selectedIds.add(id);
  }
  updateBulkBar();
  updateCheckboxes();
}

export function clearSelection() {
  selectedIds.clear();
  updateBulkBar();
  updateCheckboxes();
}

function updateCheckboxes() {
  document.querySelectorAll('.memory-tile').forEach(tile => {
    const id = tile.getAttribute('data-memory-id');
    const cb = tile.querySelector('.tile-checkbox');
    if (cb) cb.checked = selectedIds.has(id);
  });
}

function updateBulkBar() {
  const bar = document.getElementById('bulk-bar');
  const count = document.getElementById('bulk-count');
  if (selectedIds.size > 0) {
    bar.classList.remove('hidden');
    count.textContent = `${selectedIds.size} selected`;
  } else {
    bar.classList.add('hidden');
  }
}

export function initBulk() {
  document.getElementById('bulk-select-all').addEventListener('click', () => {
    document.querySelectorAll('.memory-tile').forEach(tile => {
      const id = tile.getAttribute('data-memory-id');
      if (id) selectedIds.add(id);
    });
    updateBulkBar();
    updateCheckboxes();
  });

  document.getElementById('bulk-clear').addEventListener('click', clearSelection);

  document.getElementById('bulk-delete').addEventListener('click', () => {
    if (selectedIds.size === 0) return;
    showDialog(`Delete ${selectedIds.size} memories?`, async () => {
      try {
        await bulkDeleteMemories([...selectedIds]);
        clearSelection();
        showDetail(null);
        refreshTiles();
      } catch (e) {
        alert('Delete failed: ' + e.message);
      }
    });
  });

  document.getElementById('bulk-tag').addEventListener('click', () => {
    if (selectedIds.size === 0) return;
    const body = document.getElementById('dialog-body');
    body.innerHTML = '<input type="text" id="bulk-tag-input" class="dialog-input" placeholder="Enter tag">';
    showDialog('Add Tag', async () => {
      const tag = document.getElementById('bulk-tag-input').value.trim();
      if (!tag) return;
      for (const id of selectedIds) {
        try {
          const { tags = [] } = await (await fetch(`/api/memories/${id}`)).json();
          if (!tags.includes(tag)) {
            await updateMemory(id, { tags: [...tags, tag] });
          }
        } catch (e) { console.error(e); }
      }
      clearSelection();
      refreshTiles();
    });
  });

  document.getElementById('bulk-remove-tag').addEventListener('click', async () => {
    if (selectedIds.size === 0) return;
    const body = document.getElementById('dialog-body');
    try {
      const data = await getTags();
      const tags = data.tags || [];
      body.innerHTML = `
        <select id="bulk-remove-tag-select" class="dialog-input">
          ${tags.map(t => `<option value="${t}">${t}</option>`).join('')}
        </select>
      `;
    } catch {
      body.innerHTML = '<input type="text" id="bulk-remove-tag-select" class="dialog-input" placeholder="Tag to remove">';
    }

    showDialog('Remove Tag', async () => {
      const el = document.getElementById('bulk-remove-tag-select');
      const tag = el.value.trim();
      if (!tag) return;
      for (const id of selectedIds) {
        try {
          const mem = await (await fetch(`/api/memories/${id}`)).json();
          const filtered = (mem.tags || []).filter(t => t !== tag);
          await updateMemory(id, { tags: filtered });
        } catch (e) { console.error(e); }
      }
      clearSelection();
      refreshTiles();
    });
  });

  document.getElementById('bulk-move').addEventListener('click', () => {
    if (selectedIds.size === 0) return;
    const sections = getSectionsList();
    const body = document.getElementById('dialog-body');
    body.innerHTML = `
      <select id="bulk-move-select" class="dialog-input">
        ${sections.map(s => `<option value="${s.name}">${s.name}</option>`).join('')}
      </select>
    `;
    showDialog('Move to Section', async () => {
      const section = document.getElementById('bulk-move-select').value;
      if (!section) return;
      for (const id of selectedIds) {
        try {
          const updates = { section };
          if (section === 'Skill Building') {
            updates.knowledgeType = 'concept'; // default
          }
          await updateMemory(id, updates);
        } catch (e) { console.error(e); }
      }
      clearSelection();
      refreshTiles();
    });
  });
}
