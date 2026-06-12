import { initTheme } from './theme.js';
import { initSections, setOnSectionChange, getActiveSection, getSectionsList } from './sections.js';
import { loadTiles, refreshTiles } from './tiles.js';
import { showDetail } from './detail.js';
import { initSearch } from './search.js';
import { initNetwork } from './network.js';
import { initSettings, initSemanticBanner } from './settings.js';
import { initDragDrop } from './dragdrop.js';
import { initBulk, clearSelection } from './bulk.js';
import { createMemory } from './api.js';

// Central navigation — restores the default 3-panel layout
export function goHome() {
  document.getElementById('settings-panel').classList.add('hidden');
  document.getElementById('network-panel').classList.add('hidden');
  document.getElementById('network-panel').classList.remove('flyout-open');
  const flyout = document.getElementById('network-flyout');
  if (flyout) flyout.classList.add('hidden');
  document.getElementById('sections-panel').classList.remove('hidden');
  document.getElementById('tiles-panel').classList.remove('hidden');
  document.getElementById('detail-panel').classList.remove('hidden');
  loadTiles(null);
  showDetail(null);
}

// Dialog system
let dialogConfirmCb = null;
let dialogCancelCb = null;

export function showDialog(title, onConfirm, onCancel) {
  const overlay = document.getElementById('dialog-overlay');
  const titleEl = document.getElementById('dialog-title');
  const body = document.getElementById('dialog-body');

  titleEl.textContent = title;
  if (!body.innerHTML) body.innerHTML = '<p>Are you sure?</p>';
  overlay.classList.remove('hidden');

  dialogConfirmCb = onConfirm;
  dialogCancelCb = onCancel;
}

function hideDialog() {
  document.getElementById('dialog-overlay').classList.add('hidden');
  document.getElementById('dialog-body').innerHTML = '';
  dialogConfirmCb = null;
  dialogCancelCb = null;
}

// Init mermaid
if (typeof mermaid !== 'undefined') {
  mermaid.initialize({ startOnLoad: false, theme: 'default' });
}

const KNOWLEDGE_TYPES = ['fact', 'concept', 'process', 'procedure', 'principle'];

async function init() {
  await initTheme();
  await initSections();
  initSearch();
  initNetwork();
  initSettings();
  initDragDrop();
  initBulk();
  initSemanticBanner();

  // Section change → load tiles
  setOnSectionChange((sectionName) => {
    clearSelection();
    loadTiles(sectionName);
    showDetail(null);
  });

  // Initial load
  loadTiles(null);

  // Clicking app title → go home
  document.querySelector('.app-title').addEventListener('click', () => goHome());
  document.querySelector('.app-title').style.cursor = 'pointer';

  // New Memory button
  document.getElementById('new-memory-btn').addEventListener('click', async () => {
    const activeSection = getActiveSection();
    const sectionName = activeSection || 'Ideas';
    const isSkillBuilding = sectionName === 'Skill Building';

    let knowledgeType = null;
    if (isSkillBuilding) {
      // Prompt for knowledge type
      knowledgeType = await new Promise((resolve) => {
        const body = document.getElementById('dialog-body');
        body.innerHTML = `
          <p>Select knowledge type:</p>
          <div class="kt-options">
            ${KNOWLEDGE_TYPES.map(kt => `
              <label class="kt-option">
                <input type="radio" name="new-kt" value="${kt}">
                <span class="kt-option-label">${kt}</span>
              </label>
            `).join('')}
          </div>
        `;
        showDialog('Knowledge Type', () => {
          const sel = body.querySelector('input[name="new-kt"]:checked');
          resolve(sel ? sel.value : 'concept');
        }, () => resolve(null));
      });
      if (!knowledgeType) return;
    }

    try {
      const data = { title: 'New Memory', section: sectionName };
      if (knowledgeType) data.knowledgeType = knowledgeType;
      const memory = await createMemory(data);
      refreshTiles();
      showDetail(memory.id);
    } catch (e) {
      alert('Failed to create memory: ' + e.message);
    }
  });

  // Dialog buttons
  document.getElementById('dialog-confirm').addEventListener('click', () => {
    if (dialogConfirmCb) dialogConfirmCb();
    hideDialog();
  });
  document.getElementById('dialog-cancel').addEventListener('click', () => {
    if (dialogCancelCb) dialogCancelCb();
    hideDialog();
  });
  document.getElementById('dialog-overlay').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) {
      if (dialogCancelCb) dialogCancelCb();
      hideDialog();
    }
  });
}

init().catch(console.error);
