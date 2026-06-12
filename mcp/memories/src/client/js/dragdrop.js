import { updateMemory, addLink } from './api.js';
import { refreshTiles } from './tiles.js';
import { showDetail } from './detail.js';
import { showDialog } from './app.js';

const KNOWLEDGE_TYPES = ['fact', 'concept', 'process', 'procedure', 'principle'];

export function initDragDrop() {
  // Drop to section handler
  window.__onDropToSection = async (memoryId, section) => {
    try {
      const updates = { section: section.name };

      if (section.id === 'skill-building') {
        // Prompt for knowledge type
        const kt = await promptKnowledgeType();
        if (!kt) return; // cancelled
        updates.knowledgeType = kt;
      }

      // If moving OUT of skill building, clear knowledgeType
      if (section.id !== 'skill-building') {
        updates.knowledgeType = null;
      }

      await updateMemory(memoryId, updates);
      refreshTiles();
      showDetail(memoryId);
    } catch (e) {
      console.error('Failed to move memory:', e);
    }
  };

  // Drop tile onto tile → create link
  window.__onDropToTile = async (sourceId, targetId) => {
    try {
      await addLink(sourceId, targetId);
      showDetail(sourceId);
      refreshTiles();
    } catch (e) {
      console.error('Failed to create link:', e);
      alert(e.message || 'Failed to link memories');
    }
  };
}

function promptKnowledgeType() {
  return new Promise((resolve) => {
    const body = document.getElementById('dialog-body');
    body.innerHTML = `
      <p>Select knowledge type for Skill Building:</p>
      <div class="kt-options">
        ${KNOWLEDGE_TYPES.map(kt => `
          <label class="kt-option">
            <input type="radio" name="kt" value="${kt}">
            <span class="kt-option-label">${kt}</span>
          </label>
        `).join('')}
      </div>
    `;

    showDialog('Knowledge Type', () => {
      const selected = body.querySelector('input[name="kt"]:checked');
      resolve(selected ? selected.value : null);
    }, () => {
      resolve(null);
    });
  });
}
