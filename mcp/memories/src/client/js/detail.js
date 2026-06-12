import { getMemory, updateMemory, deleteMemory, getLinks, addLink, deleteLink } from './api.js';
import { getSectionColor, getSectionsList } from './sections.js';
import { refreshTiles } from './tiles.js';

let currentMemoryId = null;
let editingField = null;

export function getCurrentMemoryId() {
  return currentMemoryId;
}

function renderMermaidBlocks(container) {
  const codeBlocks = container.querySelectorAll('pre code.language-mermaid');
  codeBlocks.forEach((block, i) => {
    const pre = block.parentElement;
    const mermaidDiv = document.createElement('div');
    mermaidDiv.className = 'mermaid';
    mermaidDiv.textContent = block.textContent;
    pre.replaceWith(mermaidDiv);
  });
  if (typeof mermaid !== 'undefined') {
    mermaid.run({ nodes: container.querySelectorAll('.mermaid') }).catch(() => {});
  }
}

function simpleMarkdown(text) {
  if (!text) return '';
  let html = text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/```mermaid\n([\s\S]*?)```/g, '<pre><code class="language-mermaid">$1</code></pre>')
    .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code class="language-$1">$2</code></pre>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/\n/g, '<br>');
  html = html.replace(/((?:<li>.*?<\/li><br>?)+)/g, '<ul>$1</ul>').replace(/<ul><br>/g, '<ul>');
  return html;
}

async function renderLinks(memoryId) {
  try {
    const data = await getLinks(memoryId);
    const links = data.links || [];
    if (links.length === 0) return '<p class="no-links">No linked memories</p>';

    return links.map(link => {
      const lineStyle = link.linkType === 'auto' ? 'dashed' : 'solid';
      return `
        <div class="link-item" data-link-id="${link.id}" style="border-left: 3px ${lineStyle} ${getSectionColor(link.section)}">
          <span class="link-title" data-memory-id="${link.id}">${link.title}</span>
          <span class="link-type-badge">${link.linkType}</span>
          ${link.linkType === 'explicit' ? `<button class="link-remove" data-source="${memoryId}" data-target="${link.id}" title="Remove link">&times;</button>` : ''}
        </div>
      `;
    }).join('');
  } catch {
    return '<p class="no-links">Could not load links</p>';
  }
}

export async function showDetail(memoryId, containerId = 'detail-content') {
  currentMemoryId = memoryId;
  const panel = document.getElementById(containerId);

  if (!memoryId) {
    panel.innerHTML = '<div class="detail-empty"><p>Select a memory to view details</p></div>';
    return;
  }

  panel.innerHTML = '<div class="detail-loading">Loading...</div>';

  try {
    const memory = await getMemory(memoryId);
    const linksHtml = await renderLinks(memoryId);
    const sectionColor = getSectionColor(memory.section);
    const bodyHtml = simpleMarkdown(memory.body);
    const tagsStr = (memory.tags || []).join(', ');

    panel.innerHTML = `
      <div class="detail-header" style="border-bottom: 3px solid ${sectionColor}">
        <div class="detail-section-badge" style="background: ${sectionColor}">${memory.section}</div>
        ${memory.knowledgeType ? `<span class="detail-kt-badge">${memory.knowledgeType}</span>` : ''}
        <button class="detail-delete-btn" title="Delete memory">🗑️</button>
      </div>
      <div class="detail-title-wrap">
        <h2 class="detail-title" contenteditable="true" data-field="title">${memory.title || 'Untitled'}</h2>
      </div>
      <div class="detail-body-wrap">
        <div class="detail-body-view">${bodyHtml}</div>
        <textarea class="detail-body-edit hidden" data-field="body">${memory.body || ''}</textarea>
      </div>
      <div class="detail-tags-section">
        <label>Tags</label>
        <input type="text" class="detail-tags-input" value="${tagsStr}" placeholder="comma-separated tags" data-field="tags">
      </div>
      <div class="detail-links-section">
        <label>Linked Memories</label>
        <div class="detail-links">${linksHtml}</div>
      </div>
      <div class="detail-meta">
        <small>Created: ${new Date(memory.createdAt).toLocaleString()}</small>
        <small>Updated: ${new Date(memory.updatedAt).toLocaleString()}</small>
      </div>
    `;

    // Render mermaid
    renderMermaidBlocks(panel);

    // Click body view to edit
    const bodyView = panel.querySelector('.detail-body-view');
    const bodyEdit = panel.querySelector('.detail-body-edit');
    bodyView.addEventListener('click', () => {
      bodyView.classList.add('hidden');
      bodyEdit.classList.remove('hidden');
      bodyEdit.focus();
    });
    bodyEdit.addEventListener('blur', async () => {
      const newBody = bodyEdit.value;
      bodyEdit.classList.add('hidden');
      bodyView.classList.remove('hidden');
      bodyView.innerHTML = simpleMarkdown(newBody);
      renderMermaidBlocks(panel);
      await saveField(memoryId, 'body', newBody);
    });

    // Title inline edit
    const titleEl = panel.querySelector('.detail-title');
    titleEl.addEventListener('blur', async () => {
      const newTitle = titleEl.textContent.trim();
      if (newTitle && newTitle !== memory.title) {
        await saveField(memoryId, 'title', newTitle);
      }
    });
    titleEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); titleEl.blur(); }
    });

    // Tags
    const tagsInput = panel.querySelector('.detail-tags-input');
    tagsInput.addEventListener('blur', async () => {
      const newTags = tagsInput.value.split(',').map(t => t.trim()).filter(Boolean);
      await saveField(memoryId, 'tags', newTags);
    });

    // Delete
    panel.querySelector('.detail-delete-btn').addEventListener('click', async () => {
      if (confirm('Delete this memory?')) {
        await deleteMemory(memoryId);
        currentMemoryId = null;
        showDetail(null);
        refreshTiles();
      }
    });

    // Link click navigation — navigate within the same container
    panel.querySelectorAll('.link-title').forEach(el => {
      el.addEventListener('click', () => {
        showDetail(el.getAttribute('data-memory-id'), containerId);
      });
    });

    // Link remove
    panel.querySelectorAll('.link-remove').forEach(btn => {
      btn.addEventListener('click', async () => {
        const src = btn.getAttribute('data-source');
        const tgt = btn.getAttribute('data-target');
        await deleteLink(src, tgt);
        showDetail(memoryId, containerId); // refresh
      });
    });

  } catch (e) {
    panel.innerHTML = `<div class="detail-error">Error loading memory: ${e.message}</div>`;
  }
}

async function saveField(memoryId, field, value) {
  try {
    const update = {};
    update[field] = value;
    await updateMemory(memoryId, update);
    refreshTiles();
  } catch (e) {
    console.error(`Failed to save ${field}:`, e);
  }
}
