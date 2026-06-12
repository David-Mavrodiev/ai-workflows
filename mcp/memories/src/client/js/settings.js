import { getSettings, updateSettings, getModels, downloadModel } from './api.js';
import { applyTheme, getCurrentTheme } from './theme.js';

export function initSettings() {
  document.getElementById('settings-btn').addEventListener('click', openSettings);
  document.getElementById('settings-close').addEventListener('click', closeSettings);
}

function openSettings() {
  // Hide everything else
  document.getElementById('sections-panel').classList.add('hidden');
  document.getElementById('tiles-panel').classList.add('hidden');
  document.getElementById('detail-panel').classList.add('hidden');
  document.getElementById('network-panel').classList.add('hidden');
  document.getElementById('network-panel').classList.remove('flyout-open');
  const flyout = document.getElementById('network-flyout');
  if (flyout) flyout.classList.add('hidden');
  document.getElementById('settings-panel').classList.remove('hidden');
  loadSettings();
}

function closeSettings() {
  document.getElementById('settings-panel').classList.add('hidden');
  document.getElementById('sections-panel').classList.remove('hidden');
  document.getElementById('tiles-panel').classList.remove('hidden');
  document.getElementById('detail-panel').classList.remove('hidden');
}

function formatSize(bytes) {
  if (bytes >= 1e9) return (bytes / 1e9).toFixed(1) + ' GB';
  if (bytes >= 1e6) return (bytes / 1e6).toFixed(0) + ' MB';
  return (bytes / 1e3).toFixed(0) + ' KB';
}

async function loadSettings() {
  const content = document.getElementById('settings-content');
  content.innerHTML = '<p>Loading...</p>';

  try {
    const [settings, modelsData] = await Promise.all([getSettings(), getModels()]);
    const models = modelsData.models || [];

    content.innerHTML = `
      <div class="settings-section">
        <h3>Appearance</h3>
        <div class="settings-row">
          <label>Theme</label>
          <div class="theme-switcher">
            <button class="btn-small ${getCurrentTheme() === 'light' ? 'active' : ''}" id="theme-light-btn">☀️ Light</button>
            <button class="btn-small ${getCurrentTheme() === 'dark' ? 'active' : ''}" id="theme-dark-btn">🌙 Dark</button>
          </div>
        </div>
      </div>

      <div class="settings-section">
        <h3>Storage</h3>
        <div class="settings-row">
          <label>Storage Path</label>
          <span class="settings-value">${settings.storagePath || 'Default'}</span>
        </div>
      </div>

      <div class="settings-section">
        <h3>Embeddings Models</h3>
        <p class="settings-desc">Download a model to enable semantic search. Active model is highlighted.</p>
        <div class="models-list">
          ${models.map(m => renderModelCard(m, settings.activeModel)).join('')}
        </div>
      </div>
    `;

    // Theme buttons
    document.getElementById('theme-light-btn').addEventListener('click', async () => {
      applyTheme('light');
      await updateSettings({ theme: 'light' });
      loadSettings();
    });
    document.getElementById('theme-dark-btn').addEventListener('click', async () => {
      applyTheme('dark');
      await updateSettings({ theme: 'dark' });
      loadSettings();
    });

    // Download buttons
    content.querySelectorAll('.model-download-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const modelId = btn.getAttribute('data-model-id');
        btn.textContent = 'Downloading...';
        btn.disabled = true;
        try {
          await downloadModel(modelId);
          // Activate the model
          await updateSettings({ activeModel: modelId });
          loadSettings();
          checkSemanticBanner();
        } catch (e) {
          btn.textContent = 'Error';
        }
      });
    });

  } catch (e) {
    content.innerHTML = `<p class="detail-error">Error: ${e.message}</p>`;
  }
}

function renderModelCard(model, activeModelId) {
  const isActive = model.active || model.id === activeModelId;
  return `
    <div class="model-card ${isActive ? 'model-active' : ''}">
      <div class="model-card-header">
        <strong>${model.name || model.id}</strong>
        ${isActive ? '<span class="model-active-badge">✓ Active</span>' : ''}
      </div>
      <p class="model-desc">${model.description || ''}</p>
      <div class="model-bars">
        <div class="model-bar-row">
          <span>Speed</span>
          <div class="progress-bar"><div class="progress-fill" style="width:${(model.speed || 0) * 100}%"></div></div>
        </div>
        <div class="model-bar-row">
          <span>Quality</span>
          <div class="progress-bar"><div class="progress-fill quality" style="width:${(model.quality || 0) * 100}%"></div></div>
        </div>
      </div>
      <div class="model-meta">
        <span>Download size: ${formatSize(model.sizeBytes || 0)}</span>
        ${isActive
          ? '<span class="model-active-text">Currently active</span>'
          : `<button class="btn-small btn-primary model-download-btn" data-model-id="${model.id}">${model.downloaded ? 'Activate' : 'Download'}</button>`
        }
      </div>
    </div>
  `;
}

export async function checkSemanticBanner() {
  try {
    const settings = await getSettings();
    const banner = document.getElementById('semantic-banner');
    if (!settings.activeModel) {
      banner.classList.remove('hidden');
    } else {
      banner.classList.add('hidden');
    }
  } catch (e) {
    // ignore
  }
}

export function initSemanticBanner() {
  document.getElementById('semantic-banner-link').addEventListener('click', (e) => {
    e.preventDefault();
    openSettings();
  });
  document.getElementById('semantic-banner-close').addEventListener('click', () => {
    document.getElementById('semantic-banner').classList.add('hidden');
  });
  checkSemanticBanner();
}
